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

  const weeksData = useMemo(() => {
    const startOfMonth = baseDate.startOf('month');
    const endOfMonth = baseDate.endOf('month');
    const startGrid = startOfMonth.startOf('isoWeek');
    const endGrid = endOfMonth.startOf('isoWeek');
    const todayStr = dayjs().format('YYYY-MM-DD');

    let weeksArray = [];
    let currentWeek = startGrid;
    
    while (currentWeek.isBefore(endGrid) || currentWeek.isSame(endGrid, 'day')) {
      let days = [];
      for (let j = 0; j < 7; j++) {
        const day = currentWeek.add(j, 'day');
        const dayStr = day.format('YYYY-MM-DD');
        
        days.push({
          day,
          dayLabel: day.format('D'),
          dayStr,
          isToday: dayStr === todayStr,
          isWeekend: j === 5 || j === 6,
          isTargetMonth: day.month() === targetMonth,
        });
      }
      weeksArray.push(days);
      currentWeek = currentWeek.add(1, 'week');
    }
    return weeksArray;
  }, [baseDate, targetMonth]);

  const selectedWeekStr = useMemo(() => {
    return selectedDate.startOf('isoWeek').format('YYYY-MM-DD');
  }, [selectedDate]);

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
        {weeksData.map((week, weekIdx) => {
          const isSelectedWeek = week[0].dayStr === selectedWeekStr;
          
          return (
            <button 
              type="button"
              key={weekIdx} 
              onClick={() => onSelectDate(week[0].day)}
              className={clsx(
                "flex flex-col items-center w-11 rounded-xl pb-2 pt-1 cursor-pointer outline-none transition-colors",
                isSelectedWeek 
                  ? "bg-brand-opacity z-10 shadow-sm" 
                  : "border-transparent bg-transparent md:hover:bg-surface-level2"
              )}
            >
              {week.map((dayObj, dayIdx) => {
                const hasMatch = matchDatesSet?.has(dayObj.dayStr);

                return (
                  <div key={dayIdx} className="w-full flex items-center justify-center h-8 relative border-b border-surface-level3">
                    {dayObj.isToday && (
                      <div className="absolute inset-[2px] border-[1px] border-brand rounded-lg pointer-events-none opacity-50 z-20" />
                    )}

                    {dayObj.isTargetMonth ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-center">
                        <span className={clsx(
                          "text-xs transition-colors duration-200 relative z-10",
                          isSelectedWeek ? "text-content-main font-medium" : (dayObj.isWeekend ? "text-danger font-medium" : "text-content-muted font-medium"),
                          dayObj.isToday && "!text-brand"
                        )}>
                          {dayObj.dayLabel}
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
  
  // Рефы для принудительных нативных тач-событий
  const touchContainerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isHorizontalSwipe = useRef(false);
  const isSwipeLocked = useRef(false);

  const [isAnimating, setIsAnimating] = useState(false);
  const [offsetIndex, setOffsetIndex] = useState(0);
  const animationTimer = useRef(null);

  // Синхронизируем стейт анимации в стабильный реф для нативных слушателей
  const isAnimatingRef = useRef(isAnimating);
  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

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
    if (isAnimatingRef.current) return;
  
    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    if (animationTimer.current) clearTimeout(animationTimer.current);

    animationTimer.current = setTimeout(() => {
      setViewDate(prev => direction === 'next' ? prev.add(1, 'month') : prev.subtract(1, 'month'));
      setOffsetIndex(0); 
      setIsAnimating(false);
    }, 300);
  }, []);

  const handleDateSelect = useCallback((selectedDate) => {
    isInternalChange.current = true;
    onChangeDate(selectedDate);
  }, [onChangeDate]);

  // --- НАДЁЖНЫЙ НАТИВНЫЙ ПЕРЕХВАТ ЖЕСТОВ С ФЛАГОМ { passive: false } ---
  useEffect(() => {
    const el = touchContainerRef.current;
    if (!el) return;

    const handleNativeTouchStart = (e) => {
      if (isAnimatingRef.current) return;
      
      const x = e.touches[0].clientX;
      if (x < 40 || x > window.innerWidth - 40) return;

      touchStartX.current = x;
      touchStartY.current = e.touches[0].clientY;
      isHorizontalSwipe.current = false;
      isSwipeLocked.current = false;
    };

    const handleNativeTouchMove = (e) => {
      if (touchStartX.current === null || isAnimatingRef.current) return;

      const diffX = touchStartX.current - e.touches[0].clientX;
      const diffY = touchStartY.current - e.touches[0].clientY;

      if (!isSwipeLocked.current) {
        if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
          isSwipeLocked.current = true;
          if (Math.abs(diffX) > Math.abs(diffY)) {
            isHorizontalSwipe.current = true;
          } else {
            touchStartX.current = null;
          }
        }
      }

      // Если зафиксирован горизонтальный свайп — отменяем нативный скролл страницы
      if (isHorizontalSwipe.current) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleNativeTouchEnd = (e) => {
      if (touchStartX.current === null || isAnimatingRef.current) {
        touchStartX.current = null;
        return;
      }
      
      const touchEndX = e.changedTouches[0].clientX;
      const diffX = touchStartX.current - touchEndX;

      if (isHorizontalSwipe.current) {
        // 🛠 КРИТИЧЕСКИЙ ФИКС: Вызываем отмену только если свайп преодолел порог в 40px
        // и действительно сменит месяц. Ложные микро-тапы пальцем теперь пролетают насквозь!
        if (Math.abs(diffX) > 40) {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          slideTo(diffX > 0 ? 'next' : 'prev');
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
      isHorizontalSwipe.current = false;
    };

    const handleNativeTouchCancel = () => {
      touchStartX.current = null;
      touchStartY.current = null;
      isHorizontalSwipe.current = false;
      isSwipeLocked.current = false;
    };

    // Вешаем нативные события, обходя ограничения React
    el.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    el.addEventListener('touchend', handleNativeTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleNativeTouchCancel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleNativeTouchStart);
      el.removeEventListener('touchmove', handleNativeTouchMove);
      el.removeEventListener('touchend', handleNativeTouchEnd);
      el.removeEventListener('touchcancel', handleNativeTouchCancel);
    };
  }, [slideTo]);

  return (
    <div 
      className="pt-2 overflow-hidden w-full relative group"
      style={{ touchAction: 'none' }} // Отключает системный пулл-скролл браузера
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
        ref={touchContainerRef}
        className="flex justify-center w-full"
      >
        <div 
          className="flex items-start"
          style={{
            gap: `${GAP_BETWEEN_MONTHS}px`,
            transform: `translateX(${-offsetIndex * STRIDE}px)`,
            transition: isAnimating ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
            willChange: 'transform' // 🛠 УБРАНО pointerEvents: ничто больше искусственно не блокирует клики
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