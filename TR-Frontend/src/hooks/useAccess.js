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

    // В PWA мы берем роли из выбранной команды
    const userRolesStr = selectedTeam?.user_role || ROLES.PLAYER; 
    let currentUserRoles = userRolesStr.split(',').map(r => r.trim()).filter(Boolean);

    return currentUserRoles.some(role => allowedRoles.includes(role));
  }, [user, selectedTeam]); // Добавили зависимости для безопасности

  return { user, selectedTeam, checkAccess };
}