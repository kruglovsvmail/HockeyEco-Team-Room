import pool from '../config/db.js';
import { getTeamIdFromRequest } from '../utils/checkPermission.js';
import { sendPushToTeamExcept, cancelScheduledNotifications, getMeetingInfo, formatFeeChange } from '../services/pushService.js';

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
    const { eventType, date, time, arena_id, location, location_url, custom_timezone } = req.body;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }
    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Необходимо указать дату и время собрания' });
    }

    const table = eventType === 'team_meeting' ? 'team_meeting' : 'club_meeting';
    const currentRes = await pool.query(
      `SELECT arena_id, location, location_url, custom_timezone FROM "public"."${table}" WHERE id = $1`,
      [eventId]
    );
    if (currentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Собрание не найдено' });
    }
    const current = currentRes.rows[0];

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
      sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
        title: 'Собрание изменено',
        body: `Новое расписание: ${info.text}`,
        url: `/event/${eventType}/${eventId}`, tag: `event-update-${eventId}`,
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
    const { eventType, player_fee } = req.body;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Параметр eventType обязателен' });
    }

    const fee = (player_fee === null || player_fee === undefined || player_fee === '') ? null : Number(player_fee);
    const table = eventType === 'team_meeting' ? 'team_meeting' : 'club_meeting';

    const check = await pool.query(
      `SELECT id, cost FROM "public"."${table}" WHERE id = $1`,
      [eventId]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Собрание не найдено' });
    }
    const oldFee = check.rows[0].cost;

    await pool.query(
      `UPDATE "public"."${table}" SET cost = $1 WHERE id = $2`,
      [fee, eventId]
    );

    if (oldFee !== fee) {
      getMeetingInfo(eventId, eventType).then(info => {
        sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
          title: 'Изменение стоимости',
          body: formatFeeChange(oldFee, fee, `собрания ${info.text}`),
          url: `/event/${eventType}/${eventId}`,
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
      return res.status(400).json({ success: false, error: 'Некорректный формат идентификатора собрания' });
    }

    const eventInfo = await getMeetingInfo(numericId, eventType);

    if (eventType === 'team_meeting') {
      const check = await pool.query(
        'SELECT id FROM "public"."team_meeting" WHERE id = $1',
        [numericId]
      );
      if (check.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Собрание не найдено' });
      }
      await pool.query(
        'DELETE FROM "public"."team_meeting_attendance" WHERE team_meeting_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."team_meeting" WHERE id = $1',
        [numericId]
      );

    } else if (eventType === 'club_meeting') {
      const check = await pool.query(
        'SELECT id FROM "public"."club_meeting" WHERE id = $1',
        [numericId]
      );
      if (check.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Клубное собрание не найдено' });
      }
      await pool.query(
        'DELETE FROM "public"."club_meeting_attendance" WHERE club_meeting_id = $1',
        [numericId]
      );
      await pool.query(
        'DELETE FROM "public"."club_meeting" WHERE id = $1',
        [numericId]
      );

    } else {
      return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    cancelScheduledNotifications(numericId).catch(() => {});
    sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
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
