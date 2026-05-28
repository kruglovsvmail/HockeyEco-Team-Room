import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { getImageUrl } from '../utils/helpers';
import { PERMISSIONS } from '../utils/permissions';
import clsx from 'clsx';

export function Sidebar({ user, teams = [], selectedTeam, onTeamChange, onClose }) {
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);
  
  // Храним состояния раскрытия для каждого из 4-х менеджерских пунктов
  const [expandedMenus, setExpandedMenus] = useState({
    MGR_CREATE_EVENT: false,
    MGR_SEASON_ROSTERS: false,
    MGR_FINANCES: false,
    MGR_HANDBOOKS: false
  });

  const location = useLocation();
  const navigate = useNavigate();

  // Вспомогательная функция безопасного извлечения ролей текущего пользователя в рамках конкретной команды
  const getRolesForTeam = (team) => {
    if (!team?.user_role || typeof team.user_role !== 'string') return [];
    return team.user_role.split(',').map(r => r.trim()).filter(Boolean);
  };

  // Проверка глобального администратора
  const isGlobalAdmin = user?.globalRole === 'admin' || user?.global_role === 'admin';

  // Конфигурация 4-х менеджерских пунктов меню со своими гранулярными правами
  const managerSectionsConfig = [
    { id: 'MGR_CREATE_EVENT', path: '/manager/create-event', label: 'Добавить событие', icon: 'plus' },
    { id: 'MGR_SEASON_ROSTERS', path: '/manager/season-rosters', label: 'Заявки', icon: 'roster' },
    { id: 'MGR_FINANCES', path: '/manager/finances', label: 'Финансы', icon: 'registry' },
    { id: 'MGR_HANDBOOKS', path: '/manager/handbooks', label: 'Справочники', icon: 'handbook' },
  ];

  // Переключатель раскрытия аккордеона для менеджерских пунктов
  const toggleMenu = (menuId) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  return (
    <div className="flex flex-col h-full bg-surface-level1 overflow-hidden">
      
      <style>
        {`
          .grid-expand-transition {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.25s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out;
            opacity: 0;
            pointer-events: none;
          }
          .grid-expand-transition.expanded { 
            grid-template-rows: 1fr; 
            opacity: 1; 
            pointer-events: auto;
          }
          .grid-expand-inner {
            min-height: 0;
            overflow: hidden;
          }
        `}
      </style>
      
      {/* Логотип платформы */}
      <div className="shrink-0 px-7 py-4 border-b border-surface-border">
        <h1 className="text-xl font-black uppercase tracking-widest text-content-main">
          HOCKEY<span className="text-brand">ECO</span>
        </h1>
        <p className="text-content-muted text-[10px] tracking-[0.3em] uppercase font-bold">
          КОМАНДА
        </p>
      </div>

      {/* Навигация */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 pt-4">
        <nav className="flex flex-col gap-1">
          
          {/* Пункт 1: Расписание */}
          <NavLink 
            to="/" 
            onClick={onClose}
            className={({ isActive }) => `
              flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none
              ${isActive 
                ? 'bg-brand-opacity text-brand font-bold' 
                : 'text-content-main hover:text-brand font-semibold'
              }
            `}
          >
            <Icon name="calendar" className="w-4 h-4" />
            <span className="text-sm tracking-wider">Расписание</span>
          </NavLink>

          {/* Пункт 2: Умное управление командами */}
          {teams.length <= 1 ? (
            teams.length === 1 ? (
              <NavLink 
                to="/my-team" 
                onClick={() => {
                  if (selectedTeam?.id !== teams[0].id) {
                    onTeamChange(teams[0]);
                  }
                  onClose();
                }}
                className={({ isActive }) => `
                  flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none
                  ${isActive 
                    ? 'bg-brand-opacity text-brand font-bold' 
                    : 'text-content-main hover:text-brand font-semibold'
                  }
                `}
              >
                <Icon name="users" className="w-4 h-4" />
                <span className="text-sm tracking-wider">Моя команда</span>
              </NavLink>
            ) : null
          ) : (
            <div className="flex flex-col w-full">
              <button 
                onClick={() => setIsTeamsExpanded(!isTeamsExpanded)}
                className={clsx(
                  "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-semibold",
                  (location.pathname === '/my-team' && !isTeamsExpanded) && "bg-brand-opacity text-brand font-bold"
                )}
              >
                <div className="flex items-center gap-4">
                  <Icon name="users" className="w-4 h-4" />
                  <span className="text-sm tracking-wider">Мои команды</span>
                </div>
                <div className={clsx("transition-transform duration-200", isTeamsExpanded && "rotate-180")}>
                  <Icon name="chevron" className="w-4 h-4" />
                </div>
              </button>
              
              {/* Раскрывающийся список логотипов и названий команд */}
              <div className={clsx("grid-expand-transition", isTeamsExpanded && "expanded")}>
                <div className="grid-expand-inner">
                  <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 border-l-2 border-surface-border/40 ml-6">
                    {teams.map((team) => {
                      const isSelected = selectedTeam?.id === team.id;
                      return (
                        <button
                          key={team.id}
                          onClick={() => {
                            onTeamChange(team);
                            onClose();
                            navigate('/my-team');
                          }}
                          className={clsx(
                            "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-xs font-bold uppercase tracking-wider",
                            isSelected 
                              ? "bg-brand-opacity text-brand" 
                              : "text-content-muted hover:text-content-main hover:bg-surface-level2"
                          )}
                        >
                          <div className="w-6 h-6 rounded-md bg-surface-level1 p-0.5 flex items-center justify-center shrink-0 ">
                            <img 
                              src={getImageUrl(team.logo_url)} 
                              alt={team.name} 
                              className="w-full h-full object-contain" 
                            />
                          </div>
                          <span className="truncate flex-1">{team.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ДИНАМИЧЕСКИЕ ПУНКТЫ УПРАВЛЕНИЯ КОМАНДАМИ (ВМЕСТО СТАРОГО СЕЛЕКТОРА) */}
          {managerSectionsConfig.map((section) => {
            // Для каждого пункта индивидуально фильтруем список доступных команд на основе разрешенных ролей
            const allowedRoles = PERMISSIONS[section.id] || [];
            
            const filteringTeams = teams.filter(team => {
              if (isGlobalAdmin) return true;
              const teamRoles = getRolesForTeam(team);
              return teamRoles.some(role => allowedRoles.includes(role));
            });

            // Если у пользователя нет ни одной команды с доступом к этому действию — пункт полностью скрывается!
            if (filteringTeams.length === 0) return null;

            // Если доступна ровно 1 команда — рендерим как обычную прямую ссылку без выпадающих подсписков
            if (filteringTeams.length === 1) {
              const targetTeam = filteringTeams[0];
              const isUrlActive = location.pathname === section.path && selectedTeam?.id === targetTeam.id;

              return (
                <button
                  key={section.id}
                  onClick={() => {
                    onTeamChange(targetTeam); // Принудительно выставляем контекст этой единственной команды
                    navigate(section.path);
                    onClose();
                  }}
                  className={clsx(
                    "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-semibold",
                    isUrlActive 
                      ? 'bg-brand-opacity text-brand font-bold' 
                      : 'text-content-main hover:text-brand'
                  )}
                >
                  <Icon name={section.icon} className="w-4 h-4 shrink-0" />
                  <span className="text-sm tracking-wider">{section.label}</span>
                </button>
              );
            }

            // Если доступно несколько команд — рендерим аккордеон со списком команд внутри этого пункта
            const isMenuOpen = expandedMenus[section.id];
            const isAnySubRouteActive = location.pathname === section.path;

            return (
              <div key={section.id} className="flex flex-col w-full">
                <button 
                  onClick={() => toggleMenu(section.id)}
                  className={clsx(
                    "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-semibold",
                    (isAnySubRouteActive && !isMenuOpen) && "bg-brand-opacity text-brand font-bold"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Icon name={section.icon} className="w-4 h-4 shrink-0" />
                    <span className="text-sm tracking-wider">{section.label}</span>
                  </div>
                  <div className={clsx("transition-transform duration-200", isMenuOpen && "rotate-180")}>
                    <Icon name="chevron" className="w-4 h-4" />
                  </div>
                </button>
                
                {/* Выкатывающийся список команд, допущенных конкретно к этому разделу */}
                <div className={clsx("grid-expand-transition", isMenuOpen && "expanded")}>
                  <div className="grid-expand-inner">
                    <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 border-l-2 border-brand/30 ml-6">
                      {filteringTeams.map((team) => {
                        const isSubItemActive = location.pathname === section.path && selectedTeam?.id === team.id;
                        return (
                          <button
                            key={team.id}
                            onClick={() => {
                              onTeamChange(team); // Меняем контекст выбранной команды на кликнутую
                              navigate(section.path);
                              onClose();
                            }}
                            className={clsx(
                              "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-xs font-bold uppercase tracking-wider",
                              isSubItemActive 
                                ? "bg-brand-opacity text-brand" 
                                : "text-content-muted hover:text-content-main hover:bg-surface-level2"
                            )}
                          >
                            <div className="w-5 h-5 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
                              <img 
                                src={getImageUrl(team.logo_url)} 
                                alt={team.name} 
                                className="w-full h-full object-contain" 
                              />
                            </div>
                            <span className="truncate flex-1">{team.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Пункт 3: Настройки приложения */}
          <NavLink 
            to="/settings" 
            onClick={onClose}
            className={({ isActive }) => `
              flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none mt-1
              ${isActive 
                ? 'bg-brand-opacity text-brand font-bold' 
                : 'text-content-main hover:text-brand font-semibold'
              }
            `}
          >
            <Icon name="settings" className="w-4 h-4" />
            <span className="text-sm tracking-wider">Настройки</span>
          </NavLink>

        </nav>
      </div>

      {/* Профиль игрока (внизу) */}
      <NavLink 
        to="/profile"
        onClick={onClose}
        className="shrink-0 p-4 border-t border-surface-border flex items-center gap-4 bg-surface-level1 hover:bg-surface-level2 transition-colors outline-none cursor-pointer"
      >
        <Avatar 
          photoUrl={user?.avatarUrl}
          firstName={user?.firstName}
          lastName={user?.lastName}
          className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border shadow-inner"
          fallbackClassName="text-xl text-brand uppercase"
        />
        
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-content-main leading-tight truncate">
            {user?.lastName}
          </span>
          <span className="text-xs font-semibold text-content-muted leading-tight truncate mt-0.5">
            {user?.firstName}
          </span>
        </div>
      </NavLink>
      
    </div>
  );
}