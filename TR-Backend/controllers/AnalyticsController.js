import pool from '../config/db.js';

// ── POST /api/analytics/page-view ────────────────────────────────────────
export const registerPageView = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page } = req.body;

    if (!page) {
      return res.status(400).json({ success: false, error: 'Не указана страница' });
    }

    // Дедупликация "видели ли уже этого пользователя в этом разделе сегодня" —
    // нужна, чтобы unique_count ниже считал каждого человека за день не более одного раза.
    // Календарный день — по часовому поясу клуба (Europe/Moscow), а не CURRENT_DATE,
    // который зависит от таймзоны сессии Postgres (обычно UTC) и сдвигал сутки на границе
    // полуночи по Москве.
    const dedupRes = await pool.query(
      `INSERT INTO page_visits_daily_seen (page, visit_date, user_id)
       VALUES ($1, (now() AT TIME ZONE 'Europe/Moscow')::date, $2)
       ON CONFLICT DO NOTHING`,
      [page, userId]
    );
    const isFirstVisitToday = dedupRes.rowCount > 0;

    await Promise.all([
      pool.query(
        `INSERT INTO page_visits (user_id, page, visit_count, last_visited_at)
         VALUES ($1, $2, 1, now())
         ON CONFLICT (user_id, page)
         DO UPDATE SET visit_count = page_visits.visit_count + 1, last_visited_at = now()`,
        [userId, page]
      ),
      pool.query(
        `INSERT INTO page_visits_daily (page, visit_date, visit_count, unique_count)
         VALUES ($1, (now() AT TIME ZONE 'Europe/Moscow')::date, 1, $2)
         ON CONFLICT (page, visit_date)
         DO UPDATE SET visit_count = page_visits_daily.visit_count + 1,
                       unique_count = page_visits_daily.unique_count + $2`,
        [page, isFirstVisitToday ? 1 : 0]
      )
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка регистрации посещения страницы:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
