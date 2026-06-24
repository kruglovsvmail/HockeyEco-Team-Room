import React from 'react';
import clsx from 'clsx';
import { getContrastTextColor } from '../utils/helpers';

export const SegmentedControl = ({ options, value, onChange, className, activeColor }) => {
  // Находим индекс текущего активного элемента, чтобы рассчитать сдвиг
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  // Если цвет передан — используем его, иначе откатываемся на CSS-переменную бренда
  const currentBrandColor = activeColor || 'var(--color-brand)';
  
  // Автоматически вычисляем контрастный класс для текста (text-white или text-content-main)
  const contrastClass = activeColor ? getContrastTextColor(activeColor) : 'text-white';

  return (
    <div className={clsx(
      "relative flex w-full p-1 bg-surface-level1 rounded-2xl border border-surface-border shadow-inner", 
      className
    )}>
      {/* Анимированный цветной бегунок */}
      <div
        className="absolute top-1 bottom-1 rounded-xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          // Ширина вычисляется автоматически: 100% минус паддинги (8px), деленное на кол-во кнопок
          width: `calc((100% - 8px) / ${options.length})`,
          // Сдвиг на 100% собственной ширины умноженный на индекс
          transform: `translateX(${selectedIndex * 100}%)`,
          backgroundColor: currentBrandColor,
        }}
      />
      
      {/* Кнопки */}
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button" // ИСПРАВЛЕНО: предотвращает автоматическую отправку формы при клике
            onClick={() => onChange(option.value)}
            className={clsx(
              "relative z-10 flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors duration-500 outline-none",
              isActive ? clsx(contrastClass, "drop-shadow-sm") : "text-content-muted hover:text-content-main"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};