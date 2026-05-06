/********** ФАЙЛ: TR-Frontend\src\ui\FilterChips.jsx **********/

import React from 'react';
import clsx from 'clsx';
import { Filter } from 'lucide-react';

export function FilterChips({ 
  items = [], 
  selectedIds = [], 
  onOpenTopSheet 
}) {
  const isAllSelected = selectedIds.length === 0 || selectedIds.length === items.length;
  const isMultipleSelected = selectedIds.length > 2 && !isAllSelected;

  return (
    <div className="w-full overflow-x-auto scrollbar-hide pb-2 pt-1 px-6 -mx-6">
      <div className="flex items-center gap-2 w-max">
        
        {/* Чипс "Все" */}
        <button
          onClick={onOpenTopSheet}
          className={clsx(
            "h-8 px-4 rounded-full text-xs font-bold uppercase tracking-widest transition-all duration-300 outline-none flex items-center shrink-0",
            isAllSelected 
              ? "bg-brand/20 text-brand border border-brand/50 shadow-sm" 
              : "bg-surface-level2 text-content-muted border border-surface-border/50 hover:text-content-main"
          )}
        >
          Все
        </button>

        {/* Если выбрано больше 2 сущностей (но не все), показываем собирательный чипс */}
        {isMultipleSelected && (
          <button
            onClick={onOpenTopSheet}
            className="h-8 px-4 rounded-full text-xs font-bold uppercase tracking-widest bg-brand/20 text-brand border border-brand/50 shadow-sm transition-all duration-300 outline-none flex items-center gap-2 shrink-0"
          >
            Выбрано: {selectedIds.length}
            <Filter size={12} strokeWidth={3} />
          </button>
        )}

        {/* Индивидуальные чипсы (показываются если их 1 или 2) */}
        {!isAllSelected && !isMultipleSelected && items
          .filter(item => selectedIds.includes(item.id))
          .map(item => (
            <button
              key={item.id}
              onClick={onOpenTopSheet}
              className="h-8 px-4 rounded-full text-xs font-bold uppercase tracking-widest bg-brand/20 text-brand border border-brand/50 shadow-sm transition-all duration-300 outline-none flex items-center shrink-0"
            >
              {item.short_name || item.name}
            </button>
        ))}

        {/* Кнопка вызова настроек (TopSheet) */}
        {!isAllSelected && (
          <button
            onClick={onOpenTopSheet}
            className="h-8 w-8 rounded-full bg-surface-level2 text-content-muted border border-surface-border/50 hover:text-content-main flex items-center justify-center transition-all duration-300 outline-none shrink-0"
          >
            <Filter size={14} strokeWidth={2.5} />
          </button>
        )}

      </div>
    </div>
  );
}