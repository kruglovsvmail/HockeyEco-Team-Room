/********** ФАЙЛ: TR-Frontend\src\components\Calendar\WeeklyPicker.jsx **********/

import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format, isSameWeek } from 'date-fns';
import { ru } from 'date-fns/locale';

export function WeeklyPicker({ onWeekChange }) {
  // Храним любую дату из выбранной недели (по умолчанию сегодня)
  const [currentDate, setCurrentDate] = useState(new Date());

  // Вычисляем границы недели (понедельник - воскресенье)
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });

  // Форматируем строку вида "10 янв - 17 янв"
  const formattedRange = `${format(start, 'd MMM', { locale: ru })} - ${format(end, 'd MMM', { locale: ru })}`;
  
  // Проверяем, является ли выбранная неделя текущей
  const isCurrentWeek = isSameWeek(currentDate, new Date(), { weekStartsOn: 1 });

  // При любом изменении currentDate передаем новые границы наверх
  useEffect(() => {
    if (onWeekChange) {
      onWeekChange({ start, end });
    }
  }, [currentDate]);

  const handlePrevWeek = () => setCurrentDate(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setCurrentDate(prev => addWeeks(prev, 1));
  const handleResetToToday = () => setCurrentDate(new Date());

  return (
    <div className="w-full z-10 relative">
      <div className="flex items-center justify-between bg-white/10 border-[1px] border-surface-border/50 rounded-full p-1">
        
        {/* Кнопка "Назад" */}
        <button 
          onClick={handlePrevWeek}
          className="h-10 w-10 flex items-center justify-center text-content-muted hover:text-content-main transition-colors outline-none active:scale-95 shrink-0"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>

        {/* Центральный блок с датами */}
        <div 
          className="flex flex-col items-center justify-center flex-1 cursor-pointer group"
          onClick={handleResetToToday}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon size={14} className="text-brand opacity-80" strokeWidth={2.5} />
            <span className="text-sm font-bold text-content-main uppercase tracking-widest">
              {formattedRange}
            </span>
          </div>

        </div>

        {/* Кнопка "Вперед" */}
        <button 
          onClick={handleNextWeek}
          className="h-10 w-10 flex items-center justify-center text-content-muted hover:text-content-main transition-colors outline-none active:scale-95 shrink-0"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
        
      </div>
    </div>
  );
}