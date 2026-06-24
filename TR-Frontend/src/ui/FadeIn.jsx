import React from 'react';
import clsx from 'clsx';

/**
 * Универсальный высокопроизводительный компонент для плавной отрисовки UI.
 * Выносит анимацию на GPU, исключает Layout Thrashing и тормоза Main Thread.
 * * @param {number} delay - Задержка старта анимации в миллисекундах (для создания каскадного эффекта)
 * @param {number} duration - Длительность анимации в миллисекундах (по умолчанию 350мс)
 */
export function FadeIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 350 
}) {
  // Генерация уникального ключа анимации на основе параметров, 
  // чтобы избежать конфликтов при каскадном выводе элементов
  const animationName = `tr-fade-in-${delay}-${duration}`;

  return (
    <div 
      className={clsx("will-change-transform", className)}
      style={{
        animationName: animationName,
        animationDuration: `${duration}ms`,
        animationTimingFunction: 'cubic-bezier(0.21, 1.02, 0.43, 1.01)',
        animationDelay: `${delay}ms`,
        animationFillMode: 'both'
      }}
    >
      {/* Изолированные CSS-правила для GPU-интерполяции */}
      <style>
        {`
          @keyframes ${animationName} {
            0% {
              opacity: 0;
              transform: translateY(10px) translateZ(0);
            }
            100% {
              opacity: 1;
              transform: translateY(0) translateZ(0);
            }
          }
        `}
      </style>
      {children}
    </div>
  );
}

/**
 * Вспомогательный компонент для создания красивого каскадного (поочередного) 
 * появления элементов в списках (например, карточек игроков или звений).
 */
export function StaggerContainer({ children, className }) {
  return (
    <div className={clsx("flex flex-col w-full box-border", className)}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        
        // Каждому следующему дочернему элементу добавляем шаг задержки в 40мс
        return (
          <FadeIn delay={index * 40} duration={300}>
            {child}
          </FadeIn>
        );
      })}
    </div>
  );
}