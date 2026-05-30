import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function HintPopover({ status, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, triggerX: 0 });
  
  // Переменная направления отображения: 'top' (сверху кнопки) или 'bottom' (снизу кнопки)
  const [placement, setPlacement] = useState('top');

  // Карта текстов ошибок от бэкенда и системы подписок
  const messages = {
    no_subscription: 'Действие ограничено. Необходимо продлить подписку.',
    unregistered: 'Вы отзаявлены или покинули команду.',
    not_approved: 'Ваша заявка на турнир еще не одобрена организатором.',
    not_in_team: 'Вы не состоите в игровом составе.',
    not_in_tournament: 'Вы не заявлены на этот турнир.',
    disqualified: 'У вас активная дисквалификация в этом турнире.',
  };

  const message = messages[status] || 'Действие недоступно.';

  // Математический перерасчет позиции плашки в контексте Viewport
  const updatePosition = () => {
    if (!triggerRef.current) return;
    
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 210; // Фиксированная базовая ширина плашки
    const popoverEstimatedHeight = 75; // Примерная высота плашки с текстом и отступами
    
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    let top = 0;
    let currentPlacement = 'top';

    // УМНЫЙ ПЕРЕКЛЮЧАТЕЛЬ НАПРАВЛЕНИЯ: 
    // Если от верхней границы кнопки до края экрана места меньше, чем высота поповера + отступ — кидаем его вниз
    if (rect.top - popoverEstimatedHeight < 12) {
      currentPlacement = 'bottom';
    }

    // Горизонтальный бампер: не даем поповеру вылететь за безопасные боковые края экрана (12px)
    const screenPadding = 12;
    if (left < screenPadding) {
      left = screenPadding;
    } else if (left + popoverWidth > window.innerWidth - screenPadding) {
      left = window.innerWidth - popoverWidth - screenPadding;
    }

    // Расчет вертикальной координаты в зависимости от выбранного направления
    if (currentPlacement === 'top') {
      top = rect.top + window.scrollY - 8; // Смещение вверх (с последующим сдвигом transform)
    } else {
      top = rect.bottom + window.scrollY + 8; // Смещение строго под нижнюю границу кнопки
    }

    setPlacement(currentPlacement);
    setCoords({
      top,
      left,
      triggerX: rect.left + rect.width / 2
    });
  };

  // Переключение состояния видимости
  const handleToggle = (e) => {
    e.stopPropagation(); // Исключаем моментальное закрытие от собственного клика по контейнеру
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  // Контроль жизненного цикла закрытия по любому стороннему взаимодействию
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalClick = () => {
      setIsOpen(false);
    };

    const handleGlobalScroll = () => {
      setIsOpen(false);
    };

    const handleGlobalResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleGlobalResize);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, { capture: true });
      window.removeEventListener('resize', handleGlobalResize);
    };
  }, [isOpen]);

  // Рендерим плашку через React Portal в document.body
  const popoverContent = isOpen && createPortal(
    <div 
      className="fixed z-[9999] w-[210px] bg-surface-level1 border border-surface-border/60 shadow-2xl rounded-xl p-3 animate-in fade-in zoom-in-95 duration-150 ease-out select-none pointer-events-auto"
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        // Если летит вверх — смещаем точку привязки через translateY, если вниз — рендерим от базовой точки без трансформации
        transform: placement === 'top' ? 'translateY(-100%)' : 'none',
      }}
    >
      <p className="text-[11px] font-semibold text-content-main leading-snug text-center whitespace-normal break-words">
        {message}
      </p>
      
      {/* Динамическая стрелочка, меняющая положение и рамки в зависимости от placement */}
      {placement === 'top' ? (
        <div 
          className="absolute -bottom-1.5 w-3 h-3 bg-surface-level1 border-b border-r border-surface-border/60 rotate-45"
          style={{
            left: `${Math.max(10, Math.min(188, coords.triggerX - coords.left - 6))}px`
          }}
        />
      ) : (
        <div 
          className="absolute -top-1.5 w-3 h-3 bg-surface-level1 border-t border-l border-surface-border/60 rotate-45"
          style={{
            left: `${Math.max(10, Math.min(188, coords.triggerX - coords.left - 6))}px`
          }}
        />
      )}
    </div>,
    document.body
  );

  return (
    <div 
      className="inline-flex items-center justify-center relative cursor-pointer" 
      ref={triggerRef}
      onClick={handleToggle}
    >
      {children ? (
        children
      ) : (
        <button 
          type="button"
          className="text-danger/80 hover:text-danger active:scale-95 transition-all p-1 flex items-center justify-center outline-none cursor-pointer"
        >
          <Icon name="shield_alert" className="w-7 h-7" />
        </button>
      )}
      {popoverContent}
    </div>
  );
}