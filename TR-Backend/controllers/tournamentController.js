// tournamentController.js
import pool from '../config/db.js';
import { METRIC_DEFS } from '../utils/nominationMetrics.js';
import { calculateNomination } from '../utils/nominationCalculator.js';
import { isVirtualPhone } from '../utils/phone.js';
import { listedReserveGoaliesSql } from '../utils/reserveGoalies.js';

// Публичный адрес бакета, где LMS хранит скрины протоколов (как у сайта ТФХ)
const PROTOCOL_IMAGE_BASE = 'https://s3.twcstorage.ru/hockeyeco-uploads/';

// Сколько мест номинации показывает карточка в разделе «Турниры / Лиги».
// Своё место человек видит и за пределами топа — отдельной строкой.
const NOMINATION_TOP_SIZE = 7;

// Подходит ли заявка игрока под номинацию: вратарю нечего делать в рейтинге
// снайперов, а защитнику — в номинации для нападающих
const fitsNomination = (position, n) => {
  if (n.player_type === 'goalie') return position === 'goalie';
  if (n.player_type === 'skater') {
    if (position === 'goalie') return false;
    return n.position_filter === 'all' || position === n.position_filter;
  }
  return true;
};

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
          -- Черновик расписания LMS — «часы арены», как их вписал организатор. Есть и у
          -- матчей без точного начала (только дата, время без арены и т.п.). Строками:
          -- голый date драйвер pg сдвигает на день на серверах в другом поясе.
          to_char(g.draft_date, 'YYYY-MM-DD') AS draft_date,
          to_char(g.draft_time, 'HH24:MI') AS draft_time,
          a.timezone AS arena_timezone,
          g.home_score,
          g.away_score,
          g.game_number,
          g.end_type,
          g.is_technical,
          g.home_team_id,
          g.away_team_id,
          -- Название, аббревиатура и лого — по слепку заявки на дивизион (snap_*),
          -- снятому LMS при допуске; пока слепка нет — живое из teams
          COALESCE(tt_home.snap_name, t_home.name) as home_team_name,
          COALESCE(tt_home.snap_short_name, t_home.short_name) as home_team_short_name,
          COALESCE(tt_home.snap_logo_url, t_home.logo_url) as home_team_logo,
          COALESCE(tt_away.snap_name, t_away.name) as away_team_name,
          COALESCE(tt_away.snap_short_name, t_away.short_name) as away_team_short_name,
          COALESCE(tt_away.snap_logo_url, t_away.logo_url) as away_team_logo,
          COALESCE(a.name, g.location) as arena_name,
          a.city as arena_city,
          a.address as arena_address,
          g.location_url,
          -- Ссылки на трансляцию / запись игры. Названия полей исторические: лига может
          -- вставить в любое из них ссылку на любую площадку, её определяет фронт по домену
          g.video_yt_url,
          g.video_vk_url,
          g.protocol_image_key,
          g.protocol_image_version,
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
        LEFT JOIN tournament_teams tt_home ON tt_home.division_id = g.division_id AND tt_home.team_id = g.home_team_id
        LEFT JOIN tournament_teams tt_away ON tt_away.division_id = g.division_id AND tt_away.team_id = g.away_team_id
        LEFT JOIN arenas a ON g.arena_id = a.id
        WHERE g.division_id = $1
        ORDER BY 
          CASE g.stage_type 
            WHEN 'regular' THEN 1 
            WHEN 'playoff' THEN 2 
            ELSE 3 
          END ASC,
          -- Внутри стадии — по туру и номеру матча, а не по дате: у части расписания
          -- даты ещё нет
          g.series_number ASC NULLS LAST,
          g.game_number ASC NULLS LAST,
          g.id ASC
      `;

      const { rows } = await pool.query(query, [divisionId]);

      // Скрин протокола LMS кладёт в S3 при публикации и пишет ключ с версией в games.
      // Ссылку собираем так же, как сайт ТФХ: версия в адресе сбивает кэш, когда скрин
      // пересоздали. Только у завершённых матчей — у остальных скрин мог остаться от
      // переоткрытого матча и уже не совпадать с протоколом.
      const games = rows.map(({ protocol_image_key, protocol_image_version, ...game }) => ({
        ...game,
        protocol_image_url: ['finished', 'finished_no_result'].includes(game.status)
          && protocol_image_key && protocol_image_version
          ? `${PROTOCOL_IMAGE_BASE}${protocol_image_key.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(protocol_image_version)}`
          : null,
      }));

      return res.json({
        success: true,
        games
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

      // Таблица строится от заявок дивизиона, а очки подтягиваются к ним — как на сайте
      // ТФХ (ChampionshipController.getDivisionStandings). Раньше читали division_standings
      // как есть, а LMS не удаляла оттуда строки команд, убранных из дивизиона: в TR
      // висели лишние команды со старыми местами. Пока сыгранных матчей нет — по алфавиту.
      const query = `
        SELECT
          tt.team_id,
          COALESCE(ds.games_played, 0)   AS games_played,
          COALESCE(ds.wins_reg, 0)       AS wins_reg,
          COALESCE(ds.wins_ot, 0)        AS wins_ot,
          COALESCE(ds.draws, 0)          AS draws,
          COALESCE(ds.losses_ot, 0)      AS losses_ot,
          COALESCE(ds.losses_reg, 0)     AS losses_reg,
          COALESCE(ds.goals_for, 0)      AS goals_for,
          COALESCE(ds.goals_against, 0)  AS goals_against,
          COALESCE(ds.points, 0)         AS points,
          ds.rank,
          -- Слепок заявки (snap_*) важнее живого профиля команды
          COALESCE(tt.snap_name, t.name) as team_name,
          COALESCE(tt.snap_short_name, t.short_name) as team_short_name,
          COALESCE(tt.snap_logo_url, t.logo_url) as team_logo
        FROM tournament_teams tt
        JOIN teams t ON t.id = tt.team_id
        LEFT JOIN division_standings ds ON ds.division_id = tt.division_id AND ds.team_id = tt.team_id
        WHERE tt.division_id = $1 AND tt.status IN ('approved', 'revision', 'pending')
        ORDER BY
          CASE WHEN SUM(COALESCE(ds.games_played, 0)) OVER () = 0
               THEN NULL
               ELSE COALESCE(ds.rank, 999999) END,
          COALESCE(ds.points, 0) DESC,
          COALESCE(tt.snap_name, t.name)
      `;

      const { rows } = await pool.query(query, [divisionId]);

      // Место — из пересчёта LMS; у заявки, до которой пересчёт ещё не дошёл, — по порядку
      const standings = rows.map((row, idx) => ({ ...row, rank: row.rank ?? idx + 1 }));

      return res.json({
        success: true,
        standings
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
          COALESCE(tt1.snap_name, t1.name) as team1_name,
          COALESCE(tt1.snap_logo_url, t1.logo_url) as team1_logo,
          COALESCE(tt2.snap_name, t2.name) as team2_name,
          COALESCE(tt2.snap_logo_url, t2.logo_url) as team2_logo
        FROM playoff_brackets pb
        JOIN playoff_rounds pr ON pb.id = pr.bracket_id
        LEFT JOIN playoff_matchups pm ON pr.id = pm.round_id
        LEFT JOIN teams t1 ON pm.team1_id = t1.id
        LEFT JOIN teams t2 ON pm.team2_id = t2.id
        LEFT JOIN tournament_teams tt1 ON tt1.division_id = pb.division_id AND tt1.team_id = pm.team1_id
        LEFT JOIN tournament_teams tt2 ON tt2.division_id = pb.division_id AND tt2.team_id = pm.team2_id
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
            -- Пока игрок допущен, в турнирных разделах показываем слепок фотографии из
            -- заявки: фото в команде руководитель меняет когда угодно, а в лиге лицо
            -- должно оставаться тем, что допустили (см. updateTournamentRosterStatus в LMS)
            COALESCE(tr.photo_snapshot_url, tm.photo_url) AS photo_url,
            tt.team_id AS team_id,
            COALESCE(tt.snap_name, t.name) AS team_name,
            COALESCE(tt.snap_logo_url, t.logo_url) AS team_logo,
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
            -- Пока игрок допущен, в турнирных разделах показываем слепок фотографии из
            -- заявки: фото в команде руководитель меняет когда угодно, а в лиге лицо
            -- должно оставаться тем, что допустили (см. updateTournamentRosterStatus в LMS)
            COALESCE(tr.photo_snapshot_url, tm.photo_url) AS photo_url,
            tt.team_id AS team_id,
            COALESCE(tt.snap_name, t.name) AS team_name,
            COALESCE(tt.snap_logo_url, t.logo_url) AS team_logo,
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

        // Что лига вообще ведёт на запрошенной стадии: фронт по этим признакам убирает
        // колонки целиком, а не забивает их прочерками. Для 'all' колонка нужна, если
        // учёт включён хотя бы в одной стадии — у кого её нет, прочерк в ячейке остаётся.
        const tracking = {
          plusMinus: stagesToFetch.some(st => trackPMByStage[st]),
          shots: stagesToFetch.some(st => trackShotsByStage[st]),
        };

        return res.json({
          success: true,
          skaters,
          goalies,
          tracking
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

  // Вкладка «О дивизионе»: описание от лиги и итоговые цифры, плюс признак, есть ли
  // резервные вратари — по нему фронт решает, показывать ли их вкладку.
  async getDivisionOverview(req, res) {
    try {
      const { divisionId } = req.params;

      const { rows } = await pool.query(`
        SELECT d.id, d.name, d.short_name, d.description,
               -- Мало включить механику в лиге — в дивизионе должен быть хоть один
               -- включённый вратарь, иначе вкладка открывалась бы пустой
               -- (так же решает сайт ТФХ)
               (l.reserve_goalies_enabled
                AND EXISTS (${listedReserveGoaliesSql('d.id')})
               ) AS has_reserve_goalies,
               (SELECT COUNT(*) FROM tournament_teams tt
                 WHERE tt.division_id = d.id AND tt.status = 'approved')::int AS teams_count,
               -- Игрок, переходивший между командами дивизиона, считается один раз
               (SELECT COUNT(DISTINCT tr.player_id)
                  FROM tournament_rosters tr
                  JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
                 WHERE tt.division_id = d.id AND tt.status = 'approved'
                   AND tr.application_status = 'approved')::int AS players_count,
               (SELECT COUNT(*) FROM games g
                 WHERE g.division_id = d.id AND g.status = 'finished')::int AS games_played,
               -- Шайбы — по протоколам. У технических результатов протокола нет,
               -- счёт там условный, и в «заброшено» он не идёт
               (SELECT COUNT(*)
                  FROM game_events ge
                  JOIN games g ON g.id = ge.game_id
                 WHERE g.division_id = d.id AND g.status = 'finished'
                   AND g.is_technical IS NULL AND ge.event_type = 'goal')::int AS goals_scored
        FROM divisions d
        JOIN seasons s ON s.id = d.season_id
        JOIN leagues l ON l.id = s.league_id
        WHERE d.id = $1 AND d.is_published = true
      `, [divisionId]);

      const d = rows[0];
      if (!d) return res.status(404).json({ success: false, error: 'Дивизион не найден' });

      return res.json({
        success: true,
        overview: {
          description: d.description?.trim() || null,
          hasReserveGoalies: !!d.has_reserve_goalies,
          teamsCount: d.teams_count,
          playersCount: d.players_count,
          gamesPlayed: d.games_played,
          goalsScored: d.goals_scored,
        }
      });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionOverview:', err);
      return res.status(500).json({ success: false, error: 'Не удалось загрузить сведения о дивизионе' });
    }
  }

  // Резервные вратари дивизиона: вратари лиги, отмеченные в этом дивизионе, с которыми
  // команда договаривается сама, когда её вратарь не выходит на матч. Выключенных здесь
  // нет вовсе; у вратаря без обязательных документов телефон не отдаём — он в списке
  // с пометкой «не доступен» (utils/reserveGoalies.js).
  // Список и правила дисквалификации — те же, что у сайта ТФХ
  // (ChampionshipController.getDivisionReserveGoalies) — правите там, правьте и здесь.
  //
  // Статистика — другая, чем на сайте: не только выходы резервным в этом дивизионе, а все
  // матчи вратаря в этой лиге за все сезоны — и за свою команду, и резервным. Командам
  // важно понять, насколько вратарь надёжен, а выходов резервным у многих ноль-один.
  async getDivisionReserveGoalies(req, res) {
    try {
      const { divisionId } = req.params;

      const divRows = await pool.query(
        `SELECT d.id, s.league_id, l.reserve_goalies_enabled, l.reserve_goalie_own_dq_blocks
         FROM divisions d
         JOIN seasons s ON s.id = d.season_id
         JOIN leagues l ON l.id = s.league_id
         WHERE d.id = $1 AND d.is_published = true`,
        [divisionId]
      );
      const div = divRows.rows[0];
      if (!div) return res.status(404).json({ success: false, error: 'Дивизион не найден' });
      if (!div.reserve_goalies_enabled) return res.json({ success: true, goalies: [] });

      const { rows } = await pool.query(
        `WITH rg AS (${listedReserveGoaliesSql('$1')}),
         goalie_games AS (
           -- Матчи в воротах за свою команду. Резервные выходы LMS кладёт не сюда, а в
           -- отдельную таблицу (см. ниже) — физически, чтобы они не смешивались с личной
           -- статистикой; здесь мы их складываем сознательно. Только реальный выход на
           -- лёд и только официальные матчи лиги
           SELECT pgs.player_id,
                  pgs.goalie_goals_against AS goals_against,
                  pgs.goalie_saves         AS saves,
                  pgs.goalie_shots_against AS shots_against,
                  pgs.goalie_shutout       AS shutout
           FROM player_game_statistics pgs
           WHERE pgs.league_id = $2 AND pgs.is_goalie AND pgs.goalie_seconds > 0
             AND pgs.game_type = 'official'
             AND pgs.player_id IN (SELECT player_id FROM rg)
           UNION ALL
           -- Выходы резервным вратарём — в любом дивизионе лиги
           SELECT r.player_id,
                  r.goalie_goals_against, r.goalie_saves, r.goalie_shots_against, r.goalie_shutout
           FROM reserve_goalie_game_statistics r
           WHERE r.league_id = $2 AND r.goalie_seconds > 0
             AND r.player_id IN (SELECT player_id FROM rg)
         )
         SELECT
           rg.player_id, rg.jersey_number, rg.note, rg.docs_ok,
           u.first_name, u.last_name, u.phone,
           -- Личный аватар в лиговых разделах не показываем: сначала фото, загруженное
           -- лигой для резерва, иначе снимок из заявки этой лиги (фото на момент допуска)
           COALESCE(rg.photo_url, photo.snapshot_url) AS photo_url,
           COALESCE(st.games_played, 0)   AS games_played,
           COALESCE(st.goals_against, 0)  AS goals_against,
           COALESCE(st.saves, 0)          AS saves,
           COALESCE(st.shots_against, 0)  AS shots_against,
           COALESCE(st.shutouts, 0)       AS shutouts,
           -- От дисквалификаций списку нужен ровно один факт: закрыт ли человеку выход
           -- резервным вратарём. Ни причина, ни срок наружу не идут
           COALESCE(dq.has_reserve_dq, false) AS dq_has_reserve,
           COALESCE(dq.has_own_dq, false)     AS dq_has_own
         FROM rg
         JOIN users u ON u.id = rg.player_id
         LEFT JOIN LATERAL (
           SELECT
             (SELECT tr.photo_snapshot_url
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
                JOIN divisions d3 ON d3.id = tt.division_id
                JOIN seasons s3 ON s3.id = d3.season_id
               WHERE tr.player_id = rg.player_id AND s3.league_id = $2
                 AND tr.photo_snapshot_url IS NOT NULL
               ORDER BY tr.id DESC LIMIT 1) AS snapshot_url
         ) photo ON true
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int                                   AS games_played,
             COALESCE(SUM(gg.goals_against), 0)::int         AS goals_against,
             COALESCE(SUM(gg.saves), 0)::int                 AS saves,
             COALESCE(SUM(gg.shots_against), 0)::int         AS shots_against,
             COUNT(*) FILTER (WHERE gg.shutout)::int         AS shutouts
           FROM goalie_games gg
           WHERE gg.player_id = rg.player_id
         ) st ON true
         LEFT JOIN LATERAL (
           SELECT
             bool_or(d2.is_reserve_goalie)     AS has_reserve_dq,
             bool_or(NOT d2.is_reserve_goalie) AS has_own_dq
           FROM disqualifications d2
           WHERE d2.user_id = rg.player_id AND d2.league_id = $2 AND d2.status = 'active'
         ) dq ON true
         WHERE rg.league_id = $2
         ORDER BY u.last_name, u.first_name`,
        [divisionId, div.league_id]
      );

      const goalies = rows.map((r) => ({
        playerId: r.player_id,
        firstName: r.first_name,
        lastName: r.last_name,
        photoUrl: r.photo_url,
        // Служебный номер виртуальной карточки — логин, а не телефон: звонить по нему
        // бессмысленно, поэтому не отдаём. Не отдаём и номер вратаря без обязательных
        // документов: договориться с ним нельзя, пока лига его не допустит
        phone: r.docs_ok && r.phone && !isVirtualPhone(r.phone) ? r.phone : null,
        isUnavailable: !r.docs_ok,
        jerseyNumber: r.jersey_number,
        note: r.note,
        gamesPlayed: r.games_played,
        goalsAgainst: r.goals_against,
        saves: r.saves,
        shotsAgainst: r.shots_against,
        shutouts: r.shutouts,
        // Правило то же, что в шторке состава LMS: наказание, полученное резервным
        // вратарём, закрывает выход всегда; полученное в своей команде — только если
        // лига включила соответствующую настройку
        isBlocked: r.dq_has_reserve || (r.dq_has_own && div.reserve_goalie_own_dq_blocks),
      }));

      return res.json({ success: true, goalies });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionReserveGoalies:', err);
      return res.status(500).json({ success: false, error: 'Не удалось загрузить резервных вратарей' });
    }
  }

  // Номинации дивизиона с рассчитанными участниками — вкладка «ТОП-7».
  // Правило задаётся в конструкторе LMS (division_nominations), здесь только считается:
  // результат нигде не хранится, поправили протокол — поменялся и лидер. Та же логика,
  // что у сайта ТФХ (getDivisionNominations), отличие одно: отдаём топ и место того,
  // кто смотрит, если он в топ не попал — даже если результата у него пока нет.
  async getDivisionNominations(req, res) {
    try {
      const { divisionId } = req.params;
      const viewerId = req.user?.id ?? null;

      // Черновик лиги не показываем, как и в справочнике лиг
      const [{ rows: nominations }, { rows: viewerEntries }] = await Promise.all([
        pool.query(
          `SELECT n.id, n.division_id, n.name, n.scope, n.player_type, n.position_filter,
                  n.stage_type, n.metric, n.sort_order, n.tiebreakers, n.min_games
           FROM division_nominations n
           JOIN divisions d ON d.id = n.division_id AND d.is_published = true
           WHERE n.division_id = $1
           ORDER BY n.display_order, n.id`,
          [divisionId]
        ),
        // Заявки того, кто смотрит, в этом дивизионе — чтобы показать его строку и тогда,
        // когда в расчёт он не попал вовсе (не сыграл, не набрал минимум матчей).
        // Одна заявка на команду, действующая первой — как в калькуляторе номинаций.
        viewerId == null ? { rows: [] } : pool.query(
          `SELECT DISTINCT ON (tt.team_id)
                  tt.team_id, tr.position, u.first_name, u.last_name,
                  COALESCE(tr.photo_snapshot_url, tm.photo_url) AS photo_url,
                  COALESCE(tt.snap_name, t.name) AS team_name,
                  COALESCE(tt.snap_logo_url, t.logo_url) AS team_logo
           FROM tournament_rosters tr
           JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
           JOIN users u ON u.id = tr.player_id
           JOIN teams t ON t.id = tt.team_id
           LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id AND tm.left_at IS NULL
           WHERE tt.division_id = $1 AND tr.player_id = $2 AND tr.application_status = 'approved'
           ORDER BY tt.team_id, tr.period_end NULLS FIRST, tr.id DESC`,
          [divisionId, viewerId]
        )
      ]);

      const toPlayer = (p, rank) => ({
        rank,
        playerId: p.player_id,
        firstName: p.first_name,
        lastName: p.last_name,
        photoUrl: p.avatar_url,
        teamId: p.team_id,
        teamName: p.team_name,
        teamLogo: p.team_logo_url,
        gamesPlayed: p.games_played,
        value: p.value,
        // Строку того, кто смотрит, фронт подсвечивает — и в топе, и отдельной
        isMe: viewerId != null && Number(p.player_id) === Number(viewerId),
        // Пояснение вместо числа матчей, когда места нет (см. ниже)
        note: null,
      });

      const result = await Promise.all(nominations.map(async (n) => {
        const def = METRIC_DEFS[n.metric];
        let calculated = [];
        try {
          calculated = await calculateNomination(n);
        } catch (err) {
          // Одна сломанная номинация не должна ронять всю вкладку
          console.error(`Ошибка расчёта номинации #${n.id}:`, err.message);
        }

        // В рейтинг — только игроки с результатом. Где «больше — лучше», ноль и минус
        // не достижение; где «меньше — лучше», ноль как раз лучший результат. Пустая
        // доля (у вратаря не было бросков) не результат ни там, ни там.
        const higherIsBetter = n.sort_order !== 'asc';
        const players = calculated.filter((p) => p.value !== null && (!higherIsBetter || p.value > 0));

        const ranked = players.map((p, idx) => toPlayer(p, idx + 1));
        const top = ranked.slice(0, NOMINATION_TOP_SIZE);

        // Своё место — отдельной строкой под топом. Три случая:
        //  1. есть в рейтинге — его место (в командном зачёте за две команды — лучшее);
        //  2. посчитан, но без результата (0 шайб, минус в +/-) — место делит со всеми,
        //     у кого результат не лучше: «сколько игроков впереди» + 1;
        //  3. в расчёт не попал (не играл, не набрал минимум матчей) — строка с прочерком
        //     и пояснением. В командном зачёте так не делаем: там считается только
        //     лучший в каждой команде, и «не попал» значит лишь «не лучший у себя».
        let me = ranked.find((p) => p.isMe) || null;
        if (!me && viewerId != null) {
          const raw = calculated.find((p) => Number(p.player_id) === Number(viewerId));
          if (raw) {
            const v = raw.value;
            const ahead = v === null ? null : calculated.filter((p) => (
              p.value !== null && (higherIsBetter ? p.value > v : p.value < v)
            )).length;
            // Если результата нет ни у кого, «первое место» с нулём было бы враньём
            me = toPlayer(raw, ahead === null || ranked.length === 0 ? null : ahead + 1);
          } else if (n.scope !== 'team') {
            const entry = viewerEntries.find((e) => fitsNomination(e.position, n));
            if (entry) {
              me = {
                rank: null,
                playerId: viewerId,
                firstName: entry.first_name,
                lastName: entry.last_name,
                photoUrl: entry.photo_url,
                teamId: entry.team_id,
                teamName: entry.team_name,
                teamLogo: entry.team_logo,
                gamesPlayed: null,
                value: null,
                isMe: true,
                // «меньше 1 матча», «меньше 21 матча», но «меньше 3 матчей»
                note: n.min_games > 0
                  ? `меньше ${n.min_games} ${n.min_games % 10 === 1 && n.min_games % 100 !== 11 ? 'матча' : 'матчей'}`
                  : 'нет матчей',
              };
            }
          }
        }

        return {
          id: n.id,
          name: n.name,
          scope: n.scope,
          playerType: n.player_type,
          positionFilter: n.position_filter,
          stageType: n.stage_type,
          metricLabel: def?.label || n.metric,
          metricFormat: def?.format || 'int',
          minGames: n.min_games,
          total: ranked.length,
          players: top,
          // В топе он и так виден — отдельная строка только вне топа
          me: me && !top.includes(me) ? me : null,
        };
      }));

      return res.json({ success: true, nominations: result });
    } catch (err) {
      console.error('Ошибка в TournamentController.getDivisionNominations:', err);
      return res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера при расчёте номинаций'
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
                OR EXISTS (SELECT 1 FROM team_owners tow WHERE tow.team_id = tt.team_id AND tow.user_id = ${userParam})
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
   *
   * Порядок дивизионов внутри сезона: сначала те, где играли позже всех (идущий матч
   * тоже считается сыгранным), потом по числу допущенных команд — больше выше, потом
   * по алфавиту. Дивизионы без единого сыгранного матча — после всех, где уже играли.
   * Фронт порядок не меняет, только делит список на дивизионы и турниры.
   */
  async getLeagueStructure(req, res) {
    try {
      const { leagueId } = req.params;

      // Сама лига — для карточки вверху панели выбора: сохранённый выбор хранит только
      // название и короткое имя, а там нужны ещё логотип и город, и всегда свежие
      const leagueRes = await pool.query(
        `SELECT id, name, short_name, city, logo_url FROM leagues WHERE id = $1`,
        [leagueId]
      );

      const { rows } = await pool.query(`
        SELECT s.id AS season_id, s.name AS season_name, s.is_active AS season_is_active,
               s.start_date AS season_start,
               d.id AS division_id, d.name AS division_name, d.short_name AS division_short_name,
               d.logo_url AS division_logo, d.is_tournament, d.tournament_type,
               -- Даты строкой: голый date драйвер pg сдвигает на день на серверах в другом поясе
               to_char(d.start_date, 'YYYY-MM-DD') AS division_start,
               to_char(d.end_date, 'YYYY-MM-DD') AS division_end,
               -- Для подписи «идёт / завершён» под дивизионом: сколько сыграно и сколько
               -- ещё впереди. Отменённые не в счёт ни там, ни там
               (SELECT COUNT(*) FROM games g
                 WHERE g.division_id = d.id AND g.status IN ('finished', 'finished_no_result'))::int AS games_played,
               (SELECT COUNT(*) FROM games g
                 WHERE g.division_id = d.id AND g.status IN ('scheduled', 'live'))::int AS games_left,
               EXISTS (
                 SELECT 1
                 FROM tournament_teams tt
                 WHERE tt.division_id = d.id AND tt.status = 'approved'
                   AND (
                     EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = tt.team_id AND tm.user_id = $2 AND tm.left_at IS NULL)
                     OR EXISTS (SELECT 1 FROM team_owners tow WHERE tow.team_id = tt.team_id AND tow.user_id = $2)
                   )
               ) AS is_mine,
               (
                 SELECT MAX(g.game_date)
                 FROM games g
                 WHERE g.division_id = d.id AND g.status IN ('live', 'finished')
               ) AS last_game_at,
               (
                 SELECT COUNT(*)
                 FROM tournament_teams tt_count
                 WHERE tt_count.division_id = d.id AND tt_count.status = 'approved'
               )::int AS teams_count
        FROM seasons s
        LEFT JOIN divisions d ON d.season_id = s.id AND d.is_published = true
        WHERE s.league_id = $1
        ORDER BY s.start_date DESC NULLS LAST, s.id DESC,
                 last_game_at DESC NULLS LAST, teams_count DESC, d.name, d.id
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
            teamsCount: row.teams_count,
            gamesPlayed: row.games_played,
            gamesLeft: row.games_left,
            isMine: row.is_mine
          });
        }
      }

      return res.json({ success: true, league: leagueRes.rows[0] || null, seasons });
    } catch (err) {
      console.error('Ошибка в TournamentController.getLeagueStructure:', err);
      return res.status(500).json({ success: false, error: 'Не удалось загрузить сезоны лиги' });
    }
  }
}

export default new TournamentController();