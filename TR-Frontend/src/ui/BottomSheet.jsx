import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export function BottomSheet({ isOpen, onClose, children }) {
  // Заменяем стейт dragY на refs, чтобы убрать тяжелые перерендеры из Main Thread при свайпах
  const panelRef = useRef(null);
  const startY = useRef(0);
  const currentTransformY = useRef(0);
  
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState('auto');

  useEffect(() => {
    if (isOpen && panelRef.current) {
      // Сбрасываем инлайн-стили при открытии, чтобы шторка плавно выезжала за счет CSS-классов
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

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    if (panelRef.current) {
      // Жестко отключаем CSS-transition на время перетаскивания, чтобы шторка шла за пальцем без задержек
      panelRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e) => {
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    
    if (delta > 0 && panelRef.current) {
      currentTransformY.current = delta;
      // Прямая мутация DOM-ноды на уровне композитных слоев GPU (минуя движок React)
      panelRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!panelRef.current) return;

    // Возвращаем стандартный плавный физический транзишн нашей шторки
    panelRef.current.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

    if (currentTransformY.current > 100) {
      // Если стянули шторку низко — очищаем трансформацию и отдаем скрытие системному классу Tailwind
      panelRef.current.style.transform = '';
      onClose();
    } else {
      // Если свайп был короткий — возвращаем шторку обратно наверх
      panelRef.current.style.transform = 'translateY(0px)';
      currentTransformY.current = 0;
    }
  };

  // Используем Портал, чтобы отрендерить шторку прямо в document.body
  return createPortal(
    <>
      {/* Задний полупрозрачный фон (Бэкдроп) */}
      <div 
        className={clsx(
          "fixed inset-0 bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-500",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Сама шторка */}
      <div 
        ref={panelRef}
        className={clsx(
          "fixed inset-x-0 bottom-0 z-[110] bg-sheet-bg backdrop-blur-sheet rounded-t-3xl border-t border-sheet-border shadow-sheet-top flex flex-col",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "translate-y-0 pointer-events-auto" : "translate-y-[calc(100%+50px)] pointer-events-none"
        )}
      >
        <div 
          className="p-5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>

        <div 
          className="overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] max-h-[85dvh]"
          style={{ height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px` }}
        >
          <div className="overflow-y-auto scrollbar-hide max-h-[85dvh] overscroll-none">
            <div className="px-6 pb-8 pb-safe">
              <div ref={contentRef}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}