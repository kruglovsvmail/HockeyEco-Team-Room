import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

export function TopSheet({ isOpen, onClose, children }) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  
  useEffect(() => {
    if (isOpen) setDragY(0);
  }, [isOpen]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    
    // Позволяем тянуть шторку только ВВЕРХ (отрицательная дельта)
    if (delta < 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    // Если потянули вверх больше чем на 80px — закрываем
    if (dragY < -80) {
      onClose();
    } else {
      setDragY(0); // Иначе отпружиниваем обратно
    }
  };

  return (
    <>
      {/* Затемнение фона */}
      <div 
        className={clsx(
          "fixed inset-0 bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-500",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Верхняя шторка */}
      <div 
        className={clsx(
          "fixed inset-x-0 top-0 z-[110] bg-sheet-bg backdrop-blur-sheet rounded-b-3xl border-b border-sheet-border shadow-xl flex flex-col",
          "transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] pt-[env(safe-area-inset-top)]",
          isOpen ? "translate-y-0" : "-translate-y-[calc(100%+50px)]"
        )}
        style={{ 
          transform: isOpen && dragY < 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY < 0 ? 'none' : ''
        }}
      >
        {/* Контент шторки */}
        <div className="px-6 pt-4 pb-2">
          {children}
        </div>

        {/* Зона захвата (Drag Handle) в самом НИЗУ шторки */}
        <div 
          className="p-4 pt-2 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Индикатор */}
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>
      </div>
    </>
  );
}