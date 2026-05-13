import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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
  const rafRef = useRef(null); // Ссылка для requestAnimationFrame

  useEffect(() => {
    if (!contentRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Округляем высоту, чтобы избежать дробных пикселей (частая причина микро-флагов на Android)
        setContentHeight(Math.ceil(entry.target.offsetHeight));
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [currentDate, isExpanded]);

  // Кэшируем обработчики, чтобы дочерние компоненты не получали новые ссылки на каждом рендере
  const handleDragStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!isDragging || touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = touchStartY.current - currentY;

    // Ограничиваем частоту обновлений с помощью rAF для плавной работы 60fps
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    
    rafRef.current = requestAnimationFrame(() => {
      if (diff > 0) {
        setDragOffset(Math.min(diff, contentHeight));
      } else {
        setDragOffset(0);
      }
    });
  }, [isDragging, contentHeight]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (dragOffset > 50) {
      setIsExpanded(false);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    }
    
    setDragOffset(0);
    touchStartY.current = null;
  }, [isDragging, dragOffset, setIsExpanded]);

  // Собираем хендлеры в один объект
  const dragHandlers = useMemo(() => ({
    onTouchStart: handleDragStart,
    onTouchMove: handleDragMove,
    onTouchEnd: handleDragEnd
  }), [handleDragStart, handleDragMove, handleDragEnd]);

  const currentHeight = isExpanded ? Math.max(0, contentHeight - dragOffset) : 0;

  return (
    <div className="w-full bg-surface-level1 overflow-hidden shadow-[inset_0_8px_8px_-8px_rgba(0,0,0,0.2),inset_0_-8px_8px_-8px_rgba(0,0,0,0.2)]">
      <CompactWeek 
        date={currentDate} 
        onChangeDate={setCurrentDate} 
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
      />
      
      {/* Убрали transition-all, заменили на transition-[height].
        Добавили will-change-[height] для переноса обработки на GPU.
      */}
      <div 
        className={clsx(
          "overflow-hidden will-change-[height]",
          isDragging ? "transition-none" : "transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        )}
        style={{ height: `${currentHeight}px` }}
      >
        <div 
          ref={contentRef}
          className={clsx(
            "will-change-transform",
            isDragging ? "transition-none" : "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          )}
          style={{ transform: `translateY(-${dragOffset}px)` }}
        >
          <ExpandedGrid 
            date={currentDate} 
            onChangeDate={setCurrentDate} 
            onToggleExpand={() => setIsExpanded(!isExpanded)}
            dragHandlers={dragHandlers}
          />
        </div>
      </div>
    </div>
  );
}