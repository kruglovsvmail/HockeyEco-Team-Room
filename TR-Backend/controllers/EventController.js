import pool from '../config/db.js';

export const getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const dateFilter = startDate && endDate 
      ? `AND event_date BETWEEN $2 AND $3` 
      : ``;

    const query = `
      WITH user_context AS (
        SELECT 
          (SELECT count(*) FROM team_members WHERE user_id = $1 AND left_at IS NULL) as active_teams,
          (SELECT count(*) FROM club_members WHERE user_id = $1 AND left_at IS NULL) as active_clubs
      ),
      user_teams AS (
        SELECT team_id FROM team_members WHERE user_id = $1 AND left_at IS NULL
        UNION
        SELECT t.id FROM clubs c 
        JOIN club_members cm ON c.id = cm.club_id 
        JOIN teams t ON t.club_id = c.id 
        WHERE cm.user_id = $1 AND cm.left_at IS NULL
      ),
      user_clubs AS (
        SELECT club_id FROM club_members WHERE user_id = $1 AND left_at IS NULL
      ),

      -- ==========================================
      -- БЛОК 1: МАТЧИ (games)
      -- ==========================================
      games_cte AS (
        SELECT 
          g.id::int AS event_id,
          'match'::varchar AS event_type,
          g.game_date::timestamptz AS event_date,
          g.status::varchar AS status,
          a.name::varchar AS arena_name,
          a.timezone::varchar AS arena_timezone,
          
          ut.team_id::int AS my_team_id,
          g.home_team_id::int AS home_team_id,
          
          my_team.name::varchar AS my_team_name,
          my_team.logo_url::varchar AS my_team_logo_url,
          
          (CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END)::int AS opponent_team_id,
          COALESCE(opp_team.name, ext_opp.name)::varchar AS opponent_name,
          COALESCE(opp_team.logo_url, ext_opp.logo_url)::varchar AS opponent_logo_url,
          
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_player_fee ELSE g.away_player_fee END)::numeric AS my_fee,
          g.home_score::int AS home_score,
          g.away_score::int AS away_score,
          
          (g.is_technical::text IN ('true', 't', '1', 'yes', 'y'))::boolean AS is_technical,
          g.end_type::varchar AS end_type,
          
          d.logo_url::varchar AS division_logo_url,
          g.stage_type::varchar AS stage_type,

          g.home_jersey_type::varchar AS home_jersey,
          g.away_jersey_type::varchar AS away_jersey,
          
          g.video_yt_url::varchar AS video_yt_url,
          g.video_vk_url::varchar AS video_vk_url,

          (CASE 
            WHEN (SELECT active_clubs FROM user_context) = 0 AND (SELECT active_teams FROM user_context) = 1 THEN false 
            ELSE true 
          END)::boolean AS show_team_context,

          (EXISTS (SELECT 1 FROM team_game_attendance tga WHERE tga.game_id = g.id AND tga.user_id = $1 AND tga.team_id = ut.team_id))::boolean AS is_attending,
          
          (CASE 
            WHEN g.stage_type = 'friendly' THEN
              COALESCE(
                (SELECT CASE WHEN tr.left_at IS NOT NULL THEN 'unregistered' ELSE 'allowed' END
                 FROM team_rosters tr JOIN team_members tm ON tr.member_id = tm.id
                 WHERE tm.user_id = $1 AND tm.team_id = ut.team_id ORDER BY tr.left_at NULLS FIRST LIMIT 1),
                'not_in_team'
              )
            ELSE
              CASE 
                WHEN EXISTS (
                  SELECT 1 FROM disqualifications dq 
                  JOIN tournament_rosters tr_dq ON dq.tournament_roster_id = tr_dq.id
                  JOIN tournament_teams tt_dq ON tr_dq.tournament_team_id = tt_dq.id
                  WHERE tr_dq.player_id = $1 AND tt_dq.division_id = g.division_id AND dq.status = 'active'
                ) THEN 'disqualified'
                ELSE COALESCE(
                  (SELECT CASE 
                            WHEN tr.period_end IS NOT NULL THEN 'unregistered'
                            WHEN tr.application_status != 'approved' THEN 'not_approved'
                            ELSE 'allowed'
                          END
                   FROM tournament_rosters tr
                   JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                   WHERE tt.division_id = g.division_id AND tt.team_id = ut.team_id AND tr.player_id = $1
                   ORDER BY tr.period_end NULLS FIRST LIMIT 1),
                  'not_in_tournament'
                )
              END
          END)::varchar AS toggle_status

        FROM user_teams ut
        JOIN games g ON (g.home_team_id = ut.team_id OR g.away_team_id = ut.team_id)
        LEFT JOIN arenas a ON g.arena_id = a.id
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN teams my_team ON my_team.id = ut.team_id
        LEFT JOIN teams opp_team ON opp_team.id = CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END
        LEFT JOIN external_opponents ext_opp ON g.away_external_id = ext_opp.id
      ),

      -- ==========================================
      -- БЛОК 2: КОМАНДНЫЕ ТРЕНИРОВКИ (team_training)
      -- ==========================================
      team_trainings_cte AS (
        SELECT 
          tt.id::int AS event_id,
          'team_training'::varchar AS event_type,
          tt.training_date::timestamptz AS event_date,
          (CASE WHEN tt.training_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          a.name::varchar AS arena_name,
          a.timezone::varchar AS arena_timezone,
          
          ut.team_id::int AS my_team_id,
          NULL::int AS home_team_id,
          
          my_team.name::varchar AS my_team_name,
          my_team.logo_url::varchar AS my_team_logo_url,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          tt.cost::numeric AS my_fee,
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          NULL::varchar AS division_logo_url, 
          NULL::varchar AS stage_type,
          
          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,
          
          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,
          
          (CASE WHEN (SELECT active_clubs FROM user_context) = 0 AND (SELECT active_teams FROM user_context) = 1 THEN false ELSE true END)::boolean AS show_team_context,
          
          (EXISTS (SELECT 1 FROM team_training_attendance tta WHERE tta.team_training_id = tt.id AND tta.user_id = $1))::boolean AS is_attending,
          
          (COALESCE(
            (SELECT CASE WHEN tr.left_at IS NOT NULL THEN 'unregistered' ELSE 'allowed' END
             FROM team_rosters tr JOIN team_members tm ON tr.member_id = tm.id
             WHERE tm.user_id = $1 AND tm.team_id = ut.team_id ORDER BY tr.left_at NULLS FIRST LIMIT 1),
            'not_in_team'
          ))::varchar AS toggle_status

        FROM user_teams ut
        JOIN team_training tt ON tt.team_id = ut.team_id
        LEFT JOIN arenas a ON tt.arena_id = a.id
        LEFT JOIN teams my_team ON my_team.id = ut.team_id
      ),

      -- ==========================================
      -- БЛОК 3: КОМАНДНЫЕ СОБРАНИЯ (team_meeting)
      -- ==========================================
      team_meetings_cte AS (
        SELECT 
          tm.id::int AS event_id,
          'team_meeting'::varchar AS event_type,
          tm.meeting_date::timestamptz AS event_date,
          (CASE WHEN tm.meeting_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          a.name::varchar AS arena_name,
          a.timezone::varchar AS arena_timezone,
          
          ut.team_id::int AS my_team_id,
          NULL::int AS home_team_id,
          
          my_team.name::varchar AS my_team_name,
          my_team.logo_url::varchar AS my_team_logo_url,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          tm.cost::numeric AS my_fee, 
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          NULL::varchar AS division_logo_url, 
          NULL::varchar AS stage_type,
          
          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,
          
          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,
          
          (CASE WHEN (SELECT active_clubs FROM user_context) = 0 AND (SELECT active_teams FROM user_context) = 1 THEN false ELSE true END)::boolean AS show_team_context,
          (EXISTS (SELECT 1 FROM team_meeting_attendance tma WHERE tma.team_meeting_id = tm.id AND tma.user_id = $1))::boolean AS is_attending,
          'allowed'::varchar AS toggle_status 

        FROM user_teams ut
        JOIN team_meeting tm ON tm.team_id = ut.team_id
        LEFT JOIN arenas a ON tm.arena_id = a.id
        LEFT JOIN teams my_team ON my_team.id = ut.team_id
      ),

      -- ==========================================
      -- БЛОК 4: КЛУБНЫЕ ТРЕНИРОВКИ (club_training)
      -- ==========================================
      club_trainings_cte AS (
        SELECT 
          ct.id::int AS event_id,
          'club_training'::varchar AS event_type,
          ct.training_date::timestamptz AS event_date,
          (CASE WHEN ct.training_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          a.name::varchar AS arena_name,
          a.timezone::varchar AS arena_timezone,
          
          NULL::int AS my_team_id,
          NULL::int AS home_team_id,
          
          c.name::varchar AS my_team_name,
          c.logo_url::varchar AS my_team_logo_url,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          ct.cost::numeric AS my_fee, 
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          NULL::varchar AS division_logo_url, 
          NULL::varchar AS stage_type,
          
          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,
          
          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,
          
          false::boolean AS show_team_context, 
          (EXISTS (SELECT 1 FROM club_training_attendance cta WHERE cta.club_training_id = ct.id AND cta.user_id = $1))::boolean AS is_attending,
          'allowed'::varchar AS toggle_status

        FROM user_clubs uc
        JOIN club_training ct ON ct.club_id = uc.club_id
        LEFT JOIN arenas a ON ct.arena_id = a.id
        LEFT JOIN clubs c ON c.id = uc.club_id
      ),

      -- ==========================================
      -- БЛОК 5: КЛУБНЫЕ СОБРАНИЯ (club_meeting)
      -- ==========================================
      club_meetings_cte AS (
        SELECT 
          cm.id::int AS event_id,
          'club_meeting'::varchar AS event_type,
          cm.meeting_date::timestamptz AS event_date,
          (CASE WHEN cm.meeting_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          a.name::varchar AS arena_name,
          a.timezone::varchar AS arena_timezone,
          
          NULL::int AS my_team_id,
          NULL::int AS home_team_id,
          
          c.name::varchar AS my_team_name,
          c.logo_url::varchar AS my_team_logo_url,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          cm.cost::numeric AS my_fee, 
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          NULL::varchar AS division_logo_url, 
          NULL::varchar AS stage_type,
          
          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,
          
          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,
          
          false::boolean AS show_team_context,
          (EXISTS (SELECT 1 FROM club_meeting_attendance cma WHERE cma.club_meeting_id = cm.id AND cma.user_id = $1))::boolean AS is_attending,
          'allowed'::varchar AS toggle_status

        FROM user_clubs uc
        JOIN club_meeting cm ON cm.club_id = uc.club_id
        LEFT JOIN arenas a ON cm.arena_id = a.id
        LEFT JOIN clubs c ON c.id = uc.club_id
      )

      -- ==========================================
      -- ФИНАЛЬНАЯ СКЛЕЙКА (UNION ALL)
      -- ==========================================
      SELECT * FROM (
        SELECT * FROM games_cte
        UNION ALL
        SELECT * FROM team_trainings_cte
        UNION ALL
        SELECT * FROM team_meetings_cte
        UNION ALL
        SELECT * FROM club_trainings_cte
        UNION ALL
        SELECT * FROM club_meetings_cte
      ) AS all_events
      WHERE 1=1 ${startDate && endDate ? dateFilter : ''}
      ORDER BY event_date ASC;
    `;

    const queryParams = [userId];
    if (startDate && endDate) {
      queryParams.push(startDate, endDate);
    }

    const result = await pool.query(query, queryParams);
    res.json({ success: true, cards: result.rows });
  } catch (err) {
    console.error('Ошибка получения событий:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const toggleEventAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    
    const { isAttending, eventType, teamId } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    switch (eventType) {
      case 'match':
        if (!teamId) return res.status(400).json({ success: false, error: 'teamId обязателен для матча' });
        if (isAttending) {
          await pool.query(`INSERT INTO team_game_attendance (game_id, user_id, team_id) VALUES ($1, $2, $3) ON CONFLICT ON CONSTRAINT team_game_att_unique DO NOTHING`, [eventId, userId, teamId]);
        } else {
          await pool.query(`DELETE FROM team_game_attendance WHERE game_id = $1 AND user_id = $2 AND team_id = $3`, [eventId, userId, teamId]);
        }
        break;

      case 'team_training':
        if (isAttending) {
          await pool.query(`INSERT INTO team_training_attendance (team_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_train_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM team_training_attendance WHERE team_training_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      case 'team_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO team_meeting_attendance (team_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_meet_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM team_meeting_attendance WHERE team_meeting_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      case 'club_training':
        if (isAttending) {
          await pool.query(`INSERT INTO club_training_attendance (club_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_train_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM club_training_attendance WHERE club_training_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      case 'club_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO club_meeting_attendance (club_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_meet_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM club_meeting_attendance WHERE club_meeting_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип события' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка переключения тумблера:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};