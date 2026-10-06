import React from 'react';
import { HintPopover } from './HintPopover';

const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[14px] font-bold whitespace-nowrap ${className}`}>{children}</span>
);

const getPenaltyPillClass = (required, completed) => {
  if (Number(required) <= 0) return 'bg-surface-level2 text-content-muted';
  return completed ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger';
};

// Пилюли одной дисквалификации — тот же формат, что и в LMS (Обяз./Доп. матчи, сумма),
// серый = ноль, зелёный = исполнено, красный = осталось исполнить.
function DisqualificationPills({ d }) {
  const hasSplit = d.mandatory_games != null || d.additional_games != null;
  const dqServed = Math.max(Number(d.games_served) || 0, 0);
  const mandatoryServed = hasSplit && d.mandatory_games != null ? Math.min(dqServed, Number(d.mandatory_games)) : null;
  const additionalServed = hasSplit && d.additional_games != null
    ? Math.min(Math.max(dqServed - (Number(d.mandatory_games) || 0), 0), Number(d.additional_games))
    : null;
  const amount = Number(d.penalty_amount);

  if (!hasSplit && d.games_assigned == null && d.penalty_amount == null) {
    let oldText = '';
    if (d.penalty_type === 'time') {
      oldText = `До: ${new Date(d.end_date).toLocaleDateString('ru-RU')}`;
    } else if (d.penalty_type === 'manual') {
      oldText = 'До решения СДК';
    }
    return oldText ? <span className="text-[14px] font-bold text-danger block">{oldText}</span> : null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {d.is_team_wide && (
        <Pill className="bg-surface-level2 text-content-muted">Штраф команды</Pill>
      )}
      {hasSplit && d.mandatory_games != null && (
        <Pill className={getPenaltyPillClass(d.mandatory_games, mandatoryServed >= Number(d.mandatory_games))}>Обяз. матчи: {mandatoryServed}/{d.mandatory_games}</Pill>
      )}
      {hasSplit && d.additional_games != null && (
        <Pill className={getPenaltyPillClass(d.additional_games, additionalServed >= Number(d.additional_games))}>Доп. матчи: {additionalServed}/{d.additional_games}</Pill>
      )}
      {!hasSplit && d.games_assigned != null && (
        <Pill className={getPenaltyPillClass(d.games_assigned, dqServed >= Number(d.games_assigned))}>Матчи: {Math.min(dqServed, Number(d.games_assigned))}/{d.games_assigned}</Pill>
      )}
      {d.penalty_amount != null && (
        <Pill className={getPenaltyPillClass(amount, d.penalty_amount_paid)}>
          {amount.toLocaleString('ru-RU')} ₽{amount > 0 && ` · ${d.penalty_amount_paid ? 'оплачен' : 'не оплачен'}`}
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
