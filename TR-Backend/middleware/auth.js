import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { ROLES, PERMISSIONS } from '../utils/permissions.js';
import {
  checkClubPermissionInternal,
  checkCommunityPermissionInternal,
  isClubEventType,
  isCommunityEventType,
  isCoachAnywhere,
} from '../utils/checkPermission.js';

// Троттлинг в памяти процесса: last_seen_at обновляется не чаще раза в LAST_SEEN_THROTTLE_MS
// на пользователя, чтобы не писать в БД на каждый авторизованный запрос подряд.
const lastSeenCache = new Map();
const LAST_SEEN_THROTTLE_MS = 2 * 60 * 1000;

const touchLastSeen = (userId) => {
  const now = Date.now();
  const prev = lastSeenCache.get(userId);
  if (prev && now - prev < LAST_SEEN_THROTTLE_MS) return;
  lastSeenCache.set(userId, now);
  pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]).catch(() => {});
};

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Отсутствует токен доступа' });
  }

  const secret = process.env.JWT_SECRET || 'hockeyeco_pwa_secret_key';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Недействительный или просроченный токен' });
    }
    req.user = decoded;
    // Fire-and-forget — не блокирует и не может провалить основной запрос
    touchLastSeen(decoded.id);
    next();
  });
};

const getTeamIdFromContext = async (req) => {
  if (req.params?.teamId) return req.params.teamId;
  if (req.body?.teamId) return req.body.teamId;
  if (req.query?.teamId) return req.query.teamId;

  const isTeamRoute = req.baseUrl?.includes('/api/teams') || req.originalUrl?.includes('/api/teams');
  if (req.params?.id && isTeamRoute) {
    return req.params.id;
  }

  if (req.params?.gameId || req.body?.gameId) {
    const gameId = req.params?.gameId || req.body?.gameId;
    const res = await pool.query(
      'SELECT home_team_id, away_team_id FROM games WHERE id = $1', 
      [gameId]
    );
    if (res.rows.length > 0) {
      return [res.rows[0].home_team_id, res.rows[0].away_team_id]; 
    }
  }

  // Таблицы events в схеме нет — календарь собирается UNION-ом на лету. Контекст команды
  // сюда обязаны передавать явно (teamId в params/body/query), иначе доступ не проверить.
  return null;
};

// Клубный контекст: клубные события и экраны клуба присылают clubId вместо teamId
const getClubIdFromContext = (req) => {
  if (req.params?.clubId) return req.params.clubId;
  if (req.body?.clubId) return req.body.clubId;
  if (req.query?.clubId) return req.query.clubId;

  const isClubRoute = req.baseUrl?.includes('/api/clubs') || req.originalUrl?.includes('/api/clubs');
  if (req.params?.id && isClubRoute) {
    return req.params.id;
  }

  return null;
};

// Контекст сообщества: страница сообщества, подкатки и солянки шлют communityId
const getCommunityIdFromContext = (req) => {
  if (req.params?.communityId) return req.params.communityId;
  if (req.body?.communityId) return req.body.communityId;
  if (req.query?.communityId) return req.query.communityId;

  const isCommunityRoute = req.baseUrl?.includes('/api/communities')
    || req.originalUrl?.includes('/api/communities');
  if (req.params?.id && isCommunityRoute) {
    return req.params.id;
  }

  return null;
};

export const requireTeamPermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Пользователь не идентифицирован' });
    }

    // Извлекаем глобальную роль и дату окончания подписки пользователя
    const userRes = await pool.query(
      'SELECT global_role, subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const { global_role, subscription_expires_at } = userRes.rows[0];

    // Глобальный суперадмин системы проходит всегда беспрепятственно
    if (global_role === ROLES.GLOBAL_ADMIN) {
      return next();
    }

    // Поддержка массива — пропускаем если ЛЮБОЕ из правил даёт доступ
    const permissionKeys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
    const permissions = permissionKeys
      .map(k => PERMISSIONS[k])
      .filter(Boolean);

    if (permissions.length === 0) {
      return res.status(403).json({ message: 'Доступ закрыт (Неизвестное правило прав)' });
    }

    let teamIds = await getTeamIdFromContext(req);
    if (!teamIds) {
      return res.status(400).json({ message: 'Невозможно определить контекст команды для проверки прав' });
    }
    if (!Array.isArray(teamIds)) teamIds = [teamIds];

    // Вычисляем статус личной подписки пользователя на текущий момент времени
    const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();

    let hasAccess = false;

    // Проверяем доступ изолированно по каждой команде из контекста запроса
    for (const tId of teamIds) {
      let userRoles = [];

      // 1. Динамическая проверка на Владельца команды (owner_id)
      const teamOwnerRes = await pool.query(
        'SELECT owner_id FROM teams WHERE id = $1',
        [tId]
      );
      if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
        userRoles.push(ROLES.OWNER);
      }

      // 2. Роли внутри команды (активное членство и активная роль)
      const trRes = await pool.query(`
        SELECT tr.role FROM team_roles tr 
        JOIN team_members tm ON tr.member_id = tm.id 
        WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
      `, [userId, tId]);
      userRoles.push(...trRes.rows.map(r => r.role));

      // 3. Роли внутри клуба (активное членство и активная роль)
      const crRes = await pool.query(`
        SELECT (CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END) AS role FROM club_roles cr
        JOIN teams t ON t.club_id = cr.club_id
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
        UNION
        SELECT 'club_owner' AS role FROM clubs c
        JOIN teams t2 ON t2.club_id = c.id
        WHERE c.owner_id = $1 AND t2.id = $2
      `, [userId, tId]);
      userRoles.push(...crRes.rows.map(r => r.role));

      // 4. Проверка на статус активного игрока состава
      const memberRes = await pool.query(`
        SELECT id FROM team_members 
        WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
      `, [userId, tId]);
      if (memberRes.rows.length > 0) {
        userRoles.push(ROLES.PLAYER);
      }

      // Атомарный анализ пересечения ролей для данной конкретной команды.
      // Доступ открыт, если ХОТЯ БЫ ОДНО из правил permissions[] подтверждает право пользователя.
      const teamHasAccess = userRoles.some(role =>
        permissions.some(permission => {
          if (!permission.allowedRoles.includes(role)) return false;

          let roleRequiresSub = false;
          if (permission.requiresSubscription === true) {
            roleRequiresSub = true;
          } else if (Array.isArray(permission.requiresSubscription)) {
            roleRequiresSub = permission.requiresSubscription.includes(role);
          }

          if (roleRequiresSub && !hasSubscription) {
            return false;
          }
          return true;
        })
      );

      if (teamHasAccess) {
        hasAccess = true;
        break; // Достаточно подтверждения прав хотя бы по одной из контекстных команд
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Недостаточно прав доступа или требуется продление подписки' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Team Error]:', err);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};

/**
 * Клубный аналог requireTeamPermission.
 * Контекст — клуб (clubId), роли берутся из club_roles + активного членства в club_members,
 * владелец клуба (clubs.owner_id) приравнивается к owner, любой активный член — к player.
 */
export const requireClubPermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Пользователь не идентифицирован' });
    }

    const permissionKeys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
    if (permissionKeys.some(k => !PERMISSIONS[k])) {
      return res.status(403).json({ message: 'Доступ закрыт (Неизвестное правило прав)' });
    }

    const clubId = getClubIdFromContext(req);
    if (!clubId) {
      return res.status(400).json({ message: 'Невозможно определить контекст клуба для проверки прав' });
    }

    // Доступ открыт, если ХОТЯ БЫ ОДНО из переданных правил подтверждает право пользователя
    const checks = await Promise.all(
      permissionKeys.map(key => checkClubPermissionInternal(userId, Number(clubId), key))
    );

    if (!checks.some(Boolean)) {
      return res.status(403).json({ message: 'Недостаточно прав доступа или требуется продление подписки' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Club Error]:', err);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};

/**
 * Аналог requireClubPermission для сообществ.
 * Контекст — сообщество (communityId), роли берутся из communities.owner_id и
 * community_roles; активное членство в community_members добавляет community_member.
 * В отличие от клуба, роль штаба здесь не требует членства.
 */
export const requireCommunityPermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Пользователь не идентифицирован' });
    }

    const permissionKeys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
    if (permissionKeys.some(k => !PERMISSIONS[k])) {
      return res.status(403).json({ message: 'Доступ закрыт (Неизвестное правило прав)' });
    }

    const communityId = getCommunityIdFromContext(req);
    if (!communityId) {
      return res.status(400).json({ message: 'Невозможно определить контекст сообщества для проверки прав' });
    }

    // Доступ открыт, если ХОТЯ БЫ ОДНО из переданных правил подтверждает право пользователя
    const checks = await Promise.all(
      permissionKeys.map(key => checkCommunityPermissionInternal(userId, Number(communityId), key))
    );

    if (!checks.some(Boolean)) {
      return res.status(403).json({ message: 'Недостаточно прав доступа' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Community Error]:', err);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};

/**
 * Внеконтекстная проверка для Тренерской: библиотека упражнений личная и не
 * принадлежит ни команде, ни клубу, поэтому ни teamId, ни clubId в запросе нет и
 * requireTeamPermission/requireClubPermission здесь неприменимы. Пропускаем всех,
 * у кого есть тренерская роль хотя бы в одном месте системы.
 */
export const requireCoach = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Пользователь не идентифицирован' });
    }

    if (!(await isCoachAnywhere(userId))) {
      return res.status(403).json({ message: 'Раздел доступен только тренерам' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Coach Error]:', err);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};

/**
 * Единый вход для маршрутов событий: одна и та же ручка обслуживает и командные,
 * и клубные тренировки/собрания. В клубную проверку уходим в двух случаях:
 *   1) тип события начинается с club_ (карточка существующего события);
 *   2) в запросе есть clubId и нет teamId (создание нового клубного события,
 *      где тип ещё «training» / «meeting» без приставки).
 *
 * Сообщества подключаются той же логикой третьим контекстом: тип события
 * community_training / community_game либо communityId без teamId и clubId.
 * Третий аргумент необязателен — маршруты, которых события сообществ не касаются,
 * менять не пришлось.
 *
 * @param {string|string[]} teamPermissionKey - правило для командного контекста
 * @param {string|string[]} clubPermissionKey - правило для клубного контекста
 * @param {string|string[]} [communityPermissionKey] - правило для контекста сообщества
 */
export const requireEventPermission = (teamPermissionKey, clubPermissionKey, communityPermissionKey) => (req, res, next) => {
  const eventType = req.body?.eventType || req.query?.eventType;
  const clubId = req.body?.clubId || req.query?.clubId || req.params?.clubId;
  const teamId = req.body?.teamId || req.query?.teamId || req.params?.teamId;
  const communityId = req.body?.communityId || req.query?.communityId || req.params?.communityId;

  if (communityPermissionKey && (isCommunityEventType(eventType) || (communityId && !teamId && !clubId))) {
    return requireCommunityPermission(communityPermissionKey)(req, res, next);
  }
  if (isClubEventType(eventType) || (clubId && !teamId)) {
    return requireClubPermission(clubPermissionKey)(req, res, next);
  }
  return requireTeamPermission(teamPermissionKey)(req, res, next);
};