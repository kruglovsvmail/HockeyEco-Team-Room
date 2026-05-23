import React from 'react';
import clsx from 'clsx';

// =========================================================================
// ХОККЕЙНЫЙ КОНФИГУРАТОР (Твой инструмент для настройки анимации)
// =========================================================================
const PUCK_CONFIG = {
  strokeColor: '#b3b3b3ff',       // Цвет контура шайбы и скоростных линий
  strokeWidth: 5,               // Толщина линий (в пикселях)
  puckScale: 1.1,               // Масштаб самой шайбы (например: 1 — базовый, 1.2 — крупнее)
  wobbleSpeed: '0.5s',         // Скорость покачивания шайбы (чем меньше, тем быстрее)
  wobbleIntensity: '5px',       // Амплитуда движения вверх-вниз в полете
  rotateIntensity: '3deg',      // Угол наклона шайбы при покачивании
  linesBaseSpeed: '0.3s',      // Базовая скорость пролета аниме-линий
};

/**
 * 1. Легковесный центрированный лоадер для страниц и панелей.
 * Шайба зафиксирована строго по центру. Настройки лоадера регулируются через PUCK_CONFIG.
 */
export function PageLoader({ className }) {
  // Транслируем настройки из конфигуратора в CSS-переменные
  const configStyles = {
    '--puck-color': PUCK_CONFIG.strokeColor,
    '--puck-stroke': `${PUCK_CONFIG.strokeWidth}px`,
    '--puck-scale': PUCK_CONFIG.puckScale,
    '--wobble-speed': PUCK_CONFIG.wobbleSpeed,
    '--wobble-y': PUCK_CONFIG.wobbleIntensity,
    '--wobble-deg': PUCK_CONFIG.rotateIntensity,
    '--lines-speed': PUCK_CONFIG.linesBaseSpeed,
  };

  return (
    <div 
      className={clsx("flex-1 flex flex-col items-center justify-center h-full w-full min-h-[250px] bg-transparent select-none", className)}
      style={configStyles}
    >
      {/* Рабочая зона анимации */}
      <div className="relative flex items-center justify-center w-72 h-32 overflow-hidden">
        
        {/* Изолированные CSS-анимации */}
        <style>{`
          @keyframes puckCenterWobble {
            0%, 100% { transform: scale(var(--puck-scale)) translateY(0) rotate(0deg); }
            25% { transform: scale(var(--puck-scale)) translateY(calc(-1 * var(--wobble-y))) rotate(calc(-1 * var(--wobble-deg))); }
            75% { transform: scale(var(--puck-scale)) translateY(var(--wobble-y)) rotate(var(--wobble-deg)); }
          }
          
          @keyframes animeSpeedLine {
            0% { left: 110%; width: 0px; opacity: 0; }
            15% { width: 45px; opacity: 1; }
            80% { width: 75px; opacity: 1; }
            100% { left: -40%; width: 0px; opacity: 0; }
          }

          .puck-centered-anim {
            animation: puckCenterWobble var(--wobble-speed) ease-in-out infinite;
            z-index: 10;
          }

          .anime-speed-line {
            position: absolute;
            height: calc(var(--puck-stroke) * 0.8);
            background-color: var(--puck-color);
            border-radius: 9999px;
            animation: animeSpeedLine var(--lines-speed) linear infinite;
            opacity: 0;
          }
        `}</style>

        {/* Аниме-линии скорости (размытый хаотичный поток под шайбой) */}
        <div className="absolute inset-0 pointer-events-none w-full h-full">
          <div className="anime-speed-line" style={{ top: '22%', animationDelay: '0s', animationDuration: 'calc(var(--lines-speed) * 0.95)' }} />
          <div className="anime-speed-line" style={{ top: '48%', animationDelay: '0.08s', animationDuration: 'calc(var(--lines-speed) * 0.75)' }} />
          <div className="anime-speed-line" style={{ top: '68%', animationDelay: '0.03s', animationDuration: 'calc(var(--lines-speed) * 1.15)' }} />
          <div className="anime-speed-line" style={{ top: '82%', animationDelay: '0.14s', animationDuration: 'calc(var(--lines-speed) * 0.85)' }} />
        </div>

        {/* Шайба — строго отцентрована геометрически */}
        <div className="puck-centered-anim flex items-center justify-center">
          <svg width="76" height="48" viewBox="0 0 76 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Верхняя плоскость */}
            <ellipse cx="38" cy="16" rx="30" ry="11" stroke="var(--puck-color)" strokeWidth="var(--puck-stroke)" fill="none" />
            {/* Нижняя грань */}
            <path d="M 8 16 V 32 A 30 11 0 0 0 68 32 V 16" stroke="var(--puck-color)" strokeWidth="var(--puck-stroke)" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        
      </div>
      
      {/* Текстовый индикатор */}
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
        "animate-pulse bg-surface-level3 border border-surface-level2",
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
    <div className={clsx("p-4 bg-surface-level2 border border-surface-level2 rounded-2xl flex flex-col gap-3 w-full box-border", className)}>
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