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

// Импортируем инструменты контроля подписок и ограничений доступов
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { useAccess } from '../../hooks/useAccess';

import { EventDetailsMatch } from './Match/EventDetailsMatch';
import { EventDetailsTraining } from './EventDetailsTraining';
import { EventDetailsMeeting } from './EventDetailsMeeting';

// Настраиваем dayjs
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

export const EventDashboard = ({ isOpen, onClose, data, type, title, user, selectedTeam, onTeamUpdated }) => {
  
  // Инициализируем хук доступов для проверки прав текущего пользователя
  const { checkAccess } = useAccess(user, selectedTeam);
  
  // Вычисляем допуск к внутренностям события по правилу INTERNAL_VIEW на основе ID команды из события
  const hasAccess = data ? checkAccess('INTERNAL_VIEW', data.my_team_id) : true;

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

  // СЦЕНАРИЙ ОГРАНИЧЕНИЯ: Если подписка отсутствует, бесшовно подменяем экран на шторку-заглушку
  if (!hasAccess) {
    return <SubscriptionStub isOpen={isOpen} onClose={onClose} />;
  }

  return (
    <div 
      className={clsx(
        /* Полностью удалены pt-[env(safe-area-inset-top)] и pb-[env(safe-area-inset-bottom)] */
        "fixed inset-0 z-[100] bg-surface-border flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
        title={title}
      />

      {/* КОНТЕНТНАЯ ЗОНА С СТАТИЧНЫМ СДВИГОМ ПОД ВЫСОТУ ШАПКИ */}
      <div 
        className="flex-1 overflow-hidden relative transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          /* Заменено с динамического calc на фиксированные 60px хедера */
          paddingTop: '60px'
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