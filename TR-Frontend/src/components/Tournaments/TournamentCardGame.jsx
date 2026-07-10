import React, { useRef, useState, useLayoutEffect } from 'react';
import { Icon } from '../../ui/Icon';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { getImageUrl } from '../../utils/helpers';

// ─── Основной компонент ───────────────────────────────────────────────────────
export function TournamentCardGame({ game }) {
  // Определяем, перенеслась ли арена на вторую строку (тогда точку-разделитель
  // перед ней не показываем). CSS не умеет детектить факт переноса flex-wrap,
  // поэтому сравниваем вертикальные позиции блоков через ResizeObserver.
  const dateGroupRef = useRef(null);
  const arenaGroupRef = useRef(null);
  const [arenaWrapped, setArenaWrapped] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      if (dateGroupRef.current && arenaGroupRef.current) {
        setArenaWrapped(arenaGroupRef.current.offsetTop > dateGroupRef.current.offsetTop);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    if (dateGroupRef.current?.parentElement) ro.observe(dateGroupRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  const isFinished = game.status === 'finished';
  const isLive = game.status === 'live';
  const hasTime = !!game.game_date;
  const isPlayedOrLive = isFinished || isLive;

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

  return (
    <div className={clsx(
      'w-full bg-surface-level1 rounded-3xl border px-2 pt-4 flex flex-col shadow-md gap-2 relative overflow-hidden select-none',
      isLive ? 'border-red-500/30 shadow-md shadow-red-500/5' : 'border-surface-border'
    )}>

      {/* ── ВЕРХНЯЯ ЧАСТЬ: счёт / VS + команды ── */}
      <div className="w-full flex items-center justify-between relative">
        {/* Хозяева */}
        <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
          <div className="w-14 h-14 flex items-center justify-center shrink-0">
            <img src={getImageUrl(game.home_team_logo)} alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[12px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
            {game.home_team_name || 'Хозяева'}
          </span>
        </div>

        {/* Центральный блок */}
        <div className="flex flex-col items-center justify-center text-center shrink-0 px-1 min-w-[84px]">
          {isPlayedOrLive ? (
            <div className="flex items-center gap-1 font-black text-[28px] tracking-tighter justify-center leading-none">
              <span className={scoreColorClass}>{homeScoreDisplay}</span>
              <span className="text-content-subtle text-[18px] font-bold pb-0.5 px-1">:</span>
              <span className={scoreColorClass}>{awayScoreDisplay}</span>
            </div>
          ) : (
            <span className="text-[18px] font-black text-content-subtle font-mono tracking-widest opacity-50">VS</span>
          )}

          {isFinished && (isOvertime || isShootout || isTech) && (
            <span className={clsx(
              'text-[12px] font-bold uppercase tracking-widest mt-1.5 px-1.5 py-0.5 rounded leading-none border shadow-xs',
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
              <span className="text-[10px] font-black text-red-500 uppercase tracking-tight">LIVE</span>
            </div>
          )}
        </div>

        {/* Гости */}
        <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
          <div className="w-14 h-14 flex items-center justify-center shrink-0">
            <img src={getImageUrl(game.away_team_logo)} alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[12px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
            {game.away_team_name || 'Гости'}
          </span>
        </div>
      </div>

      {/* ── НИЖНЯЯ СТРОКА: метаданные ── */}
      <div className="w-full grid grid-cols-[1fr,auto,1fr] items-center text-[14px] font-semibold text-content-muted border-t border-surface-level2 py-3 px-0.5 relative">
        <div className="min-w-0" />
        {/* Дата+время не переносятся; арена уезжает на вторую строку по центру, если не влезает в одну.
            Точка перед ареной скрывается через visibility (а не удаляется из потока), чтобы
            освободившееся место не «расклеивало» перенос обратно и вёрстка не мигала. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-2">
          <div ref={dateGroupRef} className="flex items-center gap-3 shrink-0">
            <span className="font-sbold text-content-muted">{formattedDateShort}</span>
            <span className="text-content-muted font-mono">•</span>
            <span className="font-sbold text-content-muted">{formattedTime}</span>
          </div>
          <div ref={arenaGroupRef} className="flex items-center gap-3">
            <span className={clsx("text-content-muted font-mono", arenaWrapped && "invisible")}>•</span>
            <span className="text-center">{game.arena_name || 'Арена не указана'}</span>
          </div>
        </div>
        <div className="flex justify-end shrink-0 opacity-60 pr-2">
          {game.game_number && (
            <span className="text-[10px] text-content-subtle opacity-40">{game.game_number}</span>
          )}
        </div>
      </div>

    </div>
  );
}