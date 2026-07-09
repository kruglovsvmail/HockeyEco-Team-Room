import pool from '../config/db.js';

// ── POST /api/push/subscribe ─────────────────────────────────────────────
export const subscribe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { endpoint, keys, deviceLabel, timezone } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, error: 'Неполные данные подписки' });
    }

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_label, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = $1, p256dh = $3, auth = $4, device_label = $5, timezone = $6, last_used_at = NOW()`,
      [userId, endpoint, keys.p256dh, keys.auth, deviceLabel || null, timezone || 'Europe/Moscow']
    );

    // Создаём настройки по умолчанию для всех команд пользователя, если ещё нет
    await pool.query(
      `INSERT INTO notification_settings (user_id, team_id)
       SELECT $1, tm.team_id
       FROM team_members tm
       WHERE tm.user_id = $1 AND tm.left_at IS NULL
       ON CONFLICT (user_id, team_id) DO NOTHING`,
      [userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка подписки на push:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── POST /api/push/unsubscribe ───────────────────────────────────────────
export const unsubscribe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { endpoint } = req.body;

    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [userId, endpoint]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка отписки от push:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── GET /api/push/settings ───────────────────────────────────────────────
export const getSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    // Подтягиваем настройки + все команды пользователя (даже если настройки ещё не созданы)
    const { rows } = await pool.query(
      `SELECT
         t.id AS team_id,
         t.name AS team_name,
         t.logo_url AS team_logo,
         COALESCE(ns.enabled, true) AS enabled,
         COALESCE(ns.schedule, true) AS schedule,
         COALESCE(ns.attendance, true) AS attendance,
         COALESCE(ns.lines, true) AS lines,
         COALESCE(ns.tournaments, true) AS tournaments,
         COALESCE(ns.friendly, true) AS friendly,
         COALESCE(ns.team_news, true) AS team_news,
         COALESCE(ns.admin, true) AS admin
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       LEFT JOIN notification_settings ns ON ns.user_id = tm.user_id AND ns.team_id = tm.team_id
       WHERE tm.user_id = $1 AND tm.left_at IS NULL
       ORDER BY t.name`,
      [userId]
    );

    // Проверяем, есть ли хотя бы одна подписка (устройство зарегистрировано)
    const { rows: subs } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      isSubscribed: subs[0].count > 0,
      teams: rows
    });
  } catch (err) {
    console.error('Ошибка получения настроек push:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// ── PUT /api/push/settings ───────────────────────────────────────────────
export const updateSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId, enabled, schedule, attendance, lines, tournaments, friendly, team_news, admin } = req.body;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    await pool.query(
      `INSERT INTO notification_settings (user_id, team_id, enabled, schedule, attendance, lines, tournaments, friendly, team_news, admin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, team_id) DO UPDATE SET
         enabled = $3, schedule = $4, attendance = $5, lines = $6,
         tournaments = $7, friendly = $8, team_news = $9, admin = $10`,
      [userId, teamId, enabled, schedule, attendance, lines, tournaments, friendly, team_news, admin]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка обновления настроек push:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
