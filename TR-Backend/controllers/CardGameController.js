// TR-Backend/controllers/CardGameController.js
import pool from '../config/db.js';

export const getEventCards = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      WITH user_teams AS (
        -- Собираем все ID команд, к которым принадлежит пользователь
        SELECT team_id FROM team_members WHERE user_id = $1 AND left_at IS NULL
        UNION
        SELECT t.id FROM clubs c 
        JOIN club_members cm ON c.id = cm.club_id 
        JOIN teams t ON t.club_id = c.id 
        WHERE cm.user_id = $1 AND cm.left_at IS NULL
      )
      SELECT 
        g.id,
        g.game_date,
        g.status,
        g.stage_type,
        g.stage_label,
        g.series_number,
        g.home_team_id,
        g.away_team_id,
        g.home_jersey_type,
        g.away_jersey_type,
        g.home_player_fee,
        g.away_player_fee,
        g.home_score,
        g.away_score,
        g.end_type,
        g.is_technical,
        g.video_yt_url,
        g.video_vk_url,
        
        -- Данные арены
        a.name AS arena_name,
        a.timezone AS arena_timezone,
        
        -- Данные лиги и дивизиона
        l.short_name AS league_short_name,
        d.short_name AS division_short_name,
        
        -- КОНТЕКСТНАЯ КОМАНДА (за кого смотрим этот конкретный экземпляр карточки)
        ut.team_id AS my_team_id,
        my_team.name AS my_team_name,
        my_team.logo_url AS my_team_logo_url,
        
        -- Соперник (вторая сторона в матче)
        CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END AS opponent_team_id,
        COALESCE(opp_team.name, ext_opp.name) AS opponent_name,
        COALESCE(opp_team.logo_url, ext_opp.logo_url) AS opponent_logo_url,

        -- Данные о форме для ЭТОЙ команды в ЭТОМ матче
        my_tour_team.custom_jersey_dark_url,
        my_tour_team.custom_jersey_light_url,
        my_team.jersey_dark_url,
        my_team.jersey_light_url,
        
        -- Статус тумблера
        EXISTS (SELECT 1 FROM team_game_attendance tga WHERE tga.game_id = g.id AND tga.user_id = $1) AS is_attending,
        
        -- Права на тумблер (проверяем именно ту команду, за которую смотрим карточку)
        CASE 
          WHEN g.stage_type = 'friendly' THEN
            EXISTS (
              SELECT 1 FROM team_rosters tr 
              JOIN team_members tm ON tr.member_id = tm.id
              WHERE tm.user_id = $1 
              AND tm.team_id = ut.team_id 
              AND tr.left_at IS NULL
            )
          ELSE
            EXISTS (
              SELECT 1 FROM tournament_rosters tr
              JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
              WHERE tt.division_id = g.division_id 
              AND tt.team_id = ut.team_id
              AND tr.player_id = $1 
              AND tr.application_status = 'approved' 
              AND tr.period_end IS NULL
            )
        END AS can_toggle

      FROM user_teams ut
      -- Присоединяем игры, где участвует эта команда
      JOIN games g ON (g.home_team_id = ut.team_id OR g.away_team_id = ut.team_id)
      LEFT JOIN arenas a ON g.arena_id = a.id
      LEFT JOIN divisions d ON g.division_id = d.id
      LEFT JOIN seasons s ON d.season_id = s.id
      LEFT JOIN leagues l ON s.league_id = l.id
      
      -- Данные нашей команды
      LEFT JOIN teams my_team ON my_team.id = ut.team_id
      LEFT JOIN tournament_teams my_tour_team ON my_tour_team.team_id = ut.team_id AND my_tour_team.division_id = g.division_id
      
      -- Данные соперника
      LEFT JOIN teams opp_team ON opp_team.id = CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END
      LEFT JOIN external_opponents ext_opp ON g.away_external_id = ext_opp.id
      
      ORDER BY g.game_date ASC
    `;

    const result = await pool.query(query, [userId]);
    res.json({ success: true, cards: result.rows });

  } catch (err) {
    console.error('Ошибка получения карточек:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const toggleGameAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { gameId } = req.params;
    const { isAttending } = req.body;

    if (isAttending) {
      await pool.query(
        `INSERT INTO team_game_attendance (game_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [gameId, userId]
      );
    } else {
      await pool.query(
        `DELETE FROM team_game_attendance WHERE game_id = $1 AND user_id = $2`,
        [gameId, userId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка переключения тумблера:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};