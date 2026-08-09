import pool from '../config/db.js';

/**
 * Пересчёт боксскора одного матча — player_game_statistics.
 *
 * Грань таблицы: одна строка = один игрок в одном матче. Всё сводное
 * (таблицы лидеров, профиль игрока, витрина THF) получается агрегацией
 * этой таблицы; отдельного кэша сумм в системе нет.
 *
 * Идемпотентность: строки матча сначала удаляются, потом вставляются заново.
 * Поэтому функцию можно звать сколько угодно раз — результат не поедет.
 * Если матч не подходит под условия (не finished, технический результат,
 * переоткрыт), остаётся только DELETE — старые строки убираются.
 *
 * Считается по тем же первичным данным, что и старый playerStatsCalculator.js:
 * game_rosters, game_events, game_plus_minus, game_goalie_log,
 * game_shots_by_goalie. Старая таблица player_statistics не затрагивается —
 * она продолжает жить параллельно, пока на проде не обновится код.
 *
 * Коэффициент надёжности (КН/GAA) здесь сознательно не считается.
 */

const DELETE_SQL = `DELETE FROM player_game_statistics WHERE game_id = $1`;

const INSERT_SQL = `
WITH ctx AS (
    -- Контекст матча. Ровно одна строка, если матч подлежит учёту, иначе ноль —
    -- и тогда весь запрос ничего не вставит.
    SELECT
        g.id                                AS game_id,
        g.game_type,
        COALESCE(g.stage_type, 'friendly')  AS stage_type,
        g.division_id,
        g.external_tournament_id,
        g.home_team_id,
        g.away_team_id,
        g.home_score,
        g.away_score,
        g.end_type,
        g.game_date,
        g.away_external_id,
        d.season_id,
        s.league_id,
        -- Снимки флагов лиги по стадии матча. Пишем их в строку, а не решаем
        -- на лету: маскирование зависит от того, кто смотрит, и это дело
        -- слоя отдачи, а не расчёта.
        CASE WHEN g.stage_type = 'playoff'
             THEN COALESCE(d.playoff_track_plus_minus, false)
             ELSE COALESCE(d.reg_track_plus_minus,     false) END AS pm_is_official,
        CASE WHEN g.stage_type = 'playoff'
             THEN COALESCE(d.playoff_track_shots, false)
             ELSE COALESCE(d.reg_track_shots,     false) END AS shots_is_official,
        -- Полная длительность матча в секундах — конец последнего вратарского
        -- интервала в journal-е замен.
        (
            COALESCE(gt.period_length, 20) * COALESCE(gt.periods_count, 3) * 60
            + CASE WHEN g.end_type IN ('ot', 'so')
                   THEN COALESCE(gt.ot_length, 5) * 60
                   ELSE 0 END
        ) AS total_seconds
    FROM games g
    LEFT JOIN game_timers gt ON gt.game_id = g.id
    LEFT JOIN divisions   d  ON d.id = g.division_id
    LEFT JOIN seasons     s  ON s.id = d.season_id
    WHERE g.id = $1
      AND g.status = 'finished'
      -- Матчи с техническим результатом в личную статистику не идут вовсе
      AND g.is_technical IS NULL
),

roster AS (
    -- Кто вписан в протокол. Основа строк таблицы: игрок без строки здесь
    -- боксскор не получает, даже если наследил в событиях.
    -- DISTINCT ON — страховка от дублей, если у команды в дивизионе окажется
    -- несколько турнирных карточек (UNIQUE на tournament_teams нет).
    SELECT DISTINCT ON (gr.player_id, gr.team_id)
        gr.player_id,
        gr.team_id,
        gr.position_in_line,
        -- COALESCE обязателен: position_in_line может быть пустым, и тогда
        -- сравнение даёт NULL, а колонка объявлена NOT NULL
        COALESCE(gr.position_in_line = 'G', false)        AS is_goalie,
        -- Капитанство берём из протокола матча, при пустом значении —
        -- из турнирной заявки (то же поведение, что и в gameController)
        COALESCE(gr.is_captain,   tr.is_captain,   false) AS is_captain,
        COALESCE(gr.is_assistant, tr.is_assistant, false) AS is_assistant,
        tr.id                                             AS tournament_roster_id,
        COALESCE(gr.team_id = c.home_team_id, false)      AS is_home
    FROM game_rosters gr
    CROSS JOIN ctx c
    LEFT JOIN tournament_teams   tt ON tt.team_id = gr.team_id AND tt.division_id = c.division_id
    LEFT JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id AND tr.player_id = gr.player_id
    WHERE gr.game_id      = c.game_id
      AND gr.is_in_lineup = true
      AND gr.player_id IS NOT NULL
      AND gr.team_id   IS NOT NULL
    ORDER BY gr.player_id, gr.team_id, tr.id NULLS LAST
),

-- ─── ПОБЕДНАЯ ШАЙБА ──────────────────────────────────────────────────────
-- Победной считается шайба победителя с номером «голы проигравшего + 1»
-- по хронологии — та, после которой отрыв уже не был отыгран. Это НЕ
-- последняя шайба матча.

goal_seq AS (
    SELECT
        ge.id,
        ge.team_id,
        ge.scorer_id,
        ge.time_seconds,
        ROW_NUMBER() OVER (PARTITION BY ge.team_id ORDER BY ge.time_seconds, ge.id) AS goal_no
    FROM game_events ge
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
      AND ge.event_type = 'goal'
),

gwg AS (
    -- В матчах, решённых серией буллитов, победной шайбы нет ни у кого:
    -- победителю в games.*_score дописана лишняя шайба за серию, и искать
    -- её среди реальных голов бессмысленно.
    SELECT gs.scorer_id AS player_id, gs.team_id, gs.time_seconds
    FROM goal_seq gs
    CROSS JOIN ctx c
    WHERE c.end_type IS DISTINCT FROM 'so'
      AND c.home_score <> c.away_score
      AND gs.team_id = CASE WHEN c.home_score > c.away_score
                            THEN c.home_team_id ELSE c.away_team_id END
      AND gs.goal_no = LEAST(c.home_score, c.away_score) + 1
),

-- ─── ПОЛЕВАЯ СТАТИСТИКА ──────────────────────────────────────────────────

goals AS (
    SELECT
        ge.scorer_id AS player_id,
        ge.team_id,
        COUNT(*) FILTER (WHERE ge.period = '1')                      AS g_p1,
        COUNT(*) FILTER (WHERE ge.period = '2')                      AS g_p2,
        COUNT(*) FILTER (WHERE ge.period = '3')                      AS g_p3,
        COUNT(*) FILTER (WHERE ge.period = 'OT')                     AS g_ot,
        COUNT(*) FILTER (WHERE ge.goal_strength IN ('pp1', 'pp2'))   AS g_pp,
        COUNT(*) FILTER (WHERE ge.goal_strength IN ('sh1', 'sh2'))   AS g_sh,
        COUNT(*) FILTER (WHERE ge.goal_strength = 'en')              AS g_en
    FROM game_events ge
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
      AND ge.event_type = 'goal'
      AND ge.scorer_id IS NOT NULL
    GROUP BY ge.scorer_id, ge.team_id
),

assists AS (
    -- Первая и вторая передача суммарно: раздельный учёт по решению
    -- пользователя не заводим.
    SELECT player_id, team_id, COUNT(*) AS a
    FROM (
        SELECT ge.assist1_id AS player_id, ge.team_id
        FROM game_events ge CROSS JOIN ctx c
        WHERE ge.game_id = c.game_id AND ge.event_type = 'goal' AND ge.assist1_id IS NOT NULL
        UNION ALL
        SELECT ge.assist2_id, ge.team_id
        FROM game_events ge CROSS JOIN ctx c
        WHERE ge.game_id = c.game_id AND ge.event_type = 'goal' AND ge.assist2_id IS NOT NULL
    ) sub
    GROUP BY player_id, team_id
),

plus_minus AS (
    -- Плюс, если игрок был на льду при голе своей команды, минус — при голе
    -- соперника. Раздельные счётчики, итог считает вычисляемая колонка.
    SELECT
        gpm.player_id,
        gpm.team_id,
        COUNT(*) FILTER (WHERE gpm.team_id =  ge.team_id) AS plus_cnt,
        COUNT(*) FILTER (WHERE gpm.team_id <> ge.team_id) AS minus_cnt
    FROM game_plus_minus gpm
    JOIN game_events ge ON ge.id = gpm.event_id
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
    GROUP BY gpm.player_id, gpm.team_id
),

penalties AS (
    SELECT
        ge.penalty_player_id AS player_id,
        ge.team_id,
        COALESCE(SUM(ge.penalty_minutes) FILTER (WHERE ge.period = '1'),  0) AS pim_p1,
        COALESCE(SUM(ge.penalty_minutes) FILTER (WHERE ge.period = '2'),  0) AS pim_p2,
        COALESCE(SUM(ge.penalty_minutes) FILTER (WHERE ge.period = '3'),  0) AS pim_p3,
        COALESCE(SUM(ge.penalty_minutes) FILTER (WHERE ge.period = 'OT'), 0) AS pim_ot,
        COUNT(*)                                                              AS pen_cnt,
        COUNT(*) FILTER (WHERE ge.penalty_class = 'minor')                    AS p_minor,
        COUNT(*) FILTER (WHERE ge.penalty_class = 'double_minor')             AS p_double,
        COUNT(*) FILTER (WHERE ge.penalty_class = 'major')                    AS p_major,
        COUNT(*) FILTER (WHERE ge.penalty_class = 'misconduct')               AS p_misc,
        COUNT(*) FILTER (WHERE ge.penalty_class = 'game_misconduct')          AS p_gm,
        COUNT(*) FILTER (WHERE ge.penalty_class = 'match')                    AS p_match
    FROM game_events ge
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
      AND ge.event_type = 'penalty'
      AND ge.penalty_player_id IS NOT NULL
    GROUP BY ge.penalty_player_id, ge.team_id
),

ga_on_penalty AS (
    -- Шайбы, пропущенные командой, пока игрок сидел на скамейке штрафников.
    -- Два условия: гол соперника в большинстве (goal_strength pp1/pp2) и
    -- попадание во временное окно штрафа.
    --
    -- Правая граница НЕСТРОГАЯ. Когда гол в большинстве досрочно прекращает
    -- малый штраф, Live Desk перезаписывает penalty_end_time ровно на время
    -- этого гола (GameLiveDesk.jsx). При строгом сравнении именно тот гол,
    -- ради которого показатель и заводится, в подсчёт бы не попал.
    --
    -- Учитываем только удаления, реально оставляющие команду в меньшинстве:
    -- 2, 2+2, 5 и матч-штраф. Дисциплинарные 10-минутные не в счёт — при них
    -- на лёд выходит замена, состав полный. Набор минут тот же, что зашит
    -- в calculatePenaltyTimelines на фронте.
    SELECT pen.penalty_player_id AS player_id, pen.team_id, COUNT(*) AS cnt
    FROM game_events pen
    CROSS JOIN ctx c
    JOIN game_events goal
      ON goal.game_id       = c.game_id
     AND goal.event_type    = 'goal'
     AND goal.team_id      <> pen.team_id
     AND goal.goal_strength IN ('pp1', 'pp2')
     AND goal.time_seconds >= pen.time_seconds
     AND goal.time_seconds <= pen.penalty_end_time
    WHERE pen.game_id          = c.game_id
      AND pen.event_type       = 'penalty'
      AND pen.penalty_player_id IS NOT NULL
      AND pen.penalty_end_time  IS NOT NULL
      AND pen.penalty_minutes  IN (2, 4, 5, 25)
    GROUP BY pen.penalty_player_id, pen.team_id
),

so_skater AS (
    -- Послематчевая серия как бьющий. В goals не идёт: по правилам это
    -- не заброшенная шайба игрока.
    SELECT
        ge.scorer_id AS player_id,
        ge.team_id,
        COUNT(*) FILTER (WHERE ge.event_type = 'shootout_goal') AS so_g,
        COUNT(*) FILTER (WHERE ge.event_type = 'shootout_miss') AS so_m
    FROM game_events ge
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
      AND ge.event_type IN ('shootout_goal', 'shootout_miss')
      AND ge.scorer_id IS NOT NULL
    GROUP BY ge.scorer_id, ge.team_id
),

-- ─── ВРАТАРСКАЯ СТАТИСТИКА ───────────────────────────────────────────────

goal_to_goalie AS (
    -- Для каждого гола ищем вратаря, стоявшего в воротах в этот момент:
    -- последняя запись журнала замен с time_seconds <= времени гола.
    -- game_events.time_seconds — сквозное время матча, та же шкала, что
    -- и у game_goalie_log.
    -- Голы с назначенного буллита по ходу матча (goal_strength = 'ps')
    -- на вратаря не записываются — правило унаследовано из старого расчёта.
    SELECT DISTINCT ON (ge.id)
        ge.id                        AS event_id,
        ge.period,
        COALESCE(ge.from_shot, true) AS from_shot,
        CASE WHEN ge.team_id = c.home_team_id THEN gl.away_goalie_id ELSE gl.home_goalie_id END AS goalie_id,
        CASE WHEN ge.team_id = c.home_team_id THEN c.away_team_id    ELSE c.home_team_id    END AS team_id
    FROM game_events ge
    CROSS JOIN ctx c
    JOIN game_goalie_log gl
      ON gl.game_id      = c.game_id
     AND gl.time_seconds <= ge.time_seconds
    WHERE ge.game_id = c.game_id
      AND ge.event_type = 'goal'
      AND ge.goal_strength IS DISTINCT FROM 'ps'
    ORDER BY ge.id, gl.time_seconds DESC
),

goalie_ga AS (
    SELECT
        gtg.goalie_id AS player_id,
        gtg.team_id,
        COUNT(*) FILTER (WHERE gtg.period = '1')                          AS ga_p1,
        COUNT(*) FILTER (WHERE gtg.period = '2')                          AS ga_p2,
        COUNT(*) FILTER (WHERE gtg.period = '3')                          AS ga_p3,
        COUNT(*) FILTER (WHERE gtg.period = 'OT')                         AS ga_ot,
        COUNT(*) FILTER (WHERE gtg.period = '1'  AND gtg.from_shot)       AS gas_p1,
        COUNT(*) FILTER (WHERE gtg.period = '2'  AND gtg.from_shot)       AS gas_p2,
        COUNT(*) FILTER (WHERE gtg.period = '3'  AND gtg.from_shot)       AS gas_p3,
        COUNT(*) FILTER (WHERE gtg.period = 'OT' AND gtg.from_shot)       AS gas_ot
    FROM goal_to_goalie gtg
    WHERE gtg.goalie_id IS NOT NULL
    GROUP BY gtg.goalie_id, gtg.team_id
),

goalie_shots AS (
    -- В game_shots_by_goalie.shots_count лежат ВСЕ броски в створ по вратарю
    -- за период, включая ставшие голами. Отражённые вычисляет сама таблица.
    -- gsb.team_id — команда вратаря, а не бросавшей стороны.
    SELECT
        gsb.goalie_id AS player_id,
        gsb.team_id,
        COALESCE(SUM(gsb.shots_count) FILTER (WHERE gsb.period = '1'),  0) AS s_p1,
        COALESCE(SUM(gsb.shots_count) FILTER (WHERE gsb.period = '2'),  0) AS s_p2,
        COALESCE(SUM(gsb.shots_count) FILTER (WHERE gsb.period = '3'),  0) AS s_p3,
        COALESCE(SUM(gsb.shots_count) FILTER (WHERE gsb.period = 'OT'), 0) AS s_ot
    FROM game_shots_by_goalie gsb
    CROSS JOIN ctx c
    WHERE gsb.game_id = c.game_id
      AND gsb.goalie_id IS NOT NULL
    GROUP BY gsb.goalie_id, gsb.team_id
),

goalie_intervals AS (
    -- Интервалы дежурства: конец текущей записи журнала = время следующей,
    -- для последней — полная длительность матча.
    SELECT
        gl.home_goalie_id,
        gl.away_goalie_id,
        c.home_team_id,
        c.away_team_id,
        gl.time_seconds AS interval_start,
        COALESCE(
            LEAD(gl.time_seconds) OVER (ORDER BY gl.time_seconds),
            c.total_seconds
        ) AS interval_end
    FROM game_goalie_log gl
    CROSS JOIN ctx c
    WHERE gl.game_id = c.game_id
),

goalie_minutes AS (
    SELECT home_goalie_id AS player_id, home_team_id AS team_id,
           SUM(GREATEST(interval_end - interval_start, 0)) AS secs
    FROM goalie_intervals WHERE home_goalie_id IS NOT NULL
    GROUP BY home_goalie_id, home_team_id
    UNION ALL
    SELECT away_goalie_id, away_team_id,
           SUM(GREATEST(interval_end - interval_start, 0))
    FROM goalie_intervals WHERE away_goalie_id IS NOT NULL
    GROUP BY away_goalie_id, away_team_id
),

goalie_minutes_agg AS (
    SELECT player_id, team_id, SUM(secs) AS secs
    FROM goalie_minutes GROUP BY player_id, team_id
),

goalie_start AS (
    -- Кто начинал матч в воротах
    SELECT gl.home_goalie_id AS home_starter, gl.away_goalie_id AS away_starter
    FROM game_goalie_log gl
    CROSS JOIN ctx c
    WHERE gl.game_id = c.game_id
    ORDER BY gl.time_seconds ASC
    LIMIT 1
),

goalie_count AS (
    -- Сколько разных вратарей отстояло за каждую сторону: сухарь даётся
    -- только тому, кто отыграл матч единственным.
    SELECT
        COUNT(DISTINCT gl.home_goalie_id) FILTER (WHERE gl.home_goalie_id IS NOT NULL) AS home_cnt,
        COUNT(DISTINCT gl.away_goalie_id) FILTER (WHERE gl.away_goalie_id IS NOT NULL) AS away_cnt
    FROM game_goalie_log gl
    CROSS JOIN ctx c
    WHERE gl.game_id = c.game_id
),

team_conceded AS (
    -- Фактически пропущенные шайбы по сторонам. Считаем по событиям, а не по
    -- games.*_score: победителю по буллитам в счёт дописана лишняя шайба
    -- за серию, и по нему сухарь определять нельзя.
    SELECT
        COUNT(*) FILTER (WHERE ge.team_id = c.away_team_id) AS home_conceded,
        COUNT(*) FILTER (WHERE ge.team_id = c.home_team_id) AS away_conceded
    FROM game_events ge
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
      AND ge.event_type = 'goal'
),

decision_moment AS (
    -- Момент, по которому определяется вратарь, получающий итог матча:
    -- время победной шайбы, а в матчах по буллитам — конец овертайма.
    SELECT COALESCE(
        (SELECT time_seconds FROM gwg LIMIT 1),
        (SELECT total_seconds FROM ctx)
    ) AS t
),

decision_goalies AS (
    SELECT gl.home_goalie_id, gl.away_goalie_id
    FROM game_goalie_log gl
    CROSS JOIN ctx c
    CROSS JOIN decision_moment dm
    WHERE gl.game_id = c.game_id
      AND gl.time_seconds <= dm.t
    ORDER BY gl.time_seconds DESC
    LIMIT 1
),

goalie_decision AS (
    SELECT dg.home_goalie_id AS player_id, c.home_team_id AS team_id,
           CASE WHEN c.home_score > c.away_score
                THEN CASE WHEN c.end_type IN ('ot', 'so') THEN 'ot_win'  ELSE 'win'  END
                ELSE CASE WHEN c.end_type IN ('ot', 'so') THEN 'ot_loss' ELSE 'loss' END
           END AS decision
    FROM decision_goalies dg CROSS JOIN ctx c
    WHERE dg.home_goalie_id IS NOT NULL AND c.home_score <> c.away_score
    UNION ALL
    SELECT dg.away_goalie_id, c.away_team_id,
           CASE WHEN c.away_score > c.home_score
                THEN CASE WHEN c.end_type IN ('ot', 'so') THEN 'ot_win'  ELSE 'win'  END
                ELSE CASE WHEN c.end_type IN ('ot', 'so') THEN 'ot_loss' ELSE 'loss' END
           END
    FROM decision_goalies dg CROSS JOIN ctx c
    WHERE dg.away_goalie_id IS NOT NULL AND c.home_score <> c.away_score
),

so_goalie AS (
    SELECT
        ge.against_goalie_id AS player_id,
        CASE WHEN ge.team_id = c.home_team_id THEN c.away_team_id ELSE c.home_team_id END AS team_id,
        COUNT(*)                                                AS so_against,
        COUNT(*) FILTER (WHERE ge.event_type = 'shootout_miss')  AS so_saves
    FROM game_events ge
    CROSS JOIN ctx c
    WHERE ge.game_id = c.game_id
      AND ge.event_type IN ('shootout_goal', 'shootout_miss')
      AND ge.against_goalie_id IS NOT NULL
    GROUP BY ge.against_goalie_id,
             CASE WHEN ge.team_id = c.home_team_id THEN c.away_team_id ELSE c.home_team_id END
),

incomplete AS (
    -- Протокол заведомо неполный: соперник внешний (у него нет заявки),
    -- вратарь где-то помечен как не указанный, либо журнала замен нет вовсе.
    SELECT (
        c.away_external_id IS NOT NULL
        OR EXISTS (
            SELECT 1 FROM game_goalie_log gl
            WHERE gl.game_id = c.game_id
              AND (gl.home_goalie_unspecified OR gl.away_goalie_unspecified)
        )
        OR NOT EXISTS (SELECT 1 FROM game_goalie_log gl WHERE gl.game_id = c.game_id)
    ) AS flag
    FROM ctx c
)

INSERT INTO player_game_statistics (
    game_id, player_id, team_id, tournament_roster_id,
    division_id, season_id, league_id, external_tournament_id,
    game_type, stage_type, game_date, is_home,
    position_in_line, is_goalie, is_captain, is_assistant, team_result,
    goals_p1, goals_p2, goals_p3, goals_ot,
    goals_pp, goals_sh, goals_en, goals_gw,
    assists,
    plus_count, minus_count, pm_is_official,
    pim_p1, pim_p2, pim_p3, pim_ot,
    penalties_count, penalties_minor, penalties_double_minor, penalties_major,
    penalties_misconduct, penalties_game_misconduct, penalties_match,
    goals_against_on_penalty,
    so_goals, so_misses,
    goalie_seconds, goalie_started, goalie_shutout, goalie_decision,
    goalie_shots_p1, goalie_shots_p2, goalie_shots_p3, goalie_shots_ot,
    goalie_ga_p1, goalie_ga_p2, goalie_ga_p3, goalie_ga_ot,
    goalie_ga_shot_p1, goalie_ga_shot_p2, goalie_ga_shot_p3, goalie_ga_shot_ot,
    goalie_so_against, goalie_so_saves, shots_is_official,
    data_incomplete, calculated_at
)
SELECT
    c.game_id,
    r.player_id,
    r.team_id,
    r.tournament_roster_id,
    c.division_id,
    c.season_id,
    c.league_id,
    c.external_tournament_id,
    c.game_type,
    c.stage_type,
    c.game_date,
    r.is_home,

    r.position_in_line,
    r.is_goalie,
    r.is_captain,
    r.is_assistant,
    CASE
        WHEN c.home_score = c.away_score THEN 'draw'
        WHEN (r.is_home AND c.home_score > c.away_score)
          OR (NOT r.is_home AND c.away_score > c.home_score)
            THEN CASE WHEN c.end_type IN ('ot', 'so') THEN 'ot_win'  ELSE 'win'  END
        ELSE     CASE WHEN c.end_type IN ('ot', 'so') THEN 'ot_loss' ELSE 'loss' END
    END AS team_result,

    COALESCE(g.g_p1, 0), COALESCE(g.g_p2, 0), COALESCE(g.g_p3, 0), COALESCE(g.g_ot, 0),
    COALESCE(g.g_pp, 0), COALESCE(g.g_sh, 0), COALESCE(g.g_en, 0),
    CASE WHEN w.player_id IS NOT NULL THEN 1 ELSE 0 END AS goals_gw,

    COALESCE(a.a, 0),

    COALESCE(pm.plus_cnt, 0), COALESCE(pm.minus_cnt, 0), c.pm_is_official,

    COALESCE(p.pim_p1, 0), COALESCE(p.pim_p2, 0), COALESCE(p.pim_p3, 0), COALESCE(p.pim_ot, 0),
    COALESCE(p.pen_cnt, 0), COALESCE(p.p_minor, 0), COALESCE(p.p_double, 0), COALESCE(p.p_major, 0),
    COALESCE(p.p_misc, 0), COALESCE(p.p_gm, 0), COALESCE(p.p_match, 0),
    COALESCE(gap.cnt, 0),

    COALESCE(sos.so_g, 0), COALESCE(sos.so_m, 0),

    COALESCE(gm.secs, 0),
    -- COALESCE обязателен: если стартовый вратарь стороны в журнале не указан
    -- (пустые ворота, сторона внешнего соперника) либо журнала нет вовсе,
    -- сравнение с NULL даёт NULL, а не false
    COALESCE(
        (r.player_id = gst.home_starter AND r.is_home)
            OR (r.player_id = gst.away_starter AND NOT r.is_home),
        false
    ) AS goalie_started,
    -- Сухарь: вратарь единственный отстоял матч за свою команду, не пропустил
    -- ни одной шайбы и команда не проиграла. Проигравший вратарь в матче
    -- 0:0, решённом буллитами, сухарь не получает.
    COALESCE(
        (
            r.is_goalie
            AND CASE WHEN r.is_home THEN gc.home_cnt ELSE gc.away_cnt END = 1
            AND CASE WHEN r.is_home THEN tc.home_conceded ELSE tc.away_conceded END = 0
            AND NOT (
                (r.is_home     AND c.home_score < c.away_score)
             OR (NOT r.is_home AND c.away_score < c.home_score)
            )
        ),
        false
    ) AS goalie_shutout,
    gd.decision,

    COALESCE(gs.s_p1, 0), COALESCE(gs.s_p2, 0), COALESCE(gs.s_p3, 0), COALESCE(gs.s_ot, 0),
    COALESCE(gga.ga_p1, 0), COALESCE(gga.ga_p2, 0), COALESCE(gga.ga_p3, 0), COALESCE(gga.ga_ot, 0),
    COALESCE(gga.gas_p1, 0), COALESCE(gga.gas_p2, 0), COALESCE(gga.gas_p3, 0), COALESCE(gga.gas_ot, 0),

    COALESCE(sog.so_against, 0), COALESCE(sog.so_saves, 0), c.shots_is_official,

    inc.flag,
    NOW()

FROM roster r
CROSS JOIN ctx c
CROSS JOIN incomplete inc
LEFT JOIN goalie_start gst ON true
LEFT JOIN goalie_count gc  ON true
LEFT JOIN team_conceded tc ON true

LEFT JOIN goals              g   ON g.player_id   = r.player_id AND g.team_id   = r.team_id
LEFT JOIN assists            a   ON a.player_id   = r.player_id AND a.team_id   = r.team_id
LEFT JOIN plus_minus         pm  ON pm.player_id  = r.player_id AND pm.team_id  = r.team_id
LEFT JOIN penalties          p   ON p.player_id   = r.player_id AND p.team_id   = r.team_id
LEFT JOIN ga_on_penalty      gap ON gap.player_id = r.player_id AND gap.team_id = r.team_id
LEFT JOIN so_skater          sos ON sos.player_id = r.player_id AND sos.team_id = r.team_id
LEFT JOIN gwg                w   ON w.player_id   = r.player_id AND w.team_id   = r.team_id
LEFT JOIN goalie_ga          gga ON gga.player_id = r.player_id AND gga.team_id = r.team_id
LEFT JOIN goalie_shots       gs  ON gs.player_id  = r.player_id AND gs.team_id  = r.team_id
LEFT JOIN goalie_minutes_agg gm  ON gm.player_id  = r.player_id AND gm.team_id  = r.team_id
LEFT JOIN goalie_decision    gd  ON gd.player_id  = r.player_id AND gd.team_id  = r.team_id
LEFT JOIN so_goalie          sog ON sog.player_id = r.player_id AND sog.team_id = r.team_id
`;

/**
 * Пересчитывает боксскор одного матча.
 *
 * @param {number} gameId
 * @param {object} [externalClient] — уже открытый клиент/транзакция вызывающего.
 *   Если передан, функция работает внутри его транзакции и своей не открывает.
 * @returns {Promise<number>} сколько строк записано
 */
export const recalculatePlayerGameStats = async (gameId, externalClient = null) => {
    const client = externalClient || await pool.connect();
    const ownsTransaction = !externalClient;

    try {
        if (ownsTransaction) await client.query('BEGIN');

        await client.query(DELETE_SQL, [gameId]);
        const res = await client.query(INSERT_SQL, [gameId]);

        if (ownsTransaction) await client.query('COMMIT');
        return res.rowCount;
    } catch (error) {
        if (ownsTransaction) await client.query('ROLLBACK');
        console.error(`Ошибка пересчёта боксскора матча ${gameId}:`, error);
        throw error;
    } finally {
        if (ownsTransaction) client.release();
    }
};

/**
 * Пересчитывает боксскор пачки матчей. Каждый матч — своя транзакция,
 * чтобы один сбойный протокол не откатывал остальные.
 *
 * @param {number[]} gameIds
 * @returns {Promise<{ ok: number, failed: number[], rows: number }>}
 */
export const recalculatePlayerGameStatsBulk = async (gameIds) => {
    const result = { ok: 0, failed: [], rows: 0 };
    if (!gameIds || gameIds.length === 0) return result;

    for (const gameId of gameIds) {
        try {
            result.rows += await recalculatePlayerGameStats(gameId);
            result.ok += 1;
        } catch {
            result.failed.push(gameId);
        }
    }
    return result;
};

/**
 * Пересчитывает боксскор всех завершённых матчей дивизиона.
 * Замена дивизионного пересчёта из playerStatsCalculator.js: там весь
 * дивизион переписывался после каждого матча, здесь это разовая операция
 * для восстановления данных.
 */
export const recalculateDivisionPlayerGameStats = async (divisionId) => {
    const { rows } = await pool.query(
        `SELECT id FROM games
         WHERE division_id = $1 AND status = 'finished' AND is_technical IS NULL
         ORDER BY game_date NULLS LAST, id`,
        [divisionId]
    );
    return recalculatePlayerGameStatsBulk(rows.map(r => r.id));
};
