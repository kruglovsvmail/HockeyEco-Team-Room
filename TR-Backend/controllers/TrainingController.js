import pool from '../config/db.js';
import { getEventScope } from '../utils/checkPermission.js';
import { sendPushToEventScopeExcept, cancelScheduledNotifications, getTrainingInfo, formatFeeChange, formatSplitCostChange, eventUrl } from '../services/pushService.js';
import { parseFeeSettings, buildFeeUpdate } from '../utils/eventFees.js';

// Командная и клубная тренировка: таблица и чья она. Тренировки сообщества правятся
// в CommunityEventController, сюда они не ходят. Любой другой тип — ошибка запроса,
// а не клубная тренировка по умолчанию: раньше всё, что не team_training, писалось
// в club_training, и тренер команды с типом community_training правил клубные.
const TRAINING_OWNERS = {
  team_training: { table: 'team_training', ownerColumn: 'team_id', scopeKey: 'teamId' },
  club_training: { table: 'club_training', ownerColumn: 'club_id', scopeKey: 'clubId' },
};

// Тренировка из адреса — только если она принадлежит команде или клубу, в которых
// гейт проверил права. Гейт (requireEventPermission) смотрит роль в teamId / clubId
// из запроса, но не то, что тренировка — именно их: без условия на колонку владельца
// тренер команды A, прислав teamId=A и id тренировки команды B, переносил её, менял
// взнос и удалял. Чужая тренировка отсюда выходит «не найденной». Законно чужой она
// не бывает: совместных нет, и календарь открывает каждую только у её владельца.
const loadTraining = async (eventId, scope, columns = 'id') => {
  const owner = TRAINING_OWNERS[scope.eventType];
  const ownerId = owner && scope[owner.scopeKey];
  if (!ownerId) return null;

  const { rows } = await pool.query(
    `SELECT ${columns} FROM "public"."${owner.table}" WHERE id = $1 AND ${owner.ownerColumn} = $2`,
    [eventId, ownerId]
  );
  return rows[0] || null;
};

// =============================================================================
// ОБНОВЛЕНИЕ РАСПИСАНИЯ ТРЕНИРОВКИ (дата, время, локация)
// Поддерживает: team_training, club_training
//
// Логика локации (строгий CHECK в БД):
//   arena_id IS NOT NULL → location = NULL,  location_url = NULL
//   arena_id IS NULL     → location != NULL, location_url != NULL
//
// При смене только даты/времени — читаем текущую локацию из БД как fallback,
// чтобы не нарушить CHECK-ограничение.
// =============================================================================
export const updateTrainingSchedule = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { date, time, arena_id, location, location_url, custom_timezone } = req.body;
    const scope = getEventScope(req);
    const { eventType, teamId, clubId } = scope;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId или clubId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }
    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Необходимо указать дату и время тренировки' });
    }

    // ── Читаем текущее состояние из БД — заодно убеждаемся, что тренировка своя ──
    const current = await loadTraining(eventId, scope, 'arena_id, location, location_url, custom_timezone');
    if (!current) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }
    const { table } = TRAINING_OWNERS[eventType];

    // ── Определяем финальные значения локации ──────────────────────────────
    // arena_id: если пришёл явно из тела — используем его (в т.ч. null для сброса),
    //           иначе берём текущий из БД
    const finalArenaId = arena_id !== undefined ? (arena_id || null) : current.arena_id;
    const isManual     = !finalArenaId;

    // При выборе арены из справочника — location и location_url = NULL (требует CHECK)
    // При ручном вводе — используем то, что пришло (включая пустую строку),
    // иначе падаем на текущие значения из БД. Пустая строка валидна для CHECK (она != NULL).
    const finalLocation    = isManual
      ? (location     !== undefined ? location     : (current.location     ?? ''))
      : null;
    const finalLocationUrl = isManual
      ? (location_url !== undefined ? location_url : (current.location_url ?? ''))
      : null;
    const finalCustomTz    = isManual
      ? (custom_timezone || current.custom_timezone || 'Europe/Moscow')
      : null;

    // Последняя защита: при ручном вводе название локации не должно быть пустым
    if (isManual && !finalLocation) {
      return res.status(400).json({
        success: false,
        error: 'Для ручной локации необходимо указать название места',
      });
    }

    // ── Определяем таймзону для конвертации времени ─────────────────────────
    let arenaTz = 'Europe/Moscow';
    if (!isManual) {
      const arenaRes = await pool.query(
        'SELECT timezone FROM "public"."arenas" WHERE id = $1',
        [finalArenaId]
      );
      if (arenaRes.rowCount > 0) arenaTz = arenaRes.rows[0].timezone;
    } else {
      arenaTz = finalCustomTz;
    }

    const fullTimestamp = `${date} ${time}:00`;

    // ── UPDATE ──────────────────────────────────────────────────────────────
    await pool.query(
      `UPDATE "public"."${table}"
       SET training_date   = $1::timestamp AT TIME ZONE $2,
           arena_id        = $3,
           location        = $4,
           location_url    = $5,
           custom_timezone = $6
       WHERE id = $7`,
      [fullTimestamp, arenaTz, finalArenaId, finalLocation, finalLocationUrl, finalCustomTz, eventId]
    );

    getTrainingInfo(eventId, eventType).then(info => {
      sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'schedule', {
        title: 'Тренировка изменена',
        body: `Новое расписание: ${info.text}`,
        url: eventUrl(eventType, eventId), tag: `event-update-${eventId}`,
      });
    }).catch(() => {});

    res.json({ success: true, message: 'Расписание тренировки успешно обновлено' });
  } catch (err) {
    console.error('Ошибка обновления расписания тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ОБНОВЛЕНИЕ СТОИМОСТИ ТРЕНИРОВКИ (взнос с игрока)
// Поддерживает: team_training, club_training
// =============================================================================
export const updateTrainingFinances = async (req, res) => {
  try {
    const { eventId } = req.params;
    const scope = getEventScope(req);
    const { eventType, teamId, clubId } = scope;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId или clubId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }

    // player_fee: null = не назначен, 0 = бесплатно, N = сумма (режим per_person).
    // В режиме split сумма живёт в total_cost, а cost не используется — но обе
    // колонки сохраняются, чтобы переключение режима туда-обратно не теряло цифры.
    const patch = parseFeeSettings(req.body, { goalieAware: true });

    const prev = await loadTraining(eventId, scope, 'id, cost, cost_mode, total_cost');
    if (!prev) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }
    const { table } = TRAINING_OWNERS[eventType];

    const upd = buildFeeUpdate(patch, 1);
    if (!upd.isEmpty) {
      await pool.query(
        `UPDATE "public"."${table}" SET ${upd.clause} WHERE id = $${upd.values.length + 1}`,
        [...upd.values, eventId]
      );
    }

    // Какой push слать, решает НОВЫЙ режим: при переходе на долевой оповещаем об
    // общей сумме, при фиксированном — о взносе с игрока, как было раньше.
    const nextMode = patch.cost_mode ?? prev.cost_mode;
    const nextFee = 'cost' in patch ? patch.cost : (prev.cost === null ? null : Number(prev.cost));
    const nextTotal = 'total_cost' in patch ? patch.total_cost : (prev.total_cost === null ? null : Number(prev.total_cost));
    const oldFee = prev.cost === null ? null : Number(prev.cost);
    const oldTotal = prev.total_cost === null ? null : Number(prev.total_cost);

    const feeChanged = nextMode === 'split'
      ? (oldTotal !== nextTotal || prev.cost_mode !== nextMode)
      : (oldFee !== nextFee || prev.cost_mode !== nextMode);

    if (feeChanged) {
      getTrainingInfo(eventId, eventType).then(info => {
        sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'schedule', {
          title: 'Изменение стоимости',
          body: nextMode === 'split'
            ? formatSplitCostChange(oldTotal, nextTotal, `тренировки ${info.text}`)
            : formatFeeChange(oldFee, nextFee, `тренировки ${info.text}`),
          url: eventUrl(eventType, eventId),
          tag: `fee-${eventId}`,
        });
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Стоимость тренировки успешно обновлена' });
  } catch (err) {
    console.error('Ошибка обновления стоимости тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ОБНОВЛЕНИЕ ТИПА ТРЕНИРОВКИ (Бросковая, ОФП, Катание...)
// Поддерживает: team_training, club_training
//
// Тип — закрытый список, тот же, что в CHECK-ограничении колонки training_type.
// Список продублирован здесь, а не импортируется из MgrEventController: там он
// приватная деталь создания события, а тянуть контроллер ради константы — лишняя
// связность. При добавлении девятого типа править оба места и CHECK в БД.
//
// Пуша не шлём: смена «Бросковой» на «Катание» не меняет ни времени, ни места,
// ни денег — дёргать всю команду уведомлением не за что.
// =============================================================================
const TRAINING_TYPES = ['general', 'shooting', 'fitness', 'dribbling', 'tactics', 'skating', 'game', 'strength'];

export const updateTrainingType = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { training_type } = req.body;
    const scope = getEventScope(req);
    const { eventType, teamId, clubId } = scope;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId или clubId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }
    // Неизвестный тип отклоняем, а не подменяем на 'general': здесь это правка
    // существующей тренировки, и молча записать не то, что просили, хуже ошибки.
    if (!TRAINING_TYPES.includes(training_type)) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    if (!(await loadTraining(eventId, scope))) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }
    const { table } = TRAINING_OWNERS[eventType];

    await pool.query(
      `UPDATE "public"."${table}" SET training_type = $1 WHERE id = $2`,
      [training_type, eventId]
    );

    res.json({ success: true, message: 'Тип тренировки обновлён' });
  } catch (err) {
    console.error('Ошибка обновления типа тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОЛНОЕ УДАЛЕНИЕ ТРЕНИРОВКИ ИЗ КАЛЕНДАРЯ
// Каскадно удаляет отметки присутствия
// =============================================================================
export const deleteTraining = async (req, res) => {
  try {
    const { eventId } = req.params;
    // eventType может прийти как в query (DELETE без body), так и в body. Порядок —
    // как у гейта: тело, потом query. Раньше здесь query читался первым, и тело
    // «team_training» проводило через проверку команды, а query «club_training»
    // удалял клубную тренировку.
    const scope = getEventScope(req);
    const { eventType, teamId, clubId } = scope;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId или clubId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }

    const numericId = Number(eventId);
    if (isNaN(numericId)) {
      return res.status(400).json({ success: false, error: 'Некорректный формат идентификатора тренировки' });
    }

    if (!TRAINING_OWNERS[eventType]) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    // Своя ли тренировка — прежде всего остального: и деталей для пуша, и сбора
    // слепков её плана
    if (!(await loadTraining(numericId, scope))) {
      return res.status(404).json({
        success: false,
        error: eventType === 'club_training' ? 'Клубная тренировка не найдена' : 'Тренировка не найдена',
      });
    }

    // Сохраняем детали ДО удаления для текста уведомления
    const eventInfo = await getTrainingInfo(numericId, eventType);

    // Разовые упражнения плана держат содержимое в drill_snapshots, а сами пункты плана
    // уходят каскадом вместе с тренировкой. Слепок каскад не заденет — он не привязан к
    // событию, — поэтому номера слепков запоминаем здесь, пока пункты ещё на месте, а
    // стираем после удаления тренировки. Раньше нельзя: пока на слепок ссылается пункт,
    // внешний ключ (ON DELETE RESTRICT) удалить его не даст и уронит всё удаление.
    // Слепки библиотечных упражнений не трогаем: они общие для всех тренировок,
    // замороженных одной правкой.
    const isClub = eventType === 'club_training';
    const planTable = isClub ? 'club_training_plan' : 'team_training_plan';
    const planColumn = isClub ? 'club_training_id' : 'team_training_id';

    const { rows: adhocRows } = await pool.query(`
      SELECT drill_snapshot_id FROM "public"."${planTable}"
      WHERE ${planColumn} = $1 AND is_adhoc AND drill_snapshot_id IS NOT NULL
    `, [numericId]);

    if (eventType === 'team_training') {
      await pool.query(
        'DELETE FROM "public"."team_training_attendance" WHERE team_training_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."team_training" WHERE id = $1',
        [numericId]
      );

    } else {
      await pool.query(
        'DELETE FROM "public"."club_training_attendance" WHERE club_training_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."club_training" WHERE id = $1',
        [numericId]
      );
    }

    // Сбой чистки удаление не отменяет: тренировки уже нет, а лишний слепок никому не мешает
    if (adhocRows.length > 0) {
      await pool.query(
        'DELETE FROM drill_snapshots WHERE id = ANY($1::int[])',
        [adhocRows.map(r => r.drill_snapshot_id)]
      ).catch(err => console.error('Ошибка очистки слепков разовых упражнений:', err.message));
    }

    cancelScheduledNotifications(numericId).catch(() => {});
    sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'schedule', {
      title: 'Тренировка отменена',
      body: eventInfo.text || 'Тренировка удалена из расписания',
      url: '/', tag: `event-cancel-${numericId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'Тренировка успешно удалена' });
  } catch (err) {
    console.error('Ошибка удаления тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};