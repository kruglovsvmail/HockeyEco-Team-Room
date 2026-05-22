import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export const TooltipLP = ({ isOpen, message, position = 'left', onClose }) => {
  if (!isOpen) return null;

  // Используем Портал, чтобы обойти transform-контекст EventDashboard и отрендерить поверх BottomBar
  return createPortal(
    <div
      className={clsx(
        "fixed bottom-[78px] z-[999999] pointer-events-auto",
        "bg-surface-level3 border border-surface-border text-content-main",
        "rounded-2xl px-4 py-3 text-[12px] font-semibold shadow-2xl tracking-wide",
        "animate-slot-enter max-w-[210px] select-none backdrop-blur-md bg-opacity-95",
        position === 'left' ? "left-4" : "right-4"
      )}
      onClick={onClose}
    >
      {/* Хвостик облачка комикса */}
      <div
        className={clsx(
          "absolute -bottom-1.5 w-3 h-3 bg-surface-level3 border-r border-b border-surface-border rotate-45",
          position === 'left' ? "left-8" : "right-8"
        )}
      />
      
      <div className="leading-snug">
        {message}
      </div>
    </div>,
    document.body
  );
};