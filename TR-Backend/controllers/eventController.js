/********** ФАЙЛ: TR-Backend\controllers\eventController.js **********/

import pool from '../config/db.js';

export const getWeeklyEvents = async (req, res) => {
  try {
    const { teamIds, startDate, endDate } = req.body;
    const currentUserId = req.user.id;

    if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
      return res.json({ success: true, events: [] });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Не указан диапазон дат' });
    }

    // --- 1. ЗАПРОС РЕАЛЬНЫХ МАТЧЕЙ ---
    const gamesQuery = `
      SELECT 
        g.id, 
        'game' as event_type, 
        g.game_date as date, 
        g.status,
        g.home_score, 
        g.away_score, 
        g.game_type,
        g.stage_label,
        g.series_number,
        t_home.name as home_name, 
        t_home.short_name as home_short, 
        t_home.logo_url as home_logo,
        t_away.name as away_name, 
        t_away.short_name as away_short, 
        t_away.logo_url as away_logo,
        a.name as location_name,
        a.timezone as timezone,
        d.short_name as division_short_name,
        s.name as season_name,
        l.short_name as league_short_name,
        EXISTS(SELECT 1 FROM game_attendance ga WHERE ga.game_id = g.id AND ga.user_id = $4) as is_user_attending,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'id', u.id, 
              'name', COALESCE(u.last_name || ' ' || u.first_name, u.first_name, 'Без имени'), 
              'avatar_url', u.avatar_url
            ))
           FROM game_attendance ga
           JOIN users u ON ga.user_id = u.id
           WHERE ga.game_id = g.id),
          '[]'::json
        ) as attendees
      FROM games g
      LEFT JOIN teams t_home ON g.home_team_id = t_home.id
      LEFT JOIN teams t_away ON g.away_team_id = t_away.id
      LEFT JOIN arenas a ON g.arena_id = a.id
      LEFT JOIN divisions d ON g.division_id = d.id
      LEFT JOIN seasons s ON d.season_id = s.id
      LEFT JOIN leagues l ON s.league_id = l.id
      WHERE (g.home_team_id = ANY($1::int[]) OR g.away_team_id = ANY($1::int[]))
        AND g.game_date >= $2::timestamp 
        AND g.game_date <= $3::timestamp
    `;
    
    const gamesResult = await pool.query(gamesQuery, [teamIds, startDate, endDate, currentUserId]);

    // --- 2. ЗАПРОС РЕАЛЬНЫХ ВНУТРЕННИХ СОБЫТИЙ (Тренировки/Собрания) ---
    const internalEventsQuery = `
      SELECT 
        te.id, 
        te.event_type, 
        te.event_date as date, 
        'scheduled' as status,
        te.title,
        el.name as location_name,
        EXISTS(SELECT 1 FROM event_attendance ea WHERE ea.event_id = te.id AND ea.user_id = $4) as is_user_attending,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'id', u.id, 
              'name', COALESCE(u.last_name || ' ' || u.first_name, u.first_name, 'Без имени'), 
              'avatar_url', u.avatar_url
            ))
           FROM event_attendance ea
           JOIN users u ON ea.user_id = u.id
           WHERE ea.event_id = te.id),
          '[]'::json
        ) as attendees
      FROM team_events te
      LEFT JOIN entity_locations el ON te.entity_location_id = el.id
      WHERE (
        te.team_id = ANY($1::int[]) 
        OR te.club_id IN (SELECT club_id FROM teams WHERE id = ANY($1::int[]) AND club_id IS NOT NULL)
      )
        AND te.event_date >= $2::timestamp 
        AND te.event_date <= $3::timestamp
    `;

    const internalEventsResult = await pool.query(internalEventsQuery, [teamIds, startDate, endDate, currentUserId]);

    // --- 3. ОБЪЕДИНЯЕМ И СОРТИРУЕМ ---
    const allEvents = [...gamesResult.rows, ...internalEventsResult.rows].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json({ success: true, events: allEvents });
  } catch (err) {
    console.error('getWeeklyEvents error:', err);
    res.status(500).json({ success: false, error: 'Ошибка при получении расписания' });
  }
};

export const toggleGameAttendance = async (req, res) => {
  try {
    const { targetId } = req.body;
    const userId = req.user.id;
    
    if (req.method === 'POST') {
      await pool.query('INSERT INTO game_attendance (game_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetId, userId]);
    } else if (req.method === 'DELETE') {
      await pool.query('DELETE FROM game_attendance WHERE game_id = $1 AND user_id = $2', [targetId, userId]);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('toggleGameAttendance error:', err);
    res.status(500).json({ success: false, error: 'Ошибка обновления отметки' });
  }
};

export const toggleEventAttendance = async (req, res) => {
  try {
    const { targetId } = req.body;
    const userId = req.user.id;
    
    if (req.method === 'POST') {
      await pool.query('INSERT INTO event_attendance (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetId, userId]);
    } else if (req.method === 'DELETE') {
      await pool.query('DELETE FROM event_attendance WHERE event_id = $1 AND user_id = $2', [targetId, userId]);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('toggleEventAttendance error:', err);
    res.status(500).json({ success: false, error: 'Ошибка обновления отметки' });
  }
};