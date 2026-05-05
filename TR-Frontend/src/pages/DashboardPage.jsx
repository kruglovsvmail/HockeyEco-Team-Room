import React from 'react';
import { useAccess } from '../hooks/useAccess';
import { ROLES } from '../utils/permissions';
import { removeToken } from '../utils/helpers';
import { useNavigate } from 'react-router-dom';

const ROLE_LABELS = {
  [ROLES.GLOBAL_ADMIN]: 'Глобальный админ',
  [ROLES.CLUB_TOP_MANAGER]: 'Руководитель клуба',
  [ROLES.CLUB_ADMIN]: 'Админ клуба',
  [ROLES.TEAM_MANAGER]: 'Менеджер команды',
  [ROLES.TEAM_ADMIN]: 'Админ команды',
  [ROLES.HEAD_COACH]: 'Главный тренер',
  [ROLES.COACH]: 'Тренер',
  [ROLES.PLAYER]: 'Игрок',
};

export function DashboardPage() {
  const { user } = useAccess();
  const navigate = useNavigate();

  const fullName = [user?.lastName, user?.firstName, user?.middleName]
    .filter(Boolean)
    .join(' ');

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* ФИО Пользователя */}
      <div className="bg-surface-level1 border border-surface-border p-6 rounded-2xl">
        <div className="text-content-muted text-xs uppercase tracking-widest mb-1 font-bold">
          Пользователь
        </div>
        <div className="text-xl font-bold text-content-main">
          {fullName || 'Имя не указано'}
        </div>
      </div>

      {/* Команды и роли (включает роли клуба, так как API отдает их вместе) */}
      <div className="bg-surface-level1 border border-surface-border p-6 rounded-2xl">
        <div className="text-content-muted text-xs uppercase tracking-widest mb-4 font-bold">
          Команды и роли
        </div>
        
        {user?.teams && user.teams.length > 0 ? (
          <ul className="space-y-4">
            {user.teams.map((team) => {
              const roles = team.user_role 
                ? team.user_role.split(',').map(r => r.trim()).filter(Boolean)
                : [ROLES.PLAYER];

              return (
                <li key={team.id} className="pb-4 border-b border-surface-border/50 last:border-0 last:pb-0">
                  <div className="text-lg font-bold text-content-main mb-2">
                    {team.name} <span className="text-sm font-normal text-content-subtle">({team.short_name})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {roles.map(roleKey => (
                      <span 
                        key={roleKey} 
                        className="px-2.5 py-1 bg-surface-level2 border border-surface-border rounded-lg text-xs text-brand font-medium"
                      >
                        {ROLE_LABELS[roleKey] || roleKey}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-content-subtle text-sm">Вы не состоите ни в одной команде или клубе.</div>
        )}
      </div>

      {/* Кнопка выхода для тестов */}
      <button 
        onClick={handleLogout}
        className="mt-6 self-start text-xs font-bold uppercase tracking-widest text-danger hover:text-danger-muted transition-colors"
      >
        Выйти из аккаунта
      </button>

    </div>
  );
}