import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../ui/Icon';
import { getPortalRoot } from '../../../utils/helpers';
import { DrillEditor } from '../../CoachCabinet/DrillEditor';

// Разовое упражнение — форма во весь экран поверх карточки события.
//
// Формой служит та же карточка упражнения, что и в Тренерской: поля совпадают,
// и заводить для плана вторую, отстающую от первой, незачем. Отличие только в адресате
// сохранения — за него отвечает onSubmit.
//
// Через портал и во весь экран, а не шторкой снизу: у упражнения есть планшет, а каток
// внутри шторки получался бы размером с почтовую марку. Портал нужен ещё и потому, что
// карточка события — оверлей со своим слоем, и обычный fixed внутри неё остался бы под
// ним. Слой планшета в самой форме лежит выше (z-20) и накрывает эту форму целиком —
// так же, как накрывает страницу упражнения в Тренерской.

export function AdhocDrillSheet({ isShown, title, initial, submitLabel, onSubmit, onClose, onNotify }) {
  return createPortal(
    <div
      className="absolute inset-0 z-[10] pointer-events-auto bg-surface-level2 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{ transform: isShown ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {/* Шапка повторяет полноэкранную панель приложения: кнопка «назад» слева,
          название справа — чтобы форма не выглядела чужой */}
      <div className="shrink-0 flex items-center justify-between shadow-md px-4 h-[60px] border-b border-surface-border">
        <button
          onClick={onClose}
          className="p-1.5 bg-white/10 rounded-xl text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center"
          aria-label="Назад"
        >
          <Icon name="chevron_left" className="w-6 h-6 text-content-main" />
        </button>
        <h3 className="text-[14px] font-bold text-content-main uppercase tracking-wider text-right truncate pl-4">
          {title}
        </h3>
      </div>

      <div className="flex-1 min-h-0">
        <DrillEditor
          initial={initial}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onClose={onClose}
          onNotify={onNotify}
        />
      </div>
    </div>,
    getPortalRoot()
  );
}
