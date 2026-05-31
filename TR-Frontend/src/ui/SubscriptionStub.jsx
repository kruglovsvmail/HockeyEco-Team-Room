import React, { useEffect } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

/**
 * Универсальный полноэкранный экран-заглушка ограничения доступа по подписке.
 * Выезжает справа как шторка на всю ширину экрана.
 * * @param {boolean} isOpen - Флаг видимости шторки
 * @param {function} onClose - Обработчик клика по кнопке "Назад" или закрытия
 * @param {string} title - Кастомный заголовок экрана (необязательно)
 * @param {string} description - Кастомный текст описания ограничения (необязательно)
 */
export function SubscriptionStub({ 
  isOpen, 
  onClose, 
  title = 'Доступ ограничен', 
  description = 'Для просмотра деталей и взаимодействия с данным разделом необходимо оформить продлить подписку.' 
}) {

  // Блокируем скролл основного интерфейса PWA под шторкой, когда она открыта
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [isOpen]);

  return (
    <div
      className={clsx(
        // Полноэкранный фиксированный контейнер на самом верхнем слое
        "fixed inset-0 z-[999] flex flex-col w-full h-full bg-surface-base transition-transform duration-500",
        "ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform overscroll-none select-none",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      
      {/* МИНИМАЛИСТИЧНЫЙ ХЕДЕР ШТОРКИ */}
      <header className="flex items-center justify-between px-4 h-[60px] border-b border-surface-border/20 shrink-0 bg-surface-level1/60 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 text-content-muted hover:text-brand active:scale-95 transition-all outline-none cursor-pointer flex items-center justify-center rounded-full"
        >
          <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
        </button>
        <span className="text-[11px] font-bold uppercase tracking-widest text-content-muted">
          HockeyEco
        </span>
        <div className="w-7 h-7 opacity-0 pointer-events-none" /> {/* Фантомный распор для центрирования */}
      </header>

      {/* ЦЕНТРАЛЬНЫЙ КОНТЕНТ (МАТОВОЕ СТЕКЛО И МИНИМАЛИЗМ) */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-surface-base via-surface-level1/30 to-surface-base">
        
        {/* Композиция иконки с эффектом неонового предупреждения */}
        <div className="relative flex items-center justify-center w-20 h-20 mb-8 rounded-2xl bg-danger/10 border border-danger/20 text-danger animate-pulse shadow-[0_0_40px_rgba(255,59,48,0.15)]">
          <Icon name="shield_alert" className="w-10 h-10" />
          <div className="absolute inset-0 rounded-2xl border border-danger/40 scale-110 opacity-30 pointer-events-none" />
        </div>

        {/* Заголовок с четкой иерархией */}
        <h2 className="text-xl font-extrabold text-content-main tracking-tight mb-3 px-4">
          {title}
        </h2>

        {/* Описание ограничения */}
        <p className="text-sm font-medium text-content-muted leading-relaxed max-w-sm mb-10 px-2 opacity-80">
          {description}
        </p>

      </div>

      {/* ФУТЕР ДЛЯ СОХРАНЕНИЯ ОЩУЩЕНИЯ НАИВНОГО ПРИЛОЖЕНИЯ */}
      <footer className="h-8 bg-surface-base shrink-0 border-t border-surface-border/10 flex items-center justify-center opacity-40">
        <span className="text-[9px] font-medium text-content-muted tracking-wider">
          Защищено сквозным rbac-шифрованием
        </span>
      </footer>

    </div>
  );
}