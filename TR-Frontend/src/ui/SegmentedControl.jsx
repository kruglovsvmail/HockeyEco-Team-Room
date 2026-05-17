import React from 'react';
import clsx from 'clsx';

export const SegmentedControl = ({ options, value, onChange }) => {
  return (
    <div className="flex bg-surface-level2 rounded-2xl p-1 w-full shadow-inner border border-surface-border select-none relative z-10">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={clsx(
              "flex-1 text-xs sm:text-sm font-black uppercase tracking-widest py-2 rounded-xl transition-all duration-300 outline-none",
              isActive 
                ? "bg-surface-base text-brand shadow-sm border border-surface-border scale-[1.02]" 
                : "text-content-muted hover:text-content-main active:scale-95"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};