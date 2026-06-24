import { useOutletContext } from 'react-router-dom';
import { PERMISSIONS, ROLES } from '../utils/permissions';
import { useCallback } from 'react';

export function useAccess(customUser = null, customTeam = null) {
  let context = {};
  try {
    context = useOutletContext() || {};
  } catch (e) {}

  const user = customUser || context.user || null;
  const selectedTeam = customTeam || context.selectedTeam || null;

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

  return { user, selectedTeam, checkAccess };
}
