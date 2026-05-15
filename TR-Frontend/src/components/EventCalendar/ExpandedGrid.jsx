import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { Icon } from '../../ui/Icon';

const MONTH_BLOCK_WIDTH = 340; 
const GAP_BETWEEN_MONTHS = 16;
const STRIDE = MONTH_BLOCK_WIDTH + GAP_BETWEEN_MONTHS; 

const RENDER_BUFFER = 1;

const MonthView = React.memo(({ baseDate, selectedDate, onSelectDate, onPrev, onNext, matchDatesSet }) => {
  const targetMonth = baseDate.month();

  const weeks = useMemo(() => {
    const startOfMonth = baseDate.startOf('month');
    const endOfMonth = baseDate.endOf('month');
    const startGrid = startOfMonth.startOf('isoWeek');
    const endGrid = endOfMonth.startOf('isoWeek');
    
    let weeksArray = [];
    let currentWeek = startGrid;
    
    while (currentWeek.isBefore(endGrid) || currentWeek.isSame(endGrid, 'day')) {
      let days = [];
      for (let j = 0; j < 7; j++) {
        days.push(currentWeek.add(j, 'day'));
      }
      weeksArray.push(days);
      currentWeek = currentWeek.add(1, 'week');
    }
    return weeksArray;
  }, [baseDate]);

  return (
    <div className="flex flex-col shrink-0 pb-4 h-full w-[340px] select-none [contain:content]">
      
      {/* Шапка месяца */}
      <div className="flex items-center justify-center px-2 mb-4 relative h-10">
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }} 
          className="md:hidden absolute left-0 p-2 text-content-muted outline-none border-none bg-transparent"
        >
          <Icon name="chevron_left" className="w-4 h-4" />
        </button>
        
        <div className="text-center text-sm font-black text-content-main uppercase tracking-widest capitalize">
          {baseDate.format('MMMM YYYY')}
        </div>

        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }} 
          className="md:hidden absolute right-0 p-2 text-content-muted outline-none border-none bg-transparent rotate-180"
        >
          <Icon name="chevron_left" className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 gap-1 justify-center relative">
        {/* Колонка Дней Недели */}
        <div className="flex flex-col w-7 pt-1 shrink-0 mr-1">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dow, idx) => (
            <div key={idx} className={clsx(
              "w-full flex items-center justify-center h-8 text-[10px] font-bold relative border-b border-surface-level3",
              (idx === 5 || idx === 6) ? "text-danger" : "text-content-subtle"
            )}>
              {dow}
            </div>
          ))}
        </div>

        {/* Сетка недель */}
        {weeks.map((week, weekIdx) => {
          const isSelectedWeek = week[0].isSame(selectedDate.startOf('isoWeek'), 'day');
          
          return (
            <button 
              type="button"
              key={weekIdx} 
              onClick={() => onSelectDate(week[0])}
              className={clsx(
                "flex flex-col items-center w-11 rounded-xl pb-2 pt-1 cursor-pointer outline-none transition-colors",
                isSelectedWeek 
                  ? "bg-brand-opacity z-10 shadow-sm" 
                  : "border-transparent bg-transparent md:hover:bg-surface-level2"
              )}
            >
              {week.map((day, dayIdx) => {
                const isToday = day.isSame(dayjs(), 'day');
                const isWeekend = dayIdx === 5 || dayIdx === 6;
                const isTargetMonth = day.month() === targetMonth;

                const dayStr = day.format('YYYY-MM-DD');
                const hasMatch = matchDatesSet?.has(dayStr);

                return (
                  <div key={dayIdx} className="w-full flex items-center justify-center h-8 relative border-b border-surface-level3">
                    {isToday && (
                      <div className="absolute inset-[2px] border-[1px] border-brand rounded-lg pointer-events-none opacity-50 z-20" />
                    )}

                    {isTargetMonth ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-center">
                        <span className={clsx(
                          "text-xs transition-colors duration-200 relative z-10",
                          isSelectedWeek ? "text-content-main font-medium" : (isWeekend ? "text-danger/90 font-medium" : "text-content-muted font-medium"),
                          isToday && "!text-brand"
                        )}>
                          {day.format('D')}
                        </span>
                        
                        {hasMatch && (
                          <div className="absolute bottom-1 w-1 h-1 rounded-full bg-brand shadow-sm z-10" />
                        )}
                      </div>
                    ) : (
                      <div className="w-1.5 h-1.5 bg-content-muted/20 rounded-full relative z-10" />
                    )}
                  </div>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export const ExpandedGrid = React.memo(function ExpandedGrid({ date, onChangeDate, matchDatesSet }) {
  const [viewDate, setViewDate] = useState(date);
  const isInternalChange = useRef(false);
  
  // Рефы для идеального свайпа
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isHorizontalSwipe = useRef(false);
  const isSwipeLocked = useRef(false);

  const [isAnimating, setIsAnimating] = useState(false);
  const [offsetIndex, setOffsetIndex] = useState(0);
  const animationTimer = useRef(null);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setViewDate(prev => date.isSame(prev, 'month') ? prev : date);
  }, [date]);

  useEffect(() => {
    return () => {
      if (animationTimer.current) clearTimeout(animationTimer.current);
    };
  }, []);

  const slideTo = useCallback((direction) => {
    if (isAnimating) return;
  
    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    if (animationTimer.current) clearTimeout(animationTimer.current);

    animationTimer.current = setTimeout(() => {
      setIsAnimating(false);
      setViewDate(prev => direction === 'next' ? prev.add(1, 'month') : prev.subtract(1, 'month'));
      setOffsetIndex(0); 
    }, 290);
  }, [isAnimating]);

  const handleDateSelect = useCallback((selectedDate) => {
    isInternalChange.current = true;
    onChangeDate(selectedDate);
  }, [onChangeDate]);

  // --- ОБРАБОТКА СВАЙПОВ ---
  const handleTouchStart = (e) => {
    if (isAnimating) return;
    
    const x = e.touches[0].clientX;
    
    // Блокировка системного Edge Swipe (Safari) - 40px мертвой зоны
    if (x < 40 || x > window.innerWidth - 40) return;

    touchStartX.current = x;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;
    isSwipeLocked.current = false;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null || isAnimating) return;

    const diffX = touchStartX.current - e.touches[0].clientX;
    const diffY = touchStartY.current - e.touches[0].clientY;

    if (!isSwipeLocked.current) {
      // Порог чувствительности (6px) для предотвращения фантомных жестов
      if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
        isSwipeLocked.current = true;
        if (Math.abs(diffX) > Math.abs(diffY)) {
          isHorizontalSwipe.current = true;
        } else {
          // Вертикальное движение отсекаем
          touchStartX.current = null;
        }
      }
    }
    
    // ИЗМЕНЕНО: Удален конфликтный вызов e.preventDefault(). 
    // Благодаря touchAction: 'none' на контейнере, браузер сам блокирует скролл без ошибок React.
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || isAnimating) {
      touchStartX.current = null;
      return;
    }
    
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX.current - touchEndX;

    if (isHorizontalSwipe.current && Math.abs(diffX) > 40) {
      if (diffX > 0) slideTo('next');
      else slideTo('prev');
    }

    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = false;
  };

  return (
    <div 
      className="pt-2 overflow-hidden w-full relative group"
      style={{ touchAction: 'none' }} // Отключает абсолютно все системные жесты внутри календаря на уровне CSS
    >
      {/* Кнопки переключения для десктопа/планшета */}
      <div className="hidden md:block">
        <button 
          onClick={() => slideTo('prev')}
          className="absolute left-4 top-[55%] -translate-y-1/2 z-30 p-2 bg-surface-level1 border border-surface-border rounded-full shadow-lg text-content-main outline-none md:hover:bg-brand md:hover:text-white transition-all opacity-0 md:group-hover:opacity-100"
        >
          <Icon name="chevron_left" className="w-6 h-6" />
        </button>
        <button 
          onClick={() => slideTo('next')}
          className="absolute right-4 top-[55%] -translate-y-1/2 z-30 p-2 bg-surface-level1 border border-surface-border rounded-full shadow-lg text-content-main outline-none md:hover:bg-brand md:hover:text-white transition-all opacity-0 md:group-hover:opacity-100"
        >
          <Icon name="chevron_left" className="w-6 h-6 rotate-180" />
        </button>
      </div>

      {/* Зона перехвата жестов */}
      <div 
        className="flex justify-center w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          className="flex items-start"
          style={{
            gap: `${GAP_BETWEEN_MONTHS}px`,
            transform: `translateX(${-offsetIndex * STRIDE}px)`,
            transition: isAnimating ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
            pointerEvents: isAnimating ? 'none' : 'auto', 
            willChange: 'transform' 
          }}
        >
          {Array.from({ length: RENDER_BUFFER * 2 + 1 }, (_, i) => i - RENDER_BUFFER).map(offset => {
            const currentMonthDate = viewDate.add(offset, 'month');
            return (
              <MonthView 
                key={currentMonthDate.format('YYYY-MM')} 
                baseDate={currentMonthDate} 
                selectedDate={date} 
                onSelectDate={handleDateSelect}
                onPrev={() => slideTo('prev')}
                onNext={() => slideTo('next')}
                matchDatesSet={matchDatesSet} 
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});