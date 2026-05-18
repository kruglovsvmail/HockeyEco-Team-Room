import React from 'react';
import clsx from 'clsx';

export const ChipTabs = ({ tabs, activeTab, onChange, className = '' }) => {
  return (
    <div 
      className={`flex items-center overflow-x-auto scrollbar-hide gap-2 px-4 ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              "whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest outline-none shrink-0",
              isActive
                ? "bg-brand text-surface-level1"
                : "bg-surface-level2 text-content-muted hover:text-content-main"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};