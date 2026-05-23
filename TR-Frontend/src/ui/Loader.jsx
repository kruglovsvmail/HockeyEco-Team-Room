import React from 'react';
import clsx from 'clsx';

/**
 * 1. Легковесный центрированный лоадер для страниц и панелей.
 * Занимает всё доступное пространство, не нагружает поток вычислений.
 */
export function PageLoader({ className }) {
  return (
    <div className={clsx("flex-1 flex flex-col items-center justify-center h-full w-full min-h-[200px] bg-transparent select-none", className)}>
      <div className="relative flex items-center justify-center">
        {/* Минималистичное кольцо крутилки */}
        <div className="w-9 h-9 rounded-xl border-2 border-surface-border border-t-brand animate-spin" />
        {/* Внутреннее легкое свечение в стиле платформы */}
        <div className="absolute w-6 h-6 rounded-full bg-brand-glow/10 blur-sm pointer-events-none" />
      </div>
      <span className="text-[10px] font-black text-brand tracking-[0.25em] uppercase mt-4 animate-pulse">
        ...
      </span>
    </div>
  );
}

/**
 * 2. Базовый скелетон-блок с мягкой матовой пульсацией для построения каркасов.
 */
export function Skeleton({ className, variant = 'rect' }) {
  return (
    <div 
      className={clsx(
        "animate-pulse bg-surface-level3 border border-surface-border",
        variant === 'circle' && "rounded-full",
        variant === 'rect' && "rounded-2xl",
        variant === 'text' && "rounded-md h-3.5 w-3/4 my-1",
        className
      )}
    />
  );
}

/**
 * 3. Готовый пресет матовой скелетон-карточки (например, для игрока или события) 
 * для быстрой сборки списков во время загрузки данных.
 */
export function SkeletonCard({ className }) {
  return (
    <div className={clsx("p-4 bg-surface-level2 border border-surface-border rounded-2xl flex flex-col gap-3 w-full box-border", className)}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="w-12 h-12 shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton variant="text" className="w-1/3 h-2.5" />
        </div>
      </div>
    </div>
  );
}