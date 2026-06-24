import webpush from 'web-push';
import pool from '../config/db.js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Форматирование дат и деталей событий для текста уведомлений ──────────

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

function formatDateRu(date, tz) {
  if (!date) return '';
  const timeZone = tz || 'Europe/Moscow';
  try {
    const d = new Date(date);
    const parts = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'long' }).formatToParts(d);
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    return `${get('day')} ${MONTHS[d.toLocaleDateString('en', { timeZone, month: 'numeric' }) - 1]}, ${get('weekday')}, ${get('hour')}:${get('minute')}`;
  } catch {
    const d = new Date(date);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${DAYS[d.getUTCDay()]}, ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  }
}

export async function getMatchInfo(eventId) {
  const { rows } = await pool.query(
    `SELECT g.game_date, g.home_team_id, g.away_team_id, g.custom_timezone,
            COALESCE(a.name, g.location, 'Место не указано') AS arena,
            a.timezone AS arena_tz,
            ht.name AS home_name, at_t.name AS away_name,
            eo.name AS ext_opponent_name
     FROM games g
     LEFT JOIN arenas a ON a.id = g.arena_id
     LEFT JOIN teams ht ON ht.id = g.home_team_id
     LEFT JOIN teams at_t ON at_t.id = g.away_team_id
     LEFT JOIN external_opponents eo ON eo.id = g.away_external_id
     WHERE g.id = $1`, [eventId]
  );
  if (!rows[0]) return { text: '', date: '', arena: '' };
  const r = rows[0];
  const tz = r.custom_timezone || r.arena_tz || 'Europe/Moscow';
  const opponent = r.away_name || r.ext_opponent_name || 'Соперник';
  const homeName = r.home_name || 'Хозяева';
  const dateStr = formatDateRu(r.game_date, tz);
  return { text: `против ${opponent}, ${dateStr}, ${r.arena}`, date: dateStr, arena: r.arena, opponent, homeName };
}

export async function getTrainingInfo(eventId, eventType) {
  const table = eventType === 'club_training' ? 'club_training' : 'team_training';
  const { rows } = await pool.query(
    `SELECT t.training_date, t.custom_timezone,
            COALESCE(a.name, t.location, 'Место не указано') AS arena,
            a.timezone AS arena_tz
     FROM "${table}" t LEFT JOIN arenas a ON a.id = t.arena_id
     WHERE t.id = $1`, [eventId]
  );
  if (!rows[0]) return { text: '', date: '', arena: '' };
  const tz = rows[0].custom_timezone || rows[0].arena_tz || 'Europe/Moscow';
  const dateStr = formatDateRu(rows[0].training_date, tz);
  return { text: `${dateStr}, ${rows[0].arena}`, date: dateStr, arena: rows[0].arena };
}

export async function getMeetingInfo(eventId, eventType) {
  const table = eventType === 'club_meeting' ? 'club_meeting' : 'team_meeting';
  const { rows } = await pool.query(
    `SELECT m.meeting_date, m.custom_timezone,
            COALESCE(a.name, m.location, 'Место не указано') AS arena,
            a.timezone AS arena_tz
     FROM "${table}" m LEFT JOIN arenas a ON a.id = m.arena_id
     WHERE m.id = $1`, [eventId]
  );
  if (!rows[0]) return { text: '', date: '', arena: '' };
  const tz = rows[0].custom_timezone || rows[0].arena_tz || 'Europe/Moscow';
  const dateStr = formatDateRu(rows[0].meeting_date, tz);
  return { text: `${dateStr}, ${rows[0].arena}`, date: dateStr, arena: rows[0].arena };
}

export async function getUserName(userId) {
  const { rows } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
  return rows[0] ? `${rows[0].last_name} ${rows[0].first_name}` : 'Игрок';
}

export function formatFeeChange(oldFee, newFee, eventLabel) {
  const fmt = (v) => `${Number(v).toLocaleString('ru-RU')} ₽`;
  if (newFee === null || newFee === undefined) return `Стоимость ${eventLabel} — взнос снят`;
  if (Number(newFee) === 0) return `Стоимость ${eventLabel} — бесплатно`;
  if (oldFee === null || oldFee === undefined) return `Установлена стоимость ${eventLabel} — ${fmt(newFee)}`;
  if (Number(newFee) > Number(oldFee)) return `Стоимость ${eventLabel} — выросла до ${fmt(newFee)}`;
  if (Number(newFee) < Number(oldFee)) return `Стоимость ${eventLabel} — снизилась до ${fmt(newFee)}`;
  return `Стоимость ${eventLabel} — ${fmt(newFee)}`;
}

// ── Отправка push одному пользователю (на все его устройства) ────────────
export async function sendPushToUser(userId, { title, body, url, tag, icon }) {
  const { rows: subs } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  const payload = JSON.stringify({ title, body, url, tag, icon });
  const results = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      await pool.query('UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1', [sub.id]);
      results.push({ id: sub.id, ok: true });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      }
      results.push({ id: sub.id, ok: false, status: err.statusCode });
    }
  }
  return results;
}

// ── Отправка push всем участникам команды (с учётом настроек) ────────────
// groupKey — ключ группы из notification_settings ('schedule', 'attendance', 'lines', ...)
// filterFn — опциональная функция (userId, roles) => bool, для фильтра по ролям
export async function sendPushToTeam(teamId, groupKey, { title, body, url, tag, icon }, filterFn) {
  const { rows: members } = await pool.query(
    `SELECT tm.user_id
     FROM team_members tm
     WHERE tm.team_id = $1 AND tm.left_at IS NULL`,
    [teamId]
  );

  const userIds = members.map(m => m.user_id);
  if (userIds.length === 0) return;

  const { rows: settings } = await pool.query(
    `SELECT user_id, enabled, ${groupKey}
     FROM notification_settings
     WHERE team_id = $1 AND user_id = ANY($2)`,
    [teamId, userIds]
  );

  const settingsMap = {};
  settings.forEach(s => { settingsMap[s.user_id] = s; });

  for (const uid of userIds) {
    if (filterFn && !filterFn(uid)) continue;

    const s = settingsMap[uid];
    // Нет строки настроек = уведомления включены по умолчанию
    if (s && (!s.enabled || !s[groupKey])) continue;

    await sendPushToUser(uid, { title, body, url, tag, icon });
  }
}

// ── Отправка push всем, кроме инициатора ────────────────────────────────
export async function sendPushToTeamExcept(teamId, excludeUserId, groupKey, payload, filterFn) {
  await sendPushToTeam(teamId, groupKey, payload, (uid) => {
    if (uid === excludeUserId) return false;
    return filterFn ? filterFn(uid) : true;
  });
}

// ── Батчинг явок: откладываем на 3 минуты, агрегируем при отправке ──────
export async function batchAttendanceNotification(teamId, eventId, eventType, eventLabel) {
  const type = 'attendance_batch';
  const { rows } = await pool.query(
    `SELECT id, payload FROM scheduled_notifications
     WHERE type = $1 AND event_id = $2 AND team_id = $3 AND sent = false`,
    [type, eventId, teamId]
  );

  if (rows.length > 0) {
    const existing = rows[0];
    const p = existing.payload;
    p.count = (p.count || 1) + 1;
    p.body = `${p.count} игроков отметились на ${eventLabel}`;
    await pool.query(
      `UPDATE scheduled_notifications SET payload = $1, send_at = NOW() + INTERVAL '3 minutes' WHERE id = $2`,
      [JSON.stringify(p), existing.id]
    );
  } else {
    await pool.query(
      `INSERT INTO scheduled_notifications (type, team_id, event_id, send_at, payload)
       VALUES ($1, $2, $3, NOW() + INTERVAL '3 minutes', $4)`,
      [type, teamId, eventId, JSON.stringify({
        title: 'Новая отметка',
        body: `1 игрок отметился на ${eventLabel}`,
        url: `/event/${eventType}/${eventId}`,
        tag: `attendance-${eventId}`,
        count: 1,
      })]
    );
  }
}

// ── Хелпер: название типа события для текста уведомлений ────────────────
export function eventTypeLabel(eventType) {
  const map = { match: 'матч', team_training: 'тренировку', club_training: 'тренировку', training: 'тренировку', team_meeting: 'собрание', club_meeting: 'собрание', meeting: 'собрание' };
  return map[eventType] || 'событие';
}

// ── Создание отложенного уведомления ────────────────────────────────────
export async function scheduleNotification({ type, targetUserId, teamId, eventId, sendAt, payload }) {
  await pool.query(
    `INSERT INTO scheduled_notifications (type, target_user_id, team_id, event_id, send_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, targetUserId || null, teamId, eventId || null, sendAt, JSON.stringify(payload)]
  );
}

// ── Удаление запланированных уведомлений (при отмене события) ────────────
export async function cancelScheduledNotifications(eventId) {
  await pool.query(
    'DELETE FROM scheduled_notifications WHERE event_id = $1 AND sent = false',
    [eventId]
  );
}

// ── Обработка очереди отложенных (вызывается крон-джобом) ────────────────
export async function processScheduledNotifications() {
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_notifications WHERE sent = false AND send_at <= NOW() ORDER BY send_at LIMIT 50`
  );

  for (const n of rows) {
    try {
      // Дедлайны заявки/состава — проверяем, не подали ли уже
      if (n.type === 'roster_deadline' || n.type === 'lines_deadline') {
        const needed = await shouldSendDeadline(n);
        if (!needed) {
          await pool.query('UPDATE scheduled_notifications SET sent = true WHERE id = $1', [n.id]);
          continue;
        }
      }

      if (n.target_user_id) {
        await sendPushToUser(n.target_user_id, n.payload);
      } else {
        const groupMap = {
          event_reminder_24h: 'schedule',
          attendance_batch: 'attendance',
          birthday: 'team_news',
          roster_deadline: 'admin',
          lines_deadline: 'admin',
          friendly_confirm_deadline: 'admin',
        };
        const groupKey = groupMap[n.type] || 'schedule';
        await sendPushToTeam(n.team_id, groupKey, n.payload);
      }
      await pool.query('UPDATE scheduled_notifications SET sent = true WHERE id = $1', [n.id]);
    } catch (err) {
      console.error(`Ошибка отправки отложенного уведомления #${n.id}:`, err.message);
    }
  }
}

// ── Склонение «год/года/лет» ─────────────────────────────────────────────
function pluralizeAge(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} лет`;
  if (last > 1 && last < 5) return `${n} года`;
  if (last === 1) return `${n} год`;
  return `${n} лет`;
}

// ── Вычисление 08:00 по таймзоне в UTC ──────────────────────────────────
function get8amInTimezone(tz) {
  try {
    const now = new Date();
    const localStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    const target = new Date(`${localStr}T08:00:00`);
    const offset = getTimezoneOffsetMs(tz);
    return new Date(target.getTime() - offset);
  } catch {
    const today = new Date();
    today.setUTCHours(5, 0, 0, 0); // fallback: UTC+3 (Москва) → 08:00 = 05:00 UTC
    return today;
  }
}

function getTimezoneOffsetMs(tz) {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = now.toLocaleString('en-US', { timeZone: tz });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

// ── Крон дней рождения: проверяет именинников и планирует уведомления ────
// Для каждого получателя планирует доставку в 08:00 по его локальному времени
// (таймзона берётся из push_subscriptions устройства).
export async function processBirthdays() {
  try {
    const { rows: birthdayUsers } = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
              EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.birth_date))::int AS age
       FROM users u
       WHERE u.birth_date IS NOT NULL
         AND EXTRACT(MONTH FROM u.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY FROM u.birth_date) = EXTRACT(DAY FROM CURRENT_DATE)
         AND u.status = 'active'`
    );

    if (birthdayUsers.length === 0) return;

    for (const bUser of birthdayUsers) {
      const { rows: teams } = await pool.query(
        `SELECT team_id FROM team_members WHERE user_id = $1 AND left_at IS NULL`,
        [bUser.id]
      );

      const name = `${bUser.first_name} ${bUser.last_name}`;
      const ageText = bUser.age ? ` (${pluralizeAge(bUser.age)})` : '';
      const today = new Date().toISOString().slice(0, 10);

      for (const { team_id } of teams) {
        // Для каждого тиммейта — персональное уведомление с его таймзоной
        const { rows: teammates } = await pool.query(
          `SELECT DISTINCT tm.user_id,
                  COALESCE(ps.timezone, 'Europe/Moscow') AS tz
           FROM team_members tm
           LEFT JOIN push_subscriptions ps ON ps.user_id = tm.user_id
           WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tm.user_id != $2`,
          [team_id, bUser.id]
        );

        for (const mate of teammates) {
          // Защита от дублей
          const { rows: existing } = await pool.query(
            `SELECT id FROM scheduled_notifications
             WHERE type = 'birthday' AND target_user_id = $1
               AND payload->>'birthday_user_id' = $2
               AND send_at::date = CURRENT_DATE`,
            [mate.user_id, String(bUser.id)]
          );
          if (existing.length > 0) continue;

          const sendAt = get8amInTimezone(mate.tz);
          if (sendAt < new Date()) {
            sendAt.setUTCDate(sendAt.getUTCDate()); // уже после 8 утра — отправим сразу
          }

          await pool.query(
            `INSERT INTO scheduled_notifications (type, target_user_id, team_id, send_at, payload)
             VALUES ('birthday', $1, $2, $3, $4)`,
            [mate.user_id, team_id, sendAt, JSON.stringify({
              title: 'День рождения',
              body: `Сегодня день рождения: ${name}${ageText}!`,
              url: '/my-team',
              tag: `birthday-${bUser.id}-${today}`,
              birthday_user_id: String(bUser.id),
            })]
          );
        }
      }
    }
  } catch (err) {
    console.error('Ошибка обработки дней рождения:', err.message);
  }
}

// ── Планирование дедлайнов администрирования при создании матча ──────────
export async function scheduleMatchDeadlines(gameId, teamId, gameDate, confirmDeadline) {
  try {
    if (!gameDate) return;
    const gameTime = new Date(gameDate).getTime();

    // Дедлайн подачи заявки: за 2 часа до матча
    const rosterDeadlineSendAt = new Date(gameTime - 2 * 60 * 60 * 1000);
    if (rosterDeadlineSendAt > new Date()) {
      await pool.query(
        `INSERT INTO scheduled_notifications (type, team_id, event_id, send_at, payload)
         VALUES ('roster_deadline', $1, $2, $3, $4)`,
        [teamId, gameId, rosterDeadlineSendAt, JSON.stringify({
          title: 'Дедлайн заявки',
          body: 'До старта матча 2 часа — подайте заявку',
          url: `/event/match/${gameId}`,
          tag: `roster-deadline-${gameId}`,
        })]
      );
    }

    // Дедлайн редактирования состава: за 2 часа до матча (совпадает, но отдельный тип)
    const linesDeadlineSendAt = new Date(gameTime - 2 * 60 * 60 * 1000);
    if (linesDeadlineSendAt > new Date()) {
      await pool.query(
        `INSERT INTO scheduled_notifications (type, team_id, event_id, send_at, payload)
         VALUES ('lines_deadline', $1, $2, $3, $4)`,
        [teamId, gameId, linesDeadlineSendAt, JSON.stringify({
          title: 'Дедлайн состава',
          body: 'До старта матча 2 часа — проверьте состав',
          url: `/event/match/${gameId}`,
          tag: `lines-deadline-${gameId}`,
        })]
      );
    }

    // Дедлайн подтверждения товарищеского матча: за 1 час до дедлайна
    if (confirmDeadline) {
      const confirmTime = new Date(confirmDeadline).getTime();
      const confirmSendAt = new Date(confirmTime - 1 * 60 * 60 * 1000);
      if (confirmSendAt > new Date()) {
        await pool.query(
          `INSERT INTO scheduled_notifications (type, team_id, event_id, send_at, payload)
           VALUES ('friendly_confirm_deadline', $1, $2, $3, $4)`,
          [teamId, gameId, confirmSendAt, JSON.stringify({
            title: 'Дедлайн подтверждения',
            body: 'До дедлайна подтверждения товарищеского матча остался 1 час',
            url: `/event/match/${gameId}`,
            tag: `friendly-deadline-${gameId}`,
          })]
        );
      }
    }
  } catch (err) {
    console.error('Ошибка планирования дедлайнов матча:', err.message);
  }
}

// ── Крон-поллинг: отслеживание матчей от LMS (official) ─────────────────
// Ищет новые/изменённые official-матчи и рассылает push + планирует дедлайны.
export async function pollLmsGames() {
  try {
    const { rows: games } = await pool.query(`
      SELECT g.id, g.game_date, g.home_team_id, g.away_team_id, g.arena_id, g.status,
             g.push_processed_at, g.created_at, g.updated_at, g.custom_timezone,
             COALESCE(a.name, g.location, 'Место не указано') AS arena_name,
             a.timezone AS arena_tz,
             ht.name AS home_name, at_t.name AS away_name
      FROM games g
      LEFT JOIN arenas a ON a.id = g.arena_id
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at_t ON at_t.id = g.away_team_id
      WHERE g.game_type = 'official'
        AND g.home_team_id IS NOT NULL
        AND g.away_team_id IS NOT NULL
        AND (g.push_processed_at IS NULL OR g.updated_at > g.push_processed_at)
      LIMIT 30
    `);

    for (const g of games) {
      const isNew = g.push_processed_at === null;
      const tz = g.custom_timezone || g.arena_tz || 'Europe/Moscow';
      const dateStr = formatDateRu(g.game_date, tz);
      const opponent = g.away_name || 'Соперник';
      const homeName = g.home_name || 'Команда';
      const teamIds = [g.home_team_id, g.away_team_id].filter(Boolean);

      if (isNew) {
        // Новый матч от лиги
        for (const tid of teamIds) {
          const oppName = tid === g.home_team_id ? opponent : homeName;
          sendPushToTeam(tid, 'tournaments', {
            title: 'Новый матч от лиги',
            body: `против ${oppName}, ${dateStr}, ${g.arena_name}`,
            url: `/event/match/${g.id}`,
            tag: `lms-new-${g.id}`,
          }).catch(() => {});

          // Напоминание за 24ч
          if (g.game_date) {
            const reminder24 = new Date(new Date(g.game_date).getTime() - 24 * 60 * 60 * 1000);
            if (reminder24 > new Date()) {
              await pool.query(
                `INSERT INTO scheduled_notifications (type, team_id, event_id, send_at, payload)
                 VALUES ('event_reminder_24h', $1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [tid, g.id, reminder24, JSON.stringify({
                  title: 'Матч через 24 часа',
                  body: `против ${oppName}, ${dateStr}, ${g.arena_name}`,
                  url: `/event/match/${g.id}`,
                  tag: `reminder-${g.id}`,
                })]
              );
            }
          }

          // Дедлайны заявки и состава за 2ч
          await scheduleMatchDeadlines(g.id, tid, g.game_date, null);
        }
      } else {
        // Изменение матча (дата/время/арена)
        for (const tid of teamIds) {
          const oppName = tid === g.home_team_id ? opponent : homeName;
          sendPushToTeam(tid, 'schedule', {
            title: 'Матч изменён',
            body: `Новое расписание: против ${oppName}, ${dateStr}, ${g.arena_name}`,
            url: `/event/match/${g.id}`,
            tag: `event-update-${g.id}`,
          }).catch(() => {});
        }

        // Пересчитываем send_at во всех отложенных уведомлениях этого матча
        if (g.game_date) {
          const gameTime = new Date(g.game_date).getTime();
          const reminder24 = new Date(gameTime - 24 * 60 * 60 * 1000);
          const deadline2h = new Date(gameTime - 2 * 60 * 60 * 1000);

          await pool.query(
            `UPDATE scheduled_notifications SET send_at = $1,
               payload = jsonb_set(payload, '{body}', to_jsonb($3::text))
             WHERE event_id = $2 AND type = 'event_reminder_24h' AND sent = false`,
            [reminder24, g.id, `против ${g.away_name || 'Соперник'}, ${dateStr}, ${g.arena_name}`]
          );

          await pool.query(
            `UPDATE scheduled_notifications SET send_at = $1
             WHERE event_id = $2 AND type IN ('roster_deadline', 'lines_deadline') AND sent = false`,
            [deadline2h, g.id]
          );
        }
      }

      // Ставим метку — обработано
      await pool.query('UPDATE games SET push_processed_at = NOW() WHERE id = $1', [g.id]);
    }
  } catch (err) {
    console.error('Ошибка поллинга LMS-матчей:', err.message);
  }
}

// ── Проверка: нужно ли отправлять дедлайн (заявка/состав не поданы) ──────
// Вызывается из processScheduledNotifications перед отправкой дедлайна
export async function shouldSendDeadline(notification) {
  try {
    if (notification.type === 'roster_deadline') {
      const { rows } = await pool.query(
        'SELECT 1 FROM game_rosters WHERE game_id = $1 AND team_id = $2 LIMIT 1',
        [notification.event_id, notification.team_id]
      );
      return rows.length === 0;
    }
    if (notification.type === 'lines_deadline') {
      const { rows } = await pool.query(
        'SELECT 1 FROM team_formation_game WHERE game_id = $1 AND team_id = $2 LIMIT 1',
        [notification.event_id, notification.team_id]
      );
      return rows.length === 0;
    }
    return true;
  } catch {
    return true;
  }
}
