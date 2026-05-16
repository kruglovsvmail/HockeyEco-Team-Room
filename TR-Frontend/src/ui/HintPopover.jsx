import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

export function HintPopover({ status }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Карта текстов ошибок от бэкенда
  const messages = {
    unregistered: 'Вы отзаявлены или покинули команду.',
    not_approved: 'Ваша заявка на турнир еще не одобрена организатором.',
    not_in_team: 'Вы не состоите в игровом составе.',
    not_in_tournament: 'Вы не заявлены на этот турнир.',
    disqualified: 'У вас активная дисквалификация в этом турнире.',
  };

  const message = messages[status] || 'Действие недоступно.';

  // Закрытие по клику вне
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative flex items-center" ref={popoverRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-danger/80 hover:text-danger transition-colors p-1"
      >
        <Icon name="shield_alert" className="w-7 h-7" />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-48 bg-surface-level1 border border-surface-border/50 shadow-lg rounded-xl p-3 z-50 animate-in fade-in zoom-in duration-200">
          <p className="text-[11px] font-medium text-content-main leading-snug text-center">
            {message}
          </p>
          {/* Треугольник-стрелочка */}
          <div className="absolute -bottom-1.5 right-3 w-3 h-3 bg-surface-level1 border-b border-r border-surface-border/50 rotate-45" />
        </div>
      )}
    </div>
  );
}