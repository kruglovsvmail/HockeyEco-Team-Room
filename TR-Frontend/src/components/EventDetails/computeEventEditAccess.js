import { PERMISSIONS } from '../../utils/permissions';

// Вычисляет доступы к редактированию полей события (расписание/финансы/медиа/удаление)
// для текущего пользователя в контексте команды события.
export function computeEventEditAccess(event, user, selectedTeam, checkAccess, checkClubAccess = null, checkCommunityAccess = null) {
  if (!event) return { canSee: false, blocks: {} };

  // Событие сообщества: ни команды, ни клуба у него нет, а блоки разведены
  // по отдельным ключам — расписание, взнос, лимиты состава и удаление.
  const eventCommunityId = event.my_community_id || null;
  if (eventCommunityId) {
    const communityRoles = (() => {
      const roles = [];
      const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
      if (globalRole === 'admin') roles.push('admin');

      const fromUser = (user?.communities || []).find(c => String(c.id) === String(eventCommunityId));
      if (fromUser) {
        if (fromUser.is_owner) roles.push('community_owner');
        if (Array.isArray(fromUser.user_roles)) {
          fromUser.user_roles.forEach(r => roles.push(String(r).toLowerCase()));
        } else if (fromUser.user_role) {
          fromUser.user_role.split(',').forEach(r => roles.push(r.trim().toLowerCase()));
        }
      }

      const matrix = user?.communityAccessMatrix || user?.community_access_matrix || {};
      const access = matrix[eventCommunityId] || matrix[Number(eventCommunityId)];
      if (access?.roles) access.roles.forEach(r => roles.push(String(r).toLowerCase()));

      return [...new Set(roles)];
    })();

    const hasKey = (key) => {
      const perm = PERMISSIONS[key];
      if (!perm) return false;
      if (communityRoles.includes('admin')) return true;
      const allowed = perm.allowedRoles.map(ar => String(ar).toLowerCase());
      return communityRoles.some(r => allowed.includes(r));
    };

    // Подписка в сообществах не требуется ни для одного ключа, но поле
    // оставляем: панель редактирования читает обе половины у всех блоков.
    const block = (key) => ({
      hasRole: hasKey(key),
      hasSubscription: checkCommunityAccess
        ? checkCommunityAccess(key, eventCommunityId)
        : hasKey(key),
    });

    const communityBlocks = {
      schedule: block('COMMUNITY_EVENT_EDIT_SCHEDULE'),
      finances: block('COMMUNITY_EVENT_EDIT_FINANCES'),
      limits:   block('COMMUNITY_EVENT_EDIT_LIMITS'),
      delete:   block('COMMUNITY_EVENT_DELETE'),
    };

    return {
      canSee: Object.values(communityBlocks).some(b => b.hasRole),
      blocks: communityBlocks,
    };
  }

  // Клубное событие живёт в контексте клуба: команды у него нет, а расписание,
  // взнос и удаление закрыты одним ключом CLUB_MANAGE_EVENTS.
  const eventClubId = event.my_club_id || null;
  if (eventClubId) {
    const clubRoles = (() => {
      const roles = [];
      const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
      if (globalRole === 'admin') roles.push('admin');

      const clubFromUser = (user?.clubs || []).find(c => String(c.id) === String(eventClubId));
      if (clubFromUser) {
        if (clubFromUser.is_owner) roles.push('club_owner');
        if (Array.isArray(clubFromUser.user_roles)) {
          clubFromUser.user_roles.forEach(r => roles.push(String(r).toLowerCase()));
        } else if (clubFromUser.user_role) {
          clubFromUser.user_role.split(',').forEach(r => roles.push(r.trim().toLowerCase()));
        }
      }

      const matrix = user?.clubAccessMatrix || user?.club_access_matrix || {};
      const clubAccess = matrix[eventClubId] || matrix[Number(eventClubId)];
      if (clubAccess?.roles) {
        clubAccess.roles.forEach(r => roles.push(String(r).toLowerCase()));
      }

      return [...new Set(roles)];
    })();

    const perm = PERMISSIONS.CLUB_MANAGE_EVENTS;
    const hasClubRole = clubRoles.includes('admin')
      || clubRoles.some(r => perm.allowedRoles.map(ar => ar.toLowerCase()).includes(r));
    const hasSub = checkClubAccess ? checkClubAccess('CLUB_MANAGE_EVENTS', eventClubId) : false;

    const clubBlocks = {
      schedule: { hasRole: hasClubRole, hasSubscription: hasSub },
      finances: { hasRole: hasClubRole, hasSubscription: hasSub },
      delete:   { hasRole: hasClubRole, hasSubscription: hasSub },
    };

    return { canSee: hasClubRole, blocks: clubBlocks };
  }

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
