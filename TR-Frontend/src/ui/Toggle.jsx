/********** ФАЙЛ: TR-Frontend\src\ui\Toggle.jsx **********/

import React from 'react';
import clsx from 'clsx';

export function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={clsx(
      "relative inline-flex items-center cursor-pointer touch-none select-none",
      disabled && "opacity-50 cursor-not-allowed"
    )}>
      <input 
        type="checkbox" 
        className="sr-only peer" 
        checked={checked} 
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
      />
      {/* Фон тумблера: peer-checked меняет серый фон на brand-градиент */}
      <div className={clsx(
        "w-11 h-6 bg-surface-border border border-surface-border/50 rounded-full",
        "peer-checked:bg-brand-dark peer-checked:from-warm-start peer-checked:to-brand peer-checked:border-brand/30",
        "transition-all duration-300 ease-in-out"
      )} />
      {/* Бегунок: peer-checked смещает его вправо */}
      <div className={clsx(
        "absolute left-0.5 top-0.5 w-5 h-5 bg-content-main rounded-full shadow-sm",
        "peer-checked:translate-x-full peer-checked:bg-white",
        "transition-transform duration-300 ease-in-out"
      )} />
    </label>
  );
}