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
        
        // ИСПРАВЛЕНО: Добавлен эффект объема (глянца) через линейный градиент с твоими настройками offset (40% и 70%)
        const dynamicStyle = isActive && activeColor 
          ? { 
              backgroundColor: activeColor, 
              backgroundImage: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 20%, rgba(255, 255, 255, 0) 100%)',
              color: getContrastTextColor(activeColor) === 'text-white' ? '#ffffff' : '#1f2937' 
            } 
          : {};

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={dynamicStyle}
            className={clsx(
              "relative overflow-hidden whitespace-nowrap px-4 py-2 shadow-sm rounded-full text-[12px] font-bold uppercase tracking-widest outline-none shrink-0 transition-all duration-200 active:scale-[0.98]",
              
              // Для дефолтного бренда добавляем глянец через before-элемент с твоими оффсетами
              isActive && !activeColor && "bg-brand text-surface-level1 before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/25 before:to-transparent before:via-white/25 before:from-[40%] before:to-[70%]",
              
              !isActive && "bg-surface-level2 text-content-muted hover:text-content-main"
            )}
          >
            {/* Оборачиваем текст в span с относительным z-index и тенью, чтобы он не перекрывался глянцем и лучше читался */}
            <span className={clsx("relative z-10", isActive && "drop-shadow-sm")}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};