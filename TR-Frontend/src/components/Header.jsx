import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { TopSheet } from '../ui/TopSheet';
import { useLocation } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { TeamProfileEditSheet } from './MyTeam/TeamProfileEditSheet';

export function Header({ isSidebarOpen, onToggleSidebar, user, selectedTeam, onTeamUpdated, hideActions = false }) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const location = useLocation();
  const { checkAccess } = useAccess(user, selectedTeam);

  const isSchedulePage = location.pathname === '/';
  const isMyTeamPage = location.pathname === '/my-team';
  const hasEditAccess = checkAccess('TEAM_EDIT_PROFILE');

  const openCalendar = () => {
    window.dispatchEvent(new Event('open-calendar-sheet'));
  };

  return (
    <>
      {/* Чистая фиксированная высота шапки без динамических сдвигов под баннеры */}
      <header 
        className="absolute top-0 left-0 right-0 flex flex-col z-40 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden"
        style={{
          height: 'calc(60px + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)' // Сдвигаем контент ниже системного статус-бара устройства
        }}
      >
        
        {/* Основной контент оригинального хедера */}
        <div className="flex-1 flex items-center justify-between p-4 h-[60px] w-full">
          <button 
            onClick={onToggleSidebar}
            className="md:hidden p-2 bg-white/40 rounded-full text-content-main hover:text-brand transition-colors outline-none"
            aria-label="Menu"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Раздел РАСПИСАНИЕ: календарь и фильтры */}
          {isSchedulePage && !hideActions && (
            <div className="flex items-center gap-3 ml-auto">
              <button 
                onClick={openCalendar}
                className="p-2 text-content-main bg-white/40 rounded-full hover:text-brand transition-colors outline-none"
                aria-label="Календарь"
              >
                <Icon name="calendar" className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsFilterOpen(true)}
                className="p-2 text-content-main bg-white/40 rounded-full hover:text-brand transition-colors outline-none"
                aria-label="Фильтр"
              >
                <Icon name="filter" className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Раздел МОЯ КОМАНДА: кнопка изменения параметров */}
          {isMyTeamPage && hasEditAccess && !hideActions && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setIsEditOpen(true)}
                className="p-2 bg-white/40 rounded-full text-content-main hover:text-brand transition-colors outline-none cursor-pointer active:scale-95"
                aria-label="Редактировать профиль команды"
              >
                <Icon name="edit" className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Шторка Фильтра календаря */}
      <TopSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
        <div className="p-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-level2 text-brand shadow-sm">
            <Icon name="filter" className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-content-main mb-2">Фильтры</h2>
          <p className="text-sm text-content-muted leading-relaxed pb-6">
            Фильтрация по командам и событиям находится в разработке.
          </p>
        </div>
      </TopSheet>

      {/* Выделенная изолированная шторка редактирования профиля команды */}
      <TeamProfileEditSheet 
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        selectedTeam={selectedTeam}
        user={user}
        onTeamUpdated={onTeamUpdated}
      />
    </>
  );
}