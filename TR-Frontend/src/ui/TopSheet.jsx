/********** ФАЙЛ: TR-Frontend\src\ui\TopSheet.jsx **********/

import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

export function TopSheet({ isOpen, onClose, children }) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState('auto');

  useEffect(() => {
    if (isOpen) setDragY(0);
  }, [isOpen]);

  useEffect(() => {
    if (!contentRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContentHeight(entry.target.offsetHeight);
      }
    });
    
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [children]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    
    // Для TopSheet мы разрешаем тянуть шторку только ВВЕРХ (отрицательная дельта)
    if (delta < 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    // Если пользователь свайпнул вверх больше чем на 100px - закрываем шторку
    if (dragY < -100) {
      onClose();
    } else {
      // Иначе возвращаем на место (эффект пружины)
      setDragY(0);
    }
  };

  return (
    <>
      {/* Затемнение фона: используем переменную 'overlay' и специфичный блюр 'overlay' */}
      <div 
        className={clsx(
          "fixed inset-0 bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Сама шторка: выезжает сверху вниз.
          Используем независимые токены 'sheet-bg', 'sheet-border', 'backdrop-blur-sheet' */}
      <div 
        className={clsx(
          "fixed inset-x-0 top-0 z-[110] bg-sheet-bg backdrop-blur-sheet rounded-b-3xl border-b border-sheet-border shadow-lg flex flex-col",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "translate-y-0" : "-translate-y-full"
        )}
        style={{ 
          // Применяем смещение только если тянем вверх (dragY < 0)
          transform: isOpen && dragY < 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY < 0 ? 'none' : ''
        }}
      >
        {/* Обертка с плавной анимацией высоты */}
        <div 
          className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] max-h-[85dvh]"
          style={{ height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px` }}
        >
          <div className="overflow-y-auto scrollbar-hide max-h-[85dvh]">
            {/* pt-[env(safe-area-inset-top)] защищает контент от перекрытия статус-баром на iOS */}
            <div ref={contentRef} className="px-6 pt-[env(safe-area-inset-top)] pt-8 pb-2">
              {children}
            </div>
          </div>
        </div>

        {/* Зона захвата (Drag Handle) перемещена в самый низ шторки */}
        <div 
          className="p-5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>
      </div>
    </>
  );
}