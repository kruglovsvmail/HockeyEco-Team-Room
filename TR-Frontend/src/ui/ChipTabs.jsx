import React from 'react';
import clsx from 'clsx';
import { getContrastTextColor } from '../utils/helpers';

export const ChipTabs = ({ tabs, activeTab, onChange, className = '', activeColor }) => {
  return (
    <div 
      className={`flex items-center overflow-x-auto scrollbar-hide gap-2 p-4 mx-2 ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        
        // ИСПРАВЛЕНО: Динамический расчет цвета фона и контраста текста при активном командном цвете
        const dynamicStyle = isActive && activeColor 
          ? { 
              backgroundColor: activeColor, 
              color: getContrastTextColor(activeColor) === 'text-white' ? '#ffffff' : '#1f2937' 
            } 
          : {};

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={dynamicStyle}
            className={clsx(
              "whitespace-nowrap px-4 py-2 shadow-sm rounded-full text-[12px] font-bold uppercase tracking-widest outline-none shrink-0 transition-all duration-200",
              isActive && !activeColor && "bg-brand text-surface-level1",
              !isActive && "bg-surface-level2 text-content-muted hover:text-content-main"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};