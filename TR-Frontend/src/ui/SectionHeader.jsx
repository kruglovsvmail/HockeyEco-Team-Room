import React from 'react';
import clsx from 'clsx';

export const SectionHeader = ({ 
  title, 
  actionText, 
  onActionClick, 
  showAction = false, 
  rightContent, 
  className 
}) => {
  return (
    <div className={clsx("flex justify-between items-end", className)}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-content-muted uppercase tracking-widest select-none">
          {title}
        </span>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Слот для дополнительных элементов управления в будущем */}
        {rightContent}

        {/* Основная текстовая кнопка действия */}
        {showAction && actionText && (
          <button
            onClick={onActionClick}
            className="text-[10px] font-bold text-brand uppercase tracking-wider active:opacity-70 transition-opacity outline-none"
          >
            {actionText}
          </button>
        )}
      </div>
    </div>
  );
};