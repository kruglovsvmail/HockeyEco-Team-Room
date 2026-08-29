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
          g.playoff_match_type,
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

  // Статистика игроков и вратарей дивизиона — всегда живой расчёт по стадии(ям).
  // stageType = 'regular' | 'playoff' → один динамический запрос, замаскированный по флагу стадии.
  // stageType = 'all' → оба запроса (regular + playoff) отдельно (каждый со своей маской),
  //   затем мёрдж по player_id+team_id: сырые числа суммируются, %/ставки пересчитываются
  //   из объединённых сумм — так замаскированная стадия не "протекает" в общий итог.
  async getDivisionStats(req, res) {
    try {
      const { divisionId } = req.params;
      const stageType = req.query.stageType || 'all';

      {
        // ── Статистика стадии из боксскора player_game_statistics ─────────────
        // Раньше здесь на каждый показ страницы перемалывались game_events,
        // game_plus_minus, game_goalie_log и game_shots_by_goalie за весь дивизион.
        // Теперь всё это посчитано один раз при завершении матча, и остаётся
        // суммирование по заявке игрока и стадии.
        //
        // Форма результата, набор параметров ($1 divisionId, $2 stageType) и
        // сортировка не изменились: маскирование по флагам лиги и мёрдж стадий
        // ниже работают ровно как раньше.
        const skatersQuery = `
          SELECT
            u.id AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url AS photo_url,
            tt.team_id AS team_id,
            t.name AS team_name,
            t.logo_url AS team_logo,
            COALESCE(s.games_played, 0)                          AS games_played,
            COALESCE(s.goals, 0)                                 AS goals,
            COALESCE(s.assists, 0)                               AS assists,
            COALESCE(s.points, 0)                                AS points,
            COALESCE(s.goals_gw, 0)                              AS goals_gw,
            COALESCE(s.plus_minus, 0)                            AS plus_minus,
            COALESCE(s.penalty_minutes, 0)                       AS penalty_minutes,
            tr.is_fee_paid,
            (SELECT hide_stats_unpaid FROM divisions WHERE id = $1) AS hide_stats_unpaid
          FROM tournament_rosters tr
          JOIN tournament_teams tt   ON tr.tournament_team_id = tt.id
          JOIN users u               ON tr.player_id          = u.id
          JOIN teams t               ON tt.team_id            = t.id
          LEFT JOIN team_members tm  ON tm.user_id = u.id AND tm.team_id = t.id
          LEFT JOIN LATERAL (
            SELECT
              -- Матчи считаем только те, где игрок выходил полевым: вратарские
              -- игры того же человека идут в его вратарскую строку. Остальные
              -- показатели берутся за все матчи — вратарь может забить и удалиться,
              -- и в прежнем расчёте это тоже попадало в полевую строку.
              COUNT(*) FILTER (WHERE NOT pgs.is_goalie)::int AS games_played,
              COALESCE(SUM(pgs.goals), 0)::int              AS goals,
              COALESCE(SUM(pgs.assists), 0)::int            AS assists,
              COALESCE(SUM(pgs.points), 0)::int             AS points,
              -- Победные шайбы: та шайба матча, после которой отрыв уже не был
              -- отыгран (не последняя). В матчах по буллитам не присуждается никому.
              COALESCE(SUM(pgs.goals_gw), 0)::int           AS goals_gw,
              COALESCE(SUM(pgs.plus_minus), 0)::int         AS plus_minus,
              COALESCE(SUM(pgs.penalty_minutes), 0)::int    AS penalty_minutes
            FROM player_game_statistics pgs
            WHERE pgs.tournament_roster_id = tr.id
              AND pgs.stage_type = $2
          ) s ON true
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position != 'goalie'
          ORDER BY points DESC, goals DESC, games_played ASC
        `;

        // ── Вратари стадии из боксскора ──────────────────────────────────────
        // Коэффициент надёжности (КН) убран из системы по решению пользователя:
        // для любительского хоккея показатель нерепрезентативен, а в интерфейсах
        // он не выводился ни разу — считался и уезжал на фронт вхолостую.
        // Вместе с ним ушла нормировка на регламентную длину матча, а с ней и
        // единственная причина читать здесь настройки периодов дивизиона.
        const goaliesQuery = `
          SELECT
            u.id AS player_id,
            u.first_name,
            u.last_name,
            tm.photo_url AS photo_url,
            tt.team_id AS team_id,
            t.name AS team_name,
            t.logo_url AS team_logo,
            COALESCE(s.games_played, 0)                          AS games_played,
            COALESCE(s.goals_against, 0)                         AS goals_against,
            COALESCE(s.saves, 0)                                 AS saves,
            COALESCE(s.shots_against, 0)                         AS shots_against,
            CASE WHEN COALESCE(s.shots_against, 0) > 0
                 THEN ROUND(s.saves::numeric / s.shots_against * 100, 2)
                 ELSE 0.00 END                                   AS save_percent,
            COALESCE(s.shutouts, 0)                              AS shutouts,
            COALESCE(s.minutes_played, 0)                        AS minutes_played,
            COALESCE(s.assists, 0)                               AS assists,
            COALESCE(s.penalty_minutes, 0)                       AS penalty_minutes,
            tr.is_fee_paid,
            (SELECT hide_stats_unpaid FROM divisions WHERE id = $1) AS hide_stats_unpaid
          FROM tournament_rosters tr
          JOIN tournament_teams tt   ON tr.tournament_team_id = tt.id
          JOIN users u               ON tr.player_id          = u.id
          JOIN teams t               ON tt.team_id            = t.id
          LEFT JOIN team_members tm  ON tm.user_id = u.id AND tm.team_id = t.id
          LEFT JOIN LATERAL (
            SELECT
              -- Матчи вратаря — только те, где он реально стоял в воротах
              COUNT(*) FILTER (WHERE pgs.is_goalie)::int          AS games_played,
              COALESCE(SUM(pgs.goalie_goals_against), 0)::int     AS goals_against,
              COALESCE(SUM(pgs.goalie_saves), 0)::int             AS saves,
              COALESCE(SUM(pgs.goalie_shots_against), 0)::int     AS shots_against,
              COUNT(*) FILTER (WHERE pgs.goalie_shutout)::int     AS shutouts,
              COALESCE(SUM(pgs.goalie_seconds), 0)::int           AS minutes_played,
              -- Передачи и штраф считаются за все матчи, как и раньше:
              -- вратаря можно поставить ассистентом и удалить наравне со всеми
              COALESCE(SUM(pgs.assists), 0)::int                  AS assists,
              COALESCE(SUM(pgs.penalty_minutes), 0)::int          AS penalty_minutes
            FROM player_game_statistics pgs
            WHERE pgs.tournament_roster_id = tr.id
              AND pgs.stage_type = $2
          ) s ON true
          WHERE tt.division_id = $1
            AND tr.application_status = 'approved'
            AND tr.position = 'goalie'
          ORDER BY save_percent DESC, goals_against ASC
        `;

        const flagsQuery = `
          SELECT reg_track_plus_minus, playoff_track_plus_minus,
                 reg_track_shots, playoff_track_shots
          FROM divisions WHERE id = $1
        `;

        const stagesToFetch = stageType === 'all' ? ['regular', 'playoff'] : [stageType];

        const [flagsResult, skaterStageResults, goalieStageResults] = await Promise.all([
          pool.query(flagsQuery, [divisionId]),
          Promise.all(stagesToFetch.map(st => pool.query(skatersQuery, [divisionId, st]))),
          Promise.all(stagesToFetch.map(st => pool.query(goaliesQuery, [divisionId, st])))
        ]);

        const flags = flagsResult.rows[0] || {};
        const trackPMByStage = {
          regular: flags.reg_track_plus_minus ?? false,
          playoff: flags.playoff_track_plus_minus ?? false,
        };
        const trackShotsByStage = {
          regular: flags.reg_track_shots ?? false,
          playoff: flags.playoff_track_shots ?? false,
        };

        // Маскируем по флагу СВОЕЙ стадии — до мёрджа, чтобы выключенная стадия не
        // "протекала" в комбинированный итог при stageType='all'.
        const maskSkaterRow = (row, st) => (trackPMByStage[st] ? row : { ...row, plus_minus: null });
        const maskGoalieRow = (row, st) => (
          trackShotsByStage[st]
            ? row
            : { ...row, saves: null, shots_against: null, save_percent: null }
        );

        const maskedSkaterStages = stagesToFetch.map((st, i) =>
          skaterStageResults[i].rows.map(row => maskSkaterRow(row, st))
        );
        const maskedGoalieStages = stagesToFetch.map((st, i) =>
          goalieStageResults[i].rows.map(row => maskGoalieRow(row, st))
        );

        let skaters, goalies;

        if (stagesToFetch.length === 1) {
          skaters = maskedSkaterStages[0];
          goalies = maskedGoalieStages[0];
        } else {
          // stageType='all' — мёрдж regular+playoff по player_id+team_id: сырые числа
          // суммируются, %/ставки пересчитываются из объединённых сумм (никогда не
          // складываем сами %).
          const n = (v) => Number(v || 0);
          const key = (row) => `${row.player_id}_${row.team_id}`;

          const skaterMap = new Map();
          maskedSkaterStages.flat().forEach(row => {
            const k = key(row);
            if (!skaterMap.has(k)) {
              skaterMap.set(k, {
                ...row,
                games_played: 0, goals: 0, assists: 0, points: 0, goals_gw: 0,
                penalty_minutes: 0, plus_minus: null,
              });
            }
            const acc = skaterMap.get(k);
            acc.games_played += n(row.games_played);
            acc.goals += n(row.goals);
            acc.assists += n(row.assists);
            acc.points += n(row.points);
            acc.goals_gw += n(row.goals_gw);
            acc.penalty_minutes += n(row.penalty_minutes);
            if (row.plus_minus != null) {
              acc.plus_minus = n(acc.plus_minus) + n(row.plus_minus);
            }
          });
          skaters = Array.from(skaterMap.values())
            .sort((a, b) => b.points - a.points || b.goals - a.goals || a.games_played - b.games_played);

          const goalieMap = new Map();
          maskedGoalieStages.flat().forEach(row => {
            const k = key(row);
            if (!goalieMap.has(k)) {
              goalieMap.set(k, {
                ...row,
                games_played: 0, goals_against: 0, shutouts: 0, minutes_played: 0,
                assists: 0, penalty_minutes: 0,
                saves: null, shots_against: null,
              });
            }
            const acc = goalieMap.get(k);
            acc.games_played += n(row.games_played);
            acc.goals_against += n(row.goals_against);
            acc.shutouts += n(row.shutouts);
            acc.minutes_played += n(row.minutes_played);
            acc.assists += n(row.assists);
            acc.penalty_minutes += n(row.penalty_minutes);
            if (row.shots_against != null) {
              acc.saves = n(acc.saves) + n(row.saves);
              acc.shots_against = n(acc.shots_against) + n(row.shots_against);
            }
          });
          goalies = Array.from(goalieMap.values()).map(g => {
            // Процент отражённых пересчитываем из объединённых сумм, а не
            // складываем проценты стадий
            g.save_percent = g.shots_against > 0
              ? Math.round((g.saves / g.shots_against) * 10000) / 100
              : (g.shots_against != null ? 0 : null);
            return g;
          }).sort((a, b) => (b.save_percent ?? -1) - (a.save_percent ?? -1) || a.goals_against - b.goals_against);
        }

        return res.json({
          success: true,
          skaters,
          goalies
        });
      }
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

      const flagsResult = await pool.query(
        `SELECT reg_track_shots, playoff_track_shots FROM divisions WHERE id = $1`,
        [divisionId]
      );
      const flags = flagsResult.rows[0] || {};
      const trackShotsByStage = {
        regular: flags.reg_track_shots ?? false,
        playoff: flags.playoff_track_shots ?? false,
      };

      // Для 'all' считаем регулярку и плей-офф ОТДЕЛЬНЫМИ запросами (тем же SQL), чтобы
      // маскировать броски-поля по флагу каждой стадии независимо, прежде чем их сложить —
      // иначе замаскированная стадия "протекала" бы в объединённый итог.
      const stagesToFetch = stageType === 'all' ? ['regular', 'playoff'] : [stageType];
      const stageResults = await Promise.all(
        stagesToFetch.map(st => pool.query(query, [divisionId, st, teamId]))
      );

      const maskStage = (row, st) => {
        if (trackShotsByStage[st]) return row;
        return {
          ...row,
          shots_on_goal: null,
          shooting_pct: null,
          shots_against: null,
          saves: null,
          save_pct: null,
        };
      };

      const rows = stagesToFetch
        .map((st, i) => (stageResults[i].rows[0] ? maskStage(stageResults[i].rows[0], st) : null))
        .filter(Boolean);

      if (rows.length === 0) {
        return res.json({ success: true, stats: null });
      }

      if (rows.length === 1) {
        return res.json({ success: true, stats: rows[0] });
      }

      // stageType='all' — суммируем сырые числа по обеим стадиям, проценты пересчитываем
      // из объединённых сумм (никогда не складываем сами проценты).
      const n = (v) => Number(v || 0);
      const anyShotsOn = rows.some(r => r.shots_on_goal != null);
      const anyShotsAgainst = rows.some(r => r.shots_against != null);

      const merged = {
        games_played: rows.reduce((s, r) => s + n(r.games_played), 0),
        goals: rows.reduce((s, r) => s + n(r.goals), 0),
        pp_goals: rows.reduce((s, r) => s + n(r.pp_goals), 0),
        pp_opportunities: rows.reduce((s, r) => s + n(r.pp_opportunities), 0),
        sh_goals: rows.reduce((s, r) => s + n(r.sh_goals), 0),
        pim: rows.reduce((s, r) => s + n(r.pim), 0),
        goals_against: rows.reduce((s, r) => s + n(r.goals_against), 0),
        shots_on_goal: anyShotsOn ? rows.reduce((s, r) => s + n(r.shots_on_goal), 0) : null,
        shots_against: anyShotsAgainst ? rows.reduce((s, r) => s + n(r.shots_against), 0) : null,
        saves: anyShotsAgainst ? rows.reduce((s, r) => s + n(r.saves), 0) : null,
      };

      // Числитель для %бросков — голы ТОЛЬКО из стадий, где броски вообще считаются:
      // "goals" сам по себе не бросковая статистика и суммируется по всем стадиям всегда,
      // а знаменатель shots_on_goal — только из немаскированных, иначе % будет несогласован.
      const shootingGoals = anyShotsOn
        ? rows.reduce((s, r) => s + (r.shots_on_goal != null ? n(r.goals) : 0), 0)
        : null;
      merged.shooting_pct = merged.shots_on_goal > 0
        ? Math.round((shootingGoals / merged.shots_on_goal) * 1000) / 10
        : (merged.shots_on_goal != null ? 0 : null);
      merged.pp_pct = merged.pp_opportunities > 0
        ? Math.round((merged.pp_goals / merged.pp_opportunities) * 1000) / 10
        : 0;
      merged.save_pct = merged.shots_against > 0
        ? Math.round((merged.saves / merged.shots_against) * 1000) / 10
        : (merged.shots_against != null ? 0 : null);

      return res.json({ success: true, stats: merged });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionTeamStats:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при расчёте командной статистики'
      });
    }
  }
  // ==========================================
  //   СПРАВОЧНИК ЛИГ ДЛЯ РАЗДЕЛА «ТУРНИРЫ / ЛИГИ»
  // ==========================================
  //
  // Раздел информационный: посмотреть чужую турнирную таблицу, статистику игрока или
  // расписание любой лиги может кто угодно, в том числе человек без единой команды.
  // Поэтому список лиг не привязан к составам, а фильтруется и подгружается порциями —
  // лиг со временем станет много, и тянуть их все разом нельзя.

  // Сколько лиг отдаём за один заход бесконечной прокрутки
  static get LEAGUES_PAGE_SIZE() { return 20; }

  /**
   * Список лиг с фильтрами и постраничной подгрузкой.
   *
   * Неопубликованный дивизион (is_published = false) — черновик лиги, и он скрыт от всех
   * без исключений, включая команды, которые в нём заявлены. Пока лига не нажала
   * «опубликовать», турнира для приложения не существует.
   *
   * scope = 'all' — все лиги, у которых есть хотя бы один опубликованный дивизион.
   * scope = 'my' — только лиги, куда заявлены команды пользователя (заявка одобрена).
   * teamId — необязательное сужение scope='my' до одной конкретной команды.
   * search — совпадение по названию, короткому имени или городу лиги.
   */
  async getLeagues(req, res) {
    try {
      const scope = req.query.scope === 'my' ? 'my' : 'all';
      const teamId = req.query.teamId ? Number(req.query.teamId) : null;
      const search = String(req.query.search || '').trim();
      const limit = Math.min(Number(req.query.limit) || TournamentController.LEAGUES_PAGE_SIZE, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      // Номера подстановок раздаём по мере сборки запроса. Иначе в ветке scope='all'
      // остаётся неиспользованный $1, а Postgres на это отвечает отказом:
      // «could not determine data type of parameter $1».
      const params = [];
      const bind = (value) => {
        params.push(value);
        return `$${params.length}`;
      };

      let scopeCondition;

      if (scope === 'my') {
        // Команды пользователя: прямое членство плюс команды, которыми он владеет
        const userParam = bind(req.user.id);
        const teamParam = bind(teamId);
        scopeCondition = `
          EXISTS (
            SELECT 1
            FROM tournament_teams tt
            JOIN divisions d2 ON d2.id = tt.division_id
            JOIN seasons s2 ON s2.id = d2.season_id
            WHERE s2.league_id = l.id
              AND d2.is_published = true
              AND tt.status = 'approved'
              AND (${teamParam}::int IS NULL OR tt.team_id = ${teamParam}::int)
              AND (
                EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = tt.team_id AND tm.user_id = ${userParam} AND tm.left_at IS NULL)
                OR EXISTS (SELECT 1 FROM teams t WHERE t.id = tt.team_id AND t.owner_id = ${userParam})
              )
          )`;
      } else {
        scopeCondition = `
          EXISTS (
            SELECT 1
            FROM divisions d2
            JOIN seasons s2 ON s2.id = d2.season_id
            WHERE s2.league_id = l.id AND d2.is_published = true
          )`;
      }

      let searchCondition = '';
      if (search) {
        const searchParam = bind(`%${search}%`);
        searchCondition = ` AND (l.name ILIKE ${searchParam} OR l.short_name ILIKE ${searchParam} OR l.city ILIKE ${searchParam})`;
      }

      const limitParam = bind(limit);
      const offsetParam = bind(offset);

      const { rows } = await pool.query(`
        SELECT l.id, l.name, l.short_name, l.city, l.logo_url,
               (
                 SELECT COUNT(*) FROM seasons s3 WHERE s3.league_id = l.id
               )::int AS seasons_count
        FROM leagues l
        WHERE ${scopeCondition}${searchCondition}
        ORDER BY l.name
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `, params);

      return res.json({
        success: true,
        leagues: rows,
        // Фронт по этому признаку понимает, есть ли смысл запрашивать следующую порцию
        hasMore: rows.length === limit
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getLeagues:', err);
      return res.status(500).json({ success: false, error: 'Не удалось загрузить список лиг' });
    }
  }

  /**
   * Сезоны выбранной лиги вместе с их дивизионами.
   *
   * Отдельным запросом, а не вместе со списком лиг: у лиги может быть десяток сезонов и
   * сотня дивизионов, и тащить это для каждой строки списка бессмысленно.
   *
   * Неопубликованные дивизионы не отдаются никому: пока лига не нажала «опубликовать»,
   * турнира для приложения не существует — даже для заявленных в него команд.
   */
  async getLeagueStructure(req, res) {
    try {
      const { leagueId } = req.params;

      const { rows } = await pool.query(`
        SELECT s.id AS season_id, s.name AS season_name, s.is_active AS season_is_active,
               s.start_date AS season_start,
               d.id AS division_id, d.name AS division_name, d.short_name AS division_short_name,
               d.logo_url AS division_logo, d.is_tournament, d.tournament_type,
               d.start_date AS division_start, d.end_date AS division_end,
               EXISTS (
                 SELECT 1
                 FROM tournament_teams tt
                 WHERE tt.division_id = d.id AND tt.status = 'approved'
                   AND (
                     EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = tt.team_id AND tm.user_id = $2 AND tm.left_at IS NULL)
                     OR EXISTS (SELECT 1 FROM teams t WHERE t.id = tt.team_id AND t.owner_id = $2)
                   )
               ) AS is_mine
        FROM seasons s
        LEFT JOIN divisions d ON d.season_id = s.id AND d.is_published = true
        WHERE s.league_id = $1
        ORDER BY s.start_date DESC NULLS LAST, s.id DESC, d.name
      `, [leagueId, req.user.id]);

      // Собираем плоскую выборку в сезоны с вложенными дивизионами.
      // LEFT JOIN оставляет сезон в ответе даже без единого видимого дивизиона —
      // так человек видит, что сезон есть, но смотреть в нём пока нечего.
      const seasons = [];
      const byId = new Map();

      for (const row of rows) {
        if (!byId.has(row.season_id)) {
          const season = {
            id: row.season_id,
            name: row.season_name,
            isActive: row.season_is_active,
            divisions: []
          };
          byId.set(row.season_id, season);
          seasons.push(season);
        }

        if (row.division_id) {
          byId.get(row.season_id).divisions.push({
            id: row.division_id,
            name: row.division_name,
            shortName: row.division_short_name,
            logoUrl: row.division_logo,
            isTournament: row.is_tournament,
            tournamentType: row.tournament_type,
            startDate: row.division_start,
            endDate: row.division_end,
            isMine: row.is_mine
          });
        }
      }

      return res.json({ success: true, seasons });
    } catch (err) {
      console.error('Ошибка в TournamentController.getLeagueStructure:', err);
      return res.status(500).json({ success: false, error: 'Не удалось загрузить сезоны лиги' });
    }
  }
}

export default new TournamentController();