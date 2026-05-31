import React, { useState, useMemo } from 'react';
import { Menu, X } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { TopSheet } from '../ui/TopSheet';
import { useLocation } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { TeamProfileEditSheet } from './MyTeam/TeamProfileEditSheet';
import { EventFilters } from './EventCalendar/EventFilters';
import { HintPopover } from '../ui/HintPopover';

export function Header({ isSidebarOpen, onToggleSidebar, user, teams, selectedTeam, onTeamUpdated, hideActions = false }) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const location = useLocation();
  const { checkAccess } = useAccess(user, selectedTeam);

  const isSchedulePage = location.pathname === '/';
  const isMyTeamPage = location.pathname === '/my-team';
  
  // Проверяем наличие прав на редактирование профиля команды по матрице доступов (учитывает тариф подписки)
  const hasEditAccess = checkAccess('TEAM_EDIT_PROFILE');

  // ЖЕСТКИЙ РОЛЕВОЙ ЗАСЛОН: Вычисляем, имеет ли право пользователь вообще видеть кнопку редактирования
  const canSeeEditButton = useMemo(() => {
    if (!user || !selectedTeam) return false;
    
    // Проверяем, является ли текущий пользователь создателем/владельцем команды
    const isTeamOwner = String(selectedTeam.owner_id) === String(user.id);
    
    // Разбираем локальные роли пользователя в рамках выбранной команды
    const teamRoles = selectedTeam.user_role?.split(',').map(r => r.trim().toLowerCase()) || [];
    
    // Проверяем глобального суперадмина платформы
    const isGlobalAdmin = user.global_role === 'admin' || user.globalRole === 'admin';

    // Кнопка рендерится только для Owner, роли team_manager или глобального админа платформы
    return isTeamOwner || teamRoles.includes('team_manager') || isGlobalAdmin;
  }, [user, selectedTeam]);

  const openCalendar = () => {
    window.dispatchEvent(new Event('open-calendar-sheet'));
  };

  return (
    <>
      {/* Шапка приведена к строгим 60px высоты без системных safe-area сдвигов */}
      <header 
        className="absolute top-0 left-0 right-0 flex flex-col z-40 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden"
        style={{
          height: '60px',
          paddingTop: '0px' 
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

          {/* Раздел МОЯ КОМАНДА: кнопка изменения параметров (видна только разрешенным ролям, тухнет без подписки) */}
          {isMyTeamPage && canSeeEditButton && !hideActions && (
            <div className="flex items-center gap-1 ml-auto">
              {hasEditAccess ? (
                /* Сценарий с подпиской: полнофункциональная кнопка, открывающая шторку */
                <button
                  onClick={() => setIsEditOpen(true)}
                  className="p-2 bg-white/40 rounded-full text-content-main hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center justify-center"
                  aria-label="Редактировать профиль команды"
                >
                  <Icon name="edit" className="w-5 h-5" />
                </button>
              ) : (
                /* Сценарий БЕЗ подписки: кнопка «потухла» (opacity-30) и завернута в поповер ограничений */
                <HintPopover status="no_subscription">
                  <button
                    type="button"
                    className="p-2 bg-white/10 border border-white/5 rounded-full text-content-main opacity-30 transition-all outline-none cursor-pointer flex items-center justify-center"
                    aria-label="Редактирование профиля ограничено подпиской"
                  >
                    <Icon name="edit" className="w-5 h-5" />
                  </button>
                </HintPopover>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Шторка Фильтра календаря с новым изолированным компонентом */}
      <TopSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
        <EventFilters 
          user={user}
          teams={teams}
          onClose={() => setIsFilterOpen(false)}
        />
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