import React, { useMemo, useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { Icon } from '../../ui/Icon';

const MONTH_BLOCK_WIDTH = 220; 
const GAP_BETWEEN_MONTHS = 1;
const STRIDE = MONTH_BLOCK_WIDTH + GAP_BETWEEN_MONTHS; 
const RENDER_BUFFER = 5;

const MonthView = React.memo(({ baseDate, selectedDate, onSelectDate }) => {
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
    <div className="flex flex-col shrink-0 pb-2 h-full w-[220px] select-none">
      <div className="text-center text-[10px] font-black text-content-main uppercase tracking-widest mb-2 capitalize">
        {baseDate.format('MMMM YYYY')}
      </div>
      <div className="flex flex-1 gap-0 justify-center">
        {weeks.map((week, weekIdx) => {
          const isSelectedWeek = week[0].isSame(selectedDate.startOf('isoWeek'), 'day');
          return (
            <div 
              key={weekIdx} 
              onClick={() => onSelectDate(week[0])}
              className={clsx(
                "flex flex-col items-center w-9 rounded-lg pb-1 cursor-pointer transition-colors duration-200",
                isSelectedWeek 
                  ? "bg-brand-opacity z-10" 
                  : "border-transparent hover:bg-surface-level2"
              )}
            >
              {week.map((day, dayIdx) => (
                <div key={dayIdx} className="w-full flex items-center justify-center h-5">
                  {day.month() === targetMonth ? (
                    <span className={clsx(
                      "text-[10px] font-semibold transition-colors duration-200",
                      isSelectedWeek ? "text-content-main" : "text-content-muted"
                    )}>
                      {day.format('D')}
                    </span>
                  ) : (
                    <div className="w-1 h-1 bg-content-muted/10 rounded-full" />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const ExpandedGrid = React.memo(function ExpandedGrid({ date, onChangeDate, onToggleExpand, dragHandlers }) {
  const [viewDate, setViewDate] = useState(date);
  const isInternalChange = useRef(false);
  const touchStartX = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [offsetIndex, setOffsetIndex] = useState(0);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setViewDate(prev => date.isSame(prev, 'month') ? prev : date);
  }, [date]);

  const slideTo = (direction) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    setTimeout(() => {
      setIsAnimating(false);
      setViewDate(prev => direction === 'next' ? prev.add(1, 'month') : prev.subtract(1, 'month'));
      setOffsetIndex(0); 
    }, 300);
  };

  const handleTouchStart = (e) => {
    e.stopPropagation(); 
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || isAnimating) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 40) {
      if (diff > 0) slideTo('next');
      else slideTo('prev');          
    }
    touchStartX.current = null;
  };

  const handleDateSelect = (selectedDate) => {
    isInternalChange.current = true;
    onChangeDate(selectedDate);
  };

  return (
    <div className="pt-2 touch-pan-y overflow-hidden w-full relative group">
      <style>{`
        @media (max-width: 767px) {
          .mobile-fade-mask {
            -webkit-mask-image: linear-gradient(to right, transparent 0px, rgba(0,0,0,0.24) 16px, rgba(0,0,0,1) 64px, rgba(0,0,0,1) calc(100% - 64px), rgba(0,0,0,0.24) calc(100% - 16px), transparent 100%);
            mask-image: linear-gradient(to right, transparent 0px, rgba(0,0,0,0.24) 16px, rgba(0,0,0,1) 64px, rgba(0,0,0,1) calc(100% - 64px), rgba(0,0,0,0.24) calc(100% - 16px), transparent 100%);
          }
        }
      `}</style>

      <div className="hidden md:block">
        <button 
          onClick={() => slideTo('prev')}
          className="absolute left-4 top-[40%] -translate-y-1/2 z-30 p-2 bg-surface-level1 border border-surface-border rounded-full shadow-lg text-content-main hover:bg-brand hover:text-white transition-all opacity-0 group-hover:opacity-100 outline-none"
        >
          <Icon name="chevron_left" className="w-6 h-6" />
        </button>
        <button 
          onClick={() => slideTo('next')}
          className="absolute right-4 top-[40%] -translate-y-1/2 z-30 p-2 bg-surface-level1 border border-surface-border rounded-full shadow-lg text-content-main hover:bg-brand hover:text-white transition-all opacity-0 group-hover:opacity-100 outline-none"
        >
          <Icon name="chevron_left" className="w-6 h-6 rotate-180" />
        </button>
      </div>

      <div 
        className="flex justify-center w-full mobile-fade-mask"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div 
          className="flex items-start will-change-transform"
          style={{
            gap: `${GAP_BETWEEN_MONTHS}px`,
            transform: `translateX(${-offsetIndex * STRIDE}px)`,
            transition: isAnimating ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
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
              />
            );
          })}
        </div>
      </div>

      <div 
        className="w-full flex justify-center mt-2 py-2 touch-none cursor-grab active:cursor-grabbing"
        {...dragHandlers}
      >
        <button 
          onClick={onToggleExpand}
          className="flex flex-col items-center gap-1 text-content-muted hover:text-brand transition-colors group/chevron outline-none"
        >
          <div className="w-12 h-1.5 bg-surface-border rounded-full group-hover/chevron:bg-brand/30 transition-colors" />
          <Icon name="expand_less" className="w-6 h-6 -mt-1" />
        </button>
      </div>
    </div>
  );
});