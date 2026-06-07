import React from 'react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { getImageUrl } from '../../utils/helpers';

export function TournamentCardGame({ game }) {
  const isFinished = game.status === 'finished';
  const isLive = game.status === 'live';
  const hasTime = !!game.game_date;

  // Форматирование времени и даты (без года для всех состояний карточки)
  const formattedTime = hasTime ? dayjs(game.game_date).format('HH:mm') : '—';
  const formattedDateShort = hasTime ? dayjs(game.game_date).format('DD.MM') : '—'; 

  // Определение хоккейных модификаторов завершения матча
  const isTech = game.end_type === 'tech' || !!game.is_technical;
  const isOvertime = game.end_type === 'ot';
  const isShootout = game.end_type === 'so';

  // Вычисление отображаемого счета со знаками + и - для технических результатов
  let homeScoreDisplay = '-';
  let awayScoreDisplay = '-';

  if (isFinished || isLive) {
    if (isTech) {
      if (game.is_technical === '+/-') {
        homeScoreDisplay = '+';
        awayScoreDisplay = '-';
      } else if (game.is_technical === '-/+') {
        homeScoreDisplay = '-';
        awayScoreDisplay = '+';
      } else if (game.is_technical === '-/-') {
        homeScoreDisplay = '-';
        awayScoreDisplay = '-';
      } else {
        homeScoreDisplay = '+';
        awayScoreDisplay = '-';
      }
    } else {
      homeScoreDisplay = game.home_score;
      awayScoreDisplay = game.away_score;
    }
  }

  // Общий стиль для цифр счета (красный для LIVE или ТЕХ)
  const scoreColorClass = (isLive || (isFinished && isTech)) ? "text-red-500" : "text-content-main";

  // Флаг того, идет ли матч сейчас или уже завершился
  const isPlayedOrLive = isFinished || isLive;

  return (
    <div className={clsx(
      "w-full bg-surface-base rounded-3xl border px-2 pb-2 pt-4 flex flex-col shadow-md gap-2 relative overflow-hidden select-none",
      isLive ? "border-red-500/30 shadow-md shadow-red-500/5" : "border-surface-border/40"
    )}>
      
      {/* 1. ОСНОВНОЙ БЛОК: Центрированное противостояние */}
      <div className="w-full flex items-center justify-between relative">
        
        {/* ХОЗЯЕВА (Левая половина) */}
        <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <img src={getImageUrl(game.home_team_logo)} alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
            {game.home_team_name || 'Хозяева'}
          </span>
        </div>

        {/* ЦЕНТРАЛЬНЫЙ БЛОК: СЧЕТ ИЛИ КРУПНОЕ ВРЕМЯ НАЧАЛА */}
        <div className="flex flex-col items-center justify-center text-center shrink-0 px-1 min-w-[84px]">
          {isPlayedOrLive ? (
            /* Если матч прошел или LIVE — выводим крупный счет */
            <div className="flex items-center gap-1 font-bold font-black text-[26px] tracking-tighter justify-center leading-none">
              <span className={scoreColorClass}>{homeScoreDisplay}</span>
              <span className="text-content-subtle text-lg font-bold pb-0.5 px-1">:</span>
              <span className={scoreColorClass}>{awayScoreDisplay}</span>
            </div>
          ) : hasTime ? (
            /* Предстоящий матч: Крупное время и дата без года */
            <div className="flex flex-col items-center justify-center leading-none bg-brand-opacity px-3 py-1.5 rounded-xl border border-brand/5 shadow-xs">
              <span className="text-[18px] font-black text-brand font-mono tracking-wide">{formattedTime}</span>
              <span className="text-[14px] font-black text-brand font-mono mt-1 tracking-wider opacity-85">{formattedDateShort}</span>
            </div>
          ) : (
            <span className="text-[20px] font-black text-content-subtle font-mono tracking-widest opacity-50">VS</span>
          )}

          {/* Хоккейные маркеры исхода (от / булл / тех) — только у завершенных */}
          {isFinished && (isOvertime || isShootout || isTech) && (
            <span className={clsx(
              "text-[9px] font-bold uppercase tracking-widest mt-1.5 px-1.5 py-0.5 rounded leading-none border shadow-xs",
              isTech ? "text-red-500 bg-red-500/5 border-red-500/10" : "text-brand bg-brand-opacity border-brand/10"
            )}>
              {isOvertime && 'от'}
              {isShootout && 'булл'}
              {isTech && 'тех'}
            </span>
          )}

          {/* Пульсирующий LIVE маркер */}
          {isLive && (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full animate-pulse mt-1.5">
              <span className="w-1 h-1 rounded-full bg-red-500" />
              <span className="text-[9px] font-black text-red-500 uppercase tracking-tight">LIVE</span>
            </div>
          )}
        </div>

        {/* ГОСТИ (Правая половина) */}
        <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <img src={getImageUrl(game.away_team_logo)} alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
            {game.away_team_name || 'Гости'}
          </span>
        </div>

      </div>

      {/* 2. НИЖНЯЯ СТРОКА: Центрированные по центру метаданные без лишних годов */}
      <div className="w-full grid grid-cols-[1fr,auto,1fr] items-center text-[9px] font-bold text-content-muted border-t border-surface-level2/50 pt-1 px-0.5 relative">
        
        {/* Пустой левый блок для обеспечения идеального математического центрирования */}
        <div className="min-w-0" />
        
        {/* Центральный блок: Строго по центру карточки */}
        <div className="flex items-center justify-center gap-3 truncate max-w-[240px] px-2">
          {isPlayedOrLive ? (
            /* Если матч сыгран/идет — цепочка по центру: Число.Месяц • Время • Арена */
            <>
              <span className="font-bold text-content-muted shrink-0">{formattedDateShort}</span>
              <span className="text-content-muted font-mono shrink-0">•</span>
              <span className="font-bold text-content-muted shrink-0">{formattedTime}</span>
              <span className="text-content-muted font-mono shrink-0">•</span>
              <span className="truncate">{game.arena_name || 'Арена не указана'}</span>
            </>
          ) : (
            /* Если матч предстоящий — по центру выводится только Арена (дата и время уже сверху) */
            <span className="truncate">{game.arena_name || 'Без арены'}</span>
          )}
        </div>
        
        {/* Правый блок: Отделенный и прижатый к правому краю номер матча */}
        <div className="flex justify-end shrink-0 opacity-60 pr-2">
          {game.game_number && (
            <span className="text-content-subtle">
              №{game.game_number}
            </span>
          )}
        </div>
      </div>

    </div>
  );
}