import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { getPortalRoot } from '../utils/helpers';

export function BottomSheet({ isOpen, onClose, children }) {
  const panelRef = useRef(null);
  const handleRef = useRef(null); // Реф для хэндла свайпа
  
  const startY = useRef(0);
  const currentTransformY = useRef(0);
  
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState('auto');

  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.style.transform = '';
      panelRef.current.style.transition = '';
      currentTransformY.current = 0;
    }
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

  // НАДЁЖНЫЙ НАТИВНЫЙ ПЕРЕХВАТ СВАЙПА С ДЕФОЛТНЫМ СБРОСОМ ТАЧ-БУФЕРА
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
      
      if (delta > 0 && panelRef.current) {
        currentTransformY.current = delta;
        panelRef.current.style.transform = `translateY(${delta}px)`;
        
        // Отменяем нативный системный скролл осей во время свайпа шторки
        if (e.cancelable) e.preventDefault();
      }
    };

    const onTouchEnd = (e) => {
      if (!panelRef.current) return;

      panelRef.current.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

      if (currentTransformY.current > 100) {
        panelRef.current.style.transform = '';
        
        // 🛠 КРИТИЧЕСКИЙ ФИКС: Гарантированно прерываем инерционный буфер тача браузера,
        // предотвращая "замораживание" экрана и залипание последующих кликов!
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
      <div
        className={clsx(
          "absolute inset-0 bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={clsx(
          "absolute inset-x-0 bottom-0 z-[110] bg-sheet-bg rounded-t-3xl border-t border-sheet-border shadow-sheet-top flex flex-col",
          "transition-transform duration-220 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "translate-y-0 pointer-events-auto" : "translate-y-[calc(100%+50px)] pointer-events-none"
        )}
      >
        {/* Верхняя шторка-индикатор (Вешаем нативный ref) */}
        <div 
          ref={handleRef}
          className="p-5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>

        <div
          className="overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] max-h-[85dvh]"
          style={{ height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px` }}
        >
          <div className="overflow-y-auto scrollbar-hide max-h-[85dvh] overscroll-none">
            <div ref={contentRef} className="px-6" style={{ paddingBottom: 'calc(3rem + env(safe-area-inset-bottom))' }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </>,
    getPortalRoot()
  );
}