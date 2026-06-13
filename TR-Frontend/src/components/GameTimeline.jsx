import React, { useMemo } from 'react';
import clsx from 'clsx';

// ─── Форматирование времени ─────────────────────────────────────────────────
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
const STRENGTH_LABELS = { pp1: 'БОЛ', pp2: 'БОЛ+2', sh1: 'МЕН', sh2: 'МЕН+2', en: 'П.В.', ps: 'ШБ', equal: '' };

// ─── Разделитель периода ────────────────────────────────────────────────────
function PeriodSeparator({ period }) {
  return (
    <div className="flex items-center gap-0 my-2">
      <div className="flex-1 h-px bg-content-subtle/25" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-content-subtle px-3 py-1">
        {PERIOD_LABELS[period] || period}
      </span>
      <div className="flex-1 h-px bg-content-subtle/25" />
    </div>
  );
}

// ─── Одно событие таймлайна ─────────────────────────────────────────────────
function TimelineEvent({ ev, isHome }) {
  const isGoal = ev.event_type === 'goal';
  const isPenalty = ev.event_type === 'penalty';
  const isSOGoal = ev.event_type === 'shootout_goal';
  const isSOMiss = ev.event_type === 'shootout_miss';
  const isShootout = isSOGoal || isSOMiss;

  const strength = STRENGTH_LABELS[ev.goal_strength] || '';
  const time = formatEventTime(ev.time_seconds);

  // Основной игрок
  const mainName = isGoal || isShootout
    ? (ev.scorer_last || ev.scorer_first || '—')
    : (ev.penalty_last || ev.penalty_first || '—');
  const mainNumber = isGoal || isShootout
    ? ev.scorer_number
    : ev.penalty_number;
  const mainInitial = isGoal || isShootout
    ? (ev.scorer_first ? ev.scorer_first[0] + '.' : '')
    : (ev.penalty_first ? ev.penalty_first[0] + '.' : '');

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

  // Метка события
  const eventLabel = isGoal || isSOGoal
    ? 'ГОЛ'
    : isSOMiss
      ? 'МИМО'
      : isPenalty
        ? `ШТРАФ (${ev.penalty_minutes}')`
        : '';

  const labelColor = isGoal || isSOGoal
    ? 'text-content-main'
    : isPenalty
      ? 'text-red-500'
      : 'text-content-subtle';

  // Блок информации об игроке
  const playerBlock = (
    <div className={clsx('flex flex-col gap-0.5', isHome ? 'items-start' : 'items-end')}>
      <span className={clsx('text-[13px] font-black uppercase tracking-wide leading-tight', labelColor)}>
        {eventLabel}
        {strength && (
          <span className="text-[9px] font-black text-brand ml-1.5 bg-brand/10 px-1 py-0.5 rounded">
            {strength}
          </span>
        )}
      </span>

      <span className={clsx('text-[12px] font-bold text-content-main leading-tight', isHome ? 'text-left' : 'text-right')}>
        {mainNumber ? `[${mainNumber}] ` : ''}{mainName} {mainInitial}
      </span>

      {assistants.map((a, i) => (
        <span key={i} className={clsx('text-[10px] font-medium text-content-muted leading-tight', isHome ? 'text-left' : 'text-right')}>
          [{a.number || '?'}] {a.name} {a.initial}
        </span>
      ))}

      {isPenalty && ev.penalty_violation && (
        <span className={clsx('text-[9px] text-content-subtle leading-tight mt-0.5 max-w-[140px]', isHome ? 'text-left' : 'text-right')}>
          {ev.penalty_violation}
        </span>
      )}
    </div>
  );

  return (
    <div className="relative flex items-start py-3">
      {/* Левая сторона (хозяева) */}
      <div className="w-[42%] flex justify-end pr-3">
        {isHome ? playerBlock : null}
      </div>

      {/* Пунктирная линия от текста к центру */}
      {isHome && (
        <div className="absolute left-[42%] right-1/2 top-[18px] border-t border-dotted border-content-subtle/30" />
      )}

      {/* Центральная ось с временем */}
      <div className="w-[16%] flex flex-col items-center relative z-10 shrink-0">
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-[2px] bg-surface-border" />
        <div className="relative bg-surface-base border border-surface-border rounded-lg px-2 py-0.5 z-10">
          <span className="text-[11px] font-black font-mono text-content-muted tabular-nums">
            {time}
          </span>
        </div>
      </div>

      {/* Пунктирная линия от центра к тексту */}
      {!isHome && (
        <div className="absolute left-1/2 right-[42%] top-[18px] border-t border-dotted border-content-subtle/30" />
      )}

      {/* Правая сторона (гости) */}
      <div className="w-[42%] flex justify-start pl-3">
        {!isHome ? playerBlock : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Переиспользуемый вертикальный таймлайн хода матча
//
// Props:
//   timeline    — массив событий (из getGameTimeline)
//   homeTeamId  — ID хозяев (для определения left/right)
// ═══════════════════════════════════════════════════════════════════════════════
export function GameTimeline({ timeline, homeTeamId }) {
  // Группировка событий по периодам
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
    <div className="relative">
      {/* Фоновая вертикальная ось */}
      <div className="absolute left-1/2 top-0 bottom-0 -translate-x-px w-[2px] bg-surface-border" />

      {groupedByPeriod.map(([period, events]) => (
        <div key={period}>
          <PeriodSeparator period={period} />
          {events.map((ev) => {
            const isHome = Number(ev.team_id) === Number(homeTeamId || ev.home_team_id);
            return (
              <TimelineEvent
                key={ev.id}
                ev={ev}
                isHome={isHome}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}