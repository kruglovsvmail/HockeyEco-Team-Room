import pool from '../config/db.js';

// Уведомления команде от лиги (league_roster_notices): лига в LMS ввела человека в
// команду и её игровой состав, внося его в заявку по общей базе пользователей
// (глобальный параметр лиги league_roster_global_search). Пишет строки LMS-Backend
// (tournamentTeamController.notifyTeamAboutLeagueAdditions), по одной на получателя —
// владельца и руководителя команды. Здесь только чтение и отметка о показе: окно
// показывается при первом заходе в приложение и закрывается кнопкой.

// ── GET /api/league-notices/pending ──────────────────────────────────────
// Непоказанные уведомления текущего пользователя, старые первыми: если лига добавляла
// людей несколько раз, окна идут в порядке событий.
export const getPendingLeagueNotices = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.created_at,
              t.id AS team_id, t.name AS team_name, t.logo_url AS team_logo_url,
              d.name AS division_name,
              l.name AS league_name, l.logo_url AS league_logo_url,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'id', u.id, 'last_name', u.last_name,
                         'first_name', u.first_name, 'middle_name', u.middle_name
                       ) ORDER BY u.last_name, u.first_name)
                FROM users u WHERE u.id = ANY(n.player_ids)
              ), '[]'::json) AS players,
              -- Кто из сотрудников лиги добавил. NULL, если его аккаунт удалён
              ab.last_name AS added_by_last_name,
              ab.first_name AS added_by_first_name,
              ab.middle_name AS added_by_middle_name
       FROM league_roster_notices n
       JOIN tournament_teams tt ON tt.id = n.tournament_team_id
       JOIN teams t ON t.id = tt.team_id
       JOIN divisions d ON d.id = tt.division_id
       JOIN seasons s ON s.id = d.season_id
       JOIN leagues l ON l.id = s.league_id
       LEFT JOIN users ab ON ab.id = n.added_by
       WHERE n.recipient_user_id = $1 AND n.seen_at IS NULL
       ORDER BY n.created_at ASC, n.id ASC
       LIMIT 20`,
      [req.user.id]
    );
    res.json({ success: true, notices: rows });
  } catch (err) {
    // Таблицы ещё нет или сбой БД — приложение из-за окна-уведомления не блокируем
    console.error('Ошибка чтения уведомлений от лиги:', err.message);
    res.json({ success: true, notices: [] });
  }
};

// ── POST /api/league-notices/:id/seen ────────────────────────────────────
// Окно закрыто — второй раз не показываем. Чужое уведомление отметить нельзя.
export const markLeagueNoticeSeen = async (req, res) => {
  try {
    await pool.query(
      `UPDATE league_roster_notices
          SET seen_at = NOW()
        WHERE id = $1 AND recipient_user_id = $2 AND seen_at IS NULL`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка отметки уведомления от лиги:', err.message);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
