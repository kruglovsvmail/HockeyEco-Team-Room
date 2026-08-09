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

    // Статистика игрока — агрегат боксскора player_game_statistics. ОДНА строка на дивизион:
    // сумма regular+playoff (по прямому решению пользователя — сводная цифра). Стадии всё
    // равно считаются отдельными парами LATERAL — не ради вывода, а ради маскирования:
    // флаги лиги у регулярки и плей-офф свои.
    //
    // Коэффициент надёжности (КН) не считается: показатель убран из системы целиком.
    //
    // Маскирование: если у дивизиона на конкретной стадии выключен track_plus_minus/track_shots,
    // вклад ЭТОЙ стадии в сумму = 0 ("—" не показываем нигде, ноль и есть ноль).
    //
    // Исключение для +/-: когда лига не ведёт +/- на стадии, строки в game_plus_minus для матчей
    // этой стадии физически мог создать только сам игрок команды (роль official_team в
    // MatchResultsController.updateMatchEvent жёстко требует "лига не ведёт", а секретарское UI
    // в LMS Live Desk наоборот скрывает кнопку +/-, пока флаг выключен — так что при выключенном
    // флаге других источников для этих строк нет). Отдельной колонки-маркера не нужно — источник
    // однозначно определяется самим состоянием флага. Такие данные подмешиваются в сумму ТОЛЬКО
    // если смотрящий (req.user) сам состоит в команде игрока (владелец/участник команды или её
    // клуба) — иначе для него это 0, как для чужой лиги. Плюс отдаём флаг pm_is_unofficial, чтобы
    // фронт мог ненавязчиво подсветить цифру.
    const statsQuery = `
      WITH base AS (
        SELECT
          tr.id AS tournament_roster_id,
          tr.position,
          tr.is_fee_paid,
          tt.team_id,
          tt.division_id,
          t.short_name AS team_short_name,
          t.name AS team_name,
          t.logo_url AS team_logo,
          t.city AS team_city,
          d.name AS division_name,
          d.short_name AS division_short_name,
          d.logo_url AS division_logo,
          d.hide_stats_unpaid,
          d.reg_track_plus_minus, d.playoff_track_plus_minus,
          d.reg_track_shots, d.playoff_track_shots,
          s.name AS season_name,
          s.is_active AS is_current,
          s.start_date,
          l.short_name AS league_name,
          l.name AS league_full_name,
          l.logo_url AS league_logo,
          l.city AS league_city,
          lq.short_name AS qual_name,
          lq.name AS qual_full_name,
          lq.description AS qual_description,
          (
            EXISTS(SELECT 1 FROM "public"."teams" tow WHERE tow.id = tt.team_id AND tow.owner_id = $2)
            OR EXISTS(SELECT 1 FROM "public"."team_members" tmem WHERE tmem.team_id = tt.team_id AND tmem.user_id = $2 AND tmem.left_at IS NULL)
            OR EXISTS(SELECT 1 FROM "public"."teams" tcw JOIN "public"."clubs" cw ON cw.id = tcw.club_id WHERE tcw.id = tt.team_id AND cw.owner_id = $2)
            OR EXISTS(SELECT 1 FROM "public"."teams" tcm JOIN "public"."club_members" cmem ON cmem.club_id = tcm.club_id WHERE tcm.id = tt.team_id AND cmem.user_id = $2 AND cmem.left_at IS NULL)
          ) AS is_own_team
        FROM "public"."tournament_rosters" tr
        JOIN "public"."tournament_teams" tt ON tr.tournament_team_id = tt.id
        JOIN "public"."teams" t ON tt.team_id = t.id
        JOIN "public"."divisions" d ON tt.division_id = d.id
        JOIN "public"."seasons" s ON d.season_id = s.id
        JOIN "public"."leagues" l ON s.league_id = l.id
        LEFT JOIN "public"."league_qualifications" lq ON tr.qualification_id = lq.id
        WHERE tr.player_id = $1
      ),
      agg AS (
        SELECT
          b.*,
          COALESCE(skater_reg.gp, 0) + COALESCE(skater_po.gp, 0) + COALESCE(goalie_reg.gp, 0) + COALESCE(goalie_po.gp, 0) AS gp,
          COALESCE(skater_reg.g, 0) + COALESCE(skater_po.g, 0) AS g,
          -- Передачи считаем и вратарю: в протоколе его можно поставить ассистентом.
          -- Голы и очки при этом остаются чисто полевыми — их у вратаря не показываем.
          COALESCE(skater_reg.a, 0) + COALESCE(skater_po.a, 0)
            + COALESCE(goalie_reg.a, 0) + COALESCE(goalie_po.a, 0) AS a,
          COALESCE(skater_reg.g, 0) + COALESCE(skater_po.g, 0) + COALESCE(skater_reg.a, 0) + COALESCE(skater_po.a, 0) AS pts,
          (
            CASE WHEN b.reg_track_plus_minus OR b.is_own_team THEN COALESCE(skater_reg.pm, 0) ELSE 0 END
            +
            CASE WHEN b.playoff_track_plus_minus OR b.is_own_team THEN COALESCE(skater_po.pm, 0) ELSE 0 END
          ) AS pm,
          (
            (NOT b.reg_track_plus_minus AND b.is_own_team AND COALESCE(skater_reg.pm, 0) <> 0)
            OR (NOT b.playoff_track_plus_minus AND b.is_own_team AND COALESCE(skater_po.pm, 0) <> 0)
          ) AS pm_is_unofficial,
          COALESCE(skater_reg.pim, 0) + COALESCE(skater_po.pim, 0) + COALESCE(goalie_reg.pim, 0) + COALESCE(goalie_po.pim, 0) AS pim,
          COALESCE(goalie_reg.ga, 0) + COALESCE(goalie_po.ga, 0) AS ga,
          (
            CASE WHEN b.reg_track_shots OR b.is_own_team THEN COALESCE(goalie_reg.sa, 0) ELSE 0 END
            + CASE WHEN b.playoff_track_shots OR b.is_own_team THEN COALESCE(goalie_po.sa, 0) ELSE 0 END
          ) AS sa,
          (
            CASE WHEN b.reg_track_shots OR b.is_own_team THEN COALESCE(goalie_reg.sv, 0) ELSE 0 END
            + CASE WHEN b.playoff_track_shots OR b.is_own_team THEN COALESCE(goalie_po.sv, 0) ELSE 0 END
          ) AS sv,
          (
            (NOT b.reg_track_shots AND b.is_own_team AND COALESCE(goalie_reg.sa, 0) <> 0)
            OR (NOT b.playoff_track_shots AND b.is_own_team AND COALESCE(goalie_po.sa, 0) <> 0)
          ) AS shots_is_unofficial,
          COALESCE(goalie_reg.sho, 0) + COALESCE(goalie_po.sho, 0) AS sho,
          COALESCE(goalie_reg.toi, 0) + COALESCE(goalie_po.toi, 0) AS toi
        FROM base b
        -- Четыре выборки из боксскора player_game_statistics: полевые и вратарские
        -- показатели, каждая — по своей стадии. Раньше на их месте были четыре
        -- LATERAL-блока с CTE по game_events, game_plus_minus, game_goalie_log и
        -- game_shots_by_goalie — около 190 строк SQL, которые крутились при каждом
        -- открытии профиля. Теперь всё посчитано при завершении матча.
        --
        -- Область — заявка игрока на турнир (b.tournament_roster_id): пара
        -- «игрок + команда» в конкретном дивизионе, как и в прежнем расчёте.
        LEFT JOIN LATERAL (
          -- Полевые показатели: регулярка (и групповые этапы)
          SELECT
            COUNT(*) FILTER (WHERE NOT pgs.is_goalie)::int AS gp,
            COALESCE(SUM(pgs.goals), 0)::int               AS g,
            COALESCE(SUM(pgs.assists), 0)::int             AS a,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int     AS pim,
            COALESCE(SUM(pgs.plus_minus), 0)::int          AS pm
          FROM "public"."player_game_statistics" pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type <> 'playoff'
        ) skater_reg ON b.position != 'goalie'
        LEFT JOIN LATERAL (
          -- Полевые показатели: плей-офф
          SELECT
            COUNT(*) FILTER (WHERE NOT pgs.is_goalie)::int AS gp,
            COALESCE(SUM(pgs.goals), 0)::int               AS g,
            COALESCE(SUM(pgs.assists), 0)::int             AS a,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int     AS pim,
            COALESCE(SUM(pgs.plus_minus), 0)::int          AS pm
          FROM "public"."player_game_statistics" pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type = 'playoff'
        ) skater_po ON b.position != 'goalie'
        LEFT JOIN LATERAL (
          -- Вратарские показатели: регулярка (и групповые этапы)
          SELECT
            -- Матчи вратаря — только те, где он реально стоял в воротах
            COUNT(*) FILTER (WHERE pgs.is_goalie)::int          AS gp,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int          AS pim,
            COALESCE(SUM(pgs.assists), 0)::int                  AS a,
            COALESCE(SUM(pgs.goalie_goals_against), 0)::int     AS ga,
            COALESCE(SUM(pgs.goalie_saves), 0)::int             AS sv,
            COALESCE(SUM(pgs.goalie_shots_against), 0)::int     AS sa,
            COUNT(*) FILTER (WHERE pgs.goalie_shutout)::int     AS sho,
            COALESCE(SUM(pgs.goalie_seconds), 0)::int           AS toi
          FROM "public"."player_game_statistics" pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type <> 'playoff'
        ) goalie_reg ON b.position = 'goalie'
        LEFT JOIN LATERAL (
          -- Вратарские показатели: плей-офф
          SELECT
            -- Матчи вратаря — только те, где он реально стоял в воротах
            COUNT(*) FILTER (WHERE pgs.is_goalie)::int          AS gp,
            COALESCE(SUM(pgs.penalty_minutes), 0)::int          AS pim,
            COALESCE(SUM(pgs.assists), 0)::int                  AS a,
            COALESCE(SUM(pgs.goalie_goals_against), 0)::int     AS ga,
            COALESCE(SUM(pgs.goalie_saves), 0)::int             AS sv,
            COALESCE(SUM(pgs.goalie_shots_against), 0)::int     AS sa,
            COUNT(*) FILTER (WHERE pgs.goalie_shutout)::int     AS sho,
            COALESCE(SUM(pgs.goalie_seconds), 0)::int           AS toi
          FROM "public"."player_game_statistics" pgs
          WHERE pgs.tournament_roster_id = b.tournament_roster_id
            AND pgs.stage_type = 'playoff'
        ) goalie_po ON b.position = 'goalie'
      )
      SELECT
        team_id, team_short_name,
        season_name, is_current,
        league_name, league_full_name, league_logo, league_city,
        division_name, division_short_name, division_logo,
        team_name, team_name AS team_full_name, team_logo, team_city,
        position, qual_name, qual_full_name, qual_description,
        is_fee_paid, hide_stats_unpaid,
        gp, g, a, pts, pm, pm_is_unofficial, pim, ga, sho, toi,
        sa, sv, shots_is_unofficial,
        -- Ведёт ли дивизион броски хотя бы на одной стадии (для своей команды считаются
        -- и неофициальные): по нему фронт решает, показать цифру или прочерк в БР/ОБ/%ОБ
        (COALESCE(reg_track_shots, false) OR COALESCE(playoff_track_shots, false) OR is_own_team) AS tracks_shots,
        CASE WHEN sa > 0 THEN ROUND(sv::numeric / sa * 100, 2) ELSE 0.00 END AS svp
      FROM agg
      WHERE gp > 0
      ORDER BY start_date DESC NULLS LAST
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
      pool.query(statsQuery, [playerId, req.user.id]),
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
