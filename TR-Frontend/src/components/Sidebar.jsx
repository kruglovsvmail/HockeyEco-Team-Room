import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { getImageUrl } from '../utils/helpers';
import { PERMISSIONS, ROLES } from '../utils/permissions';
import { useAccess } from '../hooks/useAccess';
import clsx from 'clsx';

export function Sidebar({ user, teams = [], selectedTeam, onTeamChange, onClose }) {
  // Храним ID единственного открытого в данный момент меню (string или null)
  // Для списка команд будем использовать условный ID 'TEAMS'
  const [expandedMenuId, setExpandedMenuId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { checkAccess } = useAccess(user, selectedTeam);

  // Вспомогательная функция безопасного извлечения ролей с учетом динамической роли Владельца
  const getRolesForTeam = (team) => {
    const roles = [];
    if (team?.owner_id === user?.id) {
      roles.push(ROLES.OWNER);
    }
    if (team?.user_role && typeof team.user_role === 'string') {
      roles.push(...team.user_role.split(',').map(r => r.trim()).filter(Boolean));
    }
    if (roles.length === 0 && team) {
      roles.push(ROLES.PLAYER);
    }
    return roles;
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

  // Единый переключатель для всех аккордеонов
  const toggleMenu = (menuId) => {
    setExpandedMenuId(prevId => prevId === menuId ? null : menuId);
  };

  const isTeamsExpanded = expandedMenuId === 'TEAMS';
  const isTournamentsExpanded = expandedMenuId === 'TOURNAMENTS';

  // ОПТИМИЗАЦИЯ СДВИГА: Плавный отложенный переход для разгрузки мобильного процессора
  const handleSafeNavigate = (path, callbackBeforeNavigate) => {
    if (callbackBeforeNavigate) callbackBeforeNavigate();
    onClose(); // Мгновенно запускаем закрытие сайдбара на GPU
    
    // 200мс — идеальный тайминг, сайдбар улетает на 80% траектории, и монтирование страницы не вызывает микро-фризов
    setTimeout(() => {
      navigate(path);
    }, 200);
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
          
          {/* Пункт 1: Календарь */}
          <button 
            onClick={() => handleSafeNavigate('/')}
            className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
              location.pathname === '/' 
                ? 'bg-brand-opacity text-brand font-bold' 
                : 'text-content-main hover:text-brand'
            )}
          >
            <Icon name="calendar" className="w-5 h-5" />
            <span className="text-sm tracking-wider">Календарь</span>
          </button>

          {/* Пункт 2: Умное управление командами */}
          {teams.length <= 1 ? (
            teams.length === 1 ? (
              <button 
                onClick={() => handleSafeNavigate('/my-team', () => {
                  if (selectedTeam?.id !== teams[0].id) {
                    onTeamChange(teams[0]);
                  }
                })}
                className={clsx(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                  location.pathname === '/my-team' 
                    ? 'bg-brand-opacity text-brand font-bold' 
                    : 'text-content-main hover:text-brand'
                )}
              >
                <Icon name="users" className="w-5 h-5" />
                <span className="text-sm tracking-wider">Моя команда</span>
              </button>
            ) : null
          ) : (
            <div className="flex flex-col w-full">
              <button 
                onClick={() => toggleMenu('TEAMS')}
                className={clsx(
                  "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-bold",
                  (location.pathname === '/my-team' && !isTeamsExpanded) && "bg-brand-opacity text-brand font-bold"
                )}
              >
                <div className="flex items-center gap-4">
                  <Icon name="users" className="w-5 h-5" />
                  <span className="text-sm tracking-wider">Мои команды</span>
                </div>
                <div className={clsx("transition-transform duration-200", isTeamsExpanded && "rotate-180")}>
                  <Icon name="chevron" className="w-5 h-5" />
                </div>
              </button>
              
              {/* Раскрывающийся список логотипов и названий команд */}
              <div className={clsx("grid-expand-transition", isTeamsExpanded && "expanded")}>
                <div className="grid-expand-inner">
                  <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 border-l-2 border-surface-border/40 ml-6">
                    {teams.map((team) => {
                      const isTeamSelected = selectedTeam?.id === team.id && location.pathname === '/my-team';
                      return (
                        <button
                          key={team.id}
                          onClick={() => {
                            handleSafeNavigate('/my-team', () => onTeamChange(team));
                          }}
                          className={clsx(
                            "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-xs font-bold uppercase tracking-wider",
                            isTeamSelected 
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

          {/* НОВЫЙ РАЗДЕЛ: Турниры / Лиги с умным раскрытием под команды */}
          {teams.length <= 1 ? (
            teams.length === 1 ? (
              <button 
                onClick={() => handleSafeNavigate('/tournaments', () => {
                  if (selectedTeam?.id !== teams[0].id) {
                    onTeamChange(teams[0]);
                  }
                })}
                className={clsx(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                  location.pathname === '/tournaments' 
                    ? 'bg-brand-opacity text-brand font-bold' 
                    : 'text-content-main hover:text-brand'
                )}
              >
                <Icon name="registry" className="w-5 h-5" />
                <span className="text-sm tracking-wider">Турниры / Лиги</span>
              </button>
            ) : null
          ) : (
            <div className="flex flex-col w-full">
              <button 
                onClick={() => toggleMenu('TOURNAMENTS')}
                className={clsx(
                  "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-bold",
                  (location.pathname === '/tournaments' && !isTournamentsExpanded) && "bg-brand-opacity text-brand font-bold"
                )}
              >
                <div className="flex items-center gap-4">
                  <Icon name="registry" className="w-5 h-5" />
                  <span className="text-sm tracking-wider">Турниры / Лиги</span>
                </div>
                <div className={clsx("transition-transform duration-200", isTournamentsExpanded && "rotate-180")}>
                  <Icon name="chevron" className="w-5 h-5" />
                </div>
              </button>
              
              <div className={clsx("grid-expand-transition", isTournamentsExpanded && "expanded")}>
                <div className="grid-expand-inner">
                  <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 border-l-2 border-surface-border/40 ml-6">
                    {teams.map((team) => {
                      const isTeamSelected = selectedTeam?.id === team.id && location.pathname === '/tournaments';
                      return (
                        <button
                          key={team.id}
                          onClick={() => {
                            handleSafeNavigate('/tournaments', () => onTeamChange(team));
                          }}
                          className={clsx(
                            "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-xs font-bold uppercase tracking-wider",
                            isTeamSelected 
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

          {/* ДИНАМИЧЕСКИЕ ПУНКТЫ УПРАВЛЕНИЯ КОМАНДАМИ */}
          {managerSectionsConfig.map((section) => {
            const permissionConfig = PERMISSIONS[section.id];
            const allowedRoles = permissionConfig ? permissionConfig.allowedRoles : [];
            
            const filteringTeams = teams.filter(team => {
              if (isGlobalAdmin) return true;
              const teamRoles = getRolesForTeam(team);
              return teamRoles.some(role => allowedRoles.includes(role));
            });

            if (filteringTeams.length === 0) return null;

            if (filteringTeams.length === 1) {
              const targetTeam = filteringTeams[0];
              const isUrlActive = location.pathname === section.path && selectedTeam?.id === targetTeam.id;
              
              // Вычисляем, есть ли полная подписка для этой команды
              const hasSubAccess = checkAccess(section.id, targetTeam.id);

              return (
                <button
                  key={section.id}
                  onClick={() => {
                    handleSafeNavigate(section.path, () => onTeamChange(targetTeam));
                  }}
                  className={clsx(
                    "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold justify-between",
                    isUrlActive 
                      ? 'bg-brand-opacity text-brand font-bold' 
                      : 'text-content-main hover:text-brand'
                  )}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <Icon name={section.icon} className="w-5 h-5 shrink-0" />
                    <span className={clsx("text-sm tracking-wider truncate", !hasSubAccess && "opacity-70")}>
                      {section.label}
                    </span>
                  </div>
                  {!hasSubAccess && (
                    <Icon name="lock" className="w-3 h-3 text-content-muted/60 shrink-0" />
                  )}
                </button>
              );
            }

            const isMenuOpen = expandedMenuId === section.id;
            const isAnySubRouteActive = location.pathname === section.path;

            return (
              <div key={section.id} className="flex flex-col w-full">
                <button 
                  onClick={() => toggleMenu(section.id)}
                  className={clsx(
                    "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-bold",
                    (isAnySubRouteActive && !isMenuOpen) && "bg-brand-opacity text-brand font-bold"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Icon name={section.icon} className="w-5 h-5 shrink-0" />
                    <span className="text-sm tracking-wider">{section.label}</span>
                  </div>
                  <div className={clsx("transition-transform duration-200", isMenuOpen && "rotate-180")}>
                    <Icon name="chevron" className="w-5 h-5" />
                  </div>
                </button>
                
                {/* Выкатывающийся список команд */}
                <div className={clsx("grid-expand-transition", isMenuOpen && "expanded")}>
                  <div className="grid-expand-inner">
                    <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 border-l-2 border-brand/30 ml-6">
                      {filteringTeams.map((team) => {
                        const isSubItemActive = location.pathname === section.path && selectedTeam?.id === team.id;
                        const hasSubAccess = checkAccess(section.id, team.id);

                        return (
                          <button
                            key={team.id}
                            onClick={() => {
                              handleSafeNavigate(section.path, () => onTeamChange(team));
                            }}
                            className={clsx(
                              "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-xs font-bold uppercase tracking-wider justify-between",
                              isSubItemActive 
                                ? "bg-brand-opacity text-brand" 
                                : "text-content-muted hover:text-content-main hover:bg-surface-level2"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-5 h-5 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
                                <img 
                                  src={getImageUrl(team.logo_url)} 
                                  alt={team.name} 
                                  className="w-full h-full object-contain" 
                                />
                              </div>
                              <span className={clsx("truncate flex-1", !hasSubAccess && "opacity-70")}>
                                {team.name}
                              </span>
                            </div>
                            {!hasSubAccess && (
                              <Icon name="lock" className="w-3 h-3 text-content-muted/60 shrink-0 ml-1" />
                            )}
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
          <button 
            onClick={() => handleSafeNavigate('/settings')}
            className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold mt-1",
              location.pathname === '/settings' 
                ? 'bg-brand-opacity text-brand font-bold' 
                : 'text-content-main hover:text-brand'
            )}
          >
            <Icon name="settings" className="w-5 h-5" />
            <span className="text-sm tracking-wider">Настройки</span>
          </button>

        </nav>
      </div>

      {/* Профиль игрока */}
      <button 
        onClick={() => handleSafeNavigate('/profile')}
        className="shrink-0 p-4 border-t border-surface-border w-full flex items-center gap-4 bg-surface-level1 hover:bg-surface-level2 transition-colors type-button text-left outline-none cursor-pointer"
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
          <span className="text-xs font-bold text-content-muted leading-tight truncate mt-0.5">
            {user?.firstName}
          </span>
        </div>
      </button>
      
    </div>
  );
}