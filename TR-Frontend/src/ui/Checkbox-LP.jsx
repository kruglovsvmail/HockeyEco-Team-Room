import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { Check } from 'lucide-react';

export function CheckboxLP({ checked, onChange, label, className, activeColor }) {
  // Локальное состояние ховера для обеспечения надежной динамической подсветки без жестких Tailwind-классов
  const [isHovered, setIsHovered] = useState(false);

  // ИСПРАВЛЕНО: Реактивное изменение цвета рамки при фокусе, ховере или активном состоянии
  const boxStyle = {};
  if (activeColor) {
    if (checked || isHovered) {
      boxStyle.borderColor = activeColor;
    }
  }

  return (
    <label 
      className={twMerge("flex items-center gap-3 cursor-pointer group", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        style={boxStyle}
        className={twMerge(
          "relative flex items-center justify-center w-5 h-5 rounded-md border border-surface-border bg-surface-level2 transition-colors",
          !activeColor && "group-hover:border-brand"
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Check
          style={activeColor ? { color: activeColor } : {}}
          className={twMerge(
            "w-3.5 h-3.5 transition-transform duration-200",
            !activeColor && "text-brand",
            checked ? "scale-100" : "scale-0"
          )}
          strokeWidth={4}
        />
      </div>
      {label && (
        <span className={twMerge(
          "text-[14px] font-medium transition-colors select-none text-content-muted",
          isHovered ? "text-content-main" : "text-content-muted"
        )}>
          {label}
        </span>
      )}
    </label>
  );
}