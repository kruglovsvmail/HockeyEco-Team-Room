import React from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';

// =============================================================================
// БЛОК ПАНЕЛИ УПРАВЛЕНИЯ СООБЩЕСТВОМ
//
// Та же рамка, тот же карандаш справа сверху и тот же оверлей сохранения, что
// в карточке участника: панели управления и карточки человека должны читаться
// как один интерфейс. Каждый блок сохраняется сам — общей кнопки внизу нет,
// иначе непонятно, что именно уедет на сервер.
// =============================================================================
export const PanelBlock = ({
  title, icon, accentColor, canEdit, isEditing, onToggleEdit, isSaving, children,
}) => {
  const color = accentColor || 'var(--color-brand)';

  return (
    <div className="flex flex-col px-3 py-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm relative">
      {isSaving && (
        <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center rounded-2xl">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
            <div
              className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: color, borderTopColor: 'transparent' }}
            />
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">
              Сохранение...
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <Icon name={icon} className="w-4 h-4 shrink-0" style={{ color }} />}
          <span className="text-[10px] font-black text-content-muted uppercase tracking-widest truncate">
            {title}
          </span>
        </div>

        {canEdit && onToggleEdit && (
          <button
            type="button"
            onClick={onToggleEdit}
            style={{ color }}
            className="p-0.5 outline-none cursor-pointer flex items-center justify-center transition-opacity hover:opacity-70 shrink-0"
          >
            <Icon name={isEditing ? 'close' : 'edit'} className="w-4 h-4" />
          </button>
        )}
      </div>

      {children}
    </div>
  );
};

// Кнопка «+ Добавить» — одинаковая во всех панелях, где список пополняется
export const AddRowButton = ({ label, accentColor, onClick, className }) => (
  <button
    type="button"
    onClick={onClick}
    style={{ color: accentColor || 'var(--color-brand)', borderColor: accentColor || 'var(--color-brand)' }}
    className={clsx(
      'flex items-center justify-center gap-2 w-full h-11 rounded-2xl border border-dashed bg-transparent',
      'text-[12px] font-bold uppercase tracking-wider outline-none active:scale-[0.99] transition-transform',
      className
    )}
  >
    <Icon name="plus" className="w-4 h-4" />
    {label}
  </button>
);
