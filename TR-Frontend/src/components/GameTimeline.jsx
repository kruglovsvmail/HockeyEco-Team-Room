import React, { useMemo } from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../utils/helpers';

const formatEventTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PERIOD_LABELS = {
  '1': '1-й ПЕРИОД', '2': '2-й ПЕРИОД', '3': '3-й ПЕРИОД',
  '4': '4-й ПЕРИОД', '5': '5-й ПЕРИОД', 'OT': 'ОВЕРТАЙМ', 'SO': 'БУЛЛИТЫ'
};

const STRENGTH_LABELS = {
  pp1: 'БОЛ', pp2: 'БОЛ+2', sh1: 'МЕН', sh2: 'МЕН+2', en: 'П.В.', ps: 'ШБ'
};

// ─── Аватар игрока ──────────────────────────────────────────────────────────
function PlayerAvatar({ photoUrl, firstName, lastName }) {
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  if (photoUrl) {
    return (
      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-surface-level2">
        <img src={getImageUrl(photoUrl)} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl shrink-0 bg-surface-level2 flex items-center justify-center text-[11px] font-bold text-content-muted">
      {initials}
    </div>
  );
}

// ─── Разделитель периода ────────────────────────────────────────────────────
function PeriodSeparator({ period }) {
  return (
    <div className="flex items-center my-2">
      <div className="flex-1 h-px bg-surface-border/60" />
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-content-subtle px-3">
        {PERIOD_LABELS[period] || period}
      </span>
      <div className="flex-1 h-px bg-surface-border/60" />
    </div>
  );
}

// ─── Одна карточка события ──────────────────────────────────────────────────
function TimelineEvent({ ev, isHome }) {
  const isGoal     = ev.event_type === 'goal';
  const isPenalty  = ev.event_type === 'penalty';
  const isSOGoal   = ev.event_type === 'shootout_goal';
  const isSOMiss   = ev.event_type === 'shootout_miss';
  const isShootout = isSOGoal || isSOMiss;

  const time     = formatEventTime(ev.time_seconds);
  const strength = STRENGTH_LABELS[ev.goal_strength] || '';

  // Данные основного игрока
  const mainFirst  = isGoal || isShootout ? ev.scorer_first  : ev.penalty_first;
  const mainLast   = isGoal || isShootout ? ev.scorer_last   : ev.penalty_last;
  const mainNumber = isGoal || isShootout ? ev.scorer_number : ev.penalty_number;
  const mainInitial = mainFirst ? mainFirst[0] + '.' : '';
  const mainPhoto  = isGoal || isShootout ? ev.scorer_photo  : ev.penalty_photo;
  const mainName   = mainLast || mainFirst || '—';

  // Ассистенты
  const assistants = [];
  if (ev.assist1_last || ev.assist1_first) {
    assistants.push({
      name: ev.assist1_last || ev.assist1_first,
      initial: ev.assist1_first ? ev.assist1_first[0] + '.' : '',
      number: ev.assist1_number
    });
  }
  if (ev.assist2_last || ev.assist2_first) {
    assistants.push({
      name: ev.assist2_last || ev.assist2_first,
      initial: ev.assist2_first ? ev.assist2_first[0] + '.' : '',
      number: ev.assist2_number
    });
  }

  // Метки центрального блока
  const eventLabel   = isGoal || isSOGoal ? 'Гол' : isSOMiss ? 'Мимо' : isPenalty ? `Штраф ${ev.penalty_minutes}'` : '';
  const eventColor   = isPenalty ? 'text-danger' : (isGoal || isSOGoal) ? 'text-success' : 'text-content-muted';

  // Блок игрока — аватар + номер рядом (со стороны центра), имя под ними
  const avatarRow = (
    <div className={clsx('flex items-center gap-1.5', isHome ? 'flex-row' : 'flex-row-reverse')}>
      <PlayerAvatar photoUrl={mainPhoto} firstName={mainFirst} lastName={mainLast} />
      {mainNumber && (
        <span className="text-[11px] font-bold text-content-subtle tabular-nums">
          #{mainNumber}
        </span>
      )}
    </div>
  );

  const playerBlock = (
    <div className={clsx('flex flex-col gap-1 min-w-0', isHome ? 'items-start' : 'items-end')}>
      {avatarRow}
      <span className={clsx('text-[12px] font-bold text-content-main leading-tight', isHome ? 'text-left' : 'text-right')}>
        {mainName} {mainInitial}
      </span>
      {assistants.map((a, i) => (
        <span key={i} className={clsx('text-[11px] text-content-subtle leading-tight', isHome ? 'text-left' : 'text-right')}>
          #{a.number || '?'} {a.name} {a.initial}
        </span>
      ))}
      {isPenalty && ev.penalty_violation && (
        <span className={clsx('text-[10px] text-content-subtle leading-tight', isHome ? 'text-left' : 'text-right')}>
          {ev.penalty_violation}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-2 bg-surface-base border border-surface-border rounded-2xl px-3 py-3 my-1.5">
      {/* Левая сторона — хозяева */}
      <div className="flex-1 flex justify-start min-w-0">
        {isHome ? playerBlock : null}
      </div>

      {/* Центр — время + тип + состав */}
      <div className="flex flex-col items-center shrink-0 min-w-[60px] gap-1">
        <span className="text-[16px] font-bold text-content-main tabular-nums font-mono leading-tight mb-2">
          {time}
        </span>
        <span className={clsx('text-[11px] font-bold uppercase tracking-wide leading-tight', eventColor)}>
          {eventLabel}
        </span>
        {strength && (
          <span className="text-[8px] font-bold uppercase tracking-wide leading-tight text-content-muted">
            {strength}
          </span>
        )}
      </div>

      {/* Правая сторона — гости */}
      <div className="flex-1 flex justify-end min-w-0">
        {!isHome ? playerBlock : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function GameTimeline({ timeline, homeTeamId }) {
  const groupedByPeriod = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    const map = new Map();
    for (const ev of timeline) {
      if (!map.has(ev.period)) map.set(ev.period, []);
      map.get(ev.period).push(ev);
    }
    return [...map.entries()];
  }, [timeline]);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="py-12 text-center text-[10px] font-bold text-content-subtle uppercase tracking-wider">
        События матча не записаны
      </div>
    );
  }

  return (
    <div className="w-full">
      {groupedByPeriod.map(([period, events]) => (
        <div key={period}>
          <PeriodSeparator period={period} />
          {events.map((ev) => {
            const isHome = Number(ev.team_id) === Number(homeTeamId || ev.home_team_id);
            return <TimelineEvent key={ev.id} ev={ev} isHome={isHome} />;
          })}
        </div>
      ))}
    </div>
  );
}