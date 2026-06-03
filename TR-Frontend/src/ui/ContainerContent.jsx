import React, { useState, useEffect } from 'react';
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
  collapsible = false,
  defaultExpanded = true,
  activeBrandColor, 
  ...props
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Синхронизируем внутренний стейт при изменении дефолтных пропсов извне
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const hasCount = count !== undefined && count !== null;

  // Жесткая страховка: если компонент не collapsible, он гарантированно всегда развернут
  const finalExpanded = collapsible ? isExpanded : true;

  return (
    <div
      className={clsx(
        // ИСПРАВЛЕНО: Удален хардкод mx-4, мешавший пиксельной стыковке, добавлен w-full для растяжения по сетке
        "bg-brand-glow rounded-2xl p-3 flex flex-col relative z-0 shadow-md overflow-hidden w-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        className
      )}
      {...props}
    >
      {/* Опциональная фоновая иконка */}
      {icon && !logoUrl && (
        <Icon
          name={icon}
          className="absolute -bottom-2 -right-2 -z-10 w-14 h-14 text-brand opacity-[0.06] rotate-[-10deg] pointer-events-none"
        />
      )}

      {/* Опциональный фоновый логотип */}
      {logoUrl && (
        <img
          src={getImageUrl(logoUrl)}
          alt="Турнирный логотип"
          className="absolute -bottom-2 -right-2 -z-10 w-14 h-14 opacity-[0.15] rotate-[-10deg] pointer-events-none object-contain"
        />
      )}

      {/* Шапка контейнера с поддержкой клика только при collapsible={true} */}
      {title && (
        <div 
          className={clsx(
            "flex items-center justify-between border-b border-surface-border pt-1 pl-4 pr-1 pb-3 select-none",
            collapsible && "cursor-pointer active:opacity-80 transition-opacity"
          )}
          onClick={() => collapsible && setIsExpanded(!isExpanded)}
        >
          <h4 className="text-[12px] font-bold text-content-muted uppercase tracking-wider">
            {title}
            {hasCount && ` (${count})`}
          </h4>
          
          <div className="flex items-center gap-2 shrink-0">
            {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
            
            {/* Шеврон из Icon.jsx с плавным вращением и мягкой клубной подсветкой */}
            {collapsible && (
              <Icon
                name="chevron_right"
                style={finalExpanded && activeBrandColor ? { color: activeBrandColor } : {}}
                className={clsx(
                  "w-4 h-4 text-content-muted transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  finalExpanded ? "rotate-90" : "rotate-0"
                )}
              />
            )}
          </div>
        </div>
      )}

      {/* Анимированный грид-контейнер высоты */}
      <div
        className={clsx(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          title && "mt-3",
          finalExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 pb-1">
            {children}
          </div>
        </div>
      </div>

    </div>
  );
}