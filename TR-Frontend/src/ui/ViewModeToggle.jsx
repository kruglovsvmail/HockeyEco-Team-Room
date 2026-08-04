import React from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

// Компактный переключатель отображения списка людей: плитка (сетка карточек) или
// таблица. Ставится в шапку ContainerContent сразу после названия блока.
// Значение хранит родитель (и пишет его в localStorage), сам контрол — stateless.
export const ViewModeToggle = ({ value = 'grid', onChange, activeBrandColor, className }) => {
  const accent = activeBrandColor || 'var(--color-brand)';

  const Item = ({ mode, icon, label }) => {
    const isActive = value === mode;
    return (
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          if (!isActive) onChange?.(mode);
        }}
        className={clsx(
          "flex items-center justify-center w-6 h-6 rounded-lg transition-all outline-none cursor-pointer",
          isActive ? "bg-surface-level2 shadow-sm" : "text-content-subtle opacity-60 active:opacity-100"
        )}
        style={isActive ? { color: accent } : {}}
      >
        <Icon name={icon} className="w-3.5 h-3.5" />
      </button>
    );
  };

  return (
    <div className={clsx("flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-base border border-surface-border shrink-0", className)}>
      <Item mode="grid" icon="view_grid" label="Плиткой" />
      <Item mode="table" icon="view_table" label="Таблицей" />
    </div>
  );
};
