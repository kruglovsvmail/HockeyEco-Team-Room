import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export function TopSheet({ isOpen, onClose, children }) {
  // text-заменяем стейты рендеринга на рефы, чтобы убрать просадки FPS в Main Thread при свайпах
  const panelRef = useRef(null);
  const startY = useRef(0);
  const currentTransformY = useRef(0);
  
  useEffect(() => {
    if (isOpen && panelRef.current) {
      // Очищаем инлайн-стили при открытии, возвращая управление стандартным классам транзишна
      panelRef.current.style.transform = '';
      panelRef.current.style.transition = '';
      currentTransformY.current = 0;
    }
  }, [isOpen]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    if (panelRef.current) {
      // Жестко выключаем CSS-анимацию на время движения пальца, чтобы шторка не отставала от руки
      panelRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e) => {
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    
    // Перетаскивание вверх (delta < 0) плавно уводит шторку под верхнюю кромку экрана
    if (delta < 0 && panelRef.current) {
      currentTransformY.current = delta;
      // Прямое изменение стиля DOM-элемента (минуя Main Thread и диффинг виртуального дерева)
      panelRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!panelRef.current) return;

    // Возвращаем плавный физический транзишн закрытия/возврата шторки на место
    panelRef.current.style.transition = 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1)';

    if (currentTransformY.current < -80) {
      // Если шторку свайпнули вверх достаточно высоко — сбрасываем стили и вызываем закрытие
      panelRef.current.style.transform = '';
      onClose();
    } else {
      // Если движение было коротким — возвращаем шторку в нулевое положение
      panelRef.current.style.transform = 'translateY(0px)';
      currentTransformY.current = 0;
    }
  };

  // Используем createPortal, чтобы вынести шторку на самый верхний уровень документа
  return createPortal(
    <>
      {/* ОВЕРЛЕЙ: Заменен на <button>, чтобы гарантировать мгновенное срабатывание клика без багов Safari */}
      <button 
        type="button"
        aria-label="Закрыть шторку"
        className={clsx(
          "fixed inset-0 w-full h-full bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-500 border-none outline-none p-0 m-0",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Верхняя шторка */}
      <div 
        ref={panelRef}
        className={clsx(
          "fixed inset-x-0 top-0 z-[110] bg-sheet-bg backdrop-blur-sheet rounded-b-3xl border-b border-sheet-border shadow-xl flex flex-col touch-none",
          "transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] pt-[env(safe-area-inset-top)] outline-none",
          isOpen ? "translate-y-0" : "-translate-y-[calc(100%+50px)]"
        )}
      >
        {/* Контент шторки */}
        <div className="px-6 pt-4 pb-2">
          {children}
        </div>

        {/* Зона захвата (Drag Handle) */}
        <div 
          className="p-4 pt-2 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Индикатор */}
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>
      </div>
    </>,
    document.body
  );
}