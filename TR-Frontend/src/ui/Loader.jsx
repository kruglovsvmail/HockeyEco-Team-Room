import React from 'react';
import clsx from 'clsx';

// =========================================================================
// РАСШИРЕННЫЙ ХОККЕЙНЫЙ КОНФИГУРАТОР
// =========================================================================
const PUCK_CONFIG = {
  // Габариты всего контейнера лоудера
  containerWidth: '140px',        // Общая ширина области анимации
  containerHeight: '80px',       // Общая высота области анимации
  strokeColor: '#656565ff',         // Цвет всех контуров (шайба и линии)
  
  // Геометрические размеры (без искажения толщины линий)
  puckWidth: 50,                  // РАЗМЕР ШАЙБЫ: Физическая ширина в пикселях
  puckHeight: 30,                 // РАЗМЕР ШАЙБЫ: Физическая высота в пикселях
  puckStrokeWidth: 2,             // ТОЛЩИНА ЛИНИЙ ШАЙБЫ (в пикселях)
  
  // Настройки скоростных линий
  speedLineStrokeWidth: 1,        // ТОЛЩИНА ЛИНИЙ СКОРОСТИ (в пикселях)
  speedLineCount: 5,              // КОЛИЧЕСТВО ЛИНИЙ СКОРОСТИ
  linesBaseSpeed: '0.3s',        // Базовая скорость пролета линий через экран
  
  // Настройки физики движения и покачивания
  wobbleSpeedY: '0.35s',          // СКОРОСТЬ движения вверх-вниз
  wobbleAmplitudeY: '3px',        // АМПЛИТУДА движения вверх-вниз (высота прыжка)
  wobbleSpeedRotate: '0.18s',     // СКОРОСТЬ покачивания (наклона)
  wobbleAmplitudeRotate: '5deg',  // АМПЛИТУДА покачивания (угол наклона в градусах)
};

/**
 * 1. Легковесный центрированный лоадер для страниц и панелей.
 * Полностью настраиваемый независимый компонент с плавающей шайбой по центру.
 */
export function PageLoader({ className }) {
  // Маппинг настроек конфигуратора в CSS-переменные для использования внутри @keyframes
  const configStyles = {
    '--container-w': PUCK_CONFIG.containerWidth,
    '--container-h': PUCK_CONFIG.containerHeight,
    '--puck-color': PUCK_CONFIG.strokeColor,
    '--puck-stroke': `${PUCK_CONFIG.puckStrokeWidth}px`,
    '--line-stroke': `${PUCK_CONFIG.speedLineStrokeWidth}px`,
    '--wobble-y-speed': PUCK_CONFIG.wobbleSpeedY,
    '--wobble-y-amp': PUCK_CONFIG.wobbleAmplitudeY,
    '--wobble-rot-speed': PUCK_CONFIG.wobbleSpeedRotate,
    '--wobble-rot-amp': PUCK_CONFIG.wobbleAmplitudeRotate,
    '--lines-speed': PUCK_CONFIG.linesBaseSpeed,
  };

  // Динамическая генерация заданного количества линий скорости
  const speedLines = Array.from({ length: PUCK_CONFIG.speedLineCount }).map((_, index) => {
    // Равномерно распределяем линии по высоте рабочей зоны с отступами сверху и снизу
    const minTop = 15; 
    const maxTop = 85;
    const step = PUCK_CONFIG.speedLineCount > 1 ? (maxTop - minTop) / (PUCK_CONFIG.speedLineCount - 1) : 0;
    const topPosition = minTop + step * index;

    // Добавляем псевдослучайный сдвиг по времени (stagger effect), чтобы линии шли не синхронно
    const delay = (index * 0.06).toFixed(2) + 's';
    // Небольшое варьирование скорости отдельных линий для органичного аниме-эффекта
    const speedModifier = 0.8 + (index % 3) * 0.15; 

    return (
      <div 
        key={index}
        className="anime-speed-line" 
        style={{ 
          top: `${topPosition}%`, 
          animationDelay: delay,
          animationDuration: `calc(var(--lines-speed) * ${speedModifier})`
        }} 
      />
    );
  });

  return (
    <div 
      className={clsx("flex-1 flex flex-col items-center justify-center h-full w-full min-h-[250px] bg-transparent select-none", className)}
      style={configStyles}
    >
      {/* Контейнер анимации */}
      <div 
        className="relative flex items-center justify-center overflow-hidden"
        style={{ width: 'var(--container-w)', height: 'var(--container-h)' }}
      >
        
        {/* Стили анимации */}
        <style>{`
          /* Раздельная анимация: Слой 1 — Вертикальная амплитуда */
          @keyframes puckWobbleY {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(calc(-1 * var(--wobble-y-amp))); }
          }
          
          /* Раздельная анимация: Слой 2 — Скорость покачивания (угол) */
          @keyframes puckRotate {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(calc(-1 * var(--wobble-rot-amp))); }
            75% { transform: rotate(var(--wobble-rot-amp)); }
          }
          
          /* Движение линий скорости слева направо (визуальный вылет влево) */
          @keyframes animeSpeedLine {
            0% { left: 110%; width: 0px; opacity: 0; }
            12% { width: 40px; opacity: 1; }
            80% { width: 70px; opacity: 1; }
            100% { left: -35%; width: 0px; opacity: 0; }
          }

          .puck-y-layer {
            animation: puckWobbleY var(--wobble-y-speed) ease-in-out infinite;
            z-index: 10;
          }

          .puck-rot-layer {
            animation: puckRotate var(--wobble-rot-speed) ease-in-out infinite;
          }

          .anime-speed-line {
            position: absolute;
            height: var(--line-stroke);
            background-color: var(--puck-color);
            border-radius: 9999px;
            animation: animeSpeedLine var(--lines-speed) linear infinite;
            opacity: 0;
          }
        `}</style>

        {/* Сгенерированный поток линий скорости */}
        <div className="absolute inset-0 pointer-events-none w-full h-full">
          {speedLines}
        </div>

        {/* Шайба с независимыми слоями анимации */}
        <div className="puck-y-layer">
          <div className="puck-rot-layer flex items-center justify-center">
            <svg 
              width={PUCK_CONFIG.puckWidth} 
              height={PUCK_CONFIG.puckHeight} 
              viewBox="0 0 76 48" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Верхний эллипс */}
              <ellipse 
                cx="38" 
                cy="16" 
                rx="30" 
                ry="11" 
                vectorEffect="non-scaling-stroke" 
                stroke="var(--puck-color)" 
                strokeWidth="var(--puck-stroke)" 
                fill="none" 
              />
              {/* Нижний обод */}
              <path 
                d="M 8 16 V 32 A 30 11 0 0 0 68 32 V 16" 
                vectorEffect="non-scaling-stroke" 
                stroke="var(--puck-color)" 
                strokeWidth="var(--puck-stroke)" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                fill="none" 
              />
            </svg>
          </div>
        </div>
      </div>      
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
 * 3. Готовый пресет матовой скелетон-карточки для быстрой сборки списков во время загрузки данных.
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