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
    <div className="w-full px-6 py-4 z-10 relative">
      <div className="flex items-center justify-between bg-surface-level2/60 backdrop-blur-md border border-surface-border/50 rounded-2xl p-2 shadow-sm">
        
        {/* Кнопка "Назад" */}
        <button 
          onClick={handlePrevWeek}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-base/50 text-content-muted hover:text-content-main transition-colors outline-none active:scale-95 shrink-0"
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
          
          {/* Маленькая подсказка, если мы не на текущей неделе */}
          <div className="h-4 mt-0.5 overflow-hidden flex items-center justify-center">
            <span className={clsx(
              "text-[10px] font-medium uppercase tracking-widest text-brand transition-all duration-300",
              !isCurrentWeek ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}>
              Вернуться к сегодня
            </span>
          </div>
        </div>

        {/* Кнопка "Вперед" */}
        <button 
          onClick={handleNextWeek}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-base/50 text-content-muted hover:text-content-main transition-colors outline-none active:scale-95 shrink-0"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
        
      </div>
    </div>
  );
}