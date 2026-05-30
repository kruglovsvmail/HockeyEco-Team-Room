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
    const targetTeamId = teamId || selectedTeam?.id || selectedTeam?.team_id || null;
    if (!targetTeamId) return false;

    // Достаем данные допусков по конкретной команде из In-Memory матрицы
    const matrix = user.accessMatrix || user.access_matrix || {};
    const teamAccess = matrix[targetTeamId];

    let currentUserRoles = [];
    let hasSubscription = false;

    if (teamAccess) {
      // Идеальный сценарий: берем готовые роли и статус подписки из матрицы доступов
      currentUserRoles = teamAccess.roles || [];
      hasSubscription = teamAccess.has_subscription || teamAccess.hasSubscription || false;
    } else {
      // Резервный фолбек: если матрица еще не обновилась, но команда совпадает с выбранной
      const isCurrentContext = String(selectedTeam?.id) === String(targetTeamId);
      if (isCurrentContext && selectedTeam?.user_role) {
        currentUserRoles = selectedTeam.user_role.split(',').map(r => r.trim()).filter(Boolean);
      } else if (isCurrentContext && selectedTeam) {
        currentUserRoles = [ROLES.PLAYER];
      }
      
      // Вычисляем статус личной подписки пользователя на основе даты окончания
      const subExpires = user.subscriptionExpiresAt || user.subscription_expires_at;
      hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;
    }

    // Если у пользователя нет ролей в команде, но он числится в ней — по умолчанию даем базовую роль игрока
    if (currentUserRoles.length === 0) {
      currentUserRoles.push(ROLES.PLAYER);
    }

    // Атомарный анализ пересечения ролей для текущего действия
    return currentUserRoles.some(role => {
      // Если роль в принципе не входит в список разрешенных — отсекаем её
      if (!permission.allowedRoles.includes(role)) return false;

      // Вычисляем, требует ли конкретно эта роль наличие подписки для данного действия
      let roleRequiresSub = false;
      if (permission.requiresSubscription === true) {
        roleRequiresSub = true;
      } else if (Array.isArray(permission.requiresSubscription)) {
        roleRequiresSub = permission.requiresSubscription.includes(role);
      }

      // Если для роли подписка обязательна, а у пользователя её нет — блокируем действие по этой роли
      if (roleRequiresSub && !hasSubscription) {
        return false;
      }

      // Если роль совпала и прошла фильтр подписки — доступ открыт
      return true;
    });
  }, [user, selectedTeam]);

  return { user, selectedTeam, checkAccess };
}