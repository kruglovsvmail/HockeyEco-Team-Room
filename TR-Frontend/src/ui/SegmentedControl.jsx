/********** ФАЙЛ: TR-Frontend\src\ui\SegmentedControl.jsx **********/

import React from 'react';
import clsx from 'clsx';

export const SegmentedControl = ({ options, value, onChange, className }) => {
  // Находим индекс текущего активного элемента, чтобы рассчитать сдвиг
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  return (
    <div className={clsx(
      "relative flex w-full p-1 bg-surface-level3 rounded-2xl border border-surface-border shadow-inner", 
      className
    )}>
      {/* Анимированный бегунок */}
      <div
        className="absolute top-1 bottom-1 rounded-xl bg-surface-level1 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          // Ширина вычисляется автоматически: 100% минус паддинги (8px), деленное на кол-во кнопок
          width: `calc((100% - 8px) / ${options.length})`,
          // Сдвиг на 100% собственной ширины умноженный на индекс
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
      />
      
      {/* Кнопки */}
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={clsx(
              "relative z-10 flex-1 py-2 text-[11px] font-black uppercase tracking-widest transition-colors duration-500 outline-none",
              isActive ? "text-brand drop-shadow-sm" : "text-content-muted hover:text-content-main"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};