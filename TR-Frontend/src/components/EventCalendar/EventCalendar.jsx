import React, { useRef, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CompactWeek } from './CompactWeek';
import { ExpandedGrid } from './ExpandedGrid';

export function EventCalendar({ currentDate, setCurrentDate, isExpanded, setIsExpanded }) {
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef(null);

  // --- Механика Pull-to-Close (Свайп шторки) ---
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(null);

  useEffect(() => {
    if (!contentRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContentHeight(entry.target.offsetHeight);
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [currentDate, isExpanded]);

  const handleDragStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleDragMove = (e) => {
    if (!isDragging || touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = touchStartY.current - currentY;

    // Разрешаем тянуть только вверх
    if (diff > 0) {
      // Ограничиваем сдвиг высотой самого контента
      setDragOffset(Math.min(diff, contentHeight));
    } else {
      setDragOffset(0);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Если потянули больше чем на 50px — закрываем
    if (dragOffset > 50) {
      setIsExpanded(false);
      // Добавляем легкую тактильную отдачу (Haptic Feedback)
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    }
    
    // Сбрасываем оффсет, чтобы сработала плавная CSS-анимация доводчика
    setDragOffset(0);
    touchStartY.current = null;
  };

  // Вычисляем динамическую высоту: изначальная высота минус то, сколько проскроллили
  const currentHeight = isExpanded ? Math.max(0, contentHeight - dragOffset) : 0;

  return (
<div className="w-full bg-surface-level1 overflow-hidden shadow-[inset_0_8px_8px_-8px_rgba(0,0,0,0.2),inset_0_-8px_8px_-8px_rgba(0,0,0,0.2)]">
      <CompactWeek 
        date={currentDate} 
        onChangeDate={setCurrentDate} 
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
      />
      
      {/* Контейнер, который сжимается по высоте */}
      <div 
        className={clsx(
          "overflow-hidden",
          isDragging ? "transition-none" : "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        )}
        style={{ height: `${currentHeight}px` }}
      >
        {/* Контент, который уезжает вверх, чтобы шеврон оставался под пальцем */}
        <div 
          ref={contentRef}
          className={clsx(
            isDragging ? "transition-none" : "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          )}
          style={{ transform: `translateY(-${dragOffset}px)` }}
        >
          <ExpandedGrid 
            date={currentDate} 
            onChangeDate={setCurrentDate} 
            onToggleExpand={() => setIsExpanded(!isExpanded)}
            dragHandlers={{
              onTouchStart: handleDragStart,
              onTouchMove: handleDragMove,
              onTouchEnd: handleDragEnd
            }}
          />
        </div>
      </div>
    </div>
  );
}