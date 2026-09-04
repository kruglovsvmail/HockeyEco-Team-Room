import pool from '../config/db.js';
import { promoteExpiredMatchesToNoResult } from '../utils/matchStatus.js';

export const getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, eventId, eventType } = req.query;

    // =========================================================================
    // АВТОМАТИЧЕСКОЕ ОБСЛУЖИВАНИЕ FRIENDLY_PWA-МАТЧЕЙ (БЕЗ ВНЕШНИХ ПЛАНИРОВЩИКОВ)
    // =========================================================================
    // Шаг 1: матчи с истёкшим дедлайном подтверждения → cancelled
    await pool.query(`
      UPDATE "public"."games"
      SET "status" = 'cancelled',
          "updated_at" = NOW()
      WHERE "game_type" = 'friendly_pwa'
        AND "status" = 'pending'
        AND "confirm_deadline" < NOW()
    `);

    // Шаг 2: отменённые friendly_pwa-матчи, у которых уже прошло время матча,
    // удаляем физически из БД — карточка-«покойник» больше не нужна.
    await pool.query(`
      DELETE FROM "public"."games"
      WHERE "game_type" = 'friendly_pwa'
        AND "status" = 'cancelled'
        AND "game_date" < NOW()
    `);

    // Шаг 3: неофициальные матчи, у которых прошёл game_date, но результаты ещё
    // не вносились — переводим в finished_no_result (ленивая смена статуса).
    await promoteExpiredMatchesToNoResult();

    // Фильтры финальной выборки. Номера плейсхолдеров берутся из длины queryParams,
    // поэтому порядок push в queryParams и в eventFilters обязан совпадать.
    const queryParams = [userId];
    const eventFilters = [];

    if (startDate && endDate) {
      queryParams.push(startDate, endDate);
      eventFilters.push(`AND event_date BETWEEN $${queryParams.length - 1} AND $${queryParams.length}`);
    }

    // Точечный запрос одной карточки — открытие события по прямой ссылке /event/:eventType/:eventId.
    // eventType приходит в «маршрутном» виде (match/training/meeting), разворачиваем его
    // в реальные значения event_type из UNION ALL ниже.
    const ROUTE_EVENT_TYPES = {
      match:    ['match'],
      training: ['team_training', 'club_training'],
      meeting:  ['team_meeting', 'club_meeting'],
      // Дефис, а не подчёркивание: так тип читается в URL /event/community-training/12
      'community-training': ['community_training'],
      'community-game':     ['community_game'],
    };

    const numericEventId = Number(eventId);
    if (Number.isInteger(numericEventId)) {
      queryParams.push(numericEventId);
      eventFilters.push(`AND event_id = $${queryParams.length}`);
    }
    if (ROUTE_EVENT_TYPES[eventType]) {
      queryParams.push(ROUTE_EVENT_TYPES[eventType]);
      eventFilters.push(`AND event_type = ANY($${queryParams.length}::text[])`);
    }

    const query = `
      WITH user_context AS (
        SELECT 
          (SELECT count(*) FROM team_members WHERE user_id = $1 AND left_at IS NULL) as active_teams,
          (SELECT count(*) FROM (
             SELECT club_id FROM club_members WHERE user_id = $1 AND left_at IS NULL
             UNION
             SELECT id FROM clubs WHERE owner_id = $1
           ) AS uc) as active_clubs,
          (SELECT (subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()) FROM users WHERE id = $1) as has_subscription
      ),
      user_teams AS (
        SELECT team_id FROM team_members WHERE user_id = $1 AND left_at IS NULL
        UNION
        SELECT t.id FROM clubs c 
        JOIN club_members cm ON c.id = cm.club_id 
        JOIN teams t ON t.club_id = c.id 
        WHERE cm.user_id = $1 AND cm.left_at IS NULL
        UNION
        -- Владелец команды (teams.owner_id) видит события своей команды,
        -- даже если он не состоит в team_members и не привязан к клубу команды.
        SELECT t.id FROM teams t WHERE t.owner_id = $1
        UNION
        -- Владелец клуба видит события всех команд клуба, даже не будучи в его базе
        SELECT t.id FROM clubs c JOIN teams t ON t.club_id = c.id WHERE c.owner_id = $1
      ),
      user_clubs AS (
        SELECT club_id FROM club_members WHERE user_id = $1 AND left_at IS NULL
        UNION
        -- Владелец клуба видит его тренировки и собрания, даже не числясь в общей базе
        SELECT id FROM clubs WHERE owner_id = $1
      ),
      -- Сообщества, события которых человек должен видеть: вступивший участник,
      -- владелец и штаб. Штаб тащим отдельно, потому что роль в сообществе, в
      -- отличие от клубной, членства не требует — руководитель может не кататься.
      -- Здесь же несём его группу и настройку видимости: фильтр по группам ниже
      -- строится именно на них.
      user_communities AS (
        SELECT
          c.id AS community_id,
          c.category,
          c.calendar_scope,
          c.name,
          c.logo_url,
          c.color_1,
          (SELECT cm.group_id FROM community_members cm
            WHERE cm.community_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL) AS group_id,
          EXISTS (SELECT 1 FROM community_members cm
                  WHERE cm.community_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL) AS is_member,
          (c.owner_id = $1 OR EXISTS (
            SELECT 1 FROM community_roles cr
            WHERE cr.community_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL
          )) AS is_staff
        FROM communities c
        WHERE c.owner_id = $1
          OR EXISTS (SELECT 1 FROM community_members cm
                     WHERE cm.community_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL)
          OR EXISTS (SELECT 1 FROM community_roles cr
                     WHERE cr.community_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL)
      ),

      -- Роль пользователя в сообществе для карточки события
      user_community_roles AS (
        SELECT c.id AS community_id, 'community_owner'::varchar AS role
        FROM communities c WHERE c.owner_id = $1
        UNION
        SELECT cr.community_id, cr.role::varchar FROM community_roles cr
        WHERE cr.user_id = $1 AND cr.left_at IS NULL
      ),

      -- Клубные роли пользователя: нужны, чтобы карточка клубного события знала,
      -- кто её открыл. Раньше здесь всем жёстко проставлялся 'player', и руководитель
      -- клуба не видел на своём же событии ни отметок, ни редактирования.
      -- Имена ролей здесь клубные (club_owner / club_coach), как их ждёт permissions.js:
      -- в БД тренер клуба записан тем же 'coach', что и тренер команды.
      user_club_roles AS (
        SELECT c.id as club_id, 'club_owner'::varchar as role FROM clubs c WHERE c.owner_id = $1
        UNION
        SELECT cr.club_id, (CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END)::varchar FROM club_roles cr
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        WHERE cr.user_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
      ),
      user_team_roles AS (
        SELECT t.id as team_id, 'owner'::varchar as role FROM teams t WHERE t.owner_id = $1
        UNION
        SELECT tm.team_id, tr.role::varchar FROM team_roles tr 
        JOIN team_members tm ON tr.member_id = tm.id 
        WHERE tm.user_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL
        UNION
        SELECT t.id as team_id, (CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END)::varchar FROM club_roles cr
        JOIN teams t ON t.club_id = cr.club_id
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        WHERE cr.user_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
        UNION
        -- Владелец клуба стоит над владельцем команды и получает свою роль
        -- во всех командах клуба, членства в клубе для этого не требуется
        SELECT t.id as team_id, 'club_owner'::varchar as role FROM clubs c
        JOIN teams t ON t.club_id = c.id
        WHERE c.owner_id = $1
      ),

      -- ==========================================
      -- БЛОК 1: МАТЧИ (games) — ДОБАВЛЕНЫ ПОЛЯ ЛОКАЦИИ И ID АРЕНЫ
      -- ==========================================
      games_cte AS (
        SELECT 
          g.id::int AS event_id,
          'match'::varchar AS event_type,
          g.game_type::varchar AS game_type,
          g.initiator_team_id::int AS initiator_team_id,
          g.confirm_deadline::timestamptz AS confirm_deadline,
          g.game_date::timestamptz AS event_date,
          g.status::varchar AS status,
          COALESCE(a.name, g.location, 'Арена не назначена')::varchar AS arena_name,
          COALESCE(a.timezone, g.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          g.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          g.location::varchar AS location,
          g.location_url::varchar AS location_url,
          
          ut.team_id::int AS my_team_id,
          NULL::int AS my_club_id,
          g.home_team_id::int AS home_team_id,
          
          my_team.name::varchar AS my_team_name,
          my_team.logo_url::varchar AS my_team_logo_url,
          
          COALESCE(my_team.ui_color, my_team.color_home_1)::varchar AS team_color,
          
          (CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END)::int AS opponent_team_id,
          COALESCE(opp_team.name, ext_opp.name)::varchar AS opponent_name,
          COALESCE(opp_team.logo_url, ext_opp.logo_url)::varchar AS opponent_logo_url,
          
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_player_fee ELSE g.away_player_fee END)::numeric AS fixed_fee,
          g.home_score::int AS home_score,
          g.away_score::int AS away_score,
          
          (g.is_technical::text IN ('true', 't', '1', 'yes', 'y'))::boolean AS is_technical,
          g.end_type::varchar AS end_type,
          
          d.name::varchar AS division_name,
          d.short_name::varchar AS division_short_name,
          COALESCE(d.is_tournament, false)::boolean AS is_tournament,
          COALESCE(l.name, ext_tour.name)::varchar AS league_name,
          l.short_name::varchar AS league_short_name,
          l.logo_url::varchar AS league_logo_url,
          COALESCE(d.logo_url, ext_tour.logo_url)::varchar AS division_logo_url,
          s.name::varchar AS season_name,
          
          g.stage_type::varchar AS stage_type,
          g.stage_label::varchar AS stage_label,
          g.playoff_match_type::varchar AS playoff_match_type,
          g.series_number::int AS series_number,
          (
            SELECT pr.wins_needed
            FROM playoff_brackets pb
            JOIN playoff_rounds pr ON pb.id = pr.bracket_id
            WHERE pb.division_id = g.division_id AND pr.name = g.stage_label
            LIMIT 1
          )::int AS wins_needed,

          g.home_jersey_type::varchar AS home_jersey,
          g.away_jersey_type::varchar AS away_jersey,
          
          g.video_yt_url::varchar AS video_yt_url,
          g.video_vk_url::varchar AS video_vk_url,

          COALESCE(tt_my.custom_jersey_dark_url, my_team.jersey_dark_url, '/default/jersey_dark.webp')::varchar AS my_team_jersey_dark_url,
          COALESCE(tt_my.custom_jersey_light_url, my_team.jersey_light_url, '/default/jersey_light.webp')::varchar AS my_team_jersey_light_url,
          COALESCE(tt_opp.custom_jersey_dark_url, opp_team.jersey_dark_url, '/default/jersey_dark.webp')::varchar AS opponent_jersey_dark_url,
          COALESCE(tt_opp.custom_jersey_light_url, opp_team.jersey_light_url, '/default/jersey_light.webp')::varchar AS opponent_jersey_light_url,

          (CASE 
            WHEN (SELECT active_clubs FROM user_context) = 0 AND (SELECT active_teams FROM user_context) = 1 THEN false 
            ELSE true 
          END)::boolean AS show_team_context,

          (EXISTS (SELECT 1 FROM team_game_attendance tga WHERE tga.game_id = g.id AND tga.user_id = $1 AND tga.team_id = ut.team_id AND tga.withdrawn_at IS NULL))::boolean AS is_attending,
          
          (CASE 
            WHEN g.game_type = 'official' THEN
              CASE 
                WHEN NOT EXISTS (
                  SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = ut.team_id AND left_at IS NULL
                ) THEN 'not_in_team'
                
                WHEN json_array_length(user_active_disqualifications($1, s.league_id)) > 0
                  THEN 'disqualified'
                
                ELSE COALESCE(
                  (SELECT CASE 
                            WHEN tr.period_end IS NOT NULL THEN 'unregistered'
                            WHEN tr.application_status != 'approved' THEN 'not_approved'
                            WHEN NOT (SELECT has_subscription FROM user_context) THEN 'no_subscription'
                            ELSE 'allowed'
                          END
                   FROM tournament_rosters tr
                   JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                   WHERE tt.division_id = g.division_id AND tt.team_id = ut.team_id AND tr.player_id = $1 AND tr.period_end IS NULL
                   ORDER BY tr.period_end NULLS FIRST LIMIT 1),
                  'not_in_tournament'
                )
              END
            ELSE
              COALESCE(
                (SELECT CASE 
                          WHEN tr.left_at IS NOT NULL THEN 'unregistered' 
                          WHEN NOT (SELECT has_subscription FROM user_context) THEN 'no_subscription'
                          ELSE 'allowed' 
                        END
                 FROM team_rosters tr JOIN team_members tm ON tr.member_id = tm.id
                 WHERE tm.user_id = $1 AND tm.team_id = ut.team_id AND tm.left_at IS NULL ORDER BY tr.left_at NULLS FIRST LIMIT 1),
                'not_in_team'
              )
          END)::varchar AS toggle_status,
          COALESCE(
            (SELECT role FROM user_team_roles WHERE team_id = ut.team_id AND role IN ('owner', 'team_manager', 'team_admin') LIMIT 1),
            'player'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          -- Тип тренировки нужен панели редактирования события. У матчей и собраний
          -- его нет, но колонка обязана быть во всех ветвях UNION ALL — иначе склейка
          -- ниже (SELECT * FROM ..._cte) не сойдётся по числу колонок.
          NULL::varchar AS training_type,

          -- ── ГИБКАЯ СТОИМОСТЬ ─────────────────────────────────────────────
          -- Матч хранит обе команды в одной строке, поэтому каждый параметр
          -- берётся со своей стороны. Итоговый my_fee считается не здесь, а
          -- один раз после UNION ALL — иначе одну и ту же формулу пришлось бы
          -- держать в пяти ветках синхронно.
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_cost_mode ELSE g.away_cost_mode END)::varchar AS cost_mode,
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_total_cost ELSE g.away_total_cost END)::numeric AS total_cost,
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_goalies_free ELSE g.away_goalies_free END)::boolean AS goalies_free,
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_cost_min_participants ELSE g.away_cost_min_participants END)::int AS cost_min_participants,
          (CASE WHEN g.home_team_id = ut.team_id THEN g.home_attendance_deadline_hours ELSE g.away_attendance_deadline_hours END)::int AS attendance_deadline_hours,
          g.cost_locked_at::timestamptz AS cost_locked_at,

          -- Делитель: снявшиеся после дедлайна (withdrawn_at) остаются здесь —
          -- они продолжают платить, иначе позднее снятие дорожало бы остальным.
          (SELECT count(*) FROM team_game_attendance att
            WHERE att.game_id = g.id AND att.team_id = ut.team_id
              AND att.pay_role <> 'free'
              AND NOT ((CASE WHEN g.home_team_id = ut.team_id THEN g.home_goalies_free ELSE g.away_goalies_free END)
                       AND att.pay_role = 'goalie')
          )::int AS paying_count,

          -- Своя платёжная роль: у отметившегося — из его же отметки (снимок),
          -- у остальных выводится из заявки на турнир либо из базового состава.
          COALESCE(
            (SELECT att.pay_role FROM team_game_attendance att
             WHERE att.game_id = g.id AND att.user_id = $1 AND att.team_id = ut.team_id),
            (SELECT CASE WHEN tr.position = 'goalie' THEN 'goalie' ELSE 'skater' END
             FROM tournament_rosters tr
             JOIN tournament_teams tt2 ON tr.tournament_team_id = tt2.id
             WHERE tt2.division_id = g.division_id AND tt2.team_id = ut.team_id
               AND tr.player_id = $1 AND tr.period_end IS NULL LIMIT 1),
            (SELECT CASE WHEN tr.position = 'goalie' THEN 'goalie' ELSE 'skater' END
             FROM team_rosters tr JOIN team_members tmem ON tr.member_id = tmem.id
             WHERE tmem.user_id = $1 AND tmem.team_id = ut.team_id
               AND tmem.left_at IS NULL AND tr.left_at IS NULL LIMIT 1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM team_game_attendance att
           WHERE att.game_id = g.id AND att.user_id = $1 AND att.team_id = ut.team_id)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM team_game_attendance att
                   WHERE att.game_id = g.id AND att.user_id = $1 AND att.team_id = ut.team_id
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          -- У командных и клубных событий их нет, но набор колонок обязан
          -- совпадать во всех ветвях UNION ALL — см. комментарий у training_type.
          NULL::int AS my_community_id,
          NULL::varchar AS community_category,
          NULL::int AS max_skaters,
          NULL::int AS max_goalies,
          NULL::int AS main_skaters,
          NULL::int AS main_goalies,
          NULL::int AS reserve_count,
          NULL::varchar AS my_slot_status,
          NULL::timestamptz AS my_offer_expires_at,

          -- Публикация — только у событий сообществ, но колонки обязаны быть
          -- во всех ветвях UNION ALL (см. комментарий у training_type).
          NULL::timestamptz AS published_at,
          NULL::timestamptz AS scheduled_publish_at

        FROM user_teams ut
        JOIN games g ON (g.home_team_id = ut.team_id OR g.away_team_id = ut.team_id)
        LEFT JOIN arenas a ON g.arena_id = a.id
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN seasons s ON d.season_id = s.id
        LEFT JOIN leagues l ON s.league_id = l.id
        LEFT JOIN teams my_team ON my_team.id = ut.team_id
        LEFT JOIN teams opp_team ON opp_team.id = CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END
        LEFT JOIN external_opponents ext_opp ON g.away_external_id = ext_opp.id
        LEFT JOIN tournament_teams tt_my ON tt_my.division_id = g.division_id AND tt_my.team_id = ut.team_id
        LEFT JOIN tournament_teams tt_opp ON tt_opp.division_id = g.division_id AND tt_opp.team_id = CASE WHEN g.home_team_id = ut.team_id THEN g.away_team_id ELSE g.home_team_id END
        LEFT JOIN team_external_tournaments ext_tour ON g.external_tournament_id = ext_tour.id
        -- Cancelled-матчи friendly_pwa остаются в выдаче до прохода game_date
        -- (их рисуем как «Матч отменён»). Авто-удаление выше зачищает после game_date.
      ),

      -- ==========================================
      -- БЛОК 2: ТРЕНИРОВКИ КОМАНДЫ (team_training)
      -- ==========================================
      team_trainings_cte AS (
        SELECT 
          tt.id::int AS event_id,
          'team_training'::varchar AS event_type,
          NULL::varchar AS game_type,
          NULL::int AS initiator_team_id,
          NULL::timestamptz AS confirm_deadline,
          tt.training_date::timestamptz AS event_date,
          (CASE WHEN tt.training_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          COALESCE(a.name, tt.location, 'Локация не указана')::varchar AS arena_name,
          COALESCE(a.timezone, tt.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          tt.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          tt.location::varchar AS location,
          tt.location_url::varchar AS location_url,
          
          ut.team_id::int AS my_team_id,
          NULL::int AS my_club_id,
          NULL::int AS home_team_id,
          
          my_team.name::varchar AS my_team_name,
          my_team.logo_url::varchar AS my_team_logo_url,
          
          COALESCE(my_team.ui_color, my_team.color_home_1)::varchar AS team_color,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          tt.cost::numeric AS fixed_fee,
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          
          NULL::varchar AS division_name,
          NULL::varchar AS division_short_name,
          NULL::boolean AS is_tournament,
          NULL::varchar AS league_name,
          NULL::varchar AS league_short_name,
          NULL::varchar AS league_logo_url,
          NULL::varchar AS division_logo_url,
          NULL::varchar AS season_name,
          NULL::varchar AS stage_type,
          NULL::varchar AS stage_label,
          NULL::varchar AS playoff_match_type,
          NULL::int AS series_number,
          NULL::int AS wins_needed,

          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,

          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,

          COALESCE(my_team.jersey_dark_url, '/default/jersey_dark.webp')::varchar AS my_team_jersey_dark_url,
          COALESCE(my_team.jersey_light_url, '/default/jersey_light.webp')::varchar AS my_team_jersey_light_url,
          '/default/jersey_dark.webp'::varchar AS opponent_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS opponent_jersey_light_url,

          (CASE WHEN (SELECT active_clubs FROM user_context) = 0 AND (SELECT active_teams FROM user_context) = 1 THEN false ELSE true END)::boolean AS show_team_context,

          (EXISTS (SELECT 1 FROM team_training_attendance tta WHERE tta.team_training_id = tt.id AND tta.user_id = $1 AND tta.withdrawn_at IS NULL))::boolean AS is_attending,
          
          (COALESCE(
            (SELECT CASE 
                      WHEN tr.left_at IS NOT NULL THEN 'unregistered' 
                      WHEN NOT (SELECT has_subscription FROM user_context) THEN 'no_subscription'
                      ELSE 'allowed' 
                    END
             FROM team_rosters tr JOIN team_members tm ON tr.member_id = tm.id
             WHERE tm.user_id = $1 AND tm.team_id = ut.team_id AND tm.left_at IS NULL ORDER BY tr.left_at NULLS FIRST LIMIT 1),
            'not_in_team'
          ))::varchar AS toggle_status,
          COALESCE(
            (SELECT role FROM user_team_roles WHERE team_id = ut.team_id AND role IN ('owner', 'team_manager', 'team_admin') LIMIT 1),
            'player'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          -- Тип тренировки нужен панели редактирования события. У матчей и собраний
          -- его нет, но колонка обязана быть во всех ветвях UNION ALL — иначе склейка
          -- ниже (SELECT * FROM ..._cte) не сойдётся по числу колонок.
          tt.training_type::varchar AS training_type,

          -- ── ГИБКАЯ СТОИМОСТЬ (см. комментарий в блоке матчей) ────────────
          tt.cost_mode::varchar AS cost_mode,
          tt.total_cost::numeric AS total_cost,
          tt.goalies_free::boolean AS goalies_free,
          tt.cost_min_participants::int AS cost_min_participants,
          tt.attendance_deadline_hours::int AS attendance_deadline_hours,
          tt.cost_locked_at::timestamptz AS cost_locked_at,

          (SELECT count(*) FROM team_training_attendance att
            WHERE att.team_training_id = tt.id
              AND att.pay_role <> 'free'
              AND NOT (tt.goalies_free AND att.pay_role = 'goalie')
          )::int AS paying_count,

          COALESCE(
            (SELECT att.pay_role FROM team_training_attendance att
             WHERE att.team_training_id = tt.id AND att.user_id = $1),
            (SELECT CASE WHEN tr.position = 'goalie' THEN 'goalie' ELSE 'skater' END
             FROM team_rosters tr JOIN team_members tmem ON tr.member_id = tmem.id
             WHERE tmem.user_id = $1 AND tmem.team_id = ut.team_id
               AND tmem.left_at IS NULL AND tr.left_at IS NULL LIMIT 1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM team_training_attendance att
           WHERE att.team_training_id = tt.id AND att.user_id = $1)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM team_training_attendance att
                   WHERE att.team_training_id = tt.id AND att.user_id = $1
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          -- У командных и клубных событий их нет, но набор колонок обязан
          -- совпадать во всех ветвях UNION ALL — см. комментарий у training_type.
          NULL::int AS my_community_id,
          NULL::varchar AS community_category,
          NULL::int AS max_skaters,
          NULL::int AS max_goalies,
          NULL::int AS main_skaters,
          NULL::int AS main_goalies,
          NULL::int AS reserve_count,
          NULL::varchar AS my_slot_status,
          NULL::timestamptz AS my_offer_expires_at,

          -- Публикация — только у событий сообществ, но колонки обязаны быть
          -- во всех ветвях UNION ALL (см. комментарий у training_type).
          NULL::timestamptz AS published_at,
          NULL::timestamptz AS scheduled_publish_at

        FROM user_teams ut
        JOIN team_training tt ON tt.team_id = ut.team_id
        LEFT JOIN arenas a ON tt.arena_id = a.id
        LEFT JOIN teams my_team ON my_team.id = ut.team_id
      ),

      -- ==========================================
      -- БЛОК 3: СОБРАНИЯ КОМАНДЫ (team_meeting)
      -- ==========================================
      team_meetings_cte AS (
        SELECT 
          tm.id::int AS event_id,
          'team_meeting'::varchar AS event_type,
          NULL::varchar AS game_type,
          NULL::int AS initiator_team_id,
          NULL::timestamptz AS confirm_deadline,
          tm.meeting_date::timestamptz AS event_date,
          (CASE WHEN tm.meeting_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          COALESCE(a.name, tm.location, 'Локация не указана')::varchar AS arena_name,
          COALESCE(a.timezone, tm.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          tm.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          tm.location::varchar AS location,
          tm.location_url::varchar AS location_url,
          
          ut.team_id::int AS my_team_id,
          NULL::int AS my_club_id,
          NULL::int AS home_team_id,
          
          my_team.name::varchar AS my_team_name,
          my_team.logo_url::varchar AS my_team_logo_url,
          
          COALESCE(my_team.ui_color, my_team.color_home_1)::varchar AS team_color,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          tm.cost::numeric AS fixed_fee, 
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          
          NULL::varchar AS division_name,
          NULL::varchar AS division_short_name,
          NULL::boolean AS is_tournament,
          NULL::varchar AS league_name,
          NULL::varchar AS league_short_name,
          NULL::varchar AS league_logo_url,
          NULL::varchar AS division_logo_url,
          NULL::varchar AS season_name,
          NULL::varchar AS stage_type,
          NULL::varchar AS stage_label,
          NULL::varchar AS playoff_match_type,
          NULL::int AS series_number,
          NULL::int AS wins_needed,

          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,

          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,

          COALESCE(my_team.jersey_dark_url, '/default/jersey_dark.webp')::varchar AS my_team_jersey_dark_url,
          COALESCE(my_team.jersey_light_url, '/default/jersey_light.webp')::varchar AS my_team_jersey_light_url,
          '/default/jersey_dark.webp'::varchar AS opponent_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS opponent_jersey_light_url,

          (CASE WHEN (SELECT active_clubs FROM user_context) = 0 AND (SELECT active_teams FROM user_context) = 1 THEN false ELSE true END)::boolean AS show_team_context,
          (EXISTS (SELECT 1 FROM team_meeting_attendance tma WHERE tma.team_meeting_id = tm.id AND tma.user_id = $1 AND tma.withdrawn_at IS NULL))::boolean AS is_attending,
          (CASE
             -- На собрание ходит вся команда, а не только заявленные, поэтому ростер
             -- здесь не проверяем. Но членство в команде нужно: самоотметку сервер
             -- пропускает только по роли player, а она даётся за team_members.
             -- Собрания команд клуба видят все члены клуба — без этой проверки у них
             -- тумблер выглядел рабочим и молча откатывался.
             WHEN NOT EXISTS (
               SELECT 1 FROM team_members tmem
               WHERE tmem.team_id = ut.team_id AND tmem.user_id = $1 AND tmem.left_at IS NULL
             ) THEN 'not_team_member'
             WHEN NOT (SELECT has_subscription FROM user_context) THEN 'no_subscription'
             ELSE 'allowed'
           END)::varchar AS toggle_status,
          COALESCE(
            (SELECT role FROM user_team_roles WHERE team_id = ut.team_id AND role IN ('owner', 'team_manager', 'team_admin') LIMIT 1),
            'player'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          -- Тип тренировки нужен панели редактирования события. У матчей и собраний
          -- его нет, но колонка обязана быть во всех ветвях UNION ALL — иначе склейка
          -- ниже (SELECT * FROM ..._cte) не сойдётся по числу колонок.
          NULL::varchar AS training_type,

          -- ── ГИБКАЯ СТОИМОСТЬ (см. комментарий в блоке матчей) ────────────
          -- goalies_free у собраний в БД нет: список участников плоский,
          -- деления на вратарей и полевых здесь не существует. Колонка обязана
          -- быть во всех ветвях UNION ALL, поэтому отдаём константу.
          tm.cost_mode::varchar AS cost_mode,
          tm.total_cost::numeric AS total_cost,
          false::boolean AS goalies_free,
          tm.cost_min_participants::int AS cost_min_participants,
          tm.attendance_deadline_hours::int AS attendance_deadline_hours,
          tm.cost_locked_at::timestamptz AS cost_locked_at,

          (SELECT count(*) FROM team_meeting_attendance att
            WHERE att.team_meeting_id = tm.id AND att.pay_role <> 'free'
          )::int AS paying_count,

          COALESCE(
            (SELECT att.pay_role FROM team_meeting_attendance att
             WHERE att.team_meeting_id = tm.id AND att.user_id = $1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM team_meeting_attendance att
           WHERE att.team_meeting_id = tm.id AND att.user_id = $1)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM team_meeting_attendance att
                   WHERE att.team_meeting_id = tm.id AND att.user_id = $1
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          -- У командных и клубных событий их нет, но набор колонок обязан
          -- совпадать во всех ветвях UNION ALL — см. комментарий у training_type.
          NULL::int AS my_community_id,
          NULL::varchar AS community_category,
          NULL::int AS max_skaters,
          NULL::int AS max_goalies,
          NULL::int AS main_skaters,
          NULL::int AS main_goalies,
          NULL::int AS reserve_count,
          NULL::varchar AS my_slot_status,
          NULL::timestamptz AS my_offer_expires_at,

          -- Публикация — только у событий сообществ, но колонки обязаны быть
          -- во всех ветвях UNION ALL (см. комментарий у training_type).
          NULL::timestamptz AS published_at,
          NULL::timestamptz AS scheduled_publish_at

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
          NULL::varchar AS game_type,
          NULL::int AS initiator_team_id,
          NULL::timestamptz AS confirm_deadline,
          ct.training_date::timestamptz AS event_date,
          (CASE WHEN ct.training_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          COALESCE(a.name, ct.location, 'Локация не указана')::varchar AS arena_name,
          COALESCE(a.timezone, ct.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          ct.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          ct.location::varchar AS location,
          ct.location_url::varchar AS location_url,

          NULL::int AS my_team_id,
          uc.club_id::int AS my_club_id,
          NULL::int AS home_team_id,

          c.name::varchar AS my_team_name,
          c.logo_url::varchar AS my_team_logo_url,

          c.color_1::varchar AS team_color,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          ct.cost::numeric AS fixed_fee, 
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          
          NULL::varchar AS division_name,
          NULL::varchar AS division_short_name,
          NULL::boolean AS is_tournament,
          NULL::varchar AS league_name,
          NULL::varchar AS league_short_name,
          NULL::varchar AS league_logo_url,
          NULL::varchar AS division_logo_url,
          NULL::varchar AS season_name,
          NULL::varchar AS stage_type,
          NULL::varchar AS stage_label,
          NULL::varchar AS playoff_match_type,
          NULL::int AS series_number,
          NULL::int AS wins_needed,

          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,

          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,

          '/default/jersey_dark.webp'::varchar AS my_team_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS my_team_jersey_light_url,
          '/default/jersey_dark.webp'::varchar AS opponent_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS opponent_jersey_light_url,

          -- У клубного события своего «соперника» нет, но шапку с логотипом и названием
          -- клуба показываем всегда: человек должен видеть, чей это лёд.
          true::boolean AS show_team_context,
          (EXISTS (SELECT 1 FROM club_training_attendance cta WHERE cta.club_training_id = ct.id AND cta.user_id = $1 AND cta.withdrawn_at IS NULL))::boolean AS is_attending,
          (CASE
                       -- Отмечаться может только тот, кто состоит в общей базе клуба.
                       -- Владелец клуба им быть не обязан: тогда тумблер закрыт, а не падает с ошибкой.
                       WHEN NOT EXISTS (
                         SELECT 1 FROM club_members cmem
                         WHERE cmem.club_id = uc.club_id AND cmem.user_id = $1 AND cmem.left_at IS NULL
                       ) THEN 'not_in_club'
                       WHEN NOT (SELECT has_subscription FROM user_context) THEN 'no_subscription'
                       ELSE 'allowed'
                     END)::varchar AS toggle_status,
          COALESCE(
            (SELECT role FROM user_club_roles WHERE club_id = uc.club_id AND role IN ('club_owner', 'top_manager', 'club_admin', 'club_coach') LIMIT 1),
            'player'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          -- Тип тренировки нужен панели редактирования события. У матчей и собраний
          -- его нет, но колонка обязана быть во всех ветвях UNION ALL — иначе склейка
          -- ниже (SELECT * FROM ..._cte) не сойдётся по числу колонок.
          ct.training_type::varchar AS training_type,

          -- ── ГИБКАЯ СТОИМОСТЬ (см. комментарий в блоке матчей) ────────────
          -- Амплуа на клубной тренировке берём из любого активного ростера:
          -- игрок может числиться в нескольких командах клуба. LIMIT 1 здесь
          -- обязателен — без него дубли ростеров уронили бы подзапрос.
          ct.cost_mode::varchar AS cost_mode,
          ct.total_cost::numeric AS total_cost,
          ct.goalies_free::boolean AS goalies_free,
          ct.cost_min_participants::int AS cost_min_participants,
          ct.attendance_deadline_hours::int AS attendance_deadline_hours,
          ct.cost_locked_at::timestamptz AS cost_locked_at,

          (SELECT count(*) FROM club_training_attendance att
            WHERE att.club_training_id = ct.id
              AND att.pay_role <> 'free'
              AND NOT (ct.goalies_free AND att.pay_role = 'goalie')
          )::int AS paying_count,

          COALESCE(
            (SELECT att.pay_role FROM club_training_attendance att
             WHERE att.club_training_id = ct.id AND att.user_id = $1),
            (SELECT CASE WHEN tr.position = 'goalie' THEN 'goalie' ELSE 'skater' END
             FROM team_rosters tr JOIN team_members tmem ON tr.member_id = tmem.id
             WHERE tmem.user_id = $1 AND tmem.left_at IS NULL AND tr.left_at IS NULL LIMIT 1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM club_training_attendance att
           WHERE att.club_training_id = ct.id AND att.user_id = $1)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM club_training_attendance att
                   WHERE att.club_training_id = ct.id AND att.user_id = $1
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          -- У командных и клубных событий их нет, но набор колонок обязан
          -- совпадать во всех ветвях UNION ALL — см. комментарий у training_type.
          NULL::int AS my_community_id,
          NULL::varchar AS community_category,
          NULL::int AS max_skaters,
          NULL::int AS max_goalies,
          NULL::int AS main_skaters,
          NULL::int AS main_goalies,
          NULL::int AS reserve_count,
          NULL::varchar AS my_slot_status,
          NULL::timestamptz AS my_offer_expires_at,

          -- Публикация — только у событий сообществ, но колонки обязаны быть
          -- во всех ветвях UNION ALL (см. комментарий у training_type).
          NULL::timestamptz AS published_at,
          NULL::timestamptz AS scheduled_publish_at

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
          NULL::varchar AS game_type,
          NULL::int AS initiator_team_id,
          NULL::timestamptz AS confirm_deadline,
          cm.meeting_date::timestamptz AS event_date,
          (CASE WHEN cm.meeting_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          COALESCE(a.name, cm.location, 'Локация не указана')::varchar AS arena_name,
          COALESCE(a.timezone, cm.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          cm.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          cm.location::varchar AS location,
          cm.location_url::varchar AS location_url,

          NULL::int AS my_team_id,
          uc.club_id::int AS my_club_id,
          NULL::int AS home_team_id,

          c.name::varchar AS my_team_name,
          c.logo_url::varchar AS my_team_logo_url,

          c.color_1::varchar AS team_color,
          
          NULL::int AS opponent_team_id, 
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,
          
          cm.cost::numeric AS fixed_fee, 
          NULL::int AS home_score, 
          NULL::int AS away_score, 
          false::boolean AS is_technical, 
          NULL::varchar AS end_type,
          
          NULL::varchar AS division_name,
          NULL::varchar AS division_short_name,
          NULL::boolean AS is_tournament,
          NULL::varchar AS league_name,
          NULL::varchar AS league_short_name,
          NULL::varchar AS league_logo_url,
          NULL::varchar AS division_logo_url,
          NULL::varchar AS season_name,
          NULL::varchar AS stage_type,
          NULL::varchar AS stage_label,
          NULL::varchar AS playoff_match_type,
          NULL::int AS series_number,
          NULL::int AS wins_needed,

          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,

          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,

          '/default/jersey_dark.webp'::varchar AS my_team_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS my_team_jersey_light_url,
          '/default/jersey_dark.webp'::varchar AS opponent_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS opponent_jersey_light_url,

          true::boolean AS show_team_context,
          (EXISTS (SELECT 1 FROM club_meeting_attendance cma WHERE cma.club_meeting_id = cm.id AND cma.user_id = $1 AND cma.withdrawn_at IS NULL))::boolean AS is_attending,
          (CASE
                       -- Отмечаться может только тот, кто состоит в общей базе клуба.
                       -- Владелец клуба им быть не обязан: тогда тумблер закрыт, а не падает с ошибкой.
                       WHEN NOT EXISTS (
                         SELECT 1 FROM club_members cmem
                         WHERE cmem.club_id = uc.club_id AND cmem.user_id = $1 AND cmem.left_at IS NULL
                       ) THEN 'not_in_club'
                       WHEN NOT (SELECT has_subscription FROM user_context) THEN 'no_subscription'
                       ELSE 'allowed'
                     END)::varchar AS toggle_status,
          COALESCE(
            (SELECT role FROM user_club_roles WHERE club_id = uc.club_id AND role IN ('club_owner', 'top_manager', 'club_admin', 'club_coach') LIMIT 1),
            'player'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          -- Тип тренировки нужен панели редактирования события. У матчей и собраний
          -- его нет, но колонка обязана быть во всех ветвях UNION ALL — иначе склейка
          -- ниже (SELECT * FROM ..._cte) не сойдётся по числу колонок.
          NULL::varchar AS training_type,

          -- ── ГИБКАЯ СТОИМОСТЬ (см. комментарий в блоке матчей) ────────────
          cm.cost_mode::varchar AS cost_mode,
          cm.total_cost::numeric AS total_cost,
          false::boolean AS goalies_free,
          cm.cost_min_participants::int AS cost_min_participants,
          cm.attendance_deadline_hours::int AS attendance_deadline_hours,
          cm.cost_locked_at::timestamptz AS cost_locked_at,

          (SELECT count(*) FROM club_meeting_attendance att
            WHERE att.club_meeting_id = cm.id AND att.pay_role <> 'free'
          )::int AS paying_count,

          COALESCE(
            (SELECT att.pay_role FROM club_meeting_attendance att
             WHERE att.club_meeting_id = cm.id AND att.user_id = $1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM club_meeting_attendance att
           WHERE att.club_meeting_id = cm.id AND att.user_id = $1)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM club_meeting_attendance att
                   WHERE att.club_meeting_id = cm.id AND att.user_id = $1
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          -- У командных и клубных событий их нет, но набор колонок обязан
          -- совпадать во всех ветвях UNION ALL — см. комментарий у training_type.
          NULL::int AS my_community_id,
          NULL::varchar AS community_category,
          NULL::int AS max_skaters,
          NULL::int AS max_goalies,
          NULL::int AS main_skaters,
          NULL::int AS main_goalies,
          NULL::int AS reserve_count,
          NULL::varchar AS my_slot_status,
          NULL::timestamptz AS my_offer_expires_at,

          -- Публикация — только у событий сообществ, но колонки обязаны быть
          -- во всех ветвях UNION ALL (см. комментарий у training_type).
          NULL::timestamptz AS published_at,
          NULL::timestamptz AS scheduled_publish_at

        FROM user_clubs uc
        JOIN club_meeting cm ON cm.club_id = uc.club_id
        LEFT JOIN arenas a ON cm.arena_id = a.id
        LEFT JOIN clubs c ON c.id = uc.club_id
      ),

      -- ==========================================
      -- БЛОК 6: ТРЕНИРОВКИ (community_training)
      --
      -- Видимость режется по тренировочным группам: при пяти группах календарь
      -- участника иначе забивается чужим льдом. Настройка живёт в самом
      -- сообществе (calendar_scope), штаб видит всё расписание в любом случае.
      -- ==========================================
      community_trainings_cte AS (
        SELECT
          ct.id::int AS event_id,
          'community_training'::varchar AS event_type,
          NULL::varchar AS game_type,
          NULL::int AS initiator_team_id,
          NULL::timestamptz AS confirm_deadline,
          ct.training_date::timestamptz AS event_date,
          (CASE WHEN ct.training_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          COALESCE(a.name, ct.location, 'Локация не указана')::varchar AS arena_name,
          COALESCE(a.timezone, ct.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          ct.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          ct.location::varchar AS location,
          ct.location_url::varchar AS location_url,

          NULL::int AS my_team_id,
          NULL::int AS my_club_id,
          NULL::int AS home_team_id,

          uc.name::varchar AS my_team_name,
          uc.logo_url::varchar AS my_team_logo_url,
          uc.color_1::varchar AS team_color,

          NULL::int AS opponent_team_id,
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,

          ct.cost::numeric AS fixed_fee,
          NULL::int AS home_score,
          NULL::int AS away_score,
          false::boolean AS is_technical,
          NULL::varchar AS end_type,

          NULL::varchar AS division_name,
          NULL::varchar AS division_short_name,
          NULL::boolean AS is_tournament,
          NULL::varchar AS league_name,
          NULL::varchar AS league_short_name,
          NULL::varchar AS league_logo_url,
          NULL::varchar AS division_logo_url,
          NULL::varchar AS season_name,
          NULL::varchar AS stage_type,
          NULL::varchar AS stage_label,
          NULL::varchar AS playoff_match_type,
          NULL::int AS series_number,
          NULL::int AS wins_needed,

          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,

          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,

          '/default/jersey_dark.webp'::varchar AS my_team_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS my_team_jersey_light_url,
          '/default/jersey_dark.webp'::varchar AS opponent_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS opponent_jersey_light_url,

          -- Логотип и название сообщества показываем всегда: человек должен
          -- видеть, чей это лёд.
          true::boolean AS show_team_context,

          -- В резерве человек ещё не участник события: тумблер отражает основу,
          -- а очередь показывает my_slot_status ниже.
          (EXISTS (SELECT 1 FROM community_training_attendance att
                   WHERE att.community_training_id = ct.id AND att.user_id = $1
                     AND att.slot_status = 'main' AND att.withdrawn_at IS NULL))::boolean AS is_attending,

          -- Подписку не проверяем: вступление и отметка в сообществах бесплатны
          (CASE
            WHEN NOT uc.is_member THEN 'not_in_community'
            WHEN NOT (CASE
            WHEN uc.group_id IS NULL THEN ct.include_ungrouped
            ELSE (
              NOT EXISTS (SELECT 1 FROM community_training_groups tg WHERE tg.community_training_id = ct.id)
              OR EXISTS (SELECT 1 FROM community_training_groups tg
                         WHERE tg.community_training_id = ct.id AND tg.group_id = uc.group_id)
            )
          END) THEN 'not_in_group'
            ELSE 'allowed'
          END)::varchar AS toggle_status,

          COALESCE(
            (SELECT role FROM user_community_roles ucr WHERE ucr.community_id = uc.community_id LIMIT 1),
            'community_member'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          ct.training_type::varchar AS training_type,

          ct.cost_mode::varchar AS cost_mode,
          ct.total_cost::numeric AS total_cost,
          ct.goalies_free::boolean AS goalies_free,
          ct.cost_min_participants::int AS cost_min_participants,
          ct.attendance_deadline_hours::int AS attendance_deadline_hours,
          ct.cost_locked_at::timestamptz AS cost_locked_at,

          -- Делитель совпадает с тем, по которому потом фиксируется final_fee:
          -- резерв на лёд не выходил и не платит, а слившийся с подтверждённой
          -- заменой освобождён от оплаты (см. payerPredicate в communityReserve.js).
          (SELECT count(*) FROM community_training_attendance att
            WHERE att.community_training_id = ct.id
              AND att.pay_role <> 'free'
              AND NOT (ct.goalies_free AND att.pay_role = 'goalie')
              AND att.slot_status = 'main'
              AND att.replaced_by_user_id IS NULL
              AND att.replaced_by_attendance_id IS NULL
          )::int AS paying_count,

          COALESCE(
            (SELECT att.pay_role FROM community_training_attendance att
             WHERE att.community_training_id = ct.id AND att.user_id = $1),
            (SELECT CASE WHEN cmem.position = 'goalie' THEN 'goalie' ELSE 'skater' END
             FROM community_members cmem
             WHERE cmem.community_id = uc.community_id AND cmem.user_id = $1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM community_training_attendance att
           WHERE att.community_training_id = ct.id AND att.user_id = $1)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM community_training_attendance att
                   WHERE att.community_training_id = ct.id AND att.user_id = $1
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          uc.community_id::int AS my_community_id,
          uc.category::varchar AS community_category,
          ct.max_skaters::int AS max_skaters,
          ct.max_goalies::int AS max_goalies,

          -- Занятость дорожек. Амплуа берём из членства без оглядки на left_at —
          -- ровно так же, как laneExpr в communityReserve.js, иначе счётчик на
          -- карточке разошёлся бы с тем, что считает сама очередь.
          (SELECT count(*) FROM community_training_attendance att
            WHERE att.community_training_id = ct.id AND att.slot_status = 'main' AND att.withdrawn_at IS NULL
              AND COALESCE(att.guest_position,
                           (SELECT cmem.position FROM community_members cmem
                            WHERE cmem.community_id = uc.community_id
                              AND cmem.user_id = att.user_id), 'skater') <> 'goalie'
          )::int AS main_skaters,

          (SELECT count(*) FROM community_training_attendance att
            WHERE att.community_training_id = ct.id AND att.slot_status = 'main' AND att.withdrawn_at IS NULL
              AND COALESCE(att.guest_position,
                           (SELECT cmem.position FROM community_members cmem
                            WHERE cmem.community_id = uc.community_id
                              AND cmem.user_id = att.user_id), 'skater') = 'goalie'
          )::int AS main_goalies,

          (SELECT count(*) FROM community_training_attendance att
            WHERE att.community_training_id = ct.id AND att.slot_status IN ('reserve', 'offered')
          )::int AS reserve_count,

          (SELECT att.slot_status FROM community_training_attendance att
           WHERE att.community_training_id = ct.id AND att.user_id = $1)::varchar AS my_slot_status,

          (SELECT att.offer_expires_at FROM community_training_attendance att
           WHERE att.community_training_id = ct.id AND att.user_id = $1)::timestamptz AS my_offer_expires_at,

          -- Когда событие стало видно участникам. NULL значит «ещё не видно»:
          -- такую карточку в выдаче получает только штаб.
          ct.published_at::timestamptz AS published_at,

          -- Момент автоматической публикации — для обратного отсчёта на карточке.
          -- У ручного режима его нет: там ждут не срока, а решения человека.
          (CASE
            WHEN ct.publish_mode = 'before_event' AND ct.publish_hours_before IS NOT NULL
              THEN ct.training_date - (ct.publish_hours_before * INTERVAL '1 hour')
            ELSE NULL
          END)::timestamptz AS scheduled_publish_at

        FROM user_communities uc
        JOIN community_training ct ON ct.community_id = uc.community_id
        LEFT JOIN arenas a ON ct.arena_id = a.id
        -- Запланированное, но ещё не опубликованное событие видит только штаб:
        -- лёд забронирован, а запись пока закрыта.
        WHERE (ct.published_at IS NOT NULL OR uc.is_staff)
          AND (uc.is_staff
           OR uc.calendar_scope = 'all'
           OR (CASE
            WHEN uc.group_id IS NULL THEN ct.include_ungrouped
            ELSE (
              NOT EXISTS (SELECT 1 FROM community_training_groups tg WHERE tg.community_training_id = ct.id)
              OR EXISTS (SELECT 1 FROM community_training_groups tg
                         WHERE tg.community_training_id = ct.id AND tg.group_id = uc.group_id)
            )
          END))
      ),

      -- ==========================================
      -- БЛОК 7: СОЛЯНКИ (community_game)
      --
      -- Групп у солянок нет, поэтому фильтровать нечего: событие видит любой,
      -- кто состоит в сообществе, плюс его штаб.
      -- ==========================================
      community_games_cte AS (
        SELECT
          ct.id::int AS event_id,
          'community_game'::varchar AS event_type,
          NULL::varchar AS game_type,
          NULL::int AS initiator_team_id,
          NULL::timestamptz AS confirm_deadline,
          ct.game_date::timestamptz AS event_date,
          (CASE WHEN ct.game_date < NOW() THEN 'finished' ELSE 'scheduled' END)::varchar AS status,
          COALESCE(a.name, ct.location, 'Локация не указана')::varchar AS arena_name,
          COALESCE(a.timezone, ct.custom_timezone, 'Europe/Moscow')::varchar AS arena_timezone,
          ct.arena_id::int AS arena_id,
          a.city::varchar AS arena_city,
          a.address::varchar AS arena_address,
          ct.location::varchar AS location,
          ct.location_url::varchar AS location_url,

          NULL::int AS my_team_id,
          NULL::int AS my_club_id,
          NULL::int AS home_team_id,

          uc.name::varchar AS my_team_name,
          uc.logo_url::varchar AS my_team_logo_url,
          uc.color_1::varchar AS team_color,

          NULL::int AS opponent_team_id,
          NULL::varchar AS opponent_name,
          NULL::varchar AS opponent_logo_url,

          ct.cost::numeric AS fixed_fee,
          NULL::int AS home_score,
          NULL::int AS away_score,
          false::boolean AS is_technical,
          NULL::varchar AS end_type,

          NULL::varchar AS division_name,
          NULL::varchar AS division_short_name,
          NULL::boolean AS is_tournament,
          NULL::varchar AS league_name,
          NULL::varchar AS league_short_name,
          NULL::varchar AS league_logo_url,
          NULL::varchar AS division_logo_url,
          NULL::varchar AS season_name,
          NULL::varchar AS stage_type,
          NULL::varchar AS stage_label,
          NULL::varchar AS playoff_match_type,
          NULL::int AS series_number,
          NULL::int AS wins_needed,

          NULL::varchar AS home_jersey,
          NULL::varchar AS away_jersey,

          NULL::varchar AS video_yt_url,
          NULL::varchar AS video_vk_url,

          '/default/jersey_dark.webp'::varchar AS my_team_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS my_team_jersey_light_url,
          '/default/jersey_dark.webp'::varchar AS opponent_jersey_dark_url,
          '/default/jersey_light.webp'::varchar AS opponent_jersey_light_url,

          -- Логотип и название сообщества показываем всегда: человек должен
          -- видеть, чей это лёд.
          true::boolean AS show_team_context,

          -- В резерве человек ещё не участник события: тумблер отражает основу,
          -- а очередь показывает my_slot_status ниже.
          (EXISTS (SELECT 1 FROM community_game_attendance att
                   WHERE att.community_game_id = ct.id AND att.user_id = $1
                     AND att.slot_status = 'main' AND att.withdrawn_at IS NULL))::boolean AS is_attending,

          -- Подписку не проверяем: вступление и отметка в сообществах бесплатны
          (CASE
            WHEN NOT uc.is_member THEN 'not_in_community'
            ELSE 'allowed'
          END)::varchar AS toggle_status,

          COALESCE(
            (SELECT role FROM user_community_roles ucr WHERE ucr.community_id = uc.community_id LIMIT 1),
            'community_member'
          )::varchar AS user_role,
          (SELECT has_subscription FROM user_context)::boolean AS has_subscription,

          NULL::varchar AS training_type,

          ct.cost_mode::varchar AS cost_mode,
          ct.total_cost::numeric AS total_cost,
          ct.goalies_free::boolean AS goalies_free,
          ct.cost_min_participants::int AS cost_min_participants,
          ct.attendance_deadline_hours::int AS attendance_deadline_hours,
          ct.cost_locked_at::timestamptz AS cost_locked_at,

          -- Делитель совпадает с тем, по которому потом фиксируется final_fee:
          -- резерв на лёд не выходил и не платит, а слившийся с подтверждённой
          -- заменой освобождён от оплаты (см. payerPredicate в communityReserve.js).
          (SELECT count(*) FROM community_game_attendance att
            WHERE att.community_game_id = ct.id
              AND att.pay_role <> 'free'
              AND NOT (ct.goalies_free AND att.pay_role = 'goalie')
              AND att.slot_status = 'main'
              AND att.replaced_by_user_id IS NULL
              AND att.replaced_by_attendance_id IS NULL
          )::int AS paying_count,

          COALESCE(
            (SELECT att.pay_role FROM community_game_attendance att
             WHERE att.community_game_id = ct.id AND att.user_id = $1),
            (SELECT CASE WHEN cmem.position = 'goalie' THEN 'goalie' ELSE 'skater' END
             FROM community_members cmem
             WHERE cmem.community_id = uc.community_id AND cmem.user_id = $1),
            'skater'
          )::varchar AS my_pay_role,

          (SELECT att.final_fee FROM community_game_attendance att
           WHERE att.community_game_id = ct.id AND att.user_id = $1)::numeric AS my_final_fee,

          (EXISTS (SELECT 1 FROM community_game_attendance att
                   WHERE att.community_game_id = ct.id AND att.user_id = $1
                     AND att.withdrawn_at IS NOT NULL))::boolean AS withdrawn,

          -- ── Колонки событий сообществ ────────────────────────────────────
          uc.community_id::int AS my_community_id,
          uc.category::varchar AS community_category,
          ct.max_skaters::int AS max_skaters,
          ct.max_goalies::int AS max_goalies,

          -- Занятость дорожек. Амплуа берём из членства без оглядки на left_at —
          -- ровно так же, как laneExpr в communityReserve.js, иначе счётчик на
          -- карточке разошёлся бы с тем, что считает сама очередь.
          (SELECT count(*) FROM community_game_attendance att
            WHERE att.community_game_id = ct.id AND att.slot_status = 'main' AND att.withdrawn_at IS NULL
              AND COALESCE(att.guest_position,
                           (SELECT cmem.position FROM community_members cmem
                            WHERE cmem.community_id = uc.community_id
                              AND cmem.user_id = att.user_id), 'skater') <> 'goalie'
          )::int AS main_skaters,

          (SELECT count(*) FROM community_game_attendance att
            WHERE att.community_game_id = ct.id AND att.slot_status = 'main' AND att.withdrawn_at IS NULL
              AND COALESCE(att.guest_position,
                           (SELECT cmem.position FROM community_members cmem
                            WHERE cmem.community_id = uc.community_id
                              AND cmem.user_id = att.user_id), 'skater') = 'goalie'
          )::int AS main_goalies,

          (SELECT count(*) FROM community_game_attendance att
            WHERE att.community_game_id = ct.id AND att.slot_status IN ('reserve', 'offered')
          )::int AS reserve_count,

          (SELECT att.slot_status FROM community_game_attendance att
           WHERE att.community_game_id = ct.id AND att.user_id = $1)::varchar AS my_slot_status,

          (SELECT att.offer_expires_at FROM community_game_attendance att
           WHERE att.community_game_id = ct.id AND att.user_id = $1)::timestamptz AS my_offer_expires_at,

          -- См. комментарий в ветке тренировок сообщества
          ct.published_at::timestamptz AS published_at,
          (CASE
            WHEN ct.publish_mode = 'before_event' AND ct.publish_hours_before IS NOT NULL
              THEN ct.game_date - (ct.publish_hours_before * INTERVAL '1 hour')
            ELSE NULL
          END)::timestamptz AS scheduled_publish_at

        FROM user_communities uc
        JOIN community_game ct ON ct.community_id = uc.community_id
        LEFT JOIN arenas a ON ct.arena_id = a.id
        -- Запланированную, но ещё не опубликованную солянку видит только штаб
        WHERE ct.published_at IS NOT NULL OR uc.is_staff
      )

      -- ==========================================
      -- ФИНАЛЬНАЯ СКЛЕЙКА (UNION ALL)
      -- ==========================================
      -- Стоимость считается здесь, а не в каждой ветке: формула одна на все типы
      -- событий, а ветки отдают только сырые слагаемые.
      --
      -- Делитель — фактическое число плательщиков (paying_count), одинаковое для
      -- всех смотрящих. Неотметившемуся цену «как будет, если отмечусь» не
      -- показываем: он видит то же, что и остальные, — стоимость по факту отметок.
      SELECT
        ev.*,
        -- my_fee = NULL означает «сумму не показываем»: либо взнос не назначен,
        -- либо плательщиков меньше порога. Эти случаи разводит fee_status.
        (CASE
           WHEN ev.cost_mode <> 'split'                            THEN ev.fixed_fee
           WHEN ev.total_cost IS NULL                              THEN NULL
           WHEN ev.total_cost = 0                                  THEN 0
           WHEN ev.my_pay_role = 'free'                            THEN 0
           WHEN ev.my_pay_role = 'goalie' AND ev.goalies_free      THEN 0
           WHEN ev.my_final_fee IS NOT NULL                        THEN ev.my_final_fee
           WHEN ev.paying_count < GREATEST(ev.cost_min_participants, 1) THEN NULL
           -- Округление ВВЕРХ до рубля: недобор кассы хуже переплаты в рубль.
           -- Деления на ноль здесь быть не может — нулевой делитель уходит
           -- в ветку выше, порог всегда не меньше единицы.
           ELSE ceil(ev.total_cost / ev.paying_count)
         END)::numeric AS my_fee,

        -- Как подписывать сумму в интерфейсе:
        --   none    — взнос не назначен
        --   fixed   — фиксированная сумма, от состава не зависит
        --   split   — доля, будет меняться с числом отметившихся (рисуем «≈»)
        --   pending — сумма есть, но плательщиков меньше порога, цифру прячем
        --   locked  — событие прошло, доля зафиксирована и больше не изменится
        --   exempt  — этот участник не платит (вратарь при «вратари бесплатно»)
        (CASE
           WHEN ev.cost_mode <> 'split' THEN (CASE WHEN ev.fixed_fee IS NULL THEN 'none' ELSE 'fixed' END)
           WHEN ev.total_cost IS NULL                              THEN 'none'
           WHEN ev.total_cost = 0                                  THEN 'fixed'
           WHEN ev.my_pay_role = 'free'                            THEN 'exempt'
           WHEN ev.my_pay_role = 'goalie' AND ev.goalies_free      THEN 'exempt'
           WHEN ev.cost_locked_at IS NOT NULL                      THEN 'locked'
           WHEN ev.paying_count < GREATEST(ev.cost_min_participants, 1) THEN 'pending'
           ELSE 'split'
         END)::varchar AS fee_status
      FROM (
        SELECT * FROM games_cte
        UNION ALL
        SELECT * FROM team_trainings_cte
        UNION ALL
        SELECT * FROM team_meetings_cte
        UNION ALL
        SELECT * FROM club_trainings_cte
        UNION ALL
        SELECT * FROM club_meetings_cte
        UNION ALL
        SELECT * FROM community_trainings_cte
        UNION ALL
        SELECT * FROM community_games_cte
      ) AS ev
      WHERE 1=1 ${eventFilters.join('\n      ')}
      ORDER BY event_date ASC;
    `;

    const result = await pool.query(query, queryParams);
    res.json({ success: true, cards: result.rows });
  } catch (err) {
    console.error('Ошибка получения событий:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};