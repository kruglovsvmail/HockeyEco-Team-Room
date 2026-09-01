import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

// Выпадающий список выбора одного значения.
//
// Повторяет вид переключателя этапов в статистике турнира — тот же скруглённый
// блок с шевроном и панель под ним, — но оформлен отдельным компонентом:
// там он вшит в TournamentStat, и переиспользовать его было нечем.
//
// В отличие от чипа-переключателя показывает весь набор: по одному значению
// на экране нельзя догадаться, какие ещё бывают.
export function DropdownSelect({
  options = [],
  value,
  onChange,
  label,
  className,
  activeColor,
  placeholder = 'Выбрать',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = options.find(o => o.value === value) || null;

  // Закрытие по клику мимо. mousedown, а не click: иначе список успевает
  // закрыться до того, как сработает выбор внутри него.
  useEffect(() => {
    if (!isOpen) return;
    const onOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={clsx('min-w-0', className)}>
      <style>
        {`
          @keyframes dropdownPanelIn {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .dropdown-panel-in {
            animation: dropdownPanelIn 0.18s cubic-bezier(0.32, 0.72, 0, 1);
            transform-origin: top center;
          }
        `}
      </style>

      {/* Подпись в стиле полей ввода: рядом с ними список читается как такое же
          поле формы, а не как отдельный элемент управления */}
      {label && (
        <span className="block text-[10px] text-content-subtle uppercase tracking-widest font-bold mb-1.5 px-1">
          {label}
        </span>
      )}

      {/* Кнопка и панель живут в общей системе координат, отдельно от подписи */}
      <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="relative w-full h-[40px] pl-4 pr-10 flex items-center justify-center rounded-2xl bg-surface-level1 shadow-md text-[12px] font-bold uppercase tracking-widest text-content-main outline-none active:opacity-75 transition-opacity"
      >
        {/* Значение по центру всей кнопки, а не в остатке после шеврона —
            поэтому шеврон выведен из потока */}
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        {/* В наборе иконок нет «стрелки вниз» — берём горизонтальный шеврон
            и доворачиваем, как это сделано в статистике турнира */}
        <Icon
          name="chevron_left"
          className={clsx(
            'absolute right-4 w-4 h-4 shrink-0 text-content-muted transition-transform duration-200',
            isOpen ? 'rotate-90' : '-rotate-90'
          )}
        />
      </button>

      {isOpen && (
        <div className="dropdown-panel-in absolute left-0 right-0 top-[46px] bg-surface-level1 border border-surface-border shadow-2xl rounded-2xl overflow-hidden z-50">
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange?.(opt.value); setIsOpen(false); }}
                style={isSelected && activeColor ? { backgroundColor: activeColor } : undefined}
                className={clsx(
                  'w-full text-center px-4 py-3 text-[10px] font-black uppercase tracking-wide outline-none transition-colors',
                  isSelected
                    ? clsx('text-white', !activeColor && 'bg-brand')
                    : 'text-content-muted hover:text-content-main active:bg-surface-level2'
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
