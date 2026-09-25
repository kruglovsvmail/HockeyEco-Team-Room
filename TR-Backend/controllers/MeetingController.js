import pool from '../config/db.js';
import { getEventScope } from '../utils/checkPermission.js';
import { sendPushToEventScopeExcept, cancelScheduledNotifications, getMeetingInfo, formatFeeChange, formatSplitCostChange, eventUrl } from '../services/pushService.js';
import { parseFeeSettings, buildFeeUpdate } from '../utils/eventFees.js';

// Командное и клубное собрание: таблица и чьё оно. Любой другой тип — ошибка
// запроса, а не клубное собрание по умолчанию: раньше всё, что не team_meeting,
// писалось в club_meeting, и руководитель команды правил клубные собрания.
const MEETING_OWNERS = {
  team_meeting: { table: 'team_meeting', ownerColumn: 'team_id', scopeKey: 'teamId' },
  club_meeting: { table: 'club_meeting', ownerColumn: 'club_id', scopeKey: 'clubId' },
};

// Собрание из адреса — только если оно принадлежит команде или клубу, в которых гейт
// проверил права. Гейт (requireEventPermission) смотрит роль в teamId / clubId из
// запроса, но не то, что собрание — именно их: без условия на колонку владельца
// руководитель команды A, прислав teamId=A и id собрания команды B, переносил его,
// менял взнос и удалял. Чужое собрание отсюда выходит «не найденным».
const loadMeeting = async (eventId, scope, columns = 'id') => {
  const owner = MEETING_OWNERS[scope.eventType];
  const ownerId = owner && scope[owner.scopeKey];
  if (!ownerId) return null;

  const { rows } = await pool.query(
    `SELECT ${columns} FROM "public"."${owner.table}" WHERE id = $1 AND ${owner.ownerColumn} = $2`,
    [eventId, ownerId]
  );
  return rows[0] || null;
};

// =============================================================================
// ОБНОВЛЕНИЕ РАСПИСАНИЯ СОБРАНИЯ (дата, время, локация)
// Поддерживает: team_meeting, club_meeting
//
// Логика локации (строгий CHECK в БД, идентичный team_training_location_check):
//   arena_id IS NOT NULL → location = NULL,  location_url = NULL
//   arena_id IS NULL     → location != NULL, location_url != NULL  (пустая строка допустима)
// =============================================================================
export const updateMeetingSchedule = async (req, res) => {
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
      return res.status(400).json({ success: false, error: 'Необходимо указать дату и время собрания' });
    }

    // Текущее состояние из БД — заодно убеждаемся, что собрание своё
    const current = await loadMeeting(eventId, scope, 'arena_id, location, location_url, custom_timezone');
    if (!current) {
      return res.status(404).json({ success: false, error: 'Собрание не найдено' });
    }
    const { table } = MEETING_OWNERS[eventType];

    const finalArenaId = arena_id !== undefined ? (arena_id || null) : current.arena_id;
    const isManual = !finalArenaId;

    const finalLocation = isManual
      ? (location !== undefined ? location : (current.location ?? ''))
      : null;
    const finalLocationUrl = isManual
      ? (location_url !== undefined ? location_url : (current.location_url ?? ''))
      : null;
    const finalCustomTz = isManual
      ? (custom_timezone || current.custom_timezone || 'Europe/Moscow')
      : null;

    if (isManual && !finalLocation) {
      return res.status(400).json({
        success: false,
        error: 'Для ручной локации необходимо указать название места',
      });
    }

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

    await pool.query(
      `UPDATE "public"."${table}"
       SET meeting_date    = $1::timestamp AT TIME ZONE $2,
           arena_id        = $3,
           location        = $4,
           location_url    = $5,
           custom_timezone = $6
       WHERE id = $7`,
      [fullTimestamp, arenaTz, finalArenaId, finalLocation, finalLocationUrl, finalCustomTz, eventId]
    );

    getMeetingInfo(eventId, eventType).then(info => {
      sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'schedule', {
        title: 'Собрание изменено',
        body: `Новое расписание: ${info.text}`,
        url: eventUrl(eventType, eventId), tag: `event-update-${eventId}`,
      });
    }).catch(() => {});

    res.json({ success: true, message: 'Расписание собрания успешно обновлено' });
  } catch (err) {
    console.error('Ошибка обновления расписания собрания:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ОБНОВЛЕНИЕ СТОИМОСТИ СОБРАНИЯ (взнос с участника)
// Поддерживает: team_meeting, club_meeting
// =============================================================================
export const updateMeetingFinances = async (req, res) => {
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

    // goalieAware: false — на собрании нет деления на вратарей и полевых,
    // колонки goalies_free у этих таблиц не существует.
    const patch = parseFeeSettings(req.body, { goalieAware: false });

    const prev = await loadMeeting(eventId, scope, 'id, cost, cost_mode, total_cost');
    if (!prev) {
      return res.status(404).json({ success: false, error: 'Собрание не найдено' });
    }
    const { table } = MEETING_OWNERS[eventType];

    const upd = buildFeeUpdate(patch, 1);
    if (!upd.isEmpty) {
      await pool.query(
        `UPDATE "public"."${table}" SET ${upd.clause} WHERE id = $${upd.values.length + 1}`,
        [...upd.values, eventId]
      );
    }

    const nextMode = patch.cost_mode ?? prev.cost_mode;
    const nextFee = 'cost' in patch ? patch.cost : (prev.cost === null ? null : Number(prev.cost));
    const nextTotal = 'total_cost' in patch ? patch.total_cost : (prev.total_cost === null ? null : Number(prev.total_cost));
    const oldFee = prev.cost === null ? null : Number(prev.cost);
    const oldTotal = prev.total_cost === null ? null : Number(prev.total_cost);

    const feeChanged = nextMode === 'split'
      ? (oldTotal !== nextTotal || prev.cost_mode !== nextMode)
      : (oldFee !== nextFee || prev.cost_mode !== nextMode);

    if (feeChanged) {
      getMeetingInfo(eventId, eventType).then(info => {
        sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'schedule', {
          title: 'Изменение стоимости',
          body: nextMode === 'split'
            ? formatSplitCostChange(oldTotal, nextTotal, `собрания ${info.text}`)
            : formatFeeChange(oldFee, nextFee, `собрания ${info.text}`),
          url: eventUrl(eventType, eventId),
          tag: `fee-${eventId}`,
        });
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Стоимость собрания успешно обновлена' });
  } catch (err) {
    console.error('Ошибка обновления стоимости собрания:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОЛНОЕ УДАЛЕНИЕ СОБРАНИЯ ИЗ КАЛЕНДАРЯ
// Каскадно удаляет отметки присутствия
// =============================================================================
export const deleteMeeting = async (req, res) => {
  try {
    const { eventId } = req.params;
    // eventType может прийти как в query (DELETE без body), так и в body. Порядок —
    // как у гейта: тело, потом query. Раньше здесь query читался первым, и тело
    // «team_meeting» проводило через проверку команды, а query «club_meeting»
    // удалял клубное собрание.
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
      return res.status(400).json({ success: false, error: 'Некорректный формат идентификатора собрания' });
    }

    if (!MEETING_OWNERS[eventType]) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    // Своё ли собрание — до чтения деталей для пуша и до любых удалений
    if (!(await loadMeeting(numericId, scope))) {
      return res.status(404).json({
        success: false,
        error: eventType === 'club_meeting' ? 'Клубное собрание не найдено' : 'Собрание не найдено',
      });
    }

    const eventInfo = await getMeetingInfo(numericId, eventType);

    if (eventType === 'team_meeting') {
      await pool.query(
        'DELETE FROM "public"."team_meeting_attendance" WHERE team_meeting_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."team_meeting" WHERE id = $1',
        [numericId]
      );

    } else {
      await pool.query(
        'DELETE FROM "public"."club_meeting_attendance" WHERE club_meeting_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."club_meeting" WHERE id = $1',
        [numericId]
      );
    }

    cancelScheduledNotifications(numericId).catch(() => {});
    sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'schedule', {
      title: 'Собрание отменено',
      body: eventInfo.text || 'Собрание удалено из расписания',
      url: '/', tag: `event-cancel-${numericId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'Собрание успешно удалено' });
  } catch (err) {
    console.error('Ошибка удаления собрания:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
