import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { CompactWeek } from './CompactWeek';
import { ExpandedGrid } from './ExpandedGrid';

export function EventCalendar({ currentDate, setCurrentDate, isExpanded, setIsExpanded }) {
  const [contentHeight, setContentHeight] = useState(0);
  
  // Refs для прямого доступа к DOM-узлам без вызова ре-рендера React
  const wrapperRef = useRef(null);
  const contentRef = useRef(null);

  // Refs для хранения данных о свайпе
  const touchStartY = useRef(null);
  const currentOffset = useRef(0);

  // Измеряем реальную высоту контента при загрузке
  useEffect(() => {
    if (!contentRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContentHeight(Math.ceil(entry.target.offsetHeight));
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [currentDate, isExpanded]);

  // Синхронизация стейта isExpanded с DOM (например, при клике на шеврон)
  useEffect(() => {
    if (!wrapperRef.current || !contentRef.current) return;
    
    // Включаем плавную CSS-анимацию
    wrapperRef.current.style.transition = 'height 500ms cubic-bezier(0.32,0.72,0,1)';
    contentRef.current.style.transition = 'transform 500ms cubic-bezier(0.32,0.72,0,1)';
    
    if (isExpanded) {
      wrapperRef.current.style.height = `${contentHeight}px`;
      contentRef.current.style.transform = `translateY(0px)`;
    } else {
      wrapperRef.current.style.height = `0px`;
      contentRef.current.style.transform = `translateY(0px)`;
    }
  }, [isExpanded, contentHeight]);

  const handleDragStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    currentOffset.current = 0;
    
    // Мгновенно отключаем CSS-доводчик, чтобы блок прилип к пальцу
    if (wrapperRef.current) wrapperRef.current.style.transition = 'none';
    if (contentRef.current) contentRef.current.style.transition = 'none';
  }, []);

  const handleDragMove = useCallback((e) => {
    if (touchStartY.current === null) return;
    
    const diff = touchStartY.current - e.touches[0].clientY;

    // Отрабатываем только жест смахивания вверх
    if (diff > 0 && wrapperRef.current && contentRef.current) {
      const newOffset = Math.min(diff, contentHeight);
      currentOffset.current = newOffset;
      
      const newHeight = Math.max(0, contentHeight - newOffset);
      
      // 🔥 ПРЯМАЯ МУТАЦИЯ DOM: Меняем стили в обход React!
      wrapperRef.current.style.height = `${newHeight}px`;
      contentRef.current.style.transform = `translateY(-${newOffset}px)`;
    }
  }, [contentHeight]);

  const handleDragEnd = useCallback(() => {
    if (touchStartY.current === null) return;
    
    // Возвращаем CSS-анимацию (доводчик)
    if (wrapperRef.current) wrapperRef.current.style.transition = 'height 500ms cubic-bezier(0.32,0.72,0,1)';
    if (contentRef.current) contentRef.current.style.transition = 'transform 500ms cubic-bezier(0.32,0.72,0,1)';

    if (currentOffset.current > 50) {
      // Свайпнули достаточно далеко — закрываем (меняем стейт)
      setIsExpanded(false); 
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    } else {
      // Недотянули — отпружиниваем обратно (стейт не трогаем, просто возвращаем стили)
      if (wrapperRef.current) wrapperRef.current.style.height = `${contentHeight}px`;
      if (contentRef.current) contentRef.current.style.transform = `translateY(0px)`;
    }
    
    touchStartY.current = null;
    currentOffset.current = 0;
  }, [contentHeight, setIsExpanded]);

  const dragHandlers = useMemo(() => ({
    onTouchStart: handleDragStart,
    onTouchMove: handleDragMove,
    onTouchEnd: handleDragEnd
  }), [handleDragStart, handleDragMove, handleDragEnd]);

  return (
    <div className="w-full bg-surface-level1 overflow-hidden shadow-[inset_0_8px_8px_-8px_rgba(0,0,0,0.2),inset_0_-8px_8px_-8px_rgba(0,0,0,0.2)]">
      <CompactWeek 
        date={currentDate} 
        onChangeDate={setCurrentDate} 
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
      />
      
      <div 
        ref={wrapperRef}
        className="overflow-hidden will-change-[height]"
        // Начальная инициализация стилей
        style={{ height: isExpanded ? `${contentHeight}px` : '0px' }}
      >
        <div 
          ref={contentRef}
          className="will-change-transform"
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