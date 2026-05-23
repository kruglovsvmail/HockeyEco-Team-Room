import React from 'react';
import { Icon } from './Icon';
import { getImageUrl } from '../utils/helpers';
import clsx from 'clsx';

export function ContainerContent({
  title,
  count,
  icon,
  logoUrl,
  children,
  className,
  action,
  ...props
}) {
  const hasCount = count !== undefined && count !== null;

  return (
    <div
      className={clsx(
        "bg-brand-glow rounded-2xl p-3 flex flex-col gap-4 relative z-0 overflow-hidden mx-4",
        className
      )}
      {...props}
    >
      {/* Опциональная фоновая иконка (показывается, если нет логотипа) */}
      {icon && !logoUrl && (
        <Icon
          name={icon}
          className="absolute -bottom-2 -right-2 -z-10 w-14 h-14 text-brand opacity-[0.06] rotate-[-10deg] pointer-events-none"
        />
      )}

      {/* Опциональный фоновый логотип (например, лиги или дивизиона) */}
      {logoUrl && (
        <img
          src={getImageUrl(logoUrl)}
          alt="Турнирный логотип"
          className="absolute -bottom-2 -right-2 -z-10 w-14 h-14 opacity-[0.15] rotate-[-10deg] pointer-events-none object-contain"
        />
      )}

      {/* Шапка контейнера с заголовком, счетчиком и кнопкой действия */}
      {title && (
        <div className="flex items-center justify-between border-b border-surface-border pt-1 pl-4 pr-1 pb-3">
          <h4 className="text-[12px] font-bold text-content-muted uppercase tracking-wider">
            {title}
            {hasCount && ` (${count})`}
          </h4>
          {action && <div className="flex items-center shrink-0">{action}</div>}
        </div>
      )}

      {/* Рендеринг основного контента напрямую для сохранения flex/grid структуры */}
      {children}
    </div>
  );
}