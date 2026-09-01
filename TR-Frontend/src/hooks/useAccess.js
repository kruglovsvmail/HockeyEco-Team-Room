import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS, ROLES } from '../utils/permissions';
import { useCallback } from 'react';

export function useAccess(customUser = null, customTeam = null, customClub = null, customCommunity = null) {
  let context = {};
  try {
    context = useOutletContext() || {};
  } catch (e) {}

  const user = customUser || context.user || null;
  const selectedTeam = customTeam || context.selectedTeam || null;
  const selectedClub = customClub || context.selectedClub || null;
  const selectedCommunity = customCommunity || context.selectedCommunity || null;

  /**
   * Гранулярная проверка прав доступа по конкретному действию и ID команды
   * @param {string} action - Ключ правила из permissions.js (например, 'LINES_MANAGE')
   * @param {number|string|null} teamId - ID команды. Если не передан, берется текущая выбранная команда
   */
  const checkAccess = useCallback((action, teamId = null) => {
    if (!user) return false;

    // Глобальный суперадмин системы всегда имеет полный беспрепятственный доступ
    if (user.globalRole === ROLES.GLOBAL_ADMIN || user.global_role === ROLES.GLOBAL_ADMIN) {
      return true;
    }

    // Извлекаем декларативное правило из справочника доступов
    const permission = PERMISSIONS[action];
    if (!permission) return false;

    // Определяем целевой ID команды: из аргумента функции или из контекста страницы
    const targetTeamId = String(teamId || selectedTeam?.id || selectedTeam?.team_id || '');
    if (!targetTeamId) return false;

    let currentUserRoles = [];
    let hasSubscription = false;

    // --- Источник 1: accessMatrix из user (заполняется при логине/обновлении профиля) ---
    const matrix = user.accessMatrix || user.access_matrix || {};
    const teamAccess = matrix[targetTeamId] || matrix[Number(targetTeamId)];

    if (teamAccess) {
      currentUserRoles = teamAccess.roles || [];
      hasSubscription = teamAccess.has_subscription || teamAccess.hasSubscription || false;
    } else {
      // --- Источник 2: данные из selectedTeam, обогащённые getMyTeams ---
      const isCurrentContext = String(selectedTeam?.id) === targetTeamId;

      if (isCurrentContext && selectedTeam) {
        // user_roles — массив (новый формат getMyTeams)
        if (Array.isArray(selectedTeam.user_roles) && selectedTeam.user_roles.length > 0) {
          currentUserRoles = selectedTeam.user_roles;
        }
        // user_role — строка (обратная совместимость)
        else if (selectedTeam.user_role) {
          currentUserRoles = selectedTeam.user_role.split(',').map(r => r.trim()).filter(Boolean);
        }
        // is_owner — явный флаг владельца
        if (selectedTeam.is_owner && !currentUserRoles.includes(ROLES.OWNER)) {
          currentUserRoles = [ROLES.OWNER, ...currentUserRoles];
        }

        // Статус подписки из команды (проставляется в getMyTeams)
        hasSubscription = selectedTeam.has_subscription || false;

        // Резервно: подписка из объекта пользователя
        if (!hasSubscription) {
          const subExpires = user.subscriptionExpiresAt || user.subscription_expires_at;
          hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;
        }
      }
    }

    // Если ролей нет совсем — доступ закрыт.
    // НЕ добавляем PLAYER по умолчанию: отсутствие ролей ≠ игрок.
    if (currentUserRoles.length === 0) return false;

    // Атомарный анализ пересечения ролей для текущего действия
    return currentUserRoles.some(role => {
      // Если роль в принципе не входит в список разрешённых — отсекаем
      if (!permission.allowedRoles.includes(role)) return false;

      // Вычисляем, требует ли конкретно эта роль наличие подписки
      let roleRequiresSub = false;
      if (permission.requiresSubscription === true) {
        roleRequiresSub = true;
      } else if (Array.isArray(permission.requiresSubscription)) {
        roleRequiresSub = permission.requiresSubscription.includes(role);
      }

      // Если для роли подписка обязательна, а у пользователя её нет — блокируем
      if (roleRequiresSub && !hasSubscription) return false;

      return true;
    });
  }, [user, selectedTeam]);

  /**
   * Гранулярная проверка прав в КЛУБНОМ контексте.
   *
   * Живёт отдельной функцией, а не флагом внутри checkAccess: идентификаторы команд
   * и клубов независимы, и одна общая матрица неминуемо начала бы путать команду №5
   * с клубом №5. Набор ролей здесь клубный (top_manager, club_admin, coach, player).
   *
   * @param {string} action - Ключ правила из permissions.js
   * @param {number|string|null} clubId - ID клуба. Если не передан, берётся текущий выбранный
   */
  const checkClubAccess = useCallback((action, clubId = null) => {
    if (!user) return false;

    if (user.globalRole === ROLES.GLOBAL_ADMIN || user.global_role === ROLES.GLOBAL_ADMIN) {
      return true;
    }

    const permission = PERMISSIONS[action];
    if (!permission) return false;

    const targetClubId = String(clubId || selectedClub?.id || '');
    if (!targetClubId) return false;

    let currentUserRoles = [];
    let hasSubscription = false;

    // --- Источник 1: clubAccessMatrix из user (заполняется при логине) ---
    const matrix = user.clubAccessMatrix || user.club_access_matrix || {};
    const clubAccess = matrix[targetClubId] || matrix[Number(targetClubId)];

    if (clubAccess) {
      currentUserRoles = clubAccess.roles || [];
      hasSubscription = clubAccess.has_subscription || clubAccess.hasSubscription || false;
    } else {
      // --- Источник 2: клуб из списка user.clubs / текущий выбранный клуб ---
      const clubFromUser = (user.clubs || []).find(c => String(c.id) === targetClubId);
      const source = clubFromUser || (String(selectedClub?.id) === targetClubId ? selectedClub : null);

      if (source) {
        if (Array.isArray(source.user_roles) && source.user_roles.length > 0) {
          currentUserRoles = source.user_roles;
        } else if (source.user_role) {
          currentUserRoles = source.user_role.split(',').map(r => r.trim()).filter(Boolean);
        }
        if (source.is_owner && !currentUserRoles.includes(ROLES.CLUB_OWNER)) {
          currentUserRoles = [ROLES.CLUB_OWNER, ...currentUserRoles];
        }

        hasSubscription = source.has_subscription || false;
        if (!hasSubscription) {
          const subExpires = user.subscriptionExpiresAt || user.subscription_expires_at;
          hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;
        }
      }
    }

    if (currentUserRoles.length === 0) return false;

    return currentUserRoles.some(role => {
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
  }, [user, selectedClub]);

  /**
   * Гранулярная проверка прав в контексте СООБЩЕСТВА (тренировки и солянки).
   *
   * Третья матрица рядом с командной и клубной — по той же причине: id у команд,
   * клубов и сообществ независимы, общая матрица начала бы путать команду №5
   * с сообществом №5. Роли здесь свои: community_owner, community_manager,
   * community_admin, community_member.
   *
   * Подписку не проверяем ни для одной роли — все ключи сообществ идут с
   * requiresSubscription: false, — но код проверки оставлен общим с остальными
   * контекстами, чтобы включить её потом одной правкой в permissions.js.
   *
   * @param {string} action - Ключ правила из permissions.js
   * @param {number|string|null} communityId - ID сообщества. Если не передан, берётся текущее выбранное
   */
  const checkCommunityAccess = useCallback((action, communityId = null) => {
    if (!user) return false;

    if (user.globalRole === ROLES.GLOBAL_ADMIN || user.global_role === ROLES.GLOBAL_ADMIN) {
      return true;
    }

    const permission = PERMISSIONS[action];
    if (!permission) return false;

    const targetId = String(communityId || selectedCommunity?.id || '');
    if (!targetId) return false;

    let currentUserRoles = [];
    let hasSubscription = true;

    // --- Источник 1: communityAccessMatrix из user (заполняется при логине) ---
    const matrix = user.communityAccessMatrix || user.community_access_matrix || {};
    const access = matrix[targetId] || matrix[Number(targetId)];

    if (access) {
      currentUserRoles = access.roles || [];
      hasSubscription = access.has_subscription !== false;
    } else {
      // --- Источник 2: сообщество из списка user.communities / текущее выбранное ---
      const fromUser = (user.communities || []).find(c => String(c.id) === targetId);
      const source = fromUser || (String(selectedCommunity?.id) === targetId ? selectedCommunity : null);

      if (source) {
        if (Array.isArray(source.user_roles) && source.user_roles.length > 0) {
          currentUserRoles = source.user_roles;
        } else if (source.user_role) {
          currentUserRoles = source.user_role.split(',').map(r => r.trim()).filter(Boolean);
        }
        if (source.is_owner && !currentUserRoles.includes(ROLES.COMMUNITY_OWNER)) {
          currentUserRoles = [ROLES.COMMUNITY_OWNER, ...currentUserRoles];
        }
        hasSubscription = source.has_subscription !== false;
      }
    }

    if (currentUserRoles.length === 0) return false;

    return currentUserRoles.some(role => {
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
  }, [user, selectedCommunity]);

  return { user, selectedTeam, selectedClub, selectedCommunity, checkAccess, checkClubAccess, checkCommunityAccess };
}
