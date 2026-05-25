import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export function TopSheet({ isOpen, onClose, children }) {
  const panelRef = useRef(null);
  const handleRef = useRef(null); // Реф для хэндла свайпа
  
  const startY = useRef(0);
  const currentTransformY = useRef(0);
  
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.style.transform = '';
      panelRef.current.style.transition = '';
      currentTransformY.current = 0;
    }
  }, [isOpen]);

  // НАДЁЖНЫЙ НАТИВНЫЙ ПЕРЕХВАТ СВАЙПА ВВЕРХ
  useEffect(() => {
    const handleNode = handleRef.current;
    if (!handleNode) return;

    const onTouchStart = (e) => {
      startY.current = e.touches[0].clientY;
      if (panelRef.current) {
        panelRef.current.style.transition = 'none';
      }
    };

    const onTouchMove = (e) => {
      const currentY = e.touches[0].clientY;
      const delta = currentY - startY.current;
      
      if (delta < 0 && panelRef.current) {
        currentTransformY.current = delta;
        panelRef.current.style.transform = `translateY(${delta}px)`;
        if (e.cancelable) e.preventDefault();
      }
    };

    const onTouchEnd = (e) => {
      if (!panelRef.current) return;

      panelRef.current.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

      if (currentTransformY.current < -80) {
        panelRef.current.style.transform = '';
        
        // 🛠 КРИТИЧЕСКИЙ ФИКС: Обрубаем инерцию тач-движения при закрытии
        if (e.cancelable) e.preventDefault();
        
        onClose();
      } else {
        panelRef.current.style.transform = 'translateY(0px)';
        currentTransformY.current = 0;
      }
    };

    handleNode.addEventListener('touchstart', onTouchStart, { passive: false });
    handleNode.addEventListener('touchmove', onTouchMove, { passive: false });
    handleNode.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      handleNode.removeEventListener('touchstart', onTouchStart);
      handleNode.removeEventListener('touchmove', onTouchMove);
      handleNode.removeEventListener('touchend', onTouchEnd);
    };
  }, [isOpen, onClose]);

  return createPortal(
    <>
      <button 
        type="button"
        aria-label="Закрыть шторку"
        className={clsx(
          "fixed inset-0 w-full h-full bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-300 border-none outline-none p-0 m-0",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div 
        ref={panelRef}
        className={clsx(
          "fixed inset-x-0 top-0 z-[110] bg-sheet-bg rounded-b-3xl border-b border-sheet-border shadow-xl flex flex-col touch-none",
          "transition-transform duration-220 ease-[cubic-bezier(0.32,0.72,0,1)] pt-[env(safe-area-inset-top)] outline-none",
          isOpen ? "translate-y-0" : "-translate-y-[calc(100%+50px)]"
        )}
      >
        <div className="px-6 pt-4 pb-2">
          {children}
        </div>

        {/* Зона захвата (Drag Handle вешаем нативный ref) */}
        <div 
          ref={handleRef}
          className="p-4 pt-2 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>
      </div>
    </>,
    document.body
  );
}