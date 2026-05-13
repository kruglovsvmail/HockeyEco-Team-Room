import React, { useState, useRef } from 'react';
import { useAccess } from '../hooks/useAccess';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import isoWeek from 'dayjs/plugin/isoWeek';
import { EventCalendar } from '../components/EventCalendar/EventCalendar';

dayjs.extend(isoWeek);
dayjs.locale('ru');

export function SchedulePage() {
  const { selectedTeam } = useAccess();
  
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [isExpanded, setIsExpanded] = useState(false);
  
  const touchStartX = useRef(null);

  const handleTouchStart = (e) => {
    if (isExpanded) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (isExpanded || touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) setCurrentDate(currentDate.add(1, 'week')); 
      else setCurrentDate(currentDate.subtract(1, 'week'));
    }
    touchStartX.current = null;
  };

  return (
    <div 
      className="flex flex-col h-full gap-6 touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="shrink-0 z-40 w-full sticky top-0">
        <EventCalendar 
          currentDate={currentDate} 
          setCurrentDate={setCurrentDate}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
        />
      </div>

      <div className="flex-1 bg-surface-level1 p-6 text-center rounded-3xl mx-4 shadow-sm border border-surface-border/50">
        <p className="text-sm text-content-muted leading-relaxed">
          Матчей в расписании пока нет.
        </p>
      </div>
    </div>
  );
}