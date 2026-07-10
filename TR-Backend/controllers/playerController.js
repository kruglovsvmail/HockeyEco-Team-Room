import pool from '../config/db.js';

// Профиль игрока для мобильного приложения (правая выезжающая панель) —
// та же логика и те же таблицы, что и в LMS-Backend/controllers/playerController.js
// (общая БД), просто отдельная реализация под auth-модель Team-Room.
export const getPlayerProfile = async (req, res) => {
  try {
    const { playerId } = req.params;

    const infoQuery = `
      SELECT
        u.id, u.first_name, u.last_name, u.middle_name,
        u.birth_date, u.height, u.weight, u.grip, u.avatar_url,
        COALESCE(
          (
            SELECT json_agg(json_build_object('url', sub.photo_url, 'teamLogo', sub.logo_url, 'teamId', sub.team_id))
            FROM (
              SELECT DISTINCT tm.photo_url, t.logo_url, tm.team_id
              FROM "public"."team_members" tm
              JOIN "public"."teams" t ON tm.team_id = t.id
              WHERE tm.user_id = u.id AND tm.photo_url IS NOT NULL
            ) sub
          ),
          '[]'::json
        ) as team_photos
      FROM "public"."users" u
      WHERE u.id = $1
    `;

    const statsQuery = `
      SELECT
        s.name as season_name,
        s.is_active as is_current,

        l.short_name as league_name,
        l.name as league_full_name,
        l.logo_url as league_logo,
        l.city as league_city,

        d.name as division_name,
        d.logo_url as division_logo,

        t.id as team_id,
        t.short_name as team_short_name,
        t.name as team_name,
        t.name as team_full_name,
        t.logo_url as team_logo,
        t.city as team_city,

        tr.position,
        lq.short_name as qual_name,
        lq.name as qual_full_name,
        lq.description as qual_description,

        ps.games_played as gp,
        ps.goals as g,
        ps.assists as a,
        ps.points as pts,
        ps.plus_minus as pm,
        ps.penalty_minutes as pim,
        ps.shots_against as sa,
        ps.goals_against as ga,
        ps.saves as sv,
        ps.save_percent as svp
      FROM "public"."player_statistics" ps
      JOIN "public"."tournament_rosters" tr ON ps.tournament_roster_id = tr.id
      JOIN "public"."tournament_teams" tt ON tr.tournament_team_id = tt.id
      JOIN "public"."teams" t ON tt.team_id = t.id
      JOIN "public"."divisions" d ON tt.division_id = d.id
      JOIN "public"."seasons" s ON d.season_id = s.id
      JOIN "public"."leagues" l ON s.league_id = l.id
      LEFT JOIN "public"."league_qualifications" lq ON tr.qualification_id = lq.id
      WHERE tr.player_id = $1
      ORDER BY s.start_date DESC
    `;

    // LEFT JOIN на divisions/seasons/leagues — у товарищеских/внешних матчей
    // (division_id IS NULL) лиги нет, но сам матч в истории должен остаться.
    const matchesQuery = `
      SELECT
        g.id as game_id,
        g.game_date,
        g.is_technical,
        g.end_type,
        s.name as season_name,

        l.short_name as league_name,
        l.name as league_full_name,
        l.logo_url as league_logo,
        l.city as league_city,

        d.name as division_name,
        g.stage_type,
        g.home_score,
        g.away_score,
        g.home_team_id,
        g.away_team_id,

        t_home.short_name as home_team,
        t_home.name as home_team_full,
        t_home.logo_url as home_team_logo,
        t_home.city as home_team_city,

        COALESCE(t_away.short_name, eo.short_name) as away_team,
        COALESCE(t_away.name, eo.name) as away_team_full,
        COALESCE(t_away.logo_url, eo.logo_url) as away_team_logo,
        COALESCE(t_away.city, eo.city) as away_team_city,

        gr.team_id as player_team_id,
        gr.position_in_line as position
      FROM "public"."game_rosters" gr
      JOIN "public"."games" g ON gr.game_id = g.id
      LEFT JOIN "public"."divisions" d ON g.division_id = d.id
      LEFT JOIN "public"."seasons" s ON d.season_id = s.id
      LEFT JOIN "public"."leagues" l ON s.league_id = l.id
      JOIN "public"."teams" t_home ON g.home_team_id = t_home.id
      LEFT JOIN "public"."teams" t_away ON g.away_team_id = t_away.id
      LEFT JOIN "public"."external_opponents" eo ON g.away_external_id = eo.id
      WHERE gr.player_id = $1 AND g.status = 'finished'
      ORDER BY g.game_date DESC
    `;

    const [infoRes, statsRes, matchesRes] = await Promise.all([
      pool.query(infoQuery, [playerId]),
      pool.query(statsQuery, [playerId]),
      pool.query(matchesQuery, [playerId]),
    ]);

    if (infoRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Игрок не найден' });
    }

    res.json({
      success: true,
      info: infoRes.rows[0],
      stats: statsRes.rows,
      matches: matchesRes.rows,
    });
  } catch (err) {
    console.error('Ошибка профиля игрока:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке профиля игрока' });
  }
};
