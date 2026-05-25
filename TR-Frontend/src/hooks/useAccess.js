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
  
  const checkAccess = useCallback((action) => {
    if (!user) return false;
    
    // Безопасная проверка с учетом snake_case с бэкенда
    if (user.globalRole === ROLES.GLOBAL_ADMIN || user.global_role === ROLES.GLOBAL_ADMIN) {
      return true;
    }

    const allowedRoles = PERMISSIONS[action];
    if (!allowedRoles || allowedRoles.length === 0) return false;

    // В PWA мы берем роли из выбранной команды. 
    // Если бэкенд отфильтровал left_at и прислал пустую строку или null, 
    // пользователь больше не имеет административных прав в этой команде.
    const userRolesStr = selectedTeam?.user_role || ''; 
    let currentUserRoles = userRolesStr.split(',').map(r => r.trim()).filter(Boolean);

    // Если человек числится в массиве команд (значит, прошел бэкенд-фильтр tm.left_at IS NULL),
    // но административных ролей у него нет, по умолчанию даем базовую роль игрока.
    if (currentUserRoles.length === 0 && selectedTeam) {
      currentUserRoles.push(ROLES.PLAYER);
    }

    return currentUserRoles.some(role => allowedRoles.includes(role));
  }, [user, selectedTeam]);

  return { user, selectedTeam, checkAccess };
}