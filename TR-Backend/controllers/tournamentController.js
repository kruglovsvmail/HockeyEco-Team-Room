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
          d.short_name as division_short_name,
          d.logo_url as division_logo,
          l.name as league_name,
          l.short_name as league_short_name,
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
          COALESCE(a.name, g.location) as arena_name,
          a.city as arena_city,
          a.address as arena_address,
          g.location_url,
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
        const skatersAllQuery = `
          SELECT
            u.id                              AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url                      AS photo_url,
            tt.team_id                        AS team_id,
            t.name                            AS team_name,
            t.logo_url                        AS team_logo,
            COALESCE(ps.games_played, 0)      AS games_played,
            COALESCE(ps.goals, 0)             AS goals,
            COALESCE(ps.assists, 0)           AS assists,
            COALESCE(ps.points, 0)            AS points,
            COALESCE(ps.plus_minus, 0)        AS plus_minus,
            COALESCE(ps.penalty_minutes, 0)   AS penalty_minutes,
            tr.is_fee_paid,
            (SELECT hide_stats_unpaid FROM divisions WHERE id = $1) AS hide_stats_unpaid
          FROM tournament_rosters tr
          JOIN tournament_teams tt    ON tr.tournament_team_id   = tt.id
          JOIN users u                ON tr.player_id            = u.id
          JOIN teams t                ON tt.team_id              = t.id
          LEFT JOIN team_members tm   ON tm.user_id = u.id AND tm.team_id = t.id
          LEFT JOIN player_statistics ps ON ps.tournament_roster_id = tr.id
          -- Только полевые игроки (включая заявленных но не сыгравших — gp=0)
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position != 'goalie'
          ORDER BY points DESC, goals DESC, games_played ASC
        `;

        const goaliesAllQuery = `
          SELECT
            u.id                                    AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url                            AS photo_url,
            tt.team_id                              AS team_id,
            t.name                                  AS team_name,
            t.logo_url                              AS team_logo,
            COALESCE(ps.games_played, 0)            AS games_played,
            COALESCE(ps.goals_against, 0)           AS goals_against,
            COALESCE(ps.saves, 0)                   AS saves,
            COALESCE(ps.save_percent, 0)            AS save_percent,
            COALESCE(ps.goals_against_average, 0)   AS goals_against_average,
            COALESCE(ps.shutouts, 0)                AS shutouts,
            COALESCE(ps.minutes_played, 0)          AS minutes_played,
            COALESCE(ps.shots_against, 0)           AS shots_against,
            tr.is_fee_paid,
            (SELECT hide_stats_unpaid FROM divisions WHERE id = $1) AS hide_stats_unpaid
          FROM tournament_rosters tr
          JOIN tournament_teams tt    ON tr.tournament_team_id   = tt.id
          JOIN users u                ON tr.player_id            = u.id
          JOIN teams t                ON tt.team_id              = t.id
          LEFT JOIN team_members tm   ON tm.user_id = u.id AND tm.team_id = t.id
          LEFT JOIN player_statistics ps ON ps.tournament_roster_id = tr.id
          -- Только вратари (включая заявленных но не сыгравших — gp=0)
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position = 'goalie'
          ORDER BY save_percent DESC, goals_against_average ASC
        `;

        [skatersResult, goaliesResult] = await Promise.all([
          pool.query(skatersAllQuery, [divisionId]),
          pool.query(goaliesAllQuery, [divisionId])
        ]);

      } else {
        // ── Динамический расчёт для regular / playoff ─────────────────────────
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
            tt.team_id AS team_id,
            t.name AS team_name,
            t.logo_url AS team_logo,
            COALESCE(gp.gp, 0)                                   AS games_played,
            COALESCE(g.g, 0)                                     AS goals,
            COALESCE(a.a, 0)                                     AS assists,
            COALESCE(g.g, 0) + COALESCE(a.a, 0)                 AS points,
            COALESCE(pm.pm, 0)                                   AS plus_minus,
            COALESCE(p.pim, 0)                                   AS penalty_minutes,
            tr.is_fee_paid,
            (SELECT hide_stats_unpaid FROM divisions WHERE id = $1) AS hide_stats_unpaid
          FROM tournament_rosters tr
          JOIN tournament_teams tt   ON tr.tournament_team_id = tt.id
          JOIN users u               ON tr.player_id          = u.id
          JOIN teams t               ON tt.team_id            = t.id
          LEFT JOIN team_members tm  ON tm.user_id = u.id AND tm.team_id = t.id
          LEFT JOIN GamesPlayed gp   ON gp.player_id = tr.player_id AND gp.team_id = tt.team_id
          LEFT JOIN Goals    g       ON g.player_id  = tr.player_id AND g.team_id  = tt.team_id
          LEFT JOIN Assists   a      ON a.player_id  = tr.player_id AND a.team_id  = tt.team_id
          LEFT JOIN Penalties p      ON p.player_id  = tr.player_id AND p.team_id  = tt.team_id
          LEFT JOIN PlusMinus pm     ON pm.player_id = tr.player_id AND pm.player_team_id = tt.team_id
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position != 'goalie'
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
          GoalieGamesPlayed AS (
            SELECT player_id, team_id, COUNT(DISTINCT game_id) AS gp
            FROM GoalieGames
            GROUP BY player_id, team_id
          ),
          GoalsAbsTime AS (
            SELECT ge.id AS event_id, ge.game_id, ge.team_id AS scoring_team_id,
                   vg.home_team_id, vg.away_team_id,
                   ge.time_seconds AS abs_time,
                   COALESCE(ge.from_shot, true) AS from_shot
            FROM game_events ge
            JOIN ValidGames vg ON ge.game_id = vg.id
            WHERE ge.event_type = 'goal' AND ge.goal_strength <> 'ps'
          ),
          GoalToGoalie AS (
            SELECT DISTINCT ON (ga.event_id)
              ga.game_id, ga.scoring_team_id, ga.home_team_id,
              ga.from_shot,
              CASE WHEN ga.scoring_team_id = ga.home_team_id THEN gl.away_goalie_id
                   ELSE gl.home_goalie_id END AS conceding_goalie_id
            FROM GoalsAbsTime ga
            JOIN game_goalie_log gl ON gl.game_id = ga.game_id AND gl.time_seconds <= ga.abs_time
            ORDER BY ga.event_id, gl.time_seconds DESC
          ),
          GoaliesGA AS (
            -- Все пропущенные шайбы (для GA и КН)
            SELECT conceding_goalie_id AS player_id, COUNT(*) AS ga
            FROM GoalToGoalie WHERE conceding_goalie_id IS NOT NULL
            GROUP BY conceding_goalie_id
          ),
          GoaliesGAFromShot AS (
            -- Только пропущенные С БРОСКА — для знаменателя % отражённых
            SELECT conceding_goalie_id AS player_id, COUNT(*) AS ga_fs
            FROM GoalToGoalie
            WHERE conceding_goalie_id IS NOT NULL AND from_shot = true
            GROUP BY conceding_goalie_id
          ),
          GoaliesShotsAgainst AS (
            -- В game_shots_by_goalie.shots_count хранятся ВСЕ броски в створ вратарю
            -- (включая ставшие голами с броска). Отражённые вычисляются ниже.
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
            tt.team_id AS team_id,
            t.name AS team_name,
            t.logo_url AS team_logo,
            COALESCE(ggp.gp, 0)                                   AS games_played,
            COALESCE(gga.ga, 0)                                   AS goals_against,
            -- Отражённые = (все броски в створ вратарю) − (голы С БРОСКА против него).
            GREATEST(COALESCE(gsa.sa, 0) - COALESCE(gfs.ga_fs, 0), 0) AS saves,
            -- Броски в створ по вратарю — то, что ввёл секретарь.
            COALESCE(gsa.sa, 0)                                   AS shots_against,
            CASE WHEN COALESCE(gsa.sa, 0) > 0
                 THEN ROUND(
                        GREATEST(COALESCE(gsa.sa, 0) - COALESCE(gfs.ga_fs, 0), 0)::numeric
                        / COALESCE(gsa.sa, 0) * 100, 2
                      )
                 ELSE 0.00 END                                    AS save_percent,
            CASE WHEN COALESCE(gm.total_secs, 0) > 0
                 THEN ROUND(
                     COALESCE(gga.ga,0)::numeric / gm.total_secs
                     * dr.norm_seconds, 2
                 )
                 ELSE 0.00 END                                    AS goals_against_average,
            COALESCE(sho.total_sho, 0)                           AS shutouts,
            COALESCE(gm.total_secs, 0)                           AS minutes_played,
            tr.is_fee_paid,
            (SELECT hide_stats_unpaid FROM divisions WHERE id = $1) AS hide_stats_unpaid
          FROM tournament_rosters tr
          JOIN tournament_teams tt   ON tr.tournament_team_id = tt.id
          JOIN users u               ON tr.player_id          = u.id
          JOIN teams t               ON tt.team_id            = t.id
          LEFT JOIN team_members tm  ON tm.user_id = u.id AND tm.team_id = t.id
          CROSS JOIN DivisionReg dr
          LEFT JOIN GoalieGamesPlayed    ggp ON ggp.player_id = tr.player_id AND ggp.team_id = tt.team_id
          LEFT JOIN GoaliesGA            gga ON gga.player_id = tr.player_id
          LEFT JOIN GoaliesGAFromShot    gfs ON gfs.player_id = tr.player_id
          LEFT JOIN GoaliesShotsAgainst  gsa ON gsa.player_id = tr.player_id
          LEFT JOIN GoalieMinutesAgg     gm  ON gm.player_id  = tr.player_id
          LEFT JOIN ShutoutsAgg          sho ON sho.player_id = tr.player_id
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position = 'goalie'
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
  // Командная статистика для конкретной команды в дивизионе
  // stageType = 'all' | 'regular' | 'playoff'
  async getDivisionTeamStats(req, res) {
    try {
      const { divisionId } = req.params;
      const { teamId, stageType = 'all' } = req.query;

      if (!teamId) {
        return res.status(400).json({ success: false, error: 'Не указан teamId' });
      }

      const query = `
        WITH ValidGames AS (
          SELECT id, home_team_id, away_team_id
          FROM games
          WHERE division_id = $1
            AND status = 'finished'
            AND is_technical IS NULL
            AND ($2::text = 'all' OR stage_type = $2)
            AND (home_team_id = $3 OR away_team_id = $3)
        ),
        GamesPlayed AS (
          SELECT COUNT(*) AS gp FROM ValidGames
        ),
        Goals AS (
          SELECT
            COUNT(*)                                                          AS total_goals,
            COUNT(*) FILTER (WHERE ge.goal_strength IN ('pp1', 'pp2'))        AS pp_goals,
            COUNT(*) FILTER (WHERE ge.goal_strength IN ('sh1', 'sh2'))        AS sh_goals
          FROM game_events ge
          JOIN ValidGames vg ON ge.game_id = vg.id
          WHERE ge.event_type = 'goal' AND ge.team_id = $3
        ),
        PIM AS (
          SELECT COALESCE(SUM(ge.penalty_minutes), 0) AS pim
          FROM game_events ge
          JOIN ValidGames vg ON ge.game_id = vg.id
          WHERE ge.event_type = 'penalty' AND ge.team_id = $3
        ),
        ShotsOnGoal AS (
          -- Броски НАШЕЙ команды по воротам соперника (team_id в gsb = команда вратаря = соперник)
          SELECT COALESCE(SUM(gsb.shots_count), 0) AS sog
          FROM game_shots_by_goalie gsb
          JOIN ValidGames vg ON gsb.game_id = vg.id
          WHERE gsb.team_id != $3 AND gsb.goalie_id IS NOT NULL
        ),
        ShotsAgainst AS (
          -- Броски соперника по нашим воротам
          SELECT COALESCE(SUM(gsb.shots_count), 0) AS sa
          FROM game_shots_by_goalie gsb
          JOIN ValidGames vg ON gsb.game_id = vg.id
          WHERE gsb.team_id = $3 AND gsb.goalie_id IS NOT NULL
        ),
        GoalsAgainst AS (
          SELECT COUNT(*) AS ga
          FROM game_events ge
          JOIN ValidGames vg ON ge.game_id = vg.id
          WHERE ge.event_type = 'goal' AND ge.team_id != $3
        ),
        GoalsAgainstFromShot AS (
          SELECT COUNT(*) AS ga_fs
          FROM game_events ge
          JOIN ValidGames vg ON ge.game_id = vg.id
          WHERE ge.event_type = 'goal'
            AND ge.team_id != $3
            AND ge.from_shot = true
        ),
        PPOpportunities AS (
          -- Каждый штраф соперника с большинством = одна попытка большинства (2 мин = 1 большинство)
          SELECT COUNT(*) AS ppo
          FROM game_events ge
          JOIN ValidGames vg ON ge.game_id = vg.id
          WHERE ge.event_type = 'penalty'
            AND ge.team_id != $3
            AND ge.penalty_class IN ('minor', 'double_minor', 'major', 'match')
        )
        SELECT
          COALESCE(gp.gp, 0)                                                       AS games_played,
          COALESCE(g.total_goals, 0)                                                AS goals,
          COALESCE(sog.sog, 0)                                                      AS shots_on_goal,
          CASE WHEN COALESCE(sog.sog, 0) > 0
               THEN ROUND(COALESCE(g.total_goals, 0)::numeric / sog.sog * 100, 1)
               ELSE 0 END                                                           AS shooting_pct,
          COALESCE(g.pp_goals, 0)                                                   AS pp_goals,
          COALESCE(ppo.ppo, 0)                                                      AS pp_opportunities,
          CASE WHEN COALESCE(ppo.ppo, 0) > 0
               THEN ROUND(COALESCE(g.pp_goals, 0)::numeric / ppo.ppo * 100, 1)
               ELSE 0 END                                                           AS pp_pct,
          COALESCE(g.sh_goals, 0)                                                   AS sh_goals,
          COALESCE(pim.pim, 0)                                                      AS pim,
          GREATEST(COALESCE(sa.sa, 0) - COALESCE(gafs.ga_fs, 0), 0)               AS saves,
          COALESCE(ga.ga, 0)                                                        AS goals_against,
          COALESCE(sa.sa, 0)                                                        AS shots_against,
          CASE WHEN COALESCE(sa.sa, 0) > 0
               THEN ROUND(
                      GREATEST(COALESCE(sa.sa, 0) - COALESCE(gafs.ga_fs, 0), 0)::numeric
                      / sa.sa * 100, 1
                    )
               ELSE 0 END                                                           AS save_pct
        FROM GamesPlayed gp, Goals g, PIM pim, ShotsOnGoal sog, ShotsAgainst sa,
             GoalsAgainst ga, GoalsAgainstFromShot gafs, PPOpportunities ppo
      `;

      const { rows } = await pool.query(query, [divisionId, stageType, teamId]);

      return res.json({
        success: true,
        stats: rows[0] || null
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionTeamStats:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при расчёте командной статистики'
      });
    }
  }
}

export default new TournamentController();