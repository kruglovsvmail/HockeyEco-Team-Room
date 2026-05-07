/********** ФАЙЛ: TR-Frontend\src\components\Calendar\TrainingCard.jsx **********/

import React, { useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { MapPin, Dumbbell, CalendarRange, ChevronDown } from 'lucide-react';
import { Toggle } from '../../ui/Toggle';
import { AttendanceList } from './AttendanceList';

export function TrainingCard({ event, onToggleAttendance }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className={clsx(
      "w-full bg-surface-level2/40 border border-surface-border/40 rounded-3xl mb-4 overflow-hidden transition-all duration-300",
      isExpanded ? "p-5 pb-3 border-brand/20 bg-surface-level2/80 shadow-inner" : "p-5 shadow-sm"
    )}>
      
      {/* ОСНОВНОЙ КОНТЕНТ: Кликабелен для разворачивания */}
      <div 
        className="flex items-center gap-4 cursor-pointer active:opacity-80 group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Иконка: с бренд-градиентом */}
        <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-warm-start/20 to-brand/10 border border-brand/30 flex items-center justify-center text-brand shadow-sm transition-all duration-300 group-hover:scale-105">
          {/* Lucide-react пока не имеет иконки конька, используем Dumbbell или CalendarRange */}
          <Dumbbell size={22} strokeWidth={2.5} />
        </div>

        {/* Инфо */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 pt-0.5">
            <span className="text-content-main font-bold text-[15px] truncate">
              {event.title || 'Тренировка'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-content-muted leading-none">
            <span>{format(new Date(event.date), 'HH:mm', { locale: ru })}</span>
            <span className="w-1 h-1 rounded-full bg-surface-border"></span>
            <span className="truncate">{event.location_name || 'Локация не указана'}</span>
          </div>
        </div>

        {/* Правая часть: Шеврон */}
        <div className="shrink-0 pt-0.5 pl-1">
          <div className="h-8 w-8 flex items-center justify-center text-content-subtle transition-all duration-300">
            <ChevronDown size={18} className={clsx("transition-transform duration-300", isExpanded && "rotate-180")} />
          </div>
        </div>
      </div>

      {/* ЗОНА ОТМЕТКИ (Тумблер): Выделена матовым фоном */}
      <div className="flex items-center justify-between gap-4 mt-5 p-4 rounded-2xl bg-surface-level2 border border-surface-border/50 relative z-10">
        <div className="text-sm font-medium text-content-main">Я смогу прийти</div>
        <Toggle 
            checked={event.is_user_attending} 
            onChange={(checked) => onToggleAttendance(event.id, 'training', checked)} 
        />
      </div>

      {/* РАЗВЕРНУТАЯ ЗОНА: Список отметившихся */}
      <div className={clsx(
        "transition-all duration-300 ease-in-out",
        isExpanded ? "max-h-[1000px] opacity-100 mt-1" : "max-h-0 opacity-0 overflow-hidden mt-0"
      )}>
        <AttendanceList attendees={event.attendees} />
      </div>
    </div>
  );
}