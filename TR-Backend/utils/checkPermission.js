import pool from '../config/db.js';
import { PERMISSIONS } from './permissions.js';

/**
 * Вспомогательная функция безопасного извлечения ID контекстной команды из запроса
 */
export const getTeamIdFromRequest = (req) => {
  if (!req) return null;
  return Number(req.body?.teamId || req.query?.teamId || req.params?.teamId);
};

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

    // 3. Роли внутри клуба (активное членство и активная роль)
    const crRes = await client.query(`
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
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