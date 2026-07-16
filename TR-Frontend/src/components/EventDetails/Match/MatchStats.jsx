import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';
import { FadeIn } from '../../../ui/FadeIn';
import { PageLoader } from '../../../ui/Loader';
import { Avatar } from '../../../ui/Avatar';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ ПАРАМЕТРОВ КОМАНДНОЙ СТАТИСТИКИ
// ═══════════════════════════════════════════════════════════════════════
const STAT_ROWS = [
  { key: 'shots_on_goal', label: 'Броски в створ' },
  { key: 'shooting_pct', label: '% реализации', isPercentage: true },
  { key: 'pp_goals',      label: 'Голы в большинстве' },
  { key: 'sh_goals',      label: 'Голы в меньшинстве' },
  { key: 'pim',           label: 'Штрафное время' },
  { key: 'saves',         label: 'Отр. броски' },
  { key: 'save_pct',      label: '% отр. бросков', isPercentage: true },
];

// ═══════════════════════════════════════════════════════════════════════
// СТРОКА СРАВНЕНИЯ ОДНОГО КОМАНДНОГО ПАРАМЕТРА
// ═══════════════════════════════════════════════════════════════════════
const StatRow = ({ label, homeValue, awayValue, isPercentage, homeColor, awayColor, isLast }) => {
  // null/undefined → «—» (броски не заполнены). 0 при наличии данных остаётся 0.
  const fmt = (v) => (v == null ? '—' : (isPercentage ? `${Number(v).toFixed(1)}%` : v));
  const displayHome = fmt(homeValue);
  const displayAway = fmt(awayValue);

  const hv = Number(homeValue) || 0;
  const av = Number(awayValue) || 0;
  const maxVal = Math.max(hv, av, 0.001);
  const homePct = (hv / maxVal) * 100;
  const awayPct = (av / maxVal) * 100;

  return (
    <div className={`flex flex-col gap-2 py-3 px-4 ${!isLast ? '' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-content-main w-14 text-left tabular-nums leading-none">
          {displayHome}
        </span>
        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider text-center flex-1 leading-none">
          {label}
        </span>
        <span className="text-[14px] font-bold text-content-main w-14 text-right tabular-nums leading-none">
          {displayAway}
        </span>
      </div>

      <div className="flex items-center gap-[8px]">
        <div className="flex-1">
          <div className="relative w-full h-[3px] opacity-70">
            <div className="absolute inset-0 rounded-full" style={{ backgroundColor: homeColor, opacity: 0.35 }} />
            <div className="absolute top-0 right-0 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
          </div>
        </div>
        <div className="flex-1">
          <div className="relative w-full h-[3px] opacity-70">
            <div className="absolute inset-0 rounded-full" style={{ backgroundColor: awayColor, opacity: 0.35 }} />
            <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${awayPct}%`, backgroundColor: awayColor }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ИКОНКА-ШЕВРОН ДЛЯ АККОРДЕОНА
// ═══════════════════════════════════════════════════════════════════════
const ChevronIcon = ({ isExpanded }) => (
  <svg
    className={clsx("w-4 h-4 text-content-muted transition-transform duration-300", isExpanded && "rotate-180")}
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════
// УНИВЕРСАЛЬНАЯ ОБЁРТКА АККОРДЕОНА (плавная анимация через scrollHeight)
// ═══════════════════════════════════════════════════════════════════════
const Accordion = ({ title, titleLeft, isExpanded, onToggle, children }) => {
  const bodyRef = useRef(null);
  const [height, setHeight] = useState(0);

  // При каждом изменении isExpanded берём реальную высоту содержимого
  useEffect(() => {
    if (!bodyRef.current) return;
    setHeight(isExpanded ? bodyRef.current.scrollHeight : 0);
  }, [isExpanded]);

  // Пересчёт при изменении содержимого (сортировка меняет высоту таблицы)
  useEffect(() => {
    if (isExpanded && bodyRef.current) {
      setHeight(bodyRef.current.scrollHeight);
    }
  });

  return (
    <div className="bg-surface-level1 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-3 active:opacity-70 cursor-pointer select-none"
      >
        {titleLeft ?? (
          <span className="text-[14px] font-bold text-content-main">{title}</span>
        )}
        <ChevronIcon isExpanded={isExpanded} />
      </button>

      <div
        style={{ maxHeight: height, transition: 'max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1)' }}
        className="overflow-hidden"
      >
        <div ref={bodyRef} className="border-t border-surface-border">
          {children}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ИНДИКАТОР СОРТИРОВКИ
// ═══════════════════════════════════════════════════════════════════════
const SortIndicator = ({ sortState, columnKey }) => {
  if (sortState.key !== columnKey) return <span className="opacity-20 ml-0.5">↕</span>;
  return sortState.order === 'desc'
    ? <span className="text-brand ml-0.5">↓</span>
    : <span className="text-brand ml-0.5">↑</span>;
};

// ═══════════════════════════════════════════════════════════════════════
// ОБЁРТКА СКРОЛЛИРУЕМОЙ ЧАСТИ С FADE-ГРАДИЕНТОМ СПРАВА
// ═══════════════════════════════════════════════════════════════════════
const ScrollFade = ({ children, onTouchStart, onTouchMove }) => (
  <div className="relative flex-1 min-w-0">
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      className="overflow-x-auto scrollbar-hide flex flex-col mr-2"
    >
      {children}
    </div>
    {/* Градиент-подсказка: справа есть ещё колонки */}
    <div
      className="pointer-events-none absolute top-0 right-0 h-full w-8"
      style={{ background: 'linear-gradient(to right, transparent, var(--color-surface-level1))' }}
    />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
// СТРОКА ИГРОКА (левая фиксированная колонка)
// ═══════════════════════════════════════════════════════════════════════
const PlayerCell = ({ player, idx, onClick }) => (
  <div
    onClick={onClick}
    className={clsx(
      "h-14 flex items-center px-2 border-b border-surface-border last:border-0 text-left font-semibold text-content-main",
      onClick && "cursor-pointer active:opacity-70 transition-opacity"
    )}
  >
    <div className="w-4 text-[10px] font-mono text-content-muted text-center shrink-0 opacity-50">{idx + 1}</div>
    <div className="flex items-center gap-2 min-w-0 flex-1 pl-1">
      <div className="relative shrink-0">
        <Avatar
          photoUrl={player.photo_url}
          firstName={player.first_name}
          lastName={player.last_name}
          className="w-9 h-9 rounded-lg bg-surface-level2"
        />
        {player.jersey_number != null && (
          <span className="absolute -bottom-1 -left-1 min-w-[22px] min-h-[15px] p-0.5 rounded-full bg-content-main text-content-dark text-[10px] font-ack flex items-center justify-center border border-surface-level1 leading-none tabular-nums">
            {player.jersey_number}
          </span>
        )}
      </div>
      <div className="flex flex-col min-w-0 leading-tight gap-0.5">
        <span className="text-[14px] font-normal text-content-main truncate">{player.last_name}</span>
        <span className="text-[12px] text-content-muted font-normal truncate">{player.first_name}</span>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
// АККОРДЕОН ИГРОКОВ ОДНОЙ КОМАНДЫ
// ═══════════════════════════════════════════════════════════════════════
const PlayerAccordion = ({ teamName, teamLogo, goalies, skaters, rosterSubmitted, hasTeamColor, activeBrandColor, openRightPanel }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePlayerClick = (player) => {
    if (!openRightPanel || !player?.player_id) return;
    openRightPanel('playerProfile', { playerId: player.player_id, activeBrandColor, hasTeamColor }, 'Профиль игрока');
  };

  // Сортировка полевых
  const [skaterSort, setSkaterSort] = useState({ key: 'points', order: 'desc' });
  const handleSkaterSort = (key) => {
    setSkaterSort(prev => ({ key, order: prev.key === key ? (prev.order === 'desc' ? 'asc' : 'desc') : 'desc' }));
  };
  const sortedSkaters = useMemo(() => {
    if (!skaters?.length) return [];
    return [...skaters].sort((a, b) => {
      const valA = Number(a[skaterSort.key]) || 0;
      const valB = Number(b[skaterSort.key]) || 0;
      return skaterSort.order === 'desc' ? valB - valA : valA - valB;
    });
  }, [skaters, skaterSort]);

  // Сортировка вратарей
  const [goalieSort, setGoalieSort] = useState({ key: 'save_percent', order: 'desc' });
  const handleGoalieSort = (key) => {
    setGoalieSort(prev => ({ key, order: prev.key === key ? (prev.order === 'desc' ? 'asc' : 'desc') : 'desc' }));
  };
  const sortedGoalies = useMemo(() => {
    if (!goalies?.length) return [];
    return [...goalies].sort((a, b) => {
      const valA = Number(a[goalieSort.key]) || 0;
      const valB = Number(b[goalieSort.key]) || 0;
      return goalieSort.order === 'desc' ? valB - valA : valA - valB;
    });
  }, [goalies, goalieSort]);

  const handleTouchIsolation = (e) => { e.stopPropagation(); };

  const hasGoalies = sortedGoalies.length > 0;
  const hasSkaters = sortedSkaters.length > 0;

  const titleLeft = (
    <div className="flex items-center gap-2.5">
      {teamLogo ? (
        <img src={getImageUrl(teamLogo)} alt="" className="w-5 h-5 object-contain" />
      ) : (
        <div className="w-5 h-5 rounded bg-surface-level2" />
      )}
      <span className="text-[14px] font-bold text-content-main">{teamName}</span>
    </div>
  );

  return (
    <Accordion titleLeft={titleLeft} isExpanded={isExpanded} onToggle={() => setIsExpanded(p => !p)}>
      {!rosterSubmitted ? (
        <div className="flex justify-center items-center h-20 text-[10px] font-black text-content-muted uppercase tracking-widest">
          Команда не отправила заявку
        </div>
      ) : (
       <>
      {/* ── Таблица вратарей ─────────────────────────── */}
      {hasGoalies && (
        <div className="flex w-full">
          <div className="w-[190px] shrink-0 z-10 flex flex-col">
            <div className="h-[38px] flex items-center px-2 text-[10px] font-normal uppercase tracking-wider text-content-muted border-b border-surface-border">
              <div className="w-4 text-center shrink-0">#</div>
              <div className="pl-3">Вратарь</div>
            </div>
            {sortedGoalies.map((row, idx) => (
              <PlayerCell key={row.player_id} player={row} idx={idx} onClick={() => handlePlayerClick(row)} />
            ))}
          </div>
          <ScrollFade onTouchStart={handleTouchIsolation} onTouchMove={handleTouchIsolation}>
            <div className="h-[38px] flex items-center bg-surface-level1 text-[10px] font-normal uppercase tracking-wider text-content-muted text-center select-none border-b border-surface-border min-w-[220px]">
              <div onClick={() => handleGoalieSort('goals_against')} className="w-10 shrink-0 cursor-pointer active:opacity-60">ПШ<SortIndicator sortState={goalieSort} columnKey="goals_against" /></div>
              <div onClick={() => handleGoalieSort('saves')} className="w-10 shrink-0 cursor-pointer active:opacity-60">ОБ<SortIndicator sortState={goalieSort} columnKey="saves" /></div>
              <div onClick={() => handleGoalieSort('save_percent')} className="w-14 shrink-0 cursor-pointer active:opacity-60 text-brand" style={hasTeamColor ? { color: activeBrandColor } : {}}>%ОБ<SortIndicator sortState={goalieSort} columnKey="save_percent" /></div>
              <div onClick={() => handleGoalieSort('goals_against_average')} className="w-11 shrink-0 cursor-pointer active:opacity-60">КН<SortIndicator sortState={goalieSort} columnKey="goals_against_average" /></div>
              <div onClick={() => handleGoalieSort('shutouts')} className="w-10 shrink-0 cursor-pointer active:opacity-60">И"0"<SortIndicator sortState={goalieSort} columnKey="shutouts" /></div>
            </div>
            {sortedGoalies.map((row) => {
              // Скрытие статистики (размытием): дивизион требует оплату взноса,
              // а у игрока нет отметки об оплате.
              const shouldBlur = !!row.hide_stats_unpaid && !row.is_fee_paid;
              return (
              <div key={row.player_id} className="h-14 flex items-center text-center text-[14px] font-bold text-content-main border-b border-surface-border last:border-0 min-w-[220px]">
                <div className={clsx("w-10 shrink-0", shouldBlur && "blur-sm select-none")}>{row.goals_against}</div>
                <div className={clsx("w-10 shrink-0", shouldBlur && "blur-sm select-none")}>{row.saves == null ? '—' : row.saves}</div>
                <div className={clsx("w-14 shrink-0 text-brand font-black text-[14px] font-mono", shouldBlur && "blur-sm select-none")} style={hasTeamColor ? { color: activeBrandColor } : {}}>{row.save_percent == null ? '—' : `${row.save_percent}%`}</div>
                <div className={clsx("w-11 shrink-0 text-[14px]", shouldBlur && "blur-sm select-none")}>{row.goals_against_average}</div>
                <div className={clsx("w-10 shrink-0 text-emerald-500", shouldBlur && "blur-sm select-none")}>{row.shutouts}</div>
              </div>
              );
            })}
          </ScrollFade>
        </div>
      )}

      {/* Отступ между таблицами */}
      {hasGoalies && hasSkaters && <div className="h-12 border-t border-surface-border" />}

      {/* ── Таблица полевых игроков ───────────────────── */}
      {hasSkaters && (
        <div className="flex w-full">
          <div className="w-[180px] shrink-0 z-10 flex flex-col">
            <div className="h-[38px] flex items-center px-2 text-[10px] font-normal uppercase tracking-wider text-content-muted border-b border-surface-border">
              <div className="w-4 text-center shrink-0">#</div>
              <div className="pl-3">Игрок</div>
            </div>
            {sortedSkaters.map((row, idx) => (
              <PlayerCell key={row.player_id} player={row} idx={idx} onClick={() => handlePlayerClick(row)} />
            ))}
          </div>
          <ScrollFade onTouchStart={handleTouchIsolation} onTouchMove={handleTouchIsolation}>
            <div className="h-[38px] flex items-center bg-surface-level1 text-[10px] font-normal uppercase tracking-wider text-content-muted text-center select-none border-b border-surface-border min-w-[200px]">
              <div onClick={() => handleSkaterSort('goals')} className="w-10 shrink-0 cursor-pointer active:opacity-60">Г<SortIndicator sortState={skaterSort} columnKey="goals" /></div>
              <div onClick={() => handleSkaterSort('assists')} className="w-10 shrink-0 cursor-pointer active:opacity-60">П<SortIndicator sortState={skaterSort} columnKey="assists" /></div>
              <div onClick={() => handleSkaterSort('points')} className="w-11 shrink-0 cursor-pointer active:opacity-60 text-brand" style={hasTeamColor ? { color: activeBrandColor } : {}}>О<SortIndicator sortState={skaterSort} columnKey="points" /></div>
              <div onClick={() => handleSkaterSort('plus_minus')} className="w-11 shrink-0 cursor-pointer active:opacity-60">+/-<SortIndicator sortState={skaterSort} columnKey="plus_minus" /></div>
              <div onClick={() => handleSkaterSort('penalty_minutes')} className="w-12 shrink-0 cursor-pointer active:opacity-60">Штр<SortIndicator sortState={skaterSort} columnKey="penalty_minutes" /></div>
            </div>
            {sortedSkaters.map((row) => {
              const shouldBlur = !!row.hide_stats_unpaid && !row.is_fee_paid;
              return (
              <div key={row.player_id} className="h-14 flex items-center text-center text-[14px] font-bold text-content-main border-b border-surface-border last:border-0 min-w-[200px]">
                <div className={clsx("w-10 shrink-0", shouldBlur && "blur-sm select-none")}>{row.goals}</div>
                <div className={clsx("w-10 shrink-0", shouldBlur && "blur-sm select-none")}>{row.assists}</div>
                <div className={clsx("w-11 shrink-0 text-brand font-black text-[14px]", shouldBlur && "blur-sm select-none")} style={hasTeamColor ? { color: activeBrandColor } : {}}>{row.points}</div>
                <div className={clsx("w-11 shrink-0", (row.plus_minus || 0) > 0 ? "text-emerald-500" : (row.plus_minus || 0) < 0 ? "text-red-500" : "text-content-muted", shouldBlur && "blur-sm select-none")}>
                  {(row.plus_minus || 0) > 0 ? `+${row.plus_minus}` : row.plus_minus || 0}
                </div>
                <div className={clsx("w-12 shrink-0", shouldBlur && "blur-sm select-none")}>{row.penalty_minutes}</div>
              </div>
              );
            })}
          </ScrollFade>
        </div>
      )}

      {/* Заглушка при полном отсутствии данных */}
      {!hasGoalies && !hasSkaters && (
        <div className="flex justify-center items-center h-20 text-[10px] font-black text-content-muted uppercase tracking-widest">
          Нет игроков в заявке
        </div>
      )}
       </>
      )}
    </Accordion>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ОСНОВНОЙ КОМПОНЕНТ СТАТИСТИКИ МАТЧА
// ═══════════════════════════════════════════════════════════════════════
export const MatchStats = ({ event, openRightPanel }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTeamStatsExpanded, setIsTeamStatsExpanded] = useState(true);

  const isPlayable = event?.status === 'finished' || event?.status === 'live';

  // Цвета команд
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  const isHome = event?.my_team_id === event?.home_team_id;
  // away_team_id может отсутствовать (календарный матч) — тогда определяем по наличию home_team_id
  const isAway = event?.away_team_id
    ? event?.my_team_id === event?.away_team_id
    : (!!event?.my_team_id && !isHome);
  const myTeamPlays = isHome || isAway;

  const homeBarColor = myTeamPlays
    ? (isHome ? activeBrandColor : 'rgba(160, 160, 160, 0.85)')
    : 'rgba(160, 160, 160, 0.35)';
  const awayBarColor = myTeamPlays
    ? (isAway ? activeBrandColor : 'rgba(160, 160, 160, 0.85)')
    : 'rgba(160, 160, 160, 0.35)';

  // Имена и логотипы команд
  const homeName = isHome ? event?.my_team_name : (event?.opponent_name || 'Хозяева');
  const awayName = isHome ? (event?.opponent_name || 'Гости') : event?.my_team_name;
  const homeLogo = isHome ? event?.my_team_logo_url : event?.opponent_logo_url;
  const awayLogo = isHome ? event?.opponent_logo_url : event?.my_team_logo_url;

  useEffect(() => {
    // Грузим всегда (даже до публикации) — нужны составы команд для аккордеонов.
    if (!event?.event_id) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const headers = getAuthHeaders();
        const res = await fetch(
          `${apiUrl}/api/matches/${event.event_id}/stats?teamId=${event.my_team_id}`,
          { headers }
        );
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Ошибка загрузки статистики матча:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [event?.event_id, event?.my_team_id]);

  if (loading) return <PageLoader />;

  const homeStats = stats?.home;
  const awayStats = stats?.away;

  return (
    <FadeIn className="flex flex-col gap-3">

      {/* ── Блок 1: Командная статистика — только когда есть результат ─── */}
      {isPlayable && stats && (
        <Accordion
          title="Командная статистика"
          isExpanded={isTeamStatsExpanded}
          onToggle={() => setIsTeamStatsExpanded(p => !p)}
        >
          <div className="px-4 py-1">
            {STAT_ROWS.map((row, idx) => (
              <StatRow
                key={row.key}
                label={row.label}
                homeValue={homeStats[row.key]}
                awayValue={awayStats[row.key]}
                isPercentage={row.isPercentage}
                homeColor={homeBarColor}
                awayColor={awayBarColor}
                isLast={idx === STAT_ROWS.length - 1}
              />
            ))}
          </div>
        </Accordion>
      )}

      {/* ── Блок 2: Аккордеон домашней команды (всегда) ──── */}
      <PlayerAccordion
        teamName={homeName}
        teamLogo={homeLogo}
        goalies={homeStats?.goalies || []}
        skaters={homeStats?.skaters || []}
        rosterSubmitted={!!homeStats?.roster_submitted}
        hasTeamColor={hasTeamColor}
        activeBrandColor={activeBrandColor}
        openRightPanel={openRightPanel}
      />

      {/* ── Блок 3: Аккордеон гостевой команды (всегда) ──── */}
      <PlayerAccordion
        teamName={awayName}
        teamLogo={awayLogo}
        goalies={awayStats?.goalies || []}
        skaters={awayStats?.skaters || []}
        rosterSubmitted={!!awayStats?.roster_submitted}
        hasTeamColor={hasTeamColor}
        activeBrandColor={activeBrandColor}
        openRightPanel={openRightPanel}
      />

    </FadeIn>
  );
};