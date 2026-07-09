import pool from '../config/db.js';
import { getTeamIdFromRequest } from '../utils/checkPermission.js';
import { sendPushToTeamExcept, cancelScheduledNotifications, getTrainingInfo, formatFeeChange } from '../services/pushService.js';

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
    const { eventType, date, time, arena_id, location, location_url, custom_timezone } = req.body;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }
    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Необходимо указать дату и время тренировки' });
    }

    // ── Читаем текущее состояние из БД ─────────────────────────────────────
    const table = eventType === 'team_training' ? 'team_training' : 'club_training';
    const currentRes = await pool.query(
      `SELECT arena_id, location, location_url, custom_timezone FROM "public"."${table}" WHERE id = $1`,
      [eventId]
    );
    if (currentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }
    const current = currentRes.rows[0];

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
      sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
        title: 'Тренировка изменена',
        body: `Новое расписание: ${info.text}`,
        url: `/event/${eventType}/${eventId}`, tag: `event-update-${eventId}`,
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
    const { eventType, player_fee } = req.body;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }

    // player_fee: null = не назначен, 0 = бесплатно, N = сумма
    // Явный null или undefined → NULL в БД (взнос не назначен)
    const fee = (player_fee === null || player_fee === undefined || player_fee === '') ? null : Number(player_fee);

    const table = eventType === 'team_training' ? 'team_training' : 'club_training';

    const check = await pool.query(
      `SELECT id, cost FROM "public"."${table}" WHERE id = $1`,
      [eventId]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }
    const oldFee = check.rows[0].cost;

    await pool.query(
      `UPDATE "public"."${table}" SET cost = $1 WHERE id = $2`,
      [fee, eventId]
    );

    if (oldFee !== fee) {
      getTrainingInfo(eventId, eventType).then(info => {
        sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
          title: 'Изменение стоимости',
          body: formatFeeChange(oldFee, fee, `тренировки ${info.text}`),
          url: `/event/${eventType}/${eventId}`,
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
// ПОЛНОЕ УДАЛЕНИЕ ТРЕНИРОВКИ ИЗ КАЛЕНДАРЯ
// Каскадно удаляет отметки присутствия
// =============================================================================
export const deleteTraining = async (req, res) => {
  try {
    const { eventId } = req.params;
    // eventType может прийти как в query (DELETE без body), так и в body
    const eventType = req.query.eventType || req.body?.eventType;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }

    const numericId = Number(eventId);
    if (isNaN(numericId)) {
      return res.status(400).json({ success: false, error: 'Некорректный формат идентификатора тренировки' });
    }

    // Сохраняем детали ДО удаления для текста уведомления
    const eventInfo = await getTrainingInfo(numericId, eventType);

    if (eventType === 'team_training') {
      const check = await pool.query(
        'SELECT id FROM "public"."team_training" WHERE id = $1',
        [numericId]
      );
      if (check.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
      }
      await pool.query(
        'DELETE FROM "public"."team_training_attendance" WHERE team_training_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."team_training" WHERE id = $1',
        [numericId]
      );

    } else if (eventType === 'club_training') {
      const check = await pool.query(
        'SELECT id FROM "public"."club_training" WHERE id = $1',
        [numericId]
      );
      if (check.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Клубная тренировка не найдена' });
      }
      await pool.query(
        'DELETE FROM "public"."club_training_attendance" WHERE club_training_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."club_training" WHERE id = $1',
        [numericId]
      );

    } else {
      return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    cancelScheduledNotifications(numericId).catch(() => {});
    sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
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