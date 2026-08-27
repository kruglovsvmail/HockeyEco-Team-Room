import React from 'react';
import { Icon } from './Icon';
import { formatEventFee, eventFeeHint } from '../utils/eventFee';

// =============================================================================
// СТРОКА СТОИМОСТИ В КАРТОЧКЕ СОБЫТИЯ
//
// Одна и та же строка нужна тренировке, матчу и собранию, а правила показа
// у неё нетривиальные (долевая сумма, порог, фиксация после события) — поэтому
// живёт отдельным компонентом, а не тремя копиями по деталям событий.
// =============================================================================
export const FeeRow = ({ event, activeBrandColor }) => {
  const feeText = formatEventFee(event);
  const hint = eventFeeHint(event);
  const isPending = event?.fee_status === 'pending';
  const isFree = feeText === 'Бесплатно';

  return (
    <div className="flex items-start gap-4 min-w-0 mt-4">
      <Icon
        name="currency"
        className="w-4 h-4 shrink-0 mt-0.5"
        style={{ color: feeText && !isPending ? activeBrandColor : 'var(--color-content-subtle)' }}
      />
      <div className="min-w-0">
        {feeText ? (
          isPending ? (
            // Подсказка вместо суммы — длинная, переносится: интервал поджат.
            <span className="text-[14px] font-medium leading-[1.15] block text-content-subtle">
              {feeText}
            </span>
          ) : (
            <span
              className={`text-[18px] leading-none truncate block ${isFree ? 'font-medium' : 'font-black'}`}
              style={{ color: activeBrandColor }}
            >
              {feeText}
            </span>
          )
        ) : (
          <span className="text-[14px] font-medium leading-none truncate block text-content-subtle">
            Взнос не назначен
          </span>
        )}

        {hint && (
          <span className="block text-[10px] text-content-muted leading-tight mt-1.5">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
};

export default FeeRow;
