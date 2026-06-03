import React from 'react';
import { Menu, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export function Header({ isSidebarOpen, onToggleSidebar, user, teams, selectedTeam, onTeamUpdated, hideActions = false }) {
  const location = useLocation();

  // Интеллектуальное определение заголовка раздела с гибким поиском по подстроке (.includes)
  // Это гарантирует корректный показ названия, даже если пути вложенные или содержат префиксы типа /manager/
  const getSectionTitle = () => {
    const path = location.pathname.toLowerCase();
    
    if (path.includes('my-team')) {
      return 'Состав команды';
    }
    if (path.includes('handbook')) {
      return 'Справочник команды';
    }
    // Если в пути одновременно фигурируют "event" и "create" (подходит под /events/create, /create-event, /manager/events/create)
    if (path.includes('event') && path.includes('create')) {
      return 'Создание события';
    }
    
    return '';
  };

  return (
    <header 
      className="absolute top-0 left-0 right-0 flex flex-col z-40 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden"
      style={{
        height: '60px',
        paddingTop: '0px' 
      }}
    >
      {/* Основной контент оригинального хедера */}
      <div className="flex-1 flex items-center justify-between p-4 h-[60px] w-full relative">
        <button 
          onClick={onToggleSidebar}
          className="p-2 bg-white/20 rounded-xl text-content-main hover:text-brand transition-colors outline-none z-10"
          aria-label="Menu"
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* АБСОЛЮТНО ЦЕНТРИРОВАННЫЙ ЗАГОЛОВОК ТЕКУЩЕГО РАЗДЕЛА */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[14px] font-semibold uppercase tracking-widest text-content-main pointer-events-none whitespace-nowrap text-center">
          {getSectionTitle()}
        </div>

        {/* Пустая заглушка справа для идеального Flex-баланса */}
        <div className="w-9 h-9 opacity-0 pointer-events-none" />
      </div>
    </header>
  );
}