import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { removeToken } from '../utils/helpers';

export function DashboardPage() {
  const { user } = useAccess();
  const navigate = useNavigate();
  
  // Достаем массив команд пользователя
  const teams = user?.teams || [];

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full relative z-10 px-4 pt-6">
      
      {/* Шапка */}
      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Дашборд
        </h1>
        <p className="text-[10px] text-content-muted font-bold uppercase tracking-widest mt-1">
          {user?.lastName} {user?.firstName}
        </p>
      </div>

      {/* Список команд */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-safe">
        <h2 className="text-xs font-bold text-content-subtle uppercase tracking-widest mb-4">
          Мои команды и клубы
        </h2>

        {teams.length > 0 ? (
          <div className="flex flex-col gap-3">
            {teams.map((team) => (
              <div 
                key={team.id} 
                className="bg-surface-level1/60 border border-surface-border/40 rounded-3xl p-5 flex items-center gap-4 backdrop-blur-md"
              >
                {/* Логотип */}
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-surface-level2 border border-surface-border/50 flex items-center justify-center overflow-hidden shadow-inner">
                  {team.logo_url ? (
                    <img src={team.logo_url} alt={team.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-content-subtle font-bold text-sm uppercase tracking-wider">
                      {team.short_name || 'ТМ'}
                    </span>
                  )}
                </div>

                {/* Инфо */}
                <div className="flex flex-col min-w-0">
                  <span className="text-content-main font-bold text-lg leading-tight truncate">
                    {team.name}
                  </span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2 py-0.5 bg-brand/10 border border-brand/20 text-brand text-[9px] font-black uppercase tracking-widest rounded-md">
                      Роли: {team.user_role}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface-level1/40 border border-surface-border/30 rounded-3xl p-6 text-center">
            <p className="text-sm text-content-muted leading-relaxed">
              Вы еще не привязаны ни к одной команде в системе.
            </p>
          </div>
        )}
      </div>

      {/* Кнопка выхода */}
      <button 
        onClick={handleLogout} 
        className="shrink-0 mt-6 mb-safe pb-4 w-full py-4 text-[10px] font-bold uppercase tracking-widest text-danger/60 hover:text-danger transition-colors outline-none"
      >
        Выйти из аккаунта
      </button>

    </div>
  );
}