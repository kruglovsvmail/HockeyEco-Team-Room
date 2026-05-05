import React from 'react';
import { twMerge } from 'tailwind-merge';
import { Check } from 'lucide-react';

export function CheckboxLP({ checked, onChange, label, className }) {
  return (
    <label className={twMerge("flex items-center gap-3 cursor-pointer group", className)}>
      <div className="relative flex items-center justify-center w-5 h-5 rounded-md border border-surface-border bg-surface-level2 group-hover:border-brand transition-colors">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Check
          className={twMerge(
            "w-3.5 h-3.5 text-brand transition-transform duration-200",
            checked ? "scale-100" : "scale-0"
          )}
          strokeWidth={4}
        />
      </div>
      {label && (
        <span className="text-sm text-content-muted font-medium group-hover:text-content-main transition-colors select-none">
          {label}
        </span>
      )}
    </label>
  );
}