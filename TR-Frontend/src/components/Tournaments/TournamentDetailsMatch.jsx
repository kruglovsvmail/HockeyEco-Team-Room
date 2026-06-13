import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { getAuthHeaders, getImageUrl } from '../../utils/helpers';
import { ChipTabs } from '../../ui/ChipTabs';
import { PageLoader } from '../../ui/Loader';

// Переиспользуемые компоненты из src/components/
import { GameTeamStats } from '../GameTeamStats';
import { GameTimeline } from '../GameTimeline';

const DETAIL_TABS = [
  { id: 'stats', label: 'Статистика' },
  { id: 'timeline', label: 'Ход матча' }
];

// ═══════════════════════════════════════════════════════════════════════════════
// Правая панель деталей матча турнира
// ═══════════════════════════════════════════════════════════════════════════════
export function TournamentDetailsMatch({ game, activeBrandColor, hasTeamColor }) {
  const [activeTab, setActiveTab] = useState('stats');
  const [timeline, setTimeline] = useState(null);
  const [teamStats, setTeamStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Загружаем данные один раз при монтировании
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/matches/${game.id}/details`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setTimeline(data.timeline || []);
          setTeamStats(data.team_stats || null);
        }
      } catch (err) {
        console.error('Ошибка загрузки данных матча:', err);
        setTimeline([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [game.id]);

  // Вычисляемые данные матча
  const isFinished = game.status === 'finished';
  const isLive = game.status === 'live';
  const isPlayedOrLive = isFinished || isLive;
  const hasTime = !!game.game_date;

  const formattedTime = hasTime ? dayjs(game.game_date).format('HH:mm') : '—';
  const formattedDate = hasTime ? dayjs(game.game_date).format('DD.MM.YYYY') : '—';

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

  // Короткие названия команд (аббревиатуры)
  const homeShort = game.home_team_short_name || game.home_team_name || 'ХОЗ';
  const awayShort = game.away_team_short_name || game.away_team_name || 'ГОС';

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── КОМПАКТНАЯ ШАПКА МАТЧА ── */}
      <div className="shrink-0 bg-surface-base border-b border-surface-border px-4 pt-4 pb-2">
        {/* Команды и счёт */}
        <div className="flex items-center justify-between gap-2">
          {/* Хозяева */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 shrink-0">
              <img src={getImageUrl(game.home_team_logo)} alt="" className="w-full h-full object-contain" />
            </div>
            <span className="text-[12px] font-black uppercase tracking-wide text-content-main truncate">
              {homeShort}
            </span>
          </div>

          {/* Счёт / время */}
          <div className="flex flex-col items-center shrink-0 px-2">
            {isPlayedOrLive ? (
              <div className="flex items-center gap-1">
                <span className={clsx('text-[22px] font-black tabular-nums', scoreColorClass)}>{homeScoreDisplay}</span>
                <span className="text-content-subtle text-sm font-bold px-0.5">:</span>
                <span className={clsx('text-[22px] font-black tabular-nums', scoreColorClass)}>{awayScoreDisplay}</span>
              </div>
            ) : hasTime ? (
              <span className="text-[16px] font-black text-brand font-mono">{formattedTime}</span>
            ) : (
              <span className="text-[16px] font-black text-content-subtle font-mono">VS</span>
            )}

            {isFinished && (isOvertime || isShootout || isTech) && (
              <span className={clsx(
                'text-[8px] font-bold uppercase tracking-widest mt-0.5 px-1.5 py-0.5 rounded leading-none',
                isTech ? 'text-red-500 bg-red-500/5' : 'text-brand bg-brand-opacity'
              )}>
                {isOvertime && 'ОТ'}
                {isShootout && 'БУЛЛ'}
                {isTech && 'ТЕХ'}
              </span>
            )}

            {isLive && (
              <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded-full animate-pulse mt-0.5">
                <span className="w-1 h-1 rounded-full bg-red-500" />
                <span className="text-[8px] font-black text-red-500 uppercase">LIVE</span>
              </div>
            )}
          </div>

          {/* Гости */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <span className="text-[12px] font-black uppercase tracking-wide text-content-main truncate text-right">
              {awayShort}
            </span>
            <div className="w-9 h-9 shrink-0">
              <img src={getImageUrl(game.away_team_logo)} alt="" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>

        {/* Мета: дата, время, арена */}
        <div className="flex items-center justify-center gap-2 mt-2 text-[10px] font-bold text-content-muted">
          <span>{formattedDate}</span>
          <span className="opacity-40">•</span>
          <span>{formattedTime}</span>
          <span className="opacity-40">•</span>
          <span className="truncate max-w-[140px]">{game.arena_name || 'Арена не указана'}</span>
        </div>
      </div>

      {/* ── ЧИПСЫ-ТАБЫ ── */}
      <ChipTabs
        tabs={DETAIL_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
        activeColor={hasTeamColor ? activeBrandColor : undefined}
        className="!px-2 !mx-0"
      />

      {/* ── КОНТЕНТ ── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {isLoading ? (
          <PageLoader />
        ) : activeTab === 'stats' ? (
          <div className="px-4 pb-6 pt-1">
            <GameTeamStats teamStats={teamStats} />
          </div>
        ) : (
          <div className="px-2 pb-6 pt-2">
            <GameTimeline timeline={timeline} homeTeamId={game.home_team_id} />
          </div>
        )}
      </div>
    </div>
  );
}