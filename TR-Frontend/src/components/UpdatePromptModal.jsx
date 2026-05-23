import React from 'react';
import { Icon } from '../ui/Icon';
import { ButtonLP } from '../ui/Button-LP';

export function UpdatePromptModal({ isOpen, onUpdate, onLater }) {
  if (!isOpen) return null;

  // Текст со списком обновлений текущего релиза (меняешь перед деплоем)
  const changelog = [
    "Статистика, теперь считаем взгляды тренера, полные надежды и отчаяния.",
    "Статистика считает голы и литры фанатских слёз.",
    "Индикатор режима офлайн."
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
      {/* Мягкое размытие заднего фона всего приложения */}
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onLater} />
      
      {/* Карточка модального окна */}
      <div className="bg-surface-level1 border border-surface-border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 flex flex-col gap-5 animate-scale-in text-left">
        
        {/* Иконка и Заголовок */}
        <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Icon name="refresh" className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-sm font-black text-content-main uppercase tracking-wider leading-none">
              Доступно обновление
            </h3>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-1 block">
              Новая версия приложения
            </span>
          </div>
        </div>

        {/* Список изменений (Changelog) */}
        <div className="flex flex-col gap-2.5 max-h-[30vh] overflow-y-auto scrollbar-hide py-1">
          <span className="text-[10px] font-black text-brand uppercase tracking-widest block">
            Что нового:
          </span>
          <ul className="flex flex-col gap-2 pl-1">
            {changelog.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-content-main font-medium leading-relaxed">
                <span className="text-brand shrink-0 mt-1.5 select-none text-[8px]">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Кнопки управления */}
        <div className="flex gap-3 w-full pt-2 border-t border-surface-level2">
          <ButtonLP 
            variant="outline" 
            onClick={onLater} 
            className="flex-1 !h-11 !text-[11px] !font-black !uppercase !tracking-widest"
          >
            Позже
          </ButtonLP>
          
          <ButtonLP 
            variant="primary" 
            onClick={onUpdate} 
            className="flex-1 !h-11 !text-[11px] !font-black !uppercase !tracking-widest shadow-md"
          >
            Обновить
          </ButtonLP>
        </div>

      </div>
    </div>
  );
}