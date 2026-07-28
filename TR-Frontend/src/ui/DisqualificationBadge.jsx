import React from 'react';
import { HintPopover } from './HintPopover';

const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[14px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);

// Пилюли одной дисквалификации — тот же формат, что и в LMS (Обяз./Доп. матчи, сумма),
// просто в цветах TR (danger/success вместо status-rejected/status-accepted).
function DisqualificationPills({ d }) {
  const hasSplit = d.mandatory_games != null || d.additional_games != null;
  const dqServed = d.games_served || 0;
  const mandatoryServed = hasSplit && d.mandatory_games != null ? Math.min(dqServed, d.mandatory_games) : null;
  const additionalServed = hasSplit && d.additional_games != null
    ? Math.min(Math.max(dqServed - (d.mandatory_games || 0), 0), d.additional_games)
    : null;

  if (!hasSplit && d.penalty_amount == null) {
    let oldText = '';
    if (d.penalty_type === 'games' && d.games_assigned != null) {
      oldText = `Осталось матчей: ${Math.max(d.games_assigned - dqServed, 0)}`;
    } else if (d.penalty_type === 'time') {
      oldText = `До: ${new Date(d.end_date).toLocaleDateString('ru-RU')}`;
    } else if (d.penalty_type === 'manual') {
      oldText = 'До решения СДК';
    }
    return oldText ? <span className="text-[14px] font-bold text-danger block">{oldText}</span> : null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {hasSplit && d.mandatory_games != null && (
        <Pill className="bg-danger/10 text-danger">Обяз. матчи: {mandatoryServed}/{d.mandatory_games}</Pill>
      )}
      {hasSplit && d.additional_games != null && (
        <Pill className="bg-danger/10 text-danger">Доп. матчи: {additionalServed}/{d.additional_games}</Pill>
      )}
      {d.penalty_amount != null && (
        <Pill className={d.penalty_amount_paid ? 'bg-success/10 text-success' : 'bg-[#007AFF]/10 text-[#007AFF]'}>
          {d.penalty_amount} ₽ · {d.penalty_amount_paid ? 'оплачен' : 'не оплачен'}
        </Pill>
      )}
    </div>
  );
}

// Единый бейдж "Дискв." для TR — по клику (HintPopover) показывает те же пилюли, что и в LMS,
// в стилистике TR. Используется вместо кнопки "Добавить"/отметки явки для дисквалифицированного игрока.
export function DisqualificationBadge({ activeDisqualifications, className = '' }) {
  if (!activeDisqualifications || activeDisqualifications.length === 0) return null;

  const content = (
    <div className="flex flex-col gap-2">
      {activeDisqualifications.map((d, index) => (
        <div key={index} className="flex flex-col gap-1.5 pb-2 border-b border-surface-border last:border-0 last:pb-0">
          <DisqualificationPills d={d} />
          <span className="text-[12px] text-content-muted leading-snug">{d.reason}</span>
        </div>
      ))}
    </div>
  );

  return (
    <span className={className} onClick={(e) => e.stopPropagation()}>
      <HintPopover customContent={content}>
        <span className="text-[10px] font-bold text-white tracking-wider bg-danger px-3.5 py-2 rounded-2xl">
          Дисквал.
        </span>
      </HintPopover>
    </span>
  );
}
