import React from 'react';
import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { getContrastTextColor } from '../utils/helpers';

export function ButtonLP({ 
  children, 
  onClick, 
  type = 'button', 
  disabled = false, 
  isLoading = false, 
  variant = 'primary', // 'primary' | 'outline' | 'text'
  className,
  activeColor // Добавлен проп динамического командного цвета
}) {
  // Базовые стили для всех кнопок
  const baseStyles = "relative w-full flex items-center justify-center uppercase tracking-wider rounded-3xl overflow-hidden transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed outline-none";

  // Специфичные стили для каждого варианта
  const variants = {
    primary: clsx(
      "py-4 font-bold text-sm",
      !activeColor && "bg-gradient-to-r from-brand-dark to-brand text-content-dark shadow-brand-glow",
      "before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/25 before:to-transparent"
    ),
    outline: clsx(
      "py-4 text-xs font-bold",
      "bg-surface-level1 border-[1px] border-surface-level2 text-content-muted",
    ),
    text: clsx(
      "py-2 text-[10px] font-normal",
      "bg-transparent text-content-subtle hover:text-content-muted underline underline-offset-4 !active:scale-100" 
    )
  };

  // ИСПРАВЛЕНО: Инлайновые стили для адаптации первичной кнопки под HEX-цвет клуба с расчетом контраста текста
  const dynamicStyle = variant === 'primary' && activeColor
    ? {
        backgroundColor: activeColor,
        backgroundImage: 'none',
        color: getContrastTextColor(activeColor) === 'text-white' ? '#ffffff' : '#1f2937',
        boxShadow: `0 8px 30px ${activeColor}33` // 20% прозрачности (33 в HEX) без использования косой черты /
      }
    : {};

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      style={dynamicStyle}
      className={twMerge(clsx(baseStyles, variants[variant]), className)}
    >
      <span className="relative z-10 flex items-center gap-2 drop-shadow-sm">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin currentColor" />}
        {children}
      </span>
    </button>
  );
}