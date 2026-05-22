import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export const TooltipLP = ({ isOpen, message, coords, onClose }) => {
  if (!isOpen || !coords) return null;

  const tooltipWidth = 220;
  const padding = 16;

  const { containerLeft, containerBottom, arrowLeft } = useMemo(() => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // 1. Центрируем контейнер облачка по оси X нажимаемого элемента
    let left = coords.x - tooltipWidth / 2;
    
    // Защита от вылета облачка за края экрана смартфона
    if (left < padding) left = padding;
    if (left + tooltipWidth > screenWidth - padding) {
      left = screenWidth - padding - tooltipWidth;
    }

    // 2. Рассчитываем точное смещение хвостика внутри облачка, чтобы он бил в цель
    let arrow = coords.x - left;
    if (arrow < 16) arrow = 16;
    if (arrow > tooltipWidth - 16) arrow = tooltipWidth - 16;

    // 3. Динамически рассчитываем высоту от нижней точки экрана до верха элемента
    // Добавляем ровно 8px зазора, чтобы облачко красиво парило над слотом
    let bottom = screenHeight - coords.y + 8;

    return { containerLeft: left, containerBottom: bottom, arrowLeft: arrow };
  }, [coords]);

  return createPortal(
    <div
      style={{ 
        left: `${containerLeft}px`, 
        bottom: `${containerBottom}px`, 
        width: `${tooltipWidth}px` 
      }}
      className={clsx(
        "fixed z-[999999] pointer-events-auto",
        "bg-surface-level2 border border-surface-border text-content-main",
        "rounded-2xl px-4 py-3 text-[12px] font-semibold shadow-[0_-8px_24px_rgba(0,0,0,0.2)] tracking-wide",
        "animate-slot-enter select-none backdrop-blur-md bg-opacity-95"
      )}
      onClick={onClose}
    >
      {/* Динамический хвостик, бьющий точно по координате клика */}
      <div
        style={{ left: `${arrowLeft}px` }}
        className="absolute -bottom-1.5 w-3 h-3 bg-surface-level3 border-r border-b border-surface-border rotate-45 -translate-x-1/2"
      />
      
      <div className="leading-snug text-center">
        {message}
      </div>
    </div>,
    document.body
  );
};