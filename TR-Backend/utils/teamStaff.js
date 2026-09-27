import pool from '../config/db.js';
import { PERMISSIONS } from './permissions.js';

/**
 * Кто в команде может выполнить действие по праву из permissions.js.
 *
 * Нужен уведомлениям, которые адресованы не всей команде, а тем, кто может по ним
 * что-то сделать: «подайте заявку», «проверьте состав», «подтвердите товарищеский».
 * Роли собираются из тех же мест, что и в checkPermissionInternal: владельцы
 * (team_owners), роли в команде (team_roles), роли в клубе команды (club_roles,
 * тренер клуба — club_coach) и владелец клуба.
 *
 * Подписку НЕ проверяем: руководитель без подписки всё равно должен узнать о
 * дедлайне — продлит подписку или попросит тренера подать заявку.
 *
 * Адресаты — только действующие участники команды: командные уведомления уходят
 * по team_members, и настройки уведомлений есть только у них.
 */

// Какое право нужно, чтобы по дедлайну из очереди можно было что-то сделать.
export const DEADLINE_PERMISSIONS = {
  roster_deadline: 'MATCH_ROSTER_SUBMIT',
  lines_deadline: 'MATCH_LINES_MANAGE',
  friendly_confirm_deadline: 'MATCH_CONFIRM_CANCEL',
};

// Роли, которым вообще приходят уведомления группы «Администрирование»:
// только им экран настроек показывает её переключатель.
export const ADMIN_GROUP_ROLES = [...new Set(
  Object.values(DEADLINE_PERMISSIONS).flatMap(key => PERMISSIONS[key].allowedRoles)
)];

/**
 * SQL-условие «у участника команды tm есть одна из ролей rolesParam».
 * rolesParam — плейсхолдер массива ролей, например '$2::text[]'.
 * Роли приводятся к text: в сравнении с массивом строк enum-колонка иначе не сработает.
 */
export const memberHasRoleSql = (rolesParam) => `(
  EXISTS (
    SELECT 1 FROM team_roles tr
     WHERE tr.member_id = tm.id AND tr.left_at IS NULL
       AND tr.role::text = ANY(${rolesParam})
  )
  OR ('owner' = ANY(${rolesParam}) AND EXISTS (
    SELECT 1 FROM team_owners tow
     WHERE tow.team_id = tm.team_id AND tow.user_id = tm.user_id
  ))
  OR EXISTS (
    SELECT 1 FROM teams t
      JOIN club_roles cr ON cr.club_id = t.club_id AND cr.user_id = tm.user_id AND cr.left_at IS NULL
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id AND cm.left_at IS NULL
     WHERE t.id = tm.team_id
       AND (CASE WHEN cr.role::text = 'coach' THEN 'club_coach' ELSE cr.role::text END) = ANY(${rolesParam})
  )
  OR ('club_owner' = ANY(${rolesParam}) AND EXISTS (
    SELECT 1 FROM teams t2
      JOIN clubs c ON c.id = t2.club_id
     WHERE t2.id = tm.team_id AND c.owner_id = tm.user_id
  ))
)`;

/**
 * Действующие участники команды, у которых по роли есть право permissionKey.
 * Возвращает Set с id в виде строк — чтобы сравнение не зависело от того,
 * пришёл id из базы числом или строкой.
 */
export async function getTeamMembersWithPermission(teamId, permissionKey, client = pool) {
  const permission = PERMISSIONS[permissionKey];
  if (!teamId || !permission) return new Set();

  const { rows } = await client.query(
    `SELECT tm.user_id
       FROM team_members tm
      WHERE tm.team_id = $1 AND tm.left_at IS NULL
        AND ${memberHasRoleSql('$2::text[]')}`,
    [teamId, permission.allowedRoles]
  );
  return new Set(rows.map(r => String(r.user_id)));
}
