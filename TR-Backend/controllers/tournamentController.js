// tournamentController.js
import pool from '../config/db.js';

class TournamentController {
  
  // Получение всех турниров (одобренных), в которых участвует команда
  async getTeamTournaments(req, res) {
    try {
      const { teamId } = req.params;

      const query = `
        SELECT 
          tt.id as tournament_team_id,
          tt.status as application_status,
          d.id as division_id,
          d.name as division_name,
          d.logo_url as division_logo,
          l.name as league_name,
          s.name as season_name,
          s.id as season_id
        FROM tournament_teams tt
        JOIN divisions d ON tt.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        JOIN leagues l ON s.league_id = l.id
        WHERE tt.team_id = $1 AND tt.status = 'approved'
        ORDER BY s.start_date DESC
      `;

      const { rows } = await pool.query(query, [teamId]);

      return res.json({ 
        success: true, 
        tournaments: rows 
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getTeamTournaments:', err);
      return res.status(500).json({ 
        success: false, 
        error: 'Ошибка сервера при получении списка турниров' 
      });
    }
  }

  // Получение списка всех матчей конкретного дивизиона с учетом хоккейных исходов и коротких названий команд
  async getDivisionGames(req, res) {
    try {
      const { divisionId } = req.params;

      const query = `
        SELECT 
          g.id,
          g.game_type,
          g.status,
          g.stage_type,
          g.stage_label,
          g.series_number,
          g.game_date,
          g.home_score,
          g.away_score,
          g.game_number,
          g.end_type,
          g.is_technical,
          g.home_team_id,
          g.away_team_id,
          t_home.name as home_team_name,
          t_home.short_name as home_team_short_name,
          t_home.logo_url as home_team_logo,
          t_away.name as away_team_name,
          t_away.short_name as away_team_short_name,
          t_away.logo_url as away_team_logo,
          a.name as arena_name,
          (
            SELECT pr.wins_needed 
            FROM playoff_brackets pb
            JOIN playoff_rounds pr ON pb.id = pr.bracket_id
            WHERE pb.division_id = g.division_id AND pr.name = g.stage_label
            LIMIT 1
          ) as wins_needed
        FROM games g
        LEFT JOIN teams t_home ON g.home_team_id = t_home.id
        LEFT JOIN teams t_away ON g.away_team_id = t_away.id
        LEFT JOIN arenas a ON g.arena_id = a.id
        WHERE g.division_id = $1
        ORDER BY 
          CASE g.stage_type 
            WHEN 'regular' THEN 1 
            WHEN 'playoff' THEN 2 
            ELSE 3 
          END ASC,
          g.game_date ASC, 
          g.game_number ASC,
          g.id ASC
      `;

      const { rows } = await pool.query(query, [divisionId]);

      return res.json({
        success: true,
        games: rows
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionGames:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при генерации календаря игр'
      });
    }
  }

  // Получение актуальной турнирной таблицы дивизиона (Регулярный чемпионат)
  async getDivisionStandings(req, res) {
    try {
      const { divisionId } = req.params;

      const query = `
        SELECT 
          ds.*,
          t.name as team_name,
          t.short_name as team_short_name,
          t.logo_url as team_logo
        FROM division_standings ds
        JOIN teams t ON ds.team_id = t.id
        WHERE ds.division_id = $1
        ORDER BY ds.rank ASC, ds.points DESC
      `;

      const { rows } = await pool.query(query, [divisionId]);

      return res.json({
        success: true,
        standings: rows
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionStandings:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при загрузке турнирной таблицы'
      });
    }
  }

  // Получение структуры сеток, раундов и серий плей-офф с метаданными происхождения пар
  async getDivisionPlayoffs(req, res) {
    try {
      const { divisionId } = req.params;

      const query = `
        SELECT 
          pb.id as bracket_id,
          pb.name as bracket_name,
          pb.is_main,
          pr.id as round_id,
          pr.name as round_name,
          pr.order_index,
          pr.wins_needed,
          pm.id as matchup_id,
          pm.matchup_number,
          pm.team1_source_type,
          pm.team1_source_id,
          pm.team2_source_type,
          pm.team2_source_id,
          pm.team1_id,
          pm.team2_id,
          pm.team1_wins,
          pm.team2_wins,
          pm.winner_id,
          t1.name as team1_name,
          t1.logo_url as team1_logo,
          t2.name as team2_name,
          t2.logo_url as team2_logo
        FROM playoff_brackets pb
        JOIN playoff_rounds pr ON pb.id = pr.bracket_id
        LEFT JOIN playoff_matchups pm ON pr.id = pm.round_id
        LEFT JOIN teams t1 ON pm.team1_id = t1.id
        LEFT JOIN teams t2 ON pm.team2_id = t2.id
        WHERE pb.division_id = $1
        ORDER BY pb.is_main DESC, pb.id ASC, pr.order_index ASC, pm.matchup_number ASC
      `;

      const { rows } = await pool.query(query, [divisionId]);

      return res.json({
        success: true,
        playoffs: rows
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionPlayoffs:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при загрузке данных плей-офф'
      });
    }
  }

  // Динамический расчет статистики полевых игроков и вратарей из протоколов матчей (Вариант А)
  async getDivisionStats(req, res) {
    try {
      const { divisionId } = req.params;
      const stageType = req.query.stageType || 'all'; // 'all', 'regular', 'playoff'

      // 1. Запрос статистики ПОЛЕВЫХ ИГРОКОВ (с учетом фоток из team_members)
      const skatersQuery = `
        WITH basic_roster AS (
          SELECT DISTINCT gr.player_id, gr.team_id, gm.id as game_id
          FROM game_rosters gr
          JOIN games gm ON gr.game_id = gm.id
          WHERE gm.division_id = $1 AND gm.status = 'finished'
            AND gr.position_in_line != 'G'
            AND ($2 = 'all' OR gm.stage_type = $2)
        ),
        player_games AS (
          SELECT player_id, team_id, COUNT(*) as games_played
          FROM basic_roster
          GROUP BY player_id, team_id
        ),
        player_goals AS (
          SELECT ge.scorer_id as player_id, COUNT(*) as goals
          FROM game_events ge
          JOIN games gm ON ge.game_id = gm.id
          WHERE gm.division_id = $1 AND gm.status = 'finished' AND ge.event_type = 'goal'
            AND ($2 = 'all' OR gm.stage_type = $2)
          GROUP BY ge.scorer_id
        ),
        player_assists AS (
          SELECT player_id, COUNT(*) as assists
          FROM (
            SELECT ge.assist1_id as player_id FROM game_events ge JOIN games gm ON ge.game_id = gm.id WHERE gm.division_id = $1 AND gm.status = 'finished' AND ge.event_type = 'goal' AND ($2 = 'all' OR gm.stage_type = $2) AND ge.assist1_id IS NOT NULL
            UNION ALL
            SELECT ge.assist2_id as player_id FROM game_events ge JOIN games gm ON ge.game_id = gm.id WHERE gm.division_id = $1 AND gm.status = 'finished' AND ge.event_type = 'goal' AND ($2 = 'all' OR gm.stage_type = $2) AND ge.assist2_id IS NOT NULL
          ) as sub
          GROUP BY player_id
        ),
        player_penalties AS (
          SELECT ge.penalty_player_id as player_id, SUM(ge.penalty_minutes) as pim
          FROM game_events ge
          JOIN games gm ON ge.game_id = gm.id
          WHERE gm.division_id = $1 AND gm.status = 'finished' AND ge.event_type = 'penalty'
            AND ($2 = 'all' OR gm.stage_type = $2)
          GROUP BY ge.penalty_player_id
        )
        SELECT 
          u.id as player_id,
          u.first_name,
          u.last_name,
          tm.photo_url as photo_url,
          t.name as team_name,
          t.logo_url as team_logo,
          COALESCE(pg.games_played, 0) as games_played,
          COALESCE(pgl.goals, 0) as goals,
          COALESCE(pa.assists, 0) as assists,
          (COALESCE(pgl.goals, 0) + COALESCE(pa.assists, 0)) as points,
          COALESCE(pp.pim, 0) as penalty_minutes
        FROM player_games pg
        JOIN users u ON pg.player_id = u.id
        JOIN teams t ON pg.team_id = t.id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = t.id
        LEFT JOIN player_goals pgl ON pg.player_id = pgl.player_id
        LEFT JOIN player_assists pa ON pg.player_id = pa.player_id
        LEFT JOIN player_penalties pp ON pg.player_id = pp.player_id
      `;

      // 2. Запрос статистики ВРАТАРЕЙ (с учетом фоток из team_members)
      const goaliesQuery = `
        WITH goalie_games AS (
          SELECT DISTINCT gr.player_id, gr.team_id, gm.id as game_id,
                 CASE WHEN gr.team_id = gm.home_team_id THEN gm.away_team_id ELSE gm.home_team_id END as opp_team_id
          FROM game_rosters gr
          JOIN games gm ON gr.game_id = gm.id
          WHERE gm.division_id = $1 AND gm.status = 'finished'
            AND gr.position_in_line = 'G'
            AND ($2 = 'all' OR gm.stage_type = $2)
        ),
        goalie_match_stats AS (
          SELECT 
            gg.player_id, 
            gg.team_id,
            gg.game_id,
            COUNT(ge.id) as match_goals_against,
            COALESCE(SUM(gss.shots_count), 0) as match_shots_against
          FROM goalie_games gg
          LEFT JOIN game_events ge ON gg.game_id = ge.game_id AND ge.event_type = 'goal' AND ge.against_goalie_id = gg.player_id
          LEFT JOIN game_shots_summary gss ON gg.game_id = gss.game_id AND gg.opp_team_id = gss.team_id
          GROUP BY gg.player_id, gg.team_id, gg.game_id
        ),
        goalie_aggregated AS (
          SELECT 
            player_id,
            team_id,
            COUNT(*) as games_played,
            SUM(match_goals_against) as goals_against,
            SUM(match_shots_against) as shots_against,
            SUM(CASE WHEN match_goals_against = 0 AND match_shots_against > 0 THEN 1 ELSE 0 END) as shutouts
          FROM goalie_match_stats
          GROUP BY player_id, team_id
        )
        SELECT 
          u.id as player_id,
          u.first_name,
          u.last_name,
          tm.photo_url as photo_url,
          t.name as team_name,
          t.logo_url as team_logo,
          ga.games_played,
          ga.goals_against,
          CASE WHEN ga.shots_against >= ga.goals_against THEN (ga.shots_against - ga.goals_against) ELSE 0 END as saves,
          CASE WHEN ga.shots_against > 0 
               THEN ROUND(((ga.shots_against - ga.goals_against)::numeric / ga.shots_against * 100), 2)
               ELSE 0.00 END as save_percent,
          ROUND((ga.goals_against::numeric / NULLIF(ga.games_played, 0)), 2) as goals_against_average,
          ga.shutouts
        FROM goalie_aggregated ga
        JOIN users u ON ga.player_id = u.id
        JOIN teams t ON ga.team_id = t.id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = t.id
      `;

      const [skatersResult, goaliesResult] = await Promise.all([
        pool.query(skatersQuery, [divisionId, stageType]),
        pool.query(goaliesQuery, [divisionId, stageType])
      ]);

      return res.json({
        success: true,
        skaters: skatersResult.rows,
        goalies: goaliesResult.rows
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionStats:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при расчете хоккейной статистики'
      });
    }
  }
}

export default new TournamentController();