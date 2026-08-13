import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * Индикатор жеста «потяни — обнови».
 *
 * Рисуется порталом в body, а не по месту вызова: во время жеста скролл-контейнер
 * получает transform, а внутри трансформированного предка position: fixed
 * отсчитывается от него же — значок уехал бы вместе с контентом и вдвое дальше.
 * С порталом место вызова в разметке вообще не имеет значения.
 *
 * Стрелка доворачивается по мере вытягивания и превращается в спиннер, когда
 * порог взят и данные уже грузятся.
 */
export function PullToRefreshIndicator({ distance = 0, isRefreshing = false, threshold = 70 }) {
  if ((distance <= 0 && !isRefreshing) || !document.body) return null;

  const progress = Math.min(1, distance / threshold);

  return createPortal(
    <div
      className="fixed left-1/2 top-0 z-[60] pointer-events-none"
      style={{
        // -48px — стартовая позиция за верхней кромкой экрана: значок
        // выезжает ровно настолько, насколько вытянут контейнер
        transform: `translate(-50%, ${distance - 48}px)`,
        opacity: isRefreshing ? 1 : progress,
      }}
    >
      <div className="w-9 h-9 rounded-full bg-surface-level1 border border-surface-border shadow-lg flex items-center justify-center">
        <Icon
          name="refresh"
          className={`w-4 h-4 text-brand ${isRefreshing ? 'animate-spin' : ''}`}
          style={isRefreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          strokeWidth={2.5}
        />
      </div>
    </div>,
    document.body
  );
}
