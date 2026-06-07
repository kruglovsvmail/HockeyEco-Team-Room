import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { DEADLINES } from '../utils/permissions';
import clsx from 'clsx';

export function HintPopover({ status, customContent, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, triggerX: 0 });
  
  // Направление отображения: 'top' (сверху элемента) или 'bottom' (снизу элемента)
  const [placement, setPlacement] = useState('top');

  // Карта текстов ошибок от бэкенда, системы подписок и временных дедлайнов регламента лиги
  const messages = useMemo(() => ({
    no_subscription: 'Действие ограничено. Необходимо продлить подписку.',
    unregistered: 'Вы отзаявлены или покинули команду.',
    not_approved: 'Ваша заявка на турнир еще не одобрена организатором.',
    not_in_team: 'Вы не состоите в игровом составе.',
    not_in_tournament: 'Вы не заявлены на этот турнир.',
    disqualified: 'У вас активная дисквалификация в этом турнире.',
    deadline_lines_edit: `Изменение пятерок заблокировано. До игры осталось меньше ${DEADLINES?.MIDDLE_EDIT_MINUTES || 60} минут.`,
    deadline_roster_submit: `Отправка заблокирована. До игры осталось меньше ${DEADLINES?.ROSTER_SUBMIT_MINUTES || 120} минут.`,
    deadline_player_params: `Изменение параметров игрока заблокировано. До игры осталось меньше ${DEADLINES?.ROSTER_SUBMIT_MINUTES || 120} минут.`,
    not_in_roster: 'Не доступно. Пользователь не в ростере команды',
    match_locked: 'У этой командой есть запланированые или сыграные матчи.'
  }), []);

  const message = messages[status] || 'Действие недоступно.';

  // Длительность анимации (150мс идеально подходит для легких контекстных подсказок)
  const duration = 150;
  
  // Уникальное имя анимации для исключения конфликтов стилей при рендере нескольких окон на экране
  const animationName = `tr-popover-${placement}-${isExiting ? 'exit' : 'enter'}`;

  // Координация жизненного цикла анимации закрытия плашки (размонтирование после завершения opacity)
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsExiting(false);
    } else if (isRendered) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
        setIsExiting(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRendered]);

  // Математический перерасчет позиции плашки в контексте Viewport
  const updatePosition = () => {
    if (!triggerRef.current) return;
    
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = customContent ? 260 : 210; // Адаптируем ширину под хоккейную строку счёта только при наличии контента
    const popoverEstimatedHeight = customContent ? 140 : 75; // Увеличиваем высоту для списка матчей серии
    
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
      top = rect.top + window.scrollY - 8; // Смещение вверх
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
    e.stopPropagation(); // Исключаем моментальный сброс от собственного клика
    if (!isOpen) {
      // Посылаем команду всем остальным поповерам на экране мгновенно закрыться
      window.dispatchEvent(new CustomEvent('close-all-hint-popovers'));
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  // Контроль жизненного цикла закрытия по любому стороннему взаимодействию
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalClick = (event) => {
      // Закрываем окно, если клик произошел вне контейнера текущего триггера
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleGlobalScroll = () => {
      setIsOpen(false);
    };

    const handleGlobalResize = () => {
      setIsOpen(false);
    };

    // Слушатель шинного события закрытия окон при открытии нового поповера на экране
    const handleCloseAllEvent = () => {
      setIsOpen(false);
    };

    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleGlobalResize);
    window.addEventListener('close-all-hint-popovers', handleCloseAllEvent);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, { capture: true });
      window.removeEventListener('resize', handleGlobalResize);
      window.removeEventListener('close-all-hint-popovers', handleCloseAllEvent);
    };
  }, [isOpen]);

  // Generation of dynamic high-performance GPU interpolation rules
  const keyframesStyles = useMemo(() => {
    if (placement === 'top') {
      return `
        @keyframes tr-popover-top-enter {
          0% { opacity: 0; transform: translateY(-100%) translateY(8px) translateZ(0); }
          100% { opacity: 1; transform: translateY(-100%) translateZ(0); }
        }
        @keyframes tr-popover-top-exit {
          0% { opacity: 1; transform: translateY(-100%) translateZ(0); }
          100% { opacity: 0; transform: translateY(-100%) translateY(8px) translateZ(0); }
        }
      `;
    } else {
      return `
        @keyframes tr-popover-bottom-enter {
          0% { opacity: 0; transform: translateY(-8px) translateZ(0); }
          100% { opacity: 1; transform: translateY(0) translateZ(0); }
        }
        @keyframes tr-popover-bottom-exit {
          0% { opacity: 1; transform: translateY(0) translateZ(0); }
          100% { opacity: 0; transform: translateY(-8px) translateZ(0); }
        }
      `;
    }
  }, [placement]);

  // Рендерим плашку подсказки через React Portal на верхний слой DOM-дерева
  const popoverContent = isRendered && createPortal(
    <div 
      className={clsx(
        "fixed z-[9999] bg-surface-level1 border border-surface-border/60 shadow-2xl rounded-xl p-3 select-none pointer-events-auto will-change-transform",
        customContent ? "w-[260px]" : "w-[210px]"
      )}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        animationName: animationName,
        animationDuration: `${duration}ms`,
        animationTimingFunction: 'cubic-bezier(0.21, 1.02, 0.43, 1.01)',
        animationFillMode: 'both'
      }}
    >
      {/* Инжектируем изолированные правила стилей для GPU интерполяции */}
      <style>{keyframesStyles}</style>

      {customContent ? (
        customContent
      ) : (
        <p className="text-[11px] font-semibold text-content-main leading-snug text-center whitespace-normal break-words">
          {message}
        </p>
      )}
      
      {/* Динамическая стрелочка, меняющая положение в зависимости от placement */}
      {placement === 'top' ? (
        <div 
          className="absolute -bottom-1.5 w-3 h-3 bg-surface-level1 border-b border-r border-surface-border/60 rotate-45"
          style={{
            left: `${Math.max(10, Math.min(customContent ? 238 : 188, coords.triggerX - coords.left - 6))}px`
          }}
        />
      ) : (
        <div 
          className="absolute -top-1.5 w-3 h-3 bg-surface-level1 border-t border-l border-surface-border/60 rotate-45"
          style={{
            left: `${Math.max(10, Math.min(customContent ? 238 : 188, coords.triggerX - coords.left - 6))}px`
          }}
        />
      )}
    </div>,
    document.body
  );

  return (
    <div 
      className="inline-flex items-center justify-center relative cursor-pointer w-full h-full" 
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