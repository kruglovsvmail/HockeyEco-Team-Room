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

  // Статистика игроков и вратарей дивизиона.
  // stageType = 'all'     → читаем из player_statistics (быстро, точно, данные из калькулятора)
  // stageType = 'regular' | 'playoff' → динамический расчёт из событий с правильной логикой
  async getDivisionStats(req, res) {
    try {
      const { divisionId } = req.params;
      const stageType = req.query.stageType || 'all';

      let skatersResult, goaliesResult;

      if (stageType === 'all') {
        // ── Читаем из player_statistics ──────────────────────────────────────
        // Данные уже посчитаны playerStatsCalculator.js с правильной логикой:
        // goals_against через game_goalie_log, shots_against из game_shots_by_goalie,
        // shutouts по НХЛ-правилу, minutes_played из интервалов дежурств.

        const skatersAllQuery = `
          SELECT
            u.id            AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url    AS photo_url,
            t.name          AS team_name,
            t.logo_url      AS team_logo,
            ps.games_played,
            ps.goals,
            ps.assists,
            ps.points,
            ps.plus_minus,
            ps.penalty_minutes
          FROM player_statistics ps
          JOIN tournament_rosters tr  ON ps.tournament_roster_id = tr.id
          JOIN tournament_teams tt    ON tr.tournament_team_id   = tt.id
          JOIN users u                ON tr.player_id            = u.id
          JOIN teams t                ON tt.team_id              = t.id
          LEFT JOIN team_members tm   ON tm.user_id = u.id AND tm.team_id = t.id
          -- Только полевые игроки
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position != 'goalie'
            AND ps.games_played > 0
          ORDER BY ps.points DESC, ps.goals DESC, ps.games_played ASC
        `;

        const goaliesAllQuery = `
          SELECT
            u.id            AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url    AS photo_url,
            t.name          AS team_name,
            t.logo_url      AS team_logo,
            ps.games_played,
            ps.goals_against,
            ps.saves,
            ps.save_percent,
            ps.goals_against_average,
            ps.shutouts,
            ps.minutes_played,
            ps.shots_against
          FROM player_statistics ps
          JOIN tournament_rosters tr  ON ps.tournament_roster_id = tr.id
          JOIN tournament_teams tt    ON tr.tournament_team_id   = tt.id
          JOIN users u                ON tr.player_id            = u.id
          JOIN teams t                ON tt.team_id              = t.id
          LEFT JOIN team_members tm   ON tm.user_id = u.id AND tm.team_id = t.id
          -- Только вратари
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position = 'goalie'
            AND ps.games_played > 0
          ORDER BY ps.save_percent DESC, ps.goals_against_average ASC
        `;

        [skatersResult, goaliesResult] = await Promise.all([
          pool.query(skatersAllQuery, [divisionId]),
          pool.query(goaliesAllQuery, [divisionId])
        ]);

      } else {
        // ── Динамический расчёт для regular / playoff ─────────────────────────
        // plus_minus считается через game_plus_minus (был пропущен в старой версии)

        const skatersQuery = `
          WITH ValidGames AS (
            SELECT id, home_team_id, away_team_id
            FROM games
            WHERE division_id = $1 AND status = 'finished'
              AND is_technical IS NULL AND stage_type = $2
          ),
          GamesPlayed AS (
            SELECT gr.player_id, gr.team_id, COUNT(DISTINCT gr.game_id) AS gp
            FROM game_rosters gr
            JOIN ValidGames vg ON gr.game_id = vg.id
            WHERE gr.is_in_lineup = true AND gr.position_in_line != 'G'
            GROUP BY gr.player_id, gr.team_id
          ),
          Goals AS (
            SELECT ge.scorer_id AS player_id, ge.team_id, COUNT(*) AS g
            FROM game_events ge
            JOIN ValidGames vg ON ge.game_id = vg.id
            WHERE ge.event_type = 'goal' AND ge.scorer_id IS NOT NULL
            GROUP BY ge.scorer_id, ge.team_id
          ),
          Assists AS (
            SELECT player_id, team_id, COUNT(*) AS a
            FROM (
              SELECT assist1_id AS player_id, team_id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE event_type = 'goal' AND assist1_id IS NOT NULL
              UNION ALL
              SELECT assist2_id AS player_id, team_id FROM game_events ge JOIN ValidGames vg ON ge.game_id = vg.id WHERE event_type = 'goal' AND assist2_id IS NOT NULL
            ) sub
            GROUP BY player_id, team_id
          ),
          Penalties AS (
            SELECT ge.penalty_player_id AS player_id, ge.team_id, SUM(ge.penalty_minutes) AS pim
            FROM game_events ge
            JOIN ValidGames vg ON ge.game_id = vg.id
            WHERE ge.event_type = 'penalty' AND ge.penalty_player_id IS NOT NULL
            GROUP BY ge.penalty_player_id, ge.team_id
          ),
          PlusMinus AS (
            SELECT gpm.player_id, gpm.team_id AS player_team_id,
                   SUM(CASE WHEN gpm.team_id = ge.team_id THEN 1 ELSE -1 END) AS pm
            FROM game_plus_minus gpm
            JOIN game_events ge ON gpm.event_id = ge.id
            JOIN ValidGames vg ON ge.game_id = vg.id
            GROUP BY gpm.player_id, gpm.team_id
          )
          SELECT
            u.id AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url AS photo_url,
            t.name AS team_name,
            t.logo_url AS team_logo,
            COALESCE(gp.gp, 0)                                   AS games_played,
            COALESCE(g.g, 0)                                     AS goals,
            COALESCE(a.a, 0)                                     AS assists,
            COALESCE(g.g, 0) + COALESCE(a.a, 0)                 AS points,
            COALESCE(pm.pm, 0)                                   AS plus_minus,
            COALESCE(p.pim, 0)                                   AS penalty_minutes
          FROM GamesPlayed gp
          JOIN users u  ON gp.player_id = u.id
          JOIN teams t  ON gp.team_id   = t.id
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = t.id
          LEFT JOIN Goals    g  ON g.player_id  = gp.player_id AND g.team_id = gp.team_id
          LEFT JOIN Assists   a  ON a.player_id  = gp.player_id AND a.team_id = gp.team_id
          LEFT JOIN Penalties p  ON p.player_id  = gp.player_id AND p.team_id = gp.team_id
          LEFT JOIN PlusMinus pm ON pm.player_id = gp.player_id AND pm.player_team_id = gp.team_id
          ORDER BY points DESC, goals DESC, games_played ASC
        `;

        // Вратари для regular/playoff: goals_against через game_goalie_log
        const goaliesQuery = `
          WITH ValidGames AS (
            SELECT
              g.id, g.home_team_id, g.away_team_id,
              g.home_score, g.away_score,
              COALESCE(gt.period_length, 20) AS period_length,
              COALESCE(gt.ot_length,     5)  AS ot_length,
              COALESCE(gt.periods_count, 3)  AS periods_count,
              (
                COALESCE(gt.period_length, 20) * COALESCE(gt.periods_count, 3) * 60
                + CASE WHEN g.end_type IN ('ot','so') THEN COALESCE(gt.ot_length, 5) * 60 ELSE 0 END
              ) AS total_seconds
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            WHERE g.division_id = $1 AND g.status = 'finished'
              AND g.is_technical IS NULL AND g.stage_type = $2
          ),
          DivisionReg AS (
            -- Итоговая нормировочная длина матча в секундах (для расчёта КН)
            SELECT
              CASE WHEN $2 = 'playoff'
                   THEN COALESCE(d.playoff_periods_count, 3) * COALESCE(d.playoff_period_length, 20) * 60
                   ELSE COALESCE(d.reg_periods_count,     3) * COALESCE(d.reg_period_length,     20) * 60
              END AS norm_seconds
            FROM divisions d WHERE d.id = $1
          ),
          GoalieGames AS (
            SELECT DISTINCT gr.player_id, gr.team_id, gr.game_id
            FROM game_rosters gr
            JOIN ValidGames vg ON gr.game_id = vg.id
            WHERE gr.is_in_lineup = true AND gr.position_in_line = 'G'
          ),
          GoalsAbsTime AS (
            -- time_seconds хранится от начала матча, конвертация не нужна
            SELECT ge.id AS event_id, ge.game_id, ge.team_id AS scoring_team_id,
                   vg.home_team_id, vg.away_team_id,
                   ge.time_seconds AS abs_time
            FROM game_events ge
            JOIN ValidGames vg ON ge.game_id = vg.id
            WHERE ge.event_type = 'goal' AND ge.goal_strength <> 'ps'
          ),
          GoalToGoalie AS (
            SELECT DISTINCT ON (ga.event_id)
              ga.game_id, ga.scoring_team_id, ga.home_team_id,
              CASE WHEN ga.scoring_team_id = ga.home_team_id THEN gl.away_goalie_id
                   ELSE gl.home_goalie_id END AS conceding_goalie_id
            FROM GoalsAbsTime ga
            JOIN game_goalie_log gl ON gl.game_id = ga.game_id AND gl.time_seconds <= ga.abs_time
            ORDER BY ga.event_id, gl.time_seconds DESC
          ),
          GoaliesGA AS (
            SELECT conceding_goalie_id AS player_id, COUNT(*) AS ga
            FROM GoalToGoalie WHERE conceding_goalie_id IS NOT NULL
            GROUP BY conceding_goalie_id
          ),
          GoaliesSA AS (
            SELECT gsb.goalie_id AS player_id, SUM(gsb.shots_count) AS sa
            FROM game_shots_by_goalie gsb
            JOIN ValidGames vg ON gsb.game_id = vg.id
            WHERE gsb.goalie_id IS NOT NULL
            GROUP BY gsb.goalie_id
          ),
          GoalieIntervals AS (
            SELECT gl.game_id, gl.home_goalie_id, gl.away_goalie_id,
                   gl.time_seconds AS interval_start,
                   COALESCE(LEAD(gl.time_seconds) OVER (PARTITION BY gl.game_id ORDER BY gl.time_seconds), vg.total_seconds) AS interval_end
            FROM game_goalie_log gl
            JOIN ValidGames vg ON gl.game_id = vg.id
          ),
          GoalieMinutes AS (
            SELECT home_goalie_id AS player_id, SUM(GREATEST(interval_end - interval_start, 0)) AS secs
            FROM GoalieIntervals WHERE home_goalie_id IS NOT NULL GROUP BY home_goalie_id
            UNION ALL
            SELECT away_goalie_id AS player_id, SUM(GREATEST(interval_end - interval_start, 0)) AS secs
            FROM GoalieIntervals WHERE away_goalie_id IS NOT NULL GROUP BY away_goalie_id
          ),
          GoalieMinutesAgg AS (
            SELECT player_id, SUM(secs) AS total_secs FROM GoalieMinutes GROUP BY player_id
          ),
          GoalieCountPerSide AS (
            SELECT game_id,
                   COUNT(DISTINCT home_goalie_id) FILTER (WHERE home_goalie_id IS NOT NULL) AS home_cnt,
                   COUNT(DISTINCT away_goalie_id) FILTER (WHERE away_goalie_id IS NOT NULL) AS away_cnt
            FROM game_goalie_log GROUP BY game_id
          ),
          Shutouts AS (
            SELECT gl.home_goalie_id AS player_id, COUNT(DISTINCT gl.game_id) AS sho
            FROM game_goalie_log gl JOIN ValidGames vg ON gl.game_id = vg.id
            JOIN GoalieCountPerSide gc ON gc.game_id = gl.game_id
            WHERE gl.home_goalie_id IS NOT NULL AND gc.home_cnt = 1 AND vg.away_score = 0
            GROUP BY gl.home_goalie_id
            UNION ALL
            SELECT gl.away_goalie_id AS player_id, COUNT(DISTINCT gl.game_id) AS sho
            FROM game_goalie_log gl JOIN ValidGames vg ON gl.game_id = vg.id
            JOIN GoalieCountPerSide gc ON gc.game_id = gl.game_id
            WHERE gl.away_goalie_id IS NOT NULL AND gc.away_cnt = 1 AND vg.home_score = 0
            GROUP BY gl.away_goalie_id
          ),
          ShutoutsAgg AS (
            SELECT player_id, SUM(sho) AS total_sho FROM Shutouts GROUP BY player_id
          )
          SELECT
            u.id AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url AS photo_url,
            t.name AS team_name,
            t.logo_url AS team_logo,
            COUNT(DISTINCT gg.game_id)                            AS games_played,
            COALESCE(gga.ga, 0)                                   AS goals_against,
            COALESCE(gsa.sa, 0)                                   AS shots_against,
            COALESCE(gsa.sa, 0)                                   AS saves,
            CASE WHEN (COALESCE(gsa.sa, 0) + COALESCE(gga.ga, 0)) > 0
                 THEN ROUND(COALESCE(gsa.sa,0)::numeric / (COALESCE(gsa.sa,0) + COALESCE(gga.ga,0)) * 100, 2)
                 ELSE 0.00 END                                    AS save_percent,
            CASE WHEN COALESCE(gm.total_secs, 0) > 0
                 -- КН нормируется на регламентную длину матча дивизиона
                 -- для stageType='regular' берём reg_*, для 'playoff' — playoff_*
                 THEN ROUND(
                     COALESCE(gga.ga,0)::numeric / gm.total_secs
                     * dr.norm_seconds, 2
                 )
                 ELSE 0.00 END                                    AS goals_against_average,
            COALESCE(sho.total_sho, 0)                           AS shutouts,
            COALESCE(gm.total_secs, 0)                           AS minutes_played
          FROM GoalieGames gg
          JOIN users u  ON gg.player_id = u.id
          JOIN teams t  ON gg.team_id   = t.id
          LEFT JOIN team_members tm    ON tm.user_id = u.id AND tm.team_id = t.id
          CROSS JOIN DivisionReg dr
          LEFT JOIN GoaliesGA    gga   ON gga.player_id = gg.player_id
          LEFT JOIN GoaliesSA    gsa   ON gsa.player_id = gg.player_id
          LEFT JOIN GoalieMinutesAgg gm ON gm.player_id = gg.player_id
          LEFT JOIN ShutoutsAgg  sho   ON sho.player_id = gg.player_id
          GROUP BY u.id, u.first_name, u.last_name, tm.photo_url, t.name, t.logo_url,
                   gga.ga, gsa.sa, gm.total_secs, sho.total_sho, dr.norm_seconds
          HAVING COUNT(DISTINCT gg.game_id) > 0
          ORDER BY save_percent DESC, goals_against_average ASC
        `;

        [skatersResult, goaliesResult] = await Promise.all([
          pool.query(skatersQuery, [divisionId, stageType]),
          pool.query(goaliesQuery, [divisionId, stageType])
        ]);
      }

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

  // Таймлайн событий матча — ленивая загрузка при раскрытии аккордеона в TournamentCardGame
  async getGameTimeline(req, res) {
    try {
      const { gameId } = req.params;

      const query = `
        SELECT
          ge.id,
          ge.event_type,
          ge.period,
          ge.time_seconds,
          ge.goal_strength,
          ge.penalty_minutes,
          ge.penalty_violation,
          ge.team_id,
          g.home_team_id,
          g.away_team_id,

          -- Автор гола / нарушитель
          scorer.id         AS scorer_id,
          scorer.first_name AS scorer_first,
          scorer.last_name  AS scorer_last,
          gr_scorer.jersey_number AS scorer_number,

          -- Ассистент 1
          a1.id         AS assist1_id,
          a1.first_name AS assist1_first,
          a1.last_name  AS assist1_last,
          gr_a1.jersey_number AS assist1_number,

          -- Ассистент 2
          a2.id         AS assist2_id,
          a2.first_name AS assist2_first,
          a2.last_name  AS assist2_last,
          gr_a2.jersey_number AS assist2_number,

          -- Нарушитель (штраф)
          pp.id         AS penalty_player_id,
          pp.first_name AS penalty_first,
          pp.last_name  AS penalty_last,
          gr_pp.jersey_number AS penalty_number

        FROM game_events ge
        JOIN games g ON ge.game_id = g.id

        -- Автор гола
        LEFT JOIN users scorer ON ge.scorer_id = scorer.id
        LEFT JOIN game_rosters gr_scorer
               ON gr_scorer.game_id = ge.game_id
              AND gr_scorer.player_id = ge.scorer_id

        -- Ассистент 1
        LEFT JOIN users a1 ON ge.assist1_id = a1.id
        LEFT JOIN game_rosters gr_a1
               ON gr_a1.game_id = ge.game_id
              AND gr_a1.player_id = ge.assist1_id

        -- Ассистент 2
        LEFT JOIN users a2 ON ge.assist2_id = a2.id
        LEFT JOIN game_rosters gr_a2
               ON gr_a2.game_id = ge.game_id
              AND gr_a2.player_id = ge.assist2_id

        -- Нарушитель
        LEFT JOIN users pp ON ge.penalty_player_id = pp.id
        LEFT JOIN game_rosters gr_pp
               ON gr_pp.game_id = ge.game_id
              AND gr_pp.player_id = ge.penalty_player_id

        WHERE ge.game_id = $1
          AND ge.event_type IN ('goal', 'penalty', 'shootout_goal', 'shootout_miss')

        ORDER BY
          CASE ge.period
            WHEN '1'  THEN 1
            WHEN '2'  THEN 2
            WHEN '3'  THEN 3
            WHEN '4'  THEN 4
            WHEN '5'  THEN 5
            WHEN 'OT' THEN 99
            WHEN 'SO' THEN 100
            ELSE 101
          END,
          ge.time_seconds ASC
      `;

      const { rows } = await pool.query(query, [gameId]);

      // Броски по вратарям — суммируем по всем периодам
      const shotsQuery = `
        SELECT
          gsb.goalie_id,
          gsb.team_id,
          SUM(gsb.shots_count) AS total_shots,
          u.first_name,
          u.last_name,
          gr.jersey_number
        FROM game_shots_by_goalie gsb
        LEFT JOIN users u ON gsb.goalie_id = u.id
        LEFT JOIN game_rosters gr
               ON gr.game_id = $1
              AND gr.player_id = gsb.goalie_id
        WHERE gsb.game_id = $1
          AND gsb.goalie_id IS NOT NULL
        GROUP BY gsb.goalie_id, gsb.team_id, u.first_name, u.last_name, gr.jersey_number
        ORDER BY gsb.team_id, u.last_name
      `;
      const { rows: shotsRows } = await pool.query(shotsQuery, [gameId]);

      return res.json({ success: true, timeline: rows, goalie_shots: shotsRows });
    } catch (err) {
      console.error('Ошибка в TournamentController.getGameTimeline:', err);
      return res.status(500).json({
        success: false,
        error: 'Ошибка сервера при загрузке таймлайна матча'
      });
    }
  }
}

export default new TournamentController();