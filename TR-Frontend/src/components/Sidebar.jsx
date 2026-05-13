import React from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { getImageUrl } from '../utils/helpers';

// Конфигурация пунктов меню
const MENU_ITEMS = [
  { path: '/', icon: 'calendar', label: 'Расписание' },
  { path: '/my-team', icon: 'users', label: 'Моя команда' },
];

export function Sidebar({ user, onLogout, onClose }) {
  return (
    <div className="flex flex-col h-full bg-surface-level1 overflow-hidden">
      
      {/* Логотип */}
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
        <nav className="flex flex-col gap-0">
          {MENU_ITEMS.map((item) => (
            <NavLink 
              key={item.path}
              to={item.path} 
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none
                ${isActive 
                  ? 'bg-brand-opacity text-brand font-bold' 
                  : 'text-content-main hover:text-brand font-semibold'
                }
              `}
            >
              <Icon name={item.icon} className="w-4 h-4" />
              <span className="text-sm tracking-wider">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Профиль игрока (внизу вместо кнопки выхода) */}
      <NavLink 
        to="/profile"
        onClick={onClose}
        className="shrink-0 p-4 border-t border-surface-border flex items-center gap-4 bg-surface-level1 hover:bg-surface-level2 transition-colors outline-none cursor-pointer"
      >
        {/* Аватарка */}
        <div className="w-10 h-10 shrink-0 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center overflow-hidden shadow-inner">
           {user?.avatarUrl ? (
              <img 
                src={getImageUrl(user.avatarUrl)} 
                alt="Аватар" 
                className="w-full h-full object-cover" 
              />
           ) : (
              <span className="text-xl font-black text-brand uppercase">
                {user?.lastName?.charAt(0)}{user?.firstName?.charAt(0)}
              </span>
           )}
        </div>
        
        {/* Данные */}
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