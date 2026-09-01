import pool from '../config/db.js';
import { COMMUNITY_EVENT_MAP } from './communityReserve.js';
import {
  sendPushToCommunityExcept,
  scheduleNotification,
  getCommunityEventInfo,
} from '../services/pushService.js';

// =============================================================================
// ПУБЛИКАЦИЯ СОБЫТИЙ СООБЩЕСТВА
//
// Создать событие и показать его участникам — не одно и то же. Лёд бронируют
// заранее, а открывают запись, когда решили, кого и когда собирать: иначе
// половина мест уходит за месяц случайным людям, а перед самой игрой состава нет.
//
// Три режима:
//   immediate    — видно сразу после создания (как было всегда);
//   before_event — открывается автоматически за N часов до начала;
//   manual       — пока штаб не нажмёт «Опубликовать сейчас».
//
// Опубликованность хранится как published_at: NULL значит «ещё не видно». Так
// и календарь фильтруется одним условием, и момент открытия остаётся в истории.
// =============================================================================

export const PUBLISH_MODES = ['immediate', 'before_event', 'manual'];

/**
 * Момент публикации при создании события. Отложенным режимам ставим NULL —
 * их откроет крон или человек кнопкой.
 */
export function initialPublishedAt(mode) {
  return mode === 'immediate' || !mode ? new Date() : null;
}

/**
 * Разбор режима публикации из тела запроса с учётом умолчаний сообщества.
 * Часы имеют смысл только у before_event, в остальных режимах их гасим:
 * иначе в базе останется мусор, по которому потом непонятно, что было задумано.
 */
export function parsePublishSettings(body, defaults = {}) {
  const rawMode = body.publish_mode ?? defaults.default_publish_mode ?? 'immediate';
  const mode = PUBLISH_MODES.includes(rawMode) ? rawMode : 'immediate';

  if (mode !== 'before_event') {
    return { publish_mode: mode, publish_hours_before: null };
  }

  const rawHours = body.publish_hours_before ?? defaults.default_publish_hours_before ?? 24;
  const hours = Math.min(Math.max(Math.round(Number(rawHours) || 0), 1), 720);
  return { publish_mode: mode, publish_hours_before: hours };
}

/**
 * Оповещение о событии: пуш участникам и напоминание за сутки. Вынесено сюда,
 * потому что зовётся из двух мест — при создании сразу опубликованного события
 * и при его публикации позже, кроном или кнопкой.
 */
export async function announceCommunityEvent({ event, eventType, communityId, exceptUserId = null }) {
  const cfg = COMMUNITY_EVENT_MAP[eventType];
  if (!cfg) return;

  const info = await getCommunityEventInfo(event.id, eventType);
  const route = eventType === 'community_game' ? 'community-game' : 'community-training';
  const isGame = eventType === 'community_game';

  await sendPushToCommunityExcept(Number(communityId), exceptUserId, 'schedule', {
    title: isGame ? 'Новая солянка' : 'Новая тренировка',
    body: `${event.title} — ${info.text}`,
    url: `/event/${route}/${event.id}`,
    tag: `new-${eventType}-${event.id}`,
  });

  // Напоминание за сутки. Если до события меньше суток, оно бессмысленно —
  // scheduleNotification такие моменты и так отбрасывает, проверяем здесь же.
  const sendAt = new Date(new Date(event[cfg.dateCol]).getTime() - 24 * 3600_000);
  if (sendAt > new Date()) {
    await scheduleNotification({
      type: 'event_reminder_24h',
      communityId: Number(communityId),
      eventId: event.id,
      sendAt,
      payload: {
        title: isGame ? 'Завтра солянка' : 'Завтра тренировка',
        body: `${event.title} — ${info.text}`,
        url: `/event/${route}/${event.id}`,
        tag: `reminder-${eventType}-${event.id}`,
      },
    });
  }
}

/**
 * Открыть событие участникам. Возвращает строку события, если публикация
 * действительно произошла, и null, если оно уже было опубликовано — повторный
 * пуш о «новом» событии людям не нужен.
 */
export async function publishCommunityEvent(eventType, eventId, exceptUserId = null) {
  const cfg = COMMUNITY_EVENT_MAP[eventType];
  if (!cfg) return null;

  const { rows } = await pool.query(`
    UPDATE "public"."${cfg.table}"
    SET published_at = NOW()
    WHERE id = $1 AND published_at IS NULL
    RETURNING *
  `, [eventId]);

  if (rows.length === 0) return null;

  const event = rows[0];
  await announceCommunityEvent({
    event, eventType, communityId: event.community_id, exceptUserId,
  }).catch(err => console.error('[Community Publish Notify Error]:', err.message));

  return event;
}

/**
 * Крон: открывает события, у которых подошёл срок автоматической публикации.
 * Ручной режим не трогаем — его открывает только человек.
 */
export async function publishDueCommunityEvents() {
  for (const [eventType, cfg] of Object.entries(COMMUNITY_EVENT_MAP)) {
    try {
      const { rows } = await pool.query(`
        SELECT id FROM "public"."${cfg.table}"
        WHERE published_at IS NULL
          AND publish_mode = 'before_event'
          AND publish_hours_before IS NOT NULL
          AND NOW() >= "${cfg.dateCol}" - (publish_hours_before * INTERVAL '1 hour')
      `);

      for (const row of rows) {
        await publishCommunityEvent(eventType, row.id);
      }
    } catch (error) {
      console.error(`[Community Auto Publish Error: ${eventType}]:`, error.message);
    }
  }
}
