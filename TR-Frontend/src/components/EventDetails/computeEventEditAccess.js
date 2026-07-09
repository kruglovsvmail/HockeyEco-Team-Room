import { PERMISSIONS } from '../../utils/permissions';

// Вычисляет доступы к редактированию полей события (расписание/финансы/медиа/удаление)
// для текущего пользователя в контексте команды события.
export function computeEventEditAccess(event, user, selectedTeam, checkAccess) {
  if (!event) return { canSee: false, blocks: {} };

  // ВАЖНО: роли пользователя считаем только в контексте КОМАНДЫ СОБЫТИЯ.
  // Если selectedTeam — это другая команда (например, владельца),
  // его роли НЕЛЬЗЯ переносить на команду события, где он, возможно, простой игрок.
  const userRoles = (() => {
    const roles = [];
    const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
    if (globalRole === 'admin') roles.push('admin');

    // 1. Роли из selectedTeam — только если это та же команда, что и команда события
    if (selectedTeam && String(selectedTeam.id) === String(event.my_team_id)) {
      if (selectedTeam.is_owner) roles.push('owner');
      if (selectedTeam.user_role) {
        selectedTeam.user_role.split(',').map(r => r.trim().toLowerCase()).forEach(r => roles.push(r));
      }
    }

    // 2. Роли из user.teams[] — ищем нужную команду по id
    const teamFromUser = user?.teams?.find(t => String(t.id) === String(event.my_team_id));
    if (teamFromUser) {
      if (teamFromUser.is_owner) roles.push('owner');
      if (teamFromUser.user_role) {
        teamFromUser.user_role.split(',').map(r => r.trim().toLowerCase()).forEach(r => roles.push(r));
      }
    }

    // 3. accessMatrix — авторитетный источник, если бэкенд его наполнил
    const matrix = user?.accessMatrix || user?.access_matrix || {};
    const teamAccess = matrix[event.my_team_id] || matrix[Number(event.my_team_id)];
    if (teamAccess?.roles) {
      teamAccess.roles.map(r => String(r).toLowerCase()).forEach(r => roles.push(r));
    }

    return [...new Set(roles)];
  })();

  const hasRole = (action) => {
    if (userRoles.includes('admin')) return true;
    const perm = PERMISSIONS[action];
    if (!perm) return false;
    return userRoles.some(r => perm.allowedRoles.map(ar => ar.toLowerCase()).includes(r));
  };

  const teamId = event.my_team_id;
  const eventType = event.event_type;
  const isMatch = eventType === 'match';
  const isTraining = eventType?.includes('training');
  const isMeeting = eventType?.includes('meeting');

  const blocks = {};

  if (isMatch) {
    blocks.schedule = { hasRole: hasRole('MATCH_EDIT_SCHEDULE'), hasSubscription: checkAccess('MATCH_EDIT_SCHEDULE', teamId) };
    blocks.finances = { hasRole: hasRole('MATCH_EDIT_FINANCES'), hasSubscription: checkAccess('MATCH_EDIT_FINANCES', teamId) };
    blocks.media    = { hasRole: hasRole('MATCH_EDIT_MEDIA'),    hasSubscription: checkAccess('MATCH_EDIT_MEDIA',    teamId) };
    blocks.delete   = { hasRole: hasRole('MATCH_DELETE'),        hasSubscription: checkAccess('MATCH_DELETE',        teamId) };
  } else if (isTraining) {
    blocks.schedule = { hasRole: hasRole('TRAINING_EDIT_SCHEDULE'), hasSubscription: checkAccess('TRAINING_EDIT_SCHEDULE', teamId) };
    blocks.finances = { hasRole: hasRole('TRAINING_EDIT_FINANCES'), hasSubscription: checkAccess('TRAINING_EDIT_FINANCES', teamId) };
    blocks.delete   = { hasRole: hasRole('TRAINING_DELETE'),        hasSubscription: checkAccess('TRAINING_DELETE',        teamId) };
  } else if (isMeeting) {
    blocks.schedule = { hasRole: hasRole('MEETING_EDIT_SCHEDULE'), hasSubscription: checkAccess('MEETING_EDIT_SCHEDULE', teamId) };
    blocks.finances = { hasRole: hasRole('MEETING_EDIT_FINANCES'), hasSubscription: checkAccess('MEETING_EDIT_FINANCES', teamId) };
    blocks.delete   = { hasRole: hasRole('MEETING_DELETE'),        hasSubscription: checkAccess('MEETING_DELETE',        teamId) };
  }

  const canSee = Object.values(blocks).some(b => b.hasRole);
  return { canSee, blocks };
}
