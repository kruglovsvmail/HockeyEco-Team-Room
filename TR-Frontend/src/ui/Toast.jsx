import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export function Toast({ isOpen, message, type = 'success', onClose, duration = 3000, activeColor = null }) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  // Синхронизация жизненного цикла для поддержки обратной анимации закрытия
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingIn(true);
    } else {
      setIsAnimatingIn(false);
      // Ждем ровно 250мс до завершения анимации масштабирования, затем размонтируем компонент
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Автоматический таймер закрытия тоста
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [isOpen, duration, onClose]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed top-[calc(env(safe-area-inset-top,0px)+16px)] left-1/2 -translate-x-1/2 z-[300] w-full max-w-sm px-4 pointer-events-none">
      
      {/* Изолированные CSS-анимации без использования opacity */}
      <style>
        {`
          @keyframes toastScaleIn {
            0% { transform: scale(0); transform-origin: top center; }
            100% { transform: scale(1); transform-origin: top center; }
          }
          @keyframes toastScaleOut {
            0% { transform: scale(1); transform-origin: top center; }
            100% { transform: scale(0); transform-origin: top center; }
          }
          .animate-toast-in {
            animation: toastScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            will-change: transform;
          }
          .animate-toast-out {
            animation: toastScaleOut 0.25s cubic-bezier(0.25, 1, 0.5, 1) both;
            will-change: transform;
          }
        `}
      </style>

      <div 
        style={activeColor && type === 'success' ? { borderColor: `${activeColor}20` } : {}}
        className={clsx(
          "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl",
          isAnimatingIn ? "animate-toast-in" : "animate-toast-out",
          type === 'success' && "bg-surface-level1 border-surface-border text-content-main",
          type === 'danger' && "bg-[#1a080a]/95 border-red-500/20 text-red-400"
        )}
      >
        {/* Иконка статуса */}
        <div 
          style={activeColor && type === 'success' ? { backgroundColor: `${activeColor}10`, color: activeColor } : {}}
          className={clsx(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
            type === 'success' && !activeColor && "bg-brand/10 text-brand",
            type === 'danger' && "bg-red-500/10 text-red-500"
          )}
        >
          {type === 'success' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>

        {/* Текст уведомления */}
        <div className="text-md font-semibold leading-snug">
          {message}
        </div>
      </div>
    </div>,
    document.body
  );
}