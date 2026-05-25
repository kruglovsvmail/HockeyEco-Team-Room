import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

// Импортируем нашу общую портированную шапку проекта
import { Header } from '../Header';

// Импортируем новые унифицированные компоненты производительности
import { PageLoader } from '../../ui/Loader';
import { FadeIn } from '../../ui/FadeIn';

import { EventDetailsMatch } from './Match/EventDetailsMatch';
import { EventDetailsTraining } from './EventDetailsTraining';
import { EventDetailsMeeting } from './EventDetailsMeeting';

// Настраиваем dayjs
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

export const EventDashboard = ({ isOpen, onClose, data, type, title, user, selectedTeam, onTeamUpdated }) => {
  
  // Локальное состояние готовности контента панели (устраняет выполнение тяжелого JS во время анимации)
  const [isPanelReady, setIsPanelReady] = useState(false);

  // Синхронизация жизненного цикла анимации скольжения шторки на мобильных устройствах
  useEffect(() => {
    if (isOpen) {
      setIsPanelReady(false);
      // Задержка в 400мс идеально координирует завершение движения шторки на 500мс
      const timer = setTimeout(() => {
        setIsPanelReady(true);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setIsPanelReady(false);
    }
  }, [isOpen]);

  return (
    <div 
      className={clsx(
        "fixed inset-0 z-[100] bg-surface-border flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* ИМПОРТИРОВАННАЯ СИСТЕМНАЯ ШАПКА ПРИЛОЖЕНИЯ */}
      <Header 
        isSidebarOpen={true} 
        onToggleSidebar={onClose} 
        user={user}
        selectedTeam={selectedTeam}
        onTeamUpdated={onTeamUpdated}
        hideActions={true}
      />

      {/* КОНТЕНТНАЯ ЗОНА С СТАТИЧНЫМ СДВИГОМ ПОД ВЫСОТУ ШАПКИ И СТАТУС-БАРА */}
      <div 
        className="flex-1 overflow-hidden relative transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          paddingTop: 'calc(60px + env(safe-area-inset-top, 0px))'
        }}
      >
        {!isPanelReady ? (
          <PageLoader />
        ) : (
          <FadeIn className="h-full w-full">
            {type === 'matchDetails' && <EventDetailsMatch event={data} />}
            {type === 'trainingDetails' && <EventDetailsTraining event={data} />}
            {type === 'meetingDetails' && <EventDetailsMeeting event={data} />}
          </FadeIn>
        )}
      </div>
    </div>
  );
};