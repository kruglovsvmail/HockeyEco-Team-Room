import React from 'react';
import { BottomSheet } from './BottomSheet';
import { ButtonLP } from './Button-LP';

// Иконки по умолчанию — рисуем инлайн, чтобы не зависеть от имён в Icon.jsx
const WarningSvg = (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const CheckSvg = (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

/**
 * Универсальная шторка подтверждения опасного действия.
 *
 * @param {boolean}  isOpen
 * @param {function} onClose         — закрытие по «Отмена», бэкдропу
 * @param {function} onConfirm       — выполняется по кнопке подтверждения
 * @param {boolean}  isLoading       — крутит спиннер на кнопке подтверждения и блокирует Отмену
 * @param {string}   title           — крупный заголовок (вопрос)
 * @param {ReactNode} description    — текст пояснения; принимает строку или JSX (например, с выделенным именем)
 * @param {string}   confirmLabel    — текст кнопки подтверждения, по умолч. «Подтвердить»
 * @param {string}   cancelLabel     — текст кнопки отмены, по умолч. «Отмена»
 * @param {string}   variant         — 'danger' (по умолч.) | 'primary'
 *                                     'danger'  → красная иконка + красная кнопка подтверждения
 *                                     'primary' → фирменная (или брендовая команды) иконка + кнопка подтверждения
 * @param {string}   activeColor     — цвет команды для variant='primary'
 * @param {string}   icon            — имя иконки из Icon.jsx (по умолч. 'warning' для danger, 'check' для primary)
 */
export const ConfirmSheet = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  variant = 'danger',
  activeColor,
  icon,
}) => {
  const isDanger = variant === 'danger';
  const accentColor = isDanger ? '#ef4444' : (activeColor || 'var(--color-brand)');

  const iconWrapperStyle = isDanger
    ? undefined
    : { backgroundColor: `${accentColor}1a`, color: accentColor };

  const iconNode = icon || (isDanger ? WarningSvg : CheckSvg);

  return (
    <BottomSheet isOpen={isOpen} onClose={() => !isLoading && onClose && onClose()}>
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div
          className={isDanger ? 'w-16 h-16 bg-danger-muted text-danger rounded-full flex items-center justify-center mb-2' : 'w-16 h-16 rounded-full flex items-center justify-center mb-2'}
          style={iconWrapperStyle}
        >
          {iconNode}
        </div>

        <h3 className="text-[18px] font-black text-content-main leading-tight">{title}</h3>

        {description && (
          <div className="text-[14px] text-content-muted max-w-[320px] leading-snug">
            {description}
          </div>
        )}

        <div className="flex gap-3 w-full">
          <ButtonLP
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            {cancelLabel}
          </ButtonLP>
          <ButtonLP
            variant="primary"
            activeColor={accentColor}
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={isLoading}
            className="flex-1"
          >
            {confirmLabel}
          </ButtonLP>
        </div>
      </div>
    </BottomSheet>
  );
};
