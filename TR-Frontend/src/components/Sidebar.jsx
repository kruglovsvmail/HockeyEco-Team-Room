import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { getImageUrl } from '../utils/helpers';
import clsx from 'clsx';

export function Sidebar({ user, teams = [], selectedTeam, onTeamChange, onClose }) {
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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
            <NavLink 
              to="/my-team" 
              onClick={onClose}
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