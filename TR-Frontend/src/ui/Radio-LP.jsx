import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';

// Радиокнопка в стиле CheckboxLP: та же рамка, те же размеры и та же реакция
// на активный цвет — отличается только формой и заливкой точкой вместо галочки.
// Нужна там, где вариантов ровно два-три и они должны читаться списком, а не
// сегментированным переключателем.
export function RadioLP({ checked, onChange, label, description, name, className, activeColor }) {
  const [isHovered, setIsHovered] = useState(false);

  const boxStyle = {};
  if (activeColor && (checked || isHovered)) {
    boxStyle.borderColor = activeColor;
  }

  return (
    <label
      className={twMerge('flex items-start gap-3 cursor-pointer group', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={boxStyle}
        className={twMerge(
          'relative flex items-center justify-center w-5 h-5 rounded-full border border-surface-border bg-surface-level2 transition-colors shrink-0 mt-0.5',
          !activeColor && 'group-hover:border-brand'
        )}
      >
        <input
          type="radio"
          name={name}
          className="peer sr-only"
          checked={checked}
          onChange={() => onChange(true)}
        />
        <span
          style={activeColor ? { backgroundColor: activeColor } : {}}
          className={twMerge(
            'w-2.5 h-2.5 rounded-full transition-transform duration-200',
            !activeColor && 'bg-brand',
            checked ? 'scale-100' : 'scale-0'
          )}
        />
      </div>

      {(label || description) && (
        <span className="flex flex-col min-w-0">
          {label && (
            <span className={twMerge(
              'text-[14px] font-medium transition-colors select-none',
              isHovered || checked ? 'text-content-main' : 'text-content-muted'
            )}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-content-subtle leading-snug mt-0.5 select-none">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
