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
      
      {/* Профиль пользователя (Аватар + Фамилия Имя) */}
      <div className="shrink-0 p-4 flex items-center gap-4">
        {/* Аватарка (слева) */}
        <div className="w-10 h-10 shrink-0 rounded-xl bg-surface-base border flex items-center justify-center overflow-hidden shadow-inner">
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
        
        {/* Данные (справа от аватарки, в две строки) */}
        <div className="flex flex-col min-w-0">
          <span className="text-lg font-bold text-content-main leading-tight truncate">
            {user?.lastName}
          </span>
          <span className="text-sm font-bold text-content-muted leading-tight truncate -mt-0.5">
            {user?.firstName}
          </span>
        </div>
      </div>

      {/* Навигация */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-0 pt-6">
        <nav className="flex flex-col gap-0">
          {MENU_ITEMS.map((item) => (
            <NavLink 
              key={item.path}
              to={item.path} 
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-4 transition-all outline-none
                ${isActive 
                  ? 'bg-brand-opacity border-r-[4px] border-brand text-brand font-bold' 
                  : 'text-content-main hover:text-brand font-semibold'
                }
              `}
            >
              <Icon name={item.icon} className="w-5 h-5" />
              <span className="text-md tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Кнопка выхода */}
      <div className="shrink-0 p-4 border-t">
        <button 
          onClick={onLogout} 
          className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-content-muted hover:text-danger transition-colors outline-none"
        >
          Выйти из аккаунта
        </button>
      </div>
      
    </div>
  );
}