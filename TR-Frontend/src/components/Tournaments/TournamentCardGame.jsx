import React, { useState, useCallback, useRef } from 'react';
import { Icon } from '../../ui/Icon';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { getImageUrl, getAuthHeaders } from '../../utils/helpers';

// ─── Форматирование времени события ──────────────────────────────────────────
const formatEventTime = (seconds) => {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PERIOD_LABELS = { '1': '1-й период', '2': '2-й период', '3': '3-й период', '4': '4-й период', '5': '5-й период', 'OT': 'Овертайм', 'SO': 'Буллиты' };
const STRENGTH_LABELS = { pp1: 'БОЛ', pp2: 'БОЛ+2', sh1: 'МЕН', sh2: 'МЕН+2', en: 'П.В.', ps: 'ШБ', equal: '' };

// ─── Один элемент таймлайна ───────────────────────────────────────────────────
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

  // Ассистенты
  const assistants = [];
  if (ev.assist1_last || ev.assist1_first) {
    assistants.push({ name: ev.assist1_last || ev.assist1_first, number: ev.assist1_number });
  }
  if (ev.assist2_last || ev.assist2_first) {
    assistants.push({ name: ev.assist2_last || ev.assist2_first, number: ev.assist2_number });
  }

  // Иконка события
  const EventIcon = () => {
    if (isGoal) return (
      <div className="w-6 h-6 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
        <Icon name="puck" className="w-3.5 h-3.5 text-brand" />
      </div>
    );
    if (isPenalty) return (
      <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
        <Icon name="whistle" className="w-3.5 h-3.5 text-red-500" />
      </div>
    );
    if (isSOGoal) return (
      <div className="w-6 h-6 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
        <Icon name="puck" className="w-3.5 h-3.5 text-brand" />
      </div>
    );
    if (isSOMiss) return (
      <div className="w-6 h-6 rounded-full bg-surface-level2 flex items-center justify-center shrink-0">
        <Icon name="puck" className="w-3.5 h-3.5 text-content-subtle" />
      </div>
    );
    return null;
  };

  return (
    <div className={clsx(
      'flex items-start gap-2 py-1.5',
      isHome ? 'flex-row' : 'flex-row-reverse'
    )}>
      <EventIcon />

      {/* Основная информация */}
      <div className={clsx('flex flex-col min-w-0 flex-1', isHome ? 'items-start' : 'items-end')}>
        {/* Игрок + метка силы */}
        <div className={clsx('flex items-center gap-1.5 flex-wrap', isHome ? 'flex-row' : 'flex-row-reverse')}>
          {mainNumber && (
            <span className="text-[9px] font-black text-content-subtle bg-surface-level2 px-1 rounded leading-none py-0.5">
              #{mainNumber}
            </span>
          )}
          <span className={clsx(
            'text-[12px] font-bold leading-tight',
            (isGoal || isSOGoal) ? 'text-content-main' : isPenalty ? 'text-red-500' : 'text-content-muted'
          )}>
            {mainName}
          </span>
          {strength && (
            <span className="text-[8px] font-black text-brand bg-brand/10 px-1 py-0.5 rounded leading-none">
              {strength}
            </span>
          )}
        </div>

        {/* Ассистенты */}
        {assistants.length > 0 && (
          <div className={clsx('flex items-center gap-1 mt-0.5 flex-wrap', isHome ? 'flex-row' : 'flex-row-reverse')}>
            <span className="text-[9px] text-content-subtle">пас:</span>
            {assistants.map((a, i) => (
              <span key={i} className="text-[9px] text-content-muted font-medium">
                {a.number ? `#${a.number} ` : ''}{a.name}{i < assistants.length - 1 ? ',' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Штраф: время + причина */}
        {isPenalty && (
          <div className={clsx('flex items-center gap-1 mt-0.5', isHome ? 'flex-row' : 'flex-row-reverse')}>
            <span className="text-[9px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded leading-none">
              {ev.penalty_minutes} мин
            </span>
            {ev.penalty_violation && (
              <span className="text-[9px] text-content-subtle truncate max-w-[140px]">
                {ev.penalty_violation}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Время — всегда в центре */}
      <span className="text-[10px] font-black font-mono text-content-subtle shrink-0 w-8 text-center mt-0.5">
        {time}
      </span>
    </div>
  );
}

// ─── Разделитель периода ──────────────────────────────────────────────────────
function PeriodDivider({ period }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 h-px bg-surface-level2" />
      <span className="text-[8px] font-black uppercase tracking-widest text-content-subtle px-1">
        {PERIOD_LABELS[period] || period}
      </span>
      <div className="flex-1 h-px bg-surface-level2" />
    </div>
  );
}

// ─── Скелетон загрузки ────────────────────────────────────────────────────────
function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2 animate-pulse px-1">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-level2 shrink-0" />
          <div className="flex flex-col gap-1 flex-1">
            <div className="h-2.5 bg-surface-level2 rounded w-2/3" />
            <div className="h-2 bg-surface-level2 rounded w-1/3" />
          </div>
          <div className="w-8 h-2.5 bg-surface-level2 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────
export function TournamentCardGame({ game }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeline, setTimeline] = useState(null);   // null = не загружено
  const [goalie_shots, setGoalieShots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedRef = useRef(false);

  const isFinished = game.status === 'finished';
  const isLive = game.status === 'live';
  const hasTime = !!game.game_date;
  const isPlayedOrLive = isFinished || isLive;
  const canExpand = isPlayedOrLive;

  const formattedTime = hasTime ? dayjs(game.game_date).format('HH:mm') : '—';
  const formattedDateShort = hasTime ? dayjs(game.game_date).format('DD.MM') : '—';

  const isTech = game.end_type === 'tech' || !!game.is_technical;
  const isOvertime = game.end_type === 'ot';
  const isShootout = game.end_type === 'so';

  let homeScoreDisplay = '-';
  let awayScoreDisplay = '-';
  if (isPlayedOrLive) {
    if (isTech) {
      if (game.is_technical === '+/-') { homeScoreDisplay = '+'; awayScoreDisplay = '-'; }
      else if (game.is_technical === '-/+') { homeScoreDisplay = '-'; awayScoreDisplay = '+'; }
      else if (game.is_technical === '-/-') { homeScoreDisplay = '-'; awayScoreDisplay = '-'; }
      else { homeScoreDisplay = '+'; awayScoreDisplay = '-'; }
    } else {
      homeScoreDisplay = game.home_score;
      awayScoreDisplay = game.away_score;
    }
  }

  const scoreColorClass = (isLive || (isFinished && isTech)) ? 'text-red-500' : 'text-content-main';

  // Ленивая загрузка при первом раскрытии
  const handleToggle = useCallback(() => {
    if (!canExpand) return;

    // Раскрываем карточку мгновенно — данные догрузятся параллельно
    setIsExpanded(prev => !prev);

    // Загружаем данные только при первом раскрытии
    if (!loadedRef.current) {
      loadedRef.current = true;
      setIsLoading(true);
      fetch(
        `${import.meta.env.VITE_API_URL}/api/tournaments/games/${game.id}/timeline`,
        { headers: getAuthHeaders() }
      )
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          setTimeline(data.timeline || []);
          setGoalieShots(data.goalie_shots || []);
        })
        .catch(() => setTimeline([]))
        .finally(() => setIsLoading(false));
    }
  }, [canExpand, game.id]);

  // Группировка событий по периодам
  const groupedByPeriod = React.useMemo(() => {
    if (!timeline) return [];
    const map = new Map();
    for (const ev of timeline) {
      if (!map.has(ev.period)) map.set(ev.period, []);
      map.get(ev.period).push(ev);
    }
    return [...map.entries()]; // [[period, events[]], ...]
  }, [timeline]);

  return (
    <div className={clsx(
      'w-full bg-surface-base rounded-3xl border px-2 pb-2 pt-4 flex flex-col shadow-md gap-2 relative overflow-hidden select-none',
      isLive ? 'border-red-500/30 shadow-md shadow-red-500/5' : 'border-surface-border'
    )}>

      {/* ── ВЕРХНЯЯ ЧАСТЬ: счёт/время + команды ── */}
      <div
        className={clsx('w-full flex items-center justify-between relative', canExpand && 'cursor-pointer')}
        onClick={handleToggle}
      >
        {/* Хозяева */}
        <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <img src={getImageUrl(game.home_team_logo)} alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
            {game.home_team_name || 'Хозяева'}
          </span>
        </div>

        {/* Центральный блок */}
        <div className="flex flex-col items-center justify-center text-center shrink-0 px-1 min-w-[84px]">
          {isPlayedOrLive ? (
            <div className="flex items-center gap-1 font-black text-[26px] tracking-tighter justify-center leading-none">
              <span className={scoreColorClass}>{homeScoreDisplay}</span>
              <span className="text-content-subtle text-lg font-bold pb-0.5 px-1">:</span>
              <span className={scoreColorClass}>{awayScoreDisplay}</span>
            </div>
          ) : hasTime ? (
            <div className="flex flex-col items-center justify-center leading-none bg-brand-opacity px-3 py-1.5 rounded-xl border border-brand/5 shadow-xs">
              <span className="text-[18px] font-black text-brand font-mono tracking-wide">{formattedTime}</span>
              <span className="text-[14px] font-black text-brand font-mono mt-1 tracking-wider opacity-85">{formattedDateShort}</span>
            </div>
          ) : (
            <span className="text-[20px] font-black text-content-subtle font-mono tracking-widest opacity-50">VS</span>
          )}

          {isFinished && (isOvertime || isShootout || isTech) && (
            <span className={clsx(
              'text-[9px] font-bold uppercase tracking-widest mt-1.5 px-1.5 py-0.5 rounded leading-none border shadow-xs',
              isTech ? 'text-red-500 bg-red-500/5 border-red-500/10' : 'text-brand bg-brand-opacity border-brand/10'
            )}>
              {isOvertime && 'от'}
              {isShootout && 'булл'}
              {isTech && 'тех'}
            </span>
          )}

          {isLive && (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full animate-pulse mt-1.5">
              <span className="w-1 h-1 rounded-full bg-red-500" />
              <span className="text-[9px] font-black text-red-500 uppercase tracking-tight">LIVE</span>
            </div>
          )}

          {/* Стрелка аккордеона */}
          {canExpand && (
            <Icon
              name="chevron"
              className={clsx('w-3.5 h-3.5 text-content-subtle mt-2 transition-transform duration-300', isExpanded && 'rotate-180')}
            />
          )}
        </div>

        {/* Гости */}
        <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <img src={getImageUrl(game.away_team_logo)} alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
            {game.away_team_name || 'Гости'}
          </span>
        </div>
      </div>

      {/* ── НИЖНЯЯ СТРОКА: метаданные ── */}
      <div className="w-full grid grid-cols-[1fr,auto,1fr] items-center text-[9px] font-bold text-content-muted border-t border-surface-level2/50 pt-1 px-0.5 relative">
        <div className="min-w-0" />
        <div className="flex items-center justify-center gap-3 truncate max-w-[240px] px-2">
          {isPlayedOrLive ? (
            <>
              <span className="font-bold text-content-muted shrink-0">{formattedDateShort}</span>
              <span className="text-content-muted font-mono shrink-0">•</span>
              <span className="font-bold text-content-muted shrink-0">{formattedTime}</span>
              <span className="text-content-muted font-mono shrink-0">•</span>
              <span className="truncate">{game.arena_name || 'Арена не указана'}</span>
            </>
          ) : (
            <span className="truncate">{game.arena_name || 'Без арены'}</span>
          )}
        </div>
        <div className="flex justify-end shrink-0 opacity-60 pr-2">
          {game.game_number && (
            <span className="text-content-subtle">№{game.game_number}</span>
          )}
        </div>
      </div>

      {/* ── АККОРДЕОН: ТАЙМЛАЙН ── */}
      <div className={clsx(
        'grid transition-all duration-300 ease-in-out overflow-hidden',
        isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}>
        <div className="overflow-hidden">
          <div className="border-t border-surface-level2/50 mt-1 pt-2 px-1">

            {isLoading && <TimelineSkeleton />}

            {!isLoading && timeline !== null && timeline.length === 0 && (
              <div className="py-4 text-center text-[10px] text-content-subtle font-medium">
                События матча не записаны
              </div>
            )}

            {!isLoading && groupedByPeriod.length > 0 && (
              <div className="flex flex-col">
                {groupedByPeriod.map(([period, events], pIdx) => (
                  <div key={period}>
                    <PeriodDivider period={period} />
                    <div className="flex flex-col divide-y divide-surface-level2/40">
                      {events.map((ev) => {
                        const isHome = Number(ev.team_id) === Number(ev.home_team_id);
                        return (
                          <TimelineEvent
                            key={ev.id}
                            ev={ev}
                            isHome={isHome}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Отражённые броски вратарей */}
            {!isLoading && goalie_shots.length > 0 && (
              <div className="mt-3 pt-3 border-t border-surface-level2/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-surface-level2" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-content-subtle px-1">
                    Отражённые броски
                  </span>
                  <div className="flex-1 h-px bg-surface-level2" />
                </div>
                <div className="flex flex-col gap-1 px-1">
                  {/* Хозяева */}
                  {[
                    { teamId: Number(game.home_team_id), label: game.home_team_short_name || game.home_team_name },
                    { teamId: Number(game.away_team_id), label: game.away_team_short_name || game.away_team_name },
                  ].map(({ teamId, label }) => {
                    const teamGoalies = goalie_shots.filter(g => Number(g.team_id) === teamId);
                    if (!teamGoalies.length) return null;
                    return (
                      <div key={teamId} className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold text-content-subtle uppercase tracking-wide shrink-0 w-16 truncate">
                          {label}
                        </span>
                        <div className="flex flex-col gap-0.5 flex-1">
                          {teamGoalies.map(g => (
                            <div key={g.goalie_id} className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-medium text-content-muted">
                                {g.jersey_number ? `#${g.jersey_number} ` : ''}{g.last_name || g.first_name || '—'}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] font-black text-content-main tabular-nums">
                                  {g.total_shots}
                                </span>
                                <span className="text-[8px] text-content-subtle font-medium">ОБ</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}