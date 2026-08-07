import pool from '../config/db.js';
import { PERMISSIONS, ROLES } from './permissions.js';

/**
 * Вспомогательная функция безопасного извлечения ID контекстной команды из запроса
 */
export const getTeamIdFromRequest = (req) => {
  if (!req) return null;
  return Number(req.body?.teamId || req.query?.teamId || req.params?.teamId);
};

/**
 * То же самое для клубного контекста (клубные тренировки и собрания, страница клуба)
 */
export const getClubIdFromRequest = (req) => {
  if (!req) return null;
  return Number(req.body?.clubId || req.query?.clubId || req.params?.clubId);
};

/**
 * Событие приходит с типом: team_training / club_training / team_meeting / club_meeting.
 * Всё, что начинается с club_, живёт в клубном контексте и проверяется по клубу.
 */
export const isClubEventType = (eventType) => String(eventType || '').startsWith('club_');

/**
 * Сопоставление ролей пользователя с декларативным правилом из permissions.js.
 * Вынесено отдельно, потому что командная и клубная ветки отличаются только
 * способом сбора ролей, а логика подписки у них общая.
 */
const matchRolesToPermission = (userRoles, permission, hasSubscription) =>
  userRoles.some(role => {
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

/**
 * Перевод роли из club_roles в имя роли для матрицы прав.
 *
 * В БД тренер клуба записан как 'coach' — той же строкой, что и тренер команды.
 * Чтобы клубными правами можно было управлять в permissions.js отдельно от
 * командных, на входе в клубную проверку переименовываем его в 'club_coach'.
 * top_manager и club_admin уникальны сами по себе и остаются как есть.
 */
export const toClubRoleName = (dbRole) => (dbRole === 'coach' ? ROLES.CLUB_COACH : dbRole);

/**
 * Роли пользователя внутри клуба.
 *
 * Важно: клубная роль засчитывается только при активном членстве в клубе
 * (club_members.left_at IS NULL) — строка в club_roles сама по себе прав не даёт.
 * Владелец клуба (clubs.owner_id) получает роль club_owner, активный член клуба —
 * роль player (нужна для просмотра клубных событий и самоотметки).
 */
export async function getClubRoles(userId, clubId, client = pool) {
  const userRoles = [];
  if (!userId || !clubId) return userRoles;

  const ownerRes = await client.query('SELECT owner_id FROM clubs WHERE id = $1', [clubId]);
  if (ownerRes.rows.length > 0 && ownerRes.rows[0].owner_id === userId) {
    userRoles.push(ROLES.CLUB_OWNER);
  }

  const rolesRes = await client.query(`
    SELECT cr.role FROM club_roles cr
    JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
    WHERE cr.user_id = $1 AND cr.club_id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
  `, [userId, clubId]);
  userRoles.push(...rolesRes.rows.map(r => toClubRoleName(r.role)));

  const memberRes = await client.query(`
    SELECT id FROM club_members
    WHERE user_id = $1 AND club_id = $2 AND left_at IS NULL
  `, [userId, clubId]);
  if (memberRes.rows.length > 0) {
    userRoles.push(ROLES.PLAYER);
  }

  return userRoles;
}

/**
 * Внутренняя функция для проверки гранулярных прав доступа и подписки.
 * Единая реализация для всех контроллеров — избегает дублирования кода.
 *
 * @param {number} userId - ID пользователя
 * @param {number} teamId - ID команды контекста
 * @param {string} permissionKey - Ключ правила из permissions.js
 * @param {object} client - Клиент пула подключений (по умолчанию pool)
 * @returns {boolean} true если доступ разрешён
 */
export async function checkPermissionInternal(userId, teamId, permissionKey, client = pool) {
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
    // 1. Динамическая проверка на Владельца команды (owner_id)
    const teamOwnerRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
      userRoles.push('owner');
    }

    // 2. Роли внутри команды (активное членство и активная роль)
    const trRes = await client.query(`
      SELECT tr.role FROM team_roles tr
      JOIN team_members tm ON tr.member_id = tm.id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...trRes.rows.map(r => r.role));

    // 3. Роли из клуба, которому принадлежит команда.
    //    Роли штаба требуют активного членства в клубе, владелец клуба — нет:
    //    он стоит над владельцем команды и в её членах числиться не обязан.
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

    // 4. Проверка на статус активного игрока состава
    const memberRes = await client.query(`
      SELECT id FROM team_members
      WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
    `, [userId, teamId]);
    if (memberRes.rows.length > 0) {
      userRoles.push('player');
    }
  }

  return matchRolesToPermission(userRoles, permission, hasSubscription);
}

/**
 * Клубный аналог checkPermissionInternal: контекст — клуб, а не команда.
 * Используется клубными экранами и клубными событиями (club_training, club_meeting).
 *
 * @param {number} userId - ID пользователя
 * @param {number} clubId - ID клуба контекста
 * @param {string} permissionKey - Ключ правила из permissions.js
 * @param {object} client - Клиент пула подключений (по умолчанию pool)
 * @returns {boolean} true если доступ разрешён
 */
export async function checkClubPermissionInternal(userId, clubId, permissionKey, client = pool) {
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
  const userRoles = clubId ? await getClubRoles(userId, clubId, client) : [];

  return matchRolesToPermission(userRoles, permission, hasSubscription);
}
