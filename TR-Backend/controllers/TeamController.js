import pool from '../config/db.js';
import s3 from '../config/s3.js';
import path from 'path';
import { PERMISSIONS } from '../utils/permissions.js';
import { isTeamOwner } from '../utils/teamOwners.js';
import { processAvatar } from '../utils/imageProcessor.js';
import { sendPushToTeamExcept } from '../services/pushService.js';
import { syncClubMembershipOnTeamJoin, canOfferClubExclusion, removeFromClubOnly, CLUB_EXCLUSION_OFFER_PREDICATE } from '../utils/clubMembership.js';

/**
 * Внутренняя функция для проверки гранулярных прав доступа и подписки
 */
async function checkPermissionInternal(userId, teamId, permissionKey, client = pool) {
  if (!userId) return false;

  const userRes = await client.query(
    'SELECT global_role, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return false;
  const { global_role, subscription_expires_at } = userRes.rows[0];

  if (global_role === 'admin') return true;

  const permission = PERMISSIONS[permissionKey];
  if (!permission) return false;

  const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();
  let userRoles = [];

  if (teamId) {
    if (await isTeamOwner(client, teamId, userId)) {
      userRoles.push('owner');
    }

    const trRes = await client.query(`
      SELECT tr.role FROM team_roles tr 
      JOIN team_members tm ON tr.member_id = tm.id 
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...trRes.rows.map(r => r.role));

    const crRes = await client.query(`
      SELECT (CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END) AS role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
      UNION
      SELECT 'club_owner' AS role FROM clubs c
      JOIN teams t2 ON t2.club_id = c.id
      WHERE c.owner_id = $1 AND t2.id = $2
    `, [userId, teamId]);
    userRoles.push(...crRes.rows.map(r => r.role));

    const memberRes = await client.query(`
      SELECT id FROM team_members 
      WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
    `, [userId, teamId]);
    if (memberRes.rows.length > 0) {
      userRoles.push('player');
    }
  }

  return userRoles.some(role => {
    if (!permission.allowedRoles.includes(role)) return false;

    let roleRequiresSub = false;
    if (permission.requiresSubscription === true) {
      roleRequiresSub = true;
    } else if (Array.isArray(permission.requiresSubscription)) {
      roleRequiresSub = permission.requiresSubscription.includes(role);
    }

    if (roleRequiresSub && !hasSubscription) return false;
    return true;
  });
}

// Получение всех команд текущего пользователя
export const getMyTeams = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Базовый список команд пользователя
        const teamsQuery = `
            SELECT DISTINCT t.id, t.name, t.short_name, t.logo_url, t.city, t.description,
                            t.jersey_dark_url, t.jersey_light_url, t.team_photo_url, t.ui_color,
                            t.color_home_1, t.color_home_2,
                            t.color_away_1, t.color_away_2,
                            -- Владельцев у команды может быть двое, и оба равны в правах
                            (SELECT COALESCE(array_agg(tow.user_id ORDER BY tow.added_at, tow.id), '{}')
                               FROM team_owners tow WHERE tow.team_id = t.id) AS owner_ids
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.left_at IS NULL
            LEFT JOIN club_members cm ON cm.club_id = t.club_id AND cm.left_at IS NULL
            LEFT JOIN clubs c ON c.id = t.club_id
            WHERE (tm.user_id = $1 OR cm.user_id = $1 OR c.owner_id = $1
                   OR EXISTS (SELECT 1 FROM team_owners tow WHERE tow.team_id = t.id AND tow.user_id = $1))
            ORDER BY t.name
        `;
        const { rows: teams } = await pool.query(teamsQuery, [userId]);

        if (teams.length === 0) {
            return res.json({ teams: [] });
        }

        const teamIds = teams.map(t => t.id);

        // 2. Роли пользователя в командах (team_roles)
        const teamRolesRes = await pool.query(`
            SELECT tm.team_id, tr.role
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            WHERE tm.user_id = $1 AND tm.team_id = ANY($2) AND tr.left_at IS NULL AND tm.left_at IS NULL
        `, [userId, teamIds]);

        // 3. Роли пользователя через клуб (club_roles → команды клуба)
        const clubRolesRes = await pool.query(`
            SELECT t.id AS team_id, (CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END) AS role
            FROM club_roles cr
            JOIN teams t ON t.club_id = cr.club_id
            JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
            WHERE cr.user_id = $1 AND t.id = ANY($2) AND cr.left_at IS NULL AND cm.left_at IS NULL
            UNION
            SELECT t2.id AS team_id, 'club_owner' AS role FROM clubs c
            JOIN teams t2 ON t2.club_id = c.id
            WHERE c.owner_id = $1 AND t2.id = ANY($2)
        `, [userId, teamIds]);

        // 4. Статус подписки пользователя
        const subRes = await pool.query(
            'SELECT subscription_expires_at FROM users WHERE id = $1',
            [userId]
        );
        const subExpires = subRes.rows[0]?.subscription_expires_at;
        const hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;

        // 5. Склеиваем роли в карту по team_id
        const rolesByTeam = {};
        for (const { team_id, role } of teamRolesRes.rows) {
            if (!rolesByTeam[team_id]) rolesByTeam[team_id] = new Set();
            rolesByTeam[team_id].add(role);
        }
        for (const { team_id, role } of clubRolesRes.rows) {
            if (!rolesByTeam[team_id]) rolesByTeam[team_id] = new Set();
            rolesByTeam[team_id].add(role);
        }

        // 6. Собираем итоговый массив команд с ролями
        const enrichedTeams = teams.map(team => {
            const ownerIds = (team.owner_ids || []).map(Number);
            const isOwner = ownerIds.includes(Number(userId));
            const roles = Array.from(rolesByTeam[team.id] || []);
            if (isOwner) roles.unshift('owner');

            return {
                ...team,
                // Первый владелец отдельным полем — его читают клиенты со старым кэшем
                // профиля в localStorage, где массива owner_ids ещё нет.
                owner_id: ownerIds[0] ?? null,
                user_role: roles.join(','),       // строка для обратной совместимости с фолбеком
                user_roles: roles,                 // массив для accessMatrix
                has_subscription: hasSubscription,
                is_owner: isOwner,
            };
        });

        res.json({ teams: enrichedTeams });
    } catch (error) {
        console.error('[Get My Teams Error]:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Получение детализированных списков участников хоккейной команды
export const getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.id;
        
        // 1. Запрос полного списка членов команды: отдаём и действующих, и ушедших
        // (tm.left_at IS NOT NULL) — фронт делит их по left_at на «Общий состав»
        // и «Ушедшие из команды».
        const membersQuery = `
            SELECT
                tm.id as member_id, u.id as user_id,
                u.first_name, u.last_name, u.middle_name, u.birth_date, u.height, u.weight,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                tm.left_at,
                tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant,
                -- Предлагать ли при исключении убрать человека ещё и из базы клуба.
                -- Условие зеркалит canOfferClubExclusion (utils/clubMembership.js).
                (${CLUB_EXCLUSION_OFFER_PREDICATE.replaceAll('%USER%', 'u.id')}) AS offer_club_exclusion
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            JOIN teams t ON t.id = tm.team_id
            LEFT JOIN team_rosters tr ON tm.id = tr.member_id AND tr.left_at IS NULL
            WHERE tm.team_id = $1
            ORDER BY u.last_name, u.first_name
        `;

        // 2. Запрос активного игрового ростера на турниры
        const rosterQuery = `
            SELECT
                tm.id as member_id, u.id as user_id,
                u.first_name, u.last_name, u.middle_name, u.birth_date, u.height, u.weight,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
            FROM team_rosters tr
            JOIN team_members tm ON tm.id = tr.member_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
            ORDER BY tr.jersey_number
        `;
        
        // 3. Запрос административного и тренерского штаба
        const staffQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                string_agg(trole.role, ', ') as roles
            FROM team_roles trole
            JOIN team_members tm ON tm.id = trole.member_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
            GROUP BY tm.id, u.id, u.first_name, u.last_name, tm.photo_url, u.avatar_url, u.birth_date
            ORDER BY u.last_name, u.first_name
        `;
        
        const [membersRes, rosterRes, staffRes] = await Promise.all([
            pool.query(membersQuery, [teamId]),
            pool.query(rosterQuery, [teamId]),
            pool.query(staffQuery, [teamId])
        ]);
        
        res.json({ 
            members: membersRes.rows, 
            roster: rosterRes.rows, 
            staff: staffRes.rows 
        });
    } catch (error) {
        console.error('[Get Team Details Error]:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Получение анкеты участника команды с селективной защитой виртуального кода и выдачей карты прав
export const getTeamMemberDetails = async (req, res) => {
  const { teamId, userId } = req.params;
  const reqUserId = req.user?.id;

  try {
    if (!reqUserId) {
      return res.status(401).json({ error: 'Пользователь не идентифицирован' });
    }

    // Вычисляем динамические права на основе эталонной матрицы permissions.js
    const canEditRoles = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_ROLES');
    const canEditGameProfile = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_HOCKEY');
    const canEditHeader = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_BASE');
    const canViewVirtualCode = await checkPermissionInternal(reqUserId, teamId, 'VIEW_VIRTUAL_CODE');

    // Фильтра по tm.left_at здесь намеренно нет: карточка открывается и для ушедших
    // участников (блок «Ушедшие из команды»). Признак ухода отдаём полем left_at —
    // фронт по нему показывает карточку только для чтения.
    const query = `
      SELECT
        u.id as user_id, tm.id as member_id, u.first_name, u.last_name, u.middle_name,
        u.phone, u.birth_date, u.height, u.weight, u.grip, u.virtual_code,
        tm.photo_url as team_photo_url,
        COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
        tm.left_at,
        tr.id as roster_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant,
        (
          SELECT string_agg(trole.role, ', ')
          FROM team_roles trole
          WHERE trole.member_id = tm.id AND trole.left_at IS NULL
        ) as roles
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_rosters tr ON tm.id = tr.member_id AND tr.left_at IS NULL
      WHERE tm.team_id = $1 AND u.id = $2
    `;

    const { rows } = await pool.query(query, [teamId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Участник команды не найден' });
    }

    const memberData = rows[0];

    // Если у пользователя нет прав (или нет подписки) — скрываем виртуальный код
    if (!canViewVirtualCode) {
      delete memberData.virtual_code;
    }

    res.json({ 
      success: true, 
      member: memberData, 
      isManager: canViewVirtualCode,
      isOwnProfile: reqUserId === memberData.user_id,
      permissions: {
        canEditRoles,
        canEditGameProfile,
        canEditHeader
      }
    });
  } catch (error) {
    console.error('[Get Team Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Статистика игрока внутри конкретной команды (панель "Статистика в команде").
// Пока считаем посещаемость командных тренировок и матчей; в будущем сюда же
// добавятся другие блоки (собрания и т.п.).
//
// Тренировки и НЕофициальные матчи (friendly_pwa/friendly_ext/tournament_ext)
// считаем только за те периоды, когда игрок реально числился в игровом составе
// команды (team_rosters): закрытые периоды берём из истории team_roster_periods
// (её заполняет БД-триггер trg_team_rosters_close_period при каждом исключении
// игрока — из любого приложения, Team-Room или LMS), текущий незакрытый период —
// напрямую из team_rosters.left_at IS NULL.
//
// ОФИЦИАЛЬНЫЕ матчи (game_type = 'official', привязаны к дивизиону) считаем
// по другому критерию — не по team_rosters, а по факту одобренной заявки
// игрока на дивизион (tournament_rosters.application_status = 'approved',
// tournament_team_id -> tournament_teams.division_id), с учётом period_start/
// period_end заявки, если они заданы (частичная заявка на часть сезона).
//
// «Посетил» матч — НЕ отметка в team_game_attendance (это только опрос
// намерений до формирования состава), а факт попадания в итоговый протокол
// матча: наличие строки в game_rosters (game_id + player_id + team_id).
// Игрок мог отметиться на игру, но не попасть в состав — это не считается.
//
// Матчи отдаются фронту СЫРЫМ списком с "бирками" (лига/сезон/дивизион или
// внешний турнир) — посещаемость, победы/ничьи/поражения и фильтр по турниру
// считаются в браузере при переключении фильтра, без повторных запросов.
export const getMemberTeamStats = async (req, res) => {
  const { teamId, userId } = req.params;

  try {
    // position — игровое амплуа участника в ЭТОЙ команде (team_rosters.position).
    // Именно по нему панель решает, какой набор показателей рисовать: полевой или
    // вратарский. Берём активную строку ростера, а если участник уже отзаявлен —
    // последнюю по времени, иначе у ушедшего вратаря амплуа потерялось бы.
    const infoQuery = `
      SELECT
        u.first_name, u.last_name, u.middle_name,
        COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
        r.position
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN LATERAL (
        SELECT tr.position
        FROM team_rosters tr
        WHERE tr.member_id = tm.id AND tr.team_id = tm.team_id
        ORDER BY tr.left_at DESC NULLS FIRST
        LIMIT 1
      ) r ON true
      WHERE tm.team_id = $1 AND tm.user_id = $2
    `;

    // Тренировки отдаём СПИСКОМ с типом и отметкой посещения, а не готовой суммой:
    // в панели у них теперь свой фильтр по типу, и считается он в браузере — тем же
    // приёмом (variant Б), что и фильтр матчей ниже.
    //
    // Периоды и посещение подключены через EXISTS, а не JOIN: при JOIN участник с
    // несколькими периодами в ростере (ушёл и вернулся) продублировал бы тренировку
    // в списке. Раньше это гасил COUNT(DISTINCT ...), но со списком гасить нечем.
    const trainingQuery = `
      WITH member AS (
        SELECT id AS member_id FROM team_members WHERE team_id = $1 AND user_id = $2
      ),
      periods AS (
        SELECT trp.joined_at, trp.left_at::timestamp AS left_at
        FROM team_roster_periods trp, member
        WHERE trp.team_id = $1 AND trp.member_id = member.member_id
        UNION ALL
        SELECT tr.joined_at, NULL::timestamp AS left_at
        FROM team_rosters tr, member
        WHERE tr.team_id = $1 AND tr.member_id = member.member_id AND tr.left_at IS NULL
      )
      SELECT
        tt.id,
        tt.training_date,
        tt.training_type,
        EXISTS (
          -- withdrawn_at — снятие отметки после дедлайна. Такой участник платит
          -- за тренировку (остаётся в делителе стоимости), но посещением она
          -- ему не засчитывается: на льду его не было.
          SELECT 1 FROM team_training_attendance ta
          WHERE ta.team_training_id = tt.id AND ta.user_id = $2 AND ta.withdrawn_at IS NULL
        ) AS attended
      FROM team_training tt
      WHERE tt.team_id = $1
        AND tt.training_date < NOW()
        AND EXISTS (
          SELECT 1 FROM periods p
          WHERE tt.training_date >= p.joined_at AND (p.left_at IS NULL OR tt.training_date < p.left_at)
        )
      ORDER BY tt.training_date DESC
    `;

    // Единый список ВСЕХ доступных для подсчёта матчей (не только сыгранных)
    // с "бирками" лиги/сезона/дивизиона или внешнего турнира — отдаём его
    // фронту целиком (variant Б), а посещаемость/результаты/фильтр по турниру
    // считаются уже в браузере при переключении фильтра, без новых запросов.
    //
    // Официальные — через division_periods (одобренная заявка на дивизион),
    // неофициальные (friendly_pwa/friendly_ext/tournament_ext) — через
    // roster_periods (тот же критерий, что и у тренировок). "Посетил" (attended)
    // в обеих ветках — наличие строки в game_rosters, как договорились раньше.
    // Боксскор игрока в конкретном матче — строка player_game_statistics. Отдаём
    // СЫРЫЕ колонки по каждому матчу, а не готовую сумму: полная статистика в панели
    // считается по текущему фильтру матчей, и суммирует её фронт при переключении
    // фильтра — тем же приёмом (variant Б), что посещаемость и победы/поражения.
    //
    // Строки нет вовсе, если игрок не попал в протокол, матч технический или ещё не
    // пересчитан — тогда has_stats = false и матч в суммы не идёт.
    //
    // Фрагменты вынесены в константы: оба рукава UNION ALL обязаны иметь один и тот же
    // список колонок в одном порядке, а дублировать 18 строк дважды — верный способ
    // однажды разойтись.
    const pgsFields = `
        (pgs.game_id IS NOT NULL) AS has_stats,
        pgs.is_goalie,
        pgs.goals, pgs.assists, pgs.points,
        pgs.plus_count, pgs.minus_count, pgs.plus_minus,
        pgs.goals_gw, pgs.penalty_minutes, pgs.goals_against_on_penalty,
        pgs.so_goals, pgs.so_misses,
        pgs.goals_ps, pgs.ps_misses, pgs.ps_attempts,
        pgs.goalie_shots_against, pgs.goalie_saves, pgs.goalie_goals_against,
        pgs.goalie_shutout, pgs.goalie_so_against, pgs.goalie_so_saves,
        pgs.goalie_ps_against, pgs.goalie_ps_saves`;

    const pgsJoin = `
      LEFT JOIN player_game_statistics pgs ON pgs.game_id = g.id AND pgs.player_id = $2 AND pgs.team_id = $1`;

    const matchesQuery = `
      WITH member AS (
        SELECT id AS member_id FROM team_members WHERE team_id = $1 AND user_id = $2
      ),
      roster_periods AS (
        SELECT trp.joined_at, trp.left_at::timestamp AS left_at
        FROM team_roster_periods trp, member
        WHERE trp.team_id = $1 AND trp.member_id = member.member_id
        UNION ALL
        SELECT tr.joined_at, NULL::timestamp AS left_at
        FROM team_rosters tr, member
        WHERE tr.team_id = $1 AND tr.member_id = member.member_id AND tr.left_at IS NULL
      ),
      division_periods AS (
        SELECT tt.division_id, tro.period_start, tro.period_end
        FROM tournament_rosters tro
        JOIN tournament_teams tt ON tro.tournament_team_id = tt.id
        WHERE tt.team_id = $1 AND tro.player_id = $2 AND tro.application_status = 'approved'
      )
      SELECT
        g.id, g.game_date, g.game_type,
        CASE WHEN g.home_team_id = $1 THEN g.home_score ELSE g.away_score END AS my_score,
        CASE WHEN g.home_team_id = $1 THEN g.away_score ELSE g.home_score END AS opp_score,
        -- Соперник — по слепку его заявки на дивизион (snap_*), снятому LMS при допуске
        CASE WHEN g.home_team_id = $1
          THEN COALESCE(tt_away.snap_short_name, tt_away.snap_name, t_away.short_name, t_away.name, eo.short_name, eo.name, g.external_title)
          ELSE COALESCE(tt_home.snap_short_name, tt_home.snap_name, t_home.short_name, t_home.name)
        END AS opponent_name,
        (gr.id IS NOT NULL) AS attended,
        d.id AS division_id, d.name AS division_name, d.logo_url AS division_logo, s.name AS season_name, l.short_name AS league_name,
        NULL::int AS ext_tournament_id, NULL::text AS ext_tournament_name, NULL::text AS ext_tournament_logo,
${pgsFields}
      FROM games g
      JOIN division_periods dp ON dp.division_id = g.division_id
        AND (dp.period_start IS NULL OR g.game_date::date >= dp.period_start)
        AND (dp.period_end IS NULL OR g.game_date::date <= dp.period_end)
      LEFT JOIN game_rosters gr ON gr.game_id = g.id AND gr.player_id = $2 AND gr.team_id = $1${pgsJoin}
      LEFT JOIN divisions d ON g.division_id = d.id
      LEFT JOIN seasons s ON d.season_id = s.id
      LEFT JOIN leagues l ON s.league_id = l.id
      LEFT JOIN teams t_home ON g.home_team_id = t_home.id
      LEFT JOIN teams t_away ON g.away_team_id = t_away.id
      LEFT JOIN tournament_teams tt_home ON tt_home.division_id = g.division_id AND tt_home.team_id = g.home_team_id
      LEFT JOIN tournament_teams tt_away ON tt_away.division_id = g.division_id AND tt_away.team_id = g.away_team_id
      LEFT JOIN external_opponents eo ON g.away_external_id = eo.id
      WHERE g.status = 'finished' AND g.game_type = 'official' AND (g.home_team_id = $1 OR g.away_team_id = $1)

      UNION ALL

      SELECT
        g.id, g.game_date, g.game_type,
        CASE WHEN g.home_team_id = $1 THEN g.home_score ELSE g.away_score END AS my_score,
        CASE WHEN g.home_team_id = $1 THEN g.away_score ELSE g.home_score END AS opp_score,
        CASE WHEN g.home_team_id = $1
          THEN COALESCE(t_away.short_name, t_away.name, eo.short_name, eo.name, g.external_title)
          ELSE COALESCE(t_home.short_name, t_home.name)
        END AS opponent_name,
        (gr.id IS NOT NULL) AS attended,
        NULL::int AS division_id, NULL::text AS division_name, NULL::text AS division_logo, NULL::text AS season_name, NULL::text AS league_name,
        et.id AS ext_tournament_id, et.name AS ext_tournament_name, et.logo_url AS ext_tournament_logo,
${pgsFields}
      FROM games g
      JOIN roster_periods p ON g.game_date >= p.joined_at AND (p.left_at IS NULL OR g.game_date < p.left_at)
      LEFT JOIN game_rosters gr ON gr.game_id = g.id AND gr.player_id = $2 AND gr.team_id = $1${pgsJoin}
      LEFT JOIN team_external_tournaments et ON g.external_tournament_id = et.id
      LEFT JOIN teams t_home ON g.home_team_id = t_home.id
      LEFT JOIN teams t_away ON g.away_team_id = t_away.id
      LEFT JOIN external_opponents eo ON g.away_external_id = eo.id
      WHERE g.status = 'finished'
        AND g.game_type IN ('friendly_pwa', 'friendly_ext', 'tournament_ext')
        AND (g.home_team_id = $1 OR g.away_team_id = $1)

      ORDER BY game_date DESC
    `;

    const [infoRes, trainingRes, matchesRes] = await Promise.all([
      pool.query(infoQuery, [teamId, userId]),
      pool.query(trainingQuery, [teamId, userId]),
      pool.query(matchesQuery, [teamId, userId]),
    ]);

    if (infoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Участник команды не найден' });
    }

    const trainings = trainingRes.rows.map(row => ({
      trainingId: row.id,
      trainingDate: row.training_date,
      trainingType: row.training_type,
      attended: row.attended
    }));

    // Счётчики боксскора приходят из pg как строки (bigint/numeric) — приводим здесь,
    // чтобы фронт складывал числа, а не склеивал строки.
    const num = (v) => Number(v || 0);

    const matches = matchesRes.rows.map(row => ({
      gameId: row.id,
      gameDate: row.game_date,
      gameType: row.game_type,
      myScore: Number(row.my_score),
      oppScore: Number(row.opp_score),
      opponentName: row.opponent_name,
      attended: row.attended,
      // Личный боксскор игрока в этом матче; null — строки в player_game_statistics нет
      stats: row.has_stats ? {
        isGoalie: row.is_goalie,
        goals: num(row.goals),
        assists: num(row.assists),
        points: num(row.points),
        plusCount: num(row.plus_count),
        minusCount: num(row.minus_count),
        plusMinus: num(row.plus_minus),
        goalsGw: num(row.goals_gw),
        pim: num(row.penalty_minutes),
        gaOnPenalty: num(row.goals_against_on_penalty),
        soGoals: num(row.so_goals),
        soMisses: num(row.so_misses),
        // Штрафные броски по ходу матча. Реализованный — настоящая шайба, он уже
        // сидит в goals; здесь только разрез по буллитам.
        goalsPs: num(row.goals_ps),
        psMisses: num(row.ps_misses),
        psAttempts: num(row.ps_attempts),
        goalieShotsAgainst: num(row.goalie_shots_against),
        goalieSaves: num(row.goalie_saves),
        goalieGoalsAgainst: num(row.goalie_goals_against),
        goalieShutout: !!row.goalie_shutout,
        goalieSoAgainst: num(row.goalie_so_against),
        goalieSoSaves: num(row.goalie_so_saves),
        goaliePsAgainst: num(row.goalie_ps_against),
        goaliePsSaves: num(row.goalie_ps_saves)
      } : null,
      division: row.division_id != null
        ? { id: row.division_id, name: row.division_name, logo: row.division_logo, seasonName: row.season_name, leagueName: row.league_name }
        : null,
      externalTournament: row.ext_tournament_id != null
        ? { id: row.ext_tournament_id, name: row.ext_tournament_name, logo: row.ext_tournament_logo }
        : null
    }));

    res.json({
      success: true,
      info: infoRes.rows[0],
      trainings,
      matches
    });
  } catch (error) {
    console.error('[Get Member Team Stats Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Интерактивное автоматическое сохранение параметров участника команды руководителем / админом
export const updateMemberDetails = async (req, res) => {
  const { teamId, memberId } = req.params;
  const { position, jerseyNumber, roles, isCaptain, isAssistant } = req.body;
  const reqUserId = req.user?.id;

  try {
    await pool.query('BEGIN');

    // 1. ПРОВЕРКА ПРАВ ДЛЯ ИГРОВОГО ПРОФИЛЬНОГО БЛОКА
    if (position !== undefined || jerseyNumber !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_HOCKEY');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Недостаточно прав или требуется продлить подписку для изменения игрового профиля' });
      }

      if (jerseyNumber) {
        const numCheck = await pool.query(
          `SELECT 1 FROM team_rosters 
           WHERE team_id = $1 AND jersey_number = $2 AND member_id != $3 AND left_at IS NULL`,
          [teamId, jerseyNumber, memberId]
        );
        if (numCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Этот игровой номер уже занят другим активным игроком' });
        }
      }

      await pool.query(
        `UPDATE team_rosters 
         SET position = COALESCE($1, position), 
             jersey_number = COALESCE($2, jersey_number)
         WHERE member_id = $3 AND team_id = $4 AND left_at IS NULL`,
        [position, jerseyNumber, memberId, teamId]
      );
    }

    // 2. ПРОВЕРКА ПРАВ ДЛЯ БЛОКА ШАПКИ/КАПИТАНСТВА
    if (isCaptain !== undefined || isAssistant !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_BASE');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Недостаточно прав или требуется продлить подписку для изменения капитанских статусов' });
      }

      if (isCaptain !== undefined) {
        if (isCaptain === true) {
          await pool.query(
            `UPDATE team_rosters SET is_captain = false WHERE team_id = $1 AND left_at IS NULL`,
            [teamId]
          );
          await pool.query(
            `UPDATE team_rosters SET is_captain = true, is_assistant = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        } else {
          await pool.query(
            `UPDATE team_rosters SET is_captain = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        }
      }

      if (isAssistant !== undefined) {
        if (isAssistant === true) {
          const assistCheck = await pool.query(
            `SELECT COUNT(*) FROM team_rosters 
             WHERE team_id = $1 AND is_assistant = true AND member_id != $2 AND left_at IS NULL`,
            [teamId, memberId]
          );
          if (parseInt(assistCheck.rows[0].count) >= 2) {
            return res.status(400).json({ error: 'В ростере команды уже зафиксировано 2 ассистента' });
          }
          await pool.query(
            `UPDATE team_rosters SET is_assistant = true, is_captain = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        } else {
          await pool.query(
            `UPDATE team_rosters SET is_assistant = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        }
      }
    }

    // 3. ПРОВЕРКА ПРАВ ДЛЯ АДМИНИСТРАТИВНЫХ СТАТУСОВ (Управление ролями)
    if (roles !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_ROLES');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Недостаточно прав или требуется продлить подписку для изменения административного статуса' });
      }

      const memberUserRes = await pool.query(
        `SELECT user_id FROM team_members WHERE id = $1`,
        [memberId]
      );
      
      const rolesArray = roles.split(',').map(r => r.trim()).filter(Boolean);

      // Защита от саморазжалования руководителя
      if (memberUserRes.rows.length > 0 && memberUserRes.rows[0].user_id === reqUserId) {
        if (!rolesArray.includes('team_manager')) {
          return res.status(400).json({ error: 'Вы не можете лишить самого себя роли Руководителя команды' });
        }
      }

      if (rolesArray.length > 0) {
        await pool.query(
          `UPDATE team_roles 
           SET left_at = CURRENT_DATE 
           WHERE member_id = $1 AND left_at IS NULL AND NOT (role = ANY($2))`,
          [memberId, rolesArray]
        );
      } else {
        await pool.query(
          `UPDATE team_roles 
           SET left_at = CURRENT_DATE 
           WHERE member_id = $1 AND left_at IS NULL`,
          [memberId]
        );
      }

      for (const role of rolesArray) {
        await pool.query(
          `INSERT INTO team_roles (member_id, role, joined_at, left_at) 
           VALUES ($1, $2, NOW(), NULL)
           ON CONFLICT (member_id, role) 
           DO UPDATE SET left_at = NULL`,
          [memberId, role]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true, message: 'Изменения успешно сохранены' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('[Update Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Вспомогательный метод загрузки в S3-хранилище
const uploadBufferToS3 = async (file, bucketKey) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
    Key: bucketKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  if (s3 && typeof s3.send === 'function') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    return s3.send(new PutObjectCommand(params));
  }
  if (s3 && typeof s3.putObject === 'function') {
    const request = s3.putObject(params);
    return typeof request.promise === 'function' ? request.promise() : request;
  }
  throw new Error('S3 Client не настроен на сервере');
};

// Метод загрузки/замены кастомной аватарки игрока в S3
export const updateMemberPhoto = async (req, res) => {
  const { teamId, memberId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Файл фотографии не предоставлен' });
  }

  try {
    const memberRes = await pool.query(
      `SELECT user_id FROM team_members WHERE id = $1 AND team_id = $2 AND left_at IS NULL`,
      [memberId, teamId]
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ error: 'Участник состава не найден или заархивирован' });
    }
    const userId = memberRes.rows[0].user_id;

    // Ресайз до 400×400 + конвертация в WebP перед заливкой (всегда .webp)
    const bucketKey = `uploads/teams_${teamId}_users_${userId}_photo_${Date.now()}.webp`;

    const processedBuffer = await processAvatar(req.file.buffer);
    await uploadBufferToS3({ buffer: processedBuffer, mimetype: 'image/webp' }, bucketKey);
    const photoUrl = `/${bucketKey}`;

    await pool.query(
      `UPDATE team_members SET photo_url = $1 WHERE id = $2 AND team_id = $3`,
      [photoUrl, memberId, teamId]
    );

    // Допуск игрока при замене фото НЕ снимается — и не должен. В момент допуска
    // лига снимает слепок (tournament_rosters.photo_snapshot_url) и дальше везде видит
    // именно тот кадр, с которым допускала. Что команда делает с фото у себя после
    // этого — на заявку не влияет, снимать проверку не с чего.
    res.json({ success: true, photo_url: photoUrl });
  } catch (error) {
    console.error('[Update Member Photo Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Метод удаления кастомного фото участника
export const deleteMemberPhoto = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    await pool.query(
      `UPDATE team_members SET photo_url = NULL WHERE id = $1 AND team_id = $2 AND left_at IS NULL`,
      [memberId, teamId]
    );

    // Допуск не трогаем по той же причине, что и при замене фото (см. updateMemberPhoto):
    // у допущенного игрока лига смотрит на слепок, а не на живое фото команды.
    res.json({ success: true, message: 'Фотография успешно удалена' });
  } catch (error) {
    console.error('[Delete Member Photo Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Обновление визуального профиля хоккейной команды
export const updateTeamProfile = async (req, res) => {
  try {
    const teamId = req.params.id;
    const { 
      name, short_name, city, description, 
      ui_color, color_home_1, color_home_2, color_away_1, color_away_2,
      delete_logo, delete_jersey_dark, delete_jersey_light, delete_team_photo
    } = req.body;

    let logo_url = undefined;
    let jersey_dark_url = undefined;
    let jersey_light_url = undefined;
    let team_photo_url = undefined;

    if (req.files?.['logo']?.[0]) {
      const file = req.files['logo'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_logo_${Date.now()}${ext}`;
      await uploadBufferToS3(file, key);
      logo_url = `/${key}`;
    } else if (delete_logo === 'true') {
      logo_url = null;
    }

    if (req.files?.['jersey_dark']?.[0]) {
      const file = req.files['jersey_dark'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_dark_${Date.now()}${ext}`;
      await uploadBufferToS3(file, key);
      jersey_dark_url = `/${key}`;
    } else if (delete_jersey_dark === 'true') {
      jersey_dark_url = null;
    }

    if (req.files?.['jersey_light']?.[0]) {
      const file = req.files['jersey_light'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_light_${Date.now()}${ext}`;
      await uploadBufferToS3(file, key);
      jersey_light_url = `/${key}`;
    } else if (delete_jersey_light === 'true') {
      jersey_light_url = null;
    }

    // Общее фото команды — показывается на странице команды в лиге и на сайте
    if (req.files?.['team_photo']?.[0]) {
      const file = req.files['team_photo'][0];
      const ext = path.extname(file.originalname) || '.jpg';
      const key = `uploads/teams_${teamId}_team_photo_${Date.now()}${ext}`;
      await uploadBufferToS3(file, key);
      team_photo_url = `/${key}`;
    } else if (delete_team_photo === 'true') {
      team_photo_url = null;
    }

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    const pushField = (columnName, value) => {
      if (value !== undefined) {
        updateFields.push(`"${columnName}" = $${counter}`);
        queryValues.push(value);
        counter++;
      }
    };

    pushField('name', name);
    pushField('short_name', short_name);
    pushField('city', city);
    pushField('description', description);
    // Пустая строка из формы — это «цвет интерфейса не задан»: в базе такому
    // состоянию соответствует NULL, при котором команда берёт цвет домашней формы.
    pushField('ui_color', ui_color === '' ? null : ui_color);
    pushField('color_home_1', color_home_1);
    pushField('color_home_2', color_home_2);
    pushField('color_away_1', color_away_1);
    pushField('color_away_2', color_away_2);

    if (logo_url !== undefined) pushField('logo_url', logo_url);
    if (jersey_dark_url !== undefined) pushField('jersey_dark_url', jersey_dark_url);
    if (jersey_light_url !== undefined) pushField('jersey_light_url', jersey_light_url);
    if (team_photo_url !== undefined) pushField('team_photo_url', team_photo_url);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    queryValues.push(teamId);
    const sqlQuery = `
      UPDATE teams 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${counter} 
      RETURNING *
    `;

    const { rows } = await pool.query(sqlQuery, queryValues);
    res.json({ success: true, team: rows[0] });

  } catch (error) {
    console.error('[Update Team Profile Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Исключение участника из игрового ростера на турнир
export const excludeFromRoster = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    const updateRosterQuery = `
      UPDATE team_rosters 
      SET left_at = CURRENT_DATE 
      WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateRosterQuery, [memberId, teamId]);
    res.json({ success: true, message: 'Игрок успешно исключен из турнирного ростера' });
  } catch (error) {
    console.error('[Exclude From Roster Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Полное исключение из членства команды (состав + ростер)
export const excludeFromMembership = async (req, res) => {
  const { teamId, memberId } = req.params;
  const alsoRemoveFromClub = req.body?.alsoRemoveFromClub === true;
  let removedFromClub = false;

  try {
    // Пользователя запоминаем до закрытия членства: связь по member_id останется,
    // но так удобнее и для клубной части, и для текста push-уведомления.
    const { rows: memberRows } = await pool.query(
      'SELECT user_id FROM team_members WHERE id = $1 AND team_id = $2',
      [memberId, teamId]
    );
    const excludedUserId = memberRows[0]?.user_id || null;

    await pool.query('BEGIN');

    const updateMemberQuery = `
      UPDATE team_members 
      SET left_at = CURRENT_DATE 
      WHERE id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateMemberQuery, [memberId, teamId]);

    const updateRosterQuery = `
      UPDATE team_rosters
      SET left_at = CURRENT_DATE
      WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateRosterQuery, [memberId, teamId]);

    // Полномочия в команде закрываем вместе с членством — иначе при возвращении
    // человека в состав старая роль тренера или админа воскресла бы молча.
    await pool.query(
      `UPDATE team_roles SET left_at = CURRENT_DATE WHERE member_id = $1 AND left_at IS NULL`,
      [memberId]
    );

    // Галочка «убрать и из клуба» — только если команда была единственной ниточкой
    // человека к клубу. Условие перепроверяем здесь: клиент мог прислать флаг зря.
    if (alsoRemoveFromClub && excludedUserId) {
      const canOffer = await canOfferClubExclusion(teamId, excludedUserId);
      if (canOffer) {
        const { rows: clubRows } = await pool.query('SELECT club_id FROM teams WHERE id = $1', [teamId]);
        if (clubRows[0]?.club_id) {
          await removeFromClubOnly(clubRows[0].club_id, excludedUserId);
          removedFromClub = true;
        }
      }
    }

    await pool.query('COMMIT');

    // Push: участник покинул команду
    const { rows: [excluded] } = await pool.query(
      'SELECT u.last_name, u.first_name FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.id = $1',
      [memberId]
    );
    const eName = excluded ? `${excluded.last_name} ${excluded.first_name}` : 'Участник';
    sendPushToTeamExcept(teamId, null, 'team_news', {
      title: 'Уход из команды', body: `${eName} покинул команду`,
      url: '/my-team', tag: `member-leave-${memberId}`,
    }).catch(() => {});

    res.json({ success: true, removedFromClub, message: removedFromClub
      ? 'Пользователь удалён из состава команды и из базы клуба'
      : 'Пользователь полностью удален из состава и ростеров команды' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('[Exclude From Membership Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Поиск зарегистрированного пользователя по номеру телефона
export const searchUserByPhone = async (req, res) => {
  const { teamId } = req.params;
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'Параметр phone обязателен' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const last10Digits = cleanPhone.slice(-10);

    const query = `
      SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.virtual_code, u.status,
             (tm.id IS NOT NULL AND tm.left_at IS NULL) as is_already_in_team,
             (tm.id IS NOT NULL AND tm.left_at IS NOT NULL) as is_archived_in_team
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1
      WHERE right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [teamId, last10Digits]);

    if (rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь с таким номером не зарегистрирован' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('[Search User By Phone Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Добавление или восстановление членства пользователя в команде
export const addOrRestoreTeamMember = async (req, res) => {
  const { teamId } = req.params;
  const { userId } = req.body;

  try {
    const checkQuery = `SELECT id, left_at FROM team_members WHERE team_id = $1 AND user_id = $2`;
    const { rows } = await pool.query(checkQuery, [teamId, userId]);

    if (rows.length > 0) {
      const existing = rows[0];
      if (existing.left_at === null) {
        return res.status(400).json({ error: 'Пользователь уже находится в составе команды' });
      }

      await pool.query(
        `UPDATE team_members SET left_at = NULL, joined_at = CURRENT_DATE WHERE id = $1`, 
        [existing.id]
      );

      // Команда в клубе — человек обязан быть и в общей базе клуба
      await syncClubMembershipOnTeamJoin(teamId, userId);
      // Push: участник вернулся
      const { rows: [restored] } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
      const rName = restored ? `${restored.last_name} ${restored.first_name}` : 'Участник';
      sendPushToTeamExcept(teamId, userId, 'team_news', {
        title: 'Возвращение в команду', body: `${rName} вернулся в состав`,
        url: '/my-team', tag: `member-join-${userId}`,
      }).catch(() => {});

      return res.json({ success: true, message: 'Членство пользователя в команде успешно восстановлено' });
    }

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)`,
      [teamId, userId]
    );

    // Команда в клубе — человек обязан быть и в общей базе клуба
    await syncClubMembershipOnTeamJoin(teamId, userId);

    // Push: новый участник
    const { rows: [added] } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
    const aName = added ? `${added.last_name} ${added.first_name}` : 'Новый участник';
    sendPushToTeamExcept(teamId, userId, 'team_news', {
      title: 'Новый участник', body: `${aName} добавлен в состав`,
      url: '/my-team', tag: `member-join-${userId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'Пользователь успешно добавлен в состав команды' });
  } catch (error) {
    console.error('[Add/Restore Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Включение члена основного состава в турнирный игровой ростер
export const addTeamMemberToRoster = async (req, res) => {
  const { teamId } = req.params;
  const { memberId, position, jerseyNumber } = req.body;

  try {
    const numCheck = `
      SELECT tr.id FROM team_rosters tr
      WHERE tr.team_id = $1 AND tr.jersey_number = $2 AND tr.left_at IS NULL
    `;
    const { rows: numRows } = await pool.query(numCheck, [teamId, jerseyNumber]);
    if (numRows.length > 0) {
      return res.status(400).json({ error: 'Этот игровой номер уже занят активным игроком ростера' });
    }

    const teamRes = await pool.query(`SELECT club_id FROM teams WHERE id = $1`, [teamId]);
    const clubId = teamRes.rows[0]?.club_id || null;

    const rosterCheck = `SELECT id, left_at FROM team_rosters WHERE member_id = $1`;
    const { rows: rosterRows } = await pool.query(rosterCheck, [memberId]);

    if (rosterRows.length > 0) {
      const existingRoster = rosterRows[0];
      await pool.query(`
        UPDATE team_rosters 
        SET left_at = NULL, team_id = $1, club_id = $2, position = $3, jersey_number = $4, joined_at = NOW()
        WHERE id = $5
      `, [teamId, clubId, position, jerseyNumber, existingRoster.id]);
    } else {
      await pool.query(`
        INSERT INTO team_rosters (club_id, team_id, member_id, position, jersey_number, joined_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [clubId, teamId, memberId, position, jerseyNumber]);
    }

    res.json({ success: true, message: 'Игрок успешно добавлен в активный ростер' });
  } catch (error) {
    console.error('[Add Member To Roster Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
