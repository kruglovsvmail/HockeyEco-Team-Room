import React, { useState, useMemo, useRef } from 'react';
import { Icon } from '../../../ui/Icon';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';
import { ContainerContent } from '../../../ui/ContainerContent';
import clsx from 'clsx';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

import { FadeIn } from '../../../ui/FadeIn';
import { useAccess } from '../../../hooks/useAccess';
import { HintPopover } from '../../../ui/HintPopover';
import { ButtonLP } from '../../../ui/Button-LP';
import { PERMISSIONS } from '../../../utils/permissions';


export const MatchInfo = ({
  event,
  setLocalEvent,
  referees   = [],
  h2hData    = null,
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  activeBrandColor,
  hasTeamColor,
}) => {
  // localEvent используется для реактивного обновления медиа-ссылок
  const [localEvent, _setLocalEvent] = useState(event);
  const patchLocalEvent = (patch) => {
    _setLocalEvent(prev => ({ ...prev, ...patch }));
    setLocalEvent(prev => ({ ...prev, ...patch }));
  };

  const isSharingRef = useRef(false);

  // ── Права доступа ─────────────────────────────────────────────────────────
  const localUser = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem('teampwa_user') ||
        localStorage.getItem('teampwa_cached_user')
      );
    } catch { return null; }
  }, []);

  const localTeam = useMemo(() => {
    try {
      if (!localUser || !localEvent?.my_team_id) return null;
      return localUser.teams?.find(t => String(t.id) === String(localEvent.my_team_id));
    } catch { return null; }
  }, [localUser, localEvent?.my_team_id]);

  const { user, checkAccess, selectedTeam } = useAccess(localUser, localTeam);

  const userRoles = useMemo(() => {
    const roles = [];
    const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
    if (globalRole === 'admin') roles.push('admin');
    if (selectedTeam?.user_role) {
      selectedTeam.user_role.split(',').map(r => r.trim().toLowerCase()).forEach(r => roles.push(r));
    }
    const matrix = user?.accessMatrix || user?.access_matrix || {};
    const teamAccess = matrix[localEvent?.my_team_id];
    if (teamAccess?.roles) {
      teamAccess.roles.map(r => String(r).toLowerCase()).forEach(r => roles.push(r));
    }
    if (roles.length === 0) roles.push('player');
    return [...new Set(roles)];
  }, [user, selectedTeam, localEvent?.my_team_id]);

  const hasRoleForAction = (action) => {
    if (userRoles.includes('admin')) return true;
    const perm = PERMISSIONS[action];
    if (!perm) return false;
    return userRoles.some(r => perm.allowedRoles.map(ar => ar.toLowerCase()).includes(r));
  };

  if (!localEvent) return null;

  // ── Данные для счёта в противостоянии ────────────────────────────────────
  const isFinished    = localEvent.status === 'finished';
  const isLive        = localEvent.status === 'live';
  const isPlayedOrLive = isFinished || isLive;

  const isTech      = localEvent.end_type === 'tech' || !!localEvent.is_technical;
  const isOvertime  = localEvent.end_type === 'ot';
  const isShootout  = localEvent.end_type === 'so';
  const isMyTeamHome = localEvent.my_team_id === localEvent.home_team_id;

  let homeScoreDisplay = '-';
  let awayScoreDisplay = '-';
  let matchStatusText  = '';
  let matchStatusColor = '';
  let matchStatusStyle = {};

  if (isPlayedOrLive) {
    if (isTech) {
      if (localEvent.is_technical === '+/-') {
        homeScoreDisplay = '+'; awayScoreDisplay = '-';
      } else if (localEvent.is_technical === '-/+') {
        homeScoreDisplay = '-'; awayScoreDisplay = '+';
      } else {
        homeScoreDisplay = localEvent.home_score ?? '-';
        awayScoreDisplay = localEvent.away_score ?? '-';
      }
    } else {
      homeScoreDisplay = localEvent.home_score ?? '-';
      awayScoreDisplay = localEvent.away_score ?? '-';
    }

    if (isFinished) {
      const myScore  = isMyTeamHome ? homeScoreDisplay : awayScoreDisplay;
      const oppScore = isMyTeamHome ? awayScoreDisplay : homeScoreDisplay;
      if (!isTech) {
        if (Number(myScore) > Number(oppScore)) {
          matchStatusText = 'Победа'; matchStatusColor = 'text-success';
          matchStatusStyle = { color: 'var(--color-success)' };
        } else if (Number(myScore) < Number(oppScore)) {
          matchStatusText = 'Поражение'; matchStatusColor = 'text-danger';
          matchStatusStyle = { color: 'var(--color-danger)' };
        } else {
          matchStatusText = 'Ничья'; matchStatusColor = 'text-content-muted';
        }
      } else {
        matchStatusText = 'Технический'; matchStatusColor = 'text-red-500';
        matchStatusStyle = { color: 'var(--color-danger)' };
      }
    }
  }

  const scoreColorClass = (isLive || (isFinished && isTech)) ? 'text-red-500' : 'text-content-main';

  // ── Турнирная информация ──────────────────────────────────────────────────
  const targetDate  = localEvent?.event_date || localEvent?.game_date;
  const seasonYear  = targetDate ? dayjs(targetDate).format('YYYY') : dayjs().format('YYYY');
  const seasonValue = localEvent.season_name || `${seasonYear}/${dayjs(targetDate).add(1, 'year').format('YY')}`;

  const isFriendly = localEvent.game_type === 'friendly_pwa' || localEvent.game_type === 'friendly_ext';

  const isPlayoff = localEvent.stage_type === 'playoff';
  const isGroup   = localEvent.stage_type === 'group';

  // Лейбл строки «Круг/Раунд» зависит от типа этапа турнира.
  // Для товарищеских матчей стадия не показывается.
  const stageRowLabel = isPlayoff ? 'Раунд' : isGroup ? 'Группа' : 'Круг';
  const stageRowValue = isFriendly ? null : (localEvent.stage_label || null);

  // Лейбл строки «Тур/Номер матча»: в регулярке — это тур, в плей-офф — номер матча в серии
  const seriesRowLabel = isPlayoff ? 'Номер матча' : 'Тур';
  // Номер матча в плей-офф скрываем, если серия играется до 1 победы (wins_needed === 1)
  const hideSeriesNumber = isPlayoff && Number(localEvent.wins_needed) === 1;
  const seriesRowValue  = (localEvent.series_number != null && !hideSeriesNumber)
    ? (isPlayoff ? `Матч №${localEvent.series_number}` : `Тур №${localEvent.series_number}`)
    : null;

  let leagueValue   = localEvent.league_name || 'Официальный турнир';
  let divisionValue = localEvent.division_name || null;
  let tournamentIcon = 'trophy';
  let tournamentLogo = localEvent.division_logo_url || localEvent.league_logo_url;

  if (isFriendly) {
    leagueValue    = 'Товарищеский матч';
    divisionValue  = null;
    tournamentIcon = 'handshake';
    tournamentLogo = null;
  } else if (localEvent.game_type === 'tournament_ext') {
    leagueValue    = localEvent.league_name || 'Внешний турнир';
    divisionValue  = localEvent.division_name || null;
    tournamentIcon = 'trophy';
  }

  const hasLiveStreams      = !!(localEvent.video_yt_url || localEvent.video_vk_url);
  const mainRefs            = referees.filter(r => r.role === 'main-1' || r.role === 'main-2');
  const linesmenRefs        = referees.filter(r => r.role === 'linesman-1' || r.role === 'linesman-2');
  const hasRefereesAssigned = mainRefs.length > 0 || linesmenRefs.length > 0;

  // ── H2H расчёты ──────────────────────────────────────────────────────────
  let lastGames = [];
  if (h2hData?.games) {
    const finishedGames = h2hData.games.filter(g => g.status === 'finished');
    lastGames = finishedGames.slice(0, 5).reverse();
  }

  const sparklinePoints = lastGames.map((game, idx) => {
    const isGameHome = String(game.home_team_id) === String(localEvent.my_team_id);
    const myScore    = isGameHome ? game.home_score : game.away_score;
    const oppScore   = isGameHome ? game.away_score : game.home_score;
    const x = 16 + idx * 42;
    let y = 20; let dotColor = '#9ca3af';
    if (myScore > oppScore) { y = 6;  dotColor = '#10b981'; }
    else if (myScore < oppScore) { y = 34; dotColor = '#ef4444'; }
    return { x, y, dotColor };
  });
  const pathD = sparklinePoints.length > 0
    ? `M ${sparklinePoints.map(p => `${p.x} ${p.y}`).join(' L ')}`
    : '';

  const handleShare = async (e, url) => {
    e.stopPropagation();
    if (isSharingRef.current) return;
    isSharingRef.current = true;
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard?.writeText(url);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    } finally {
      isSharingRef.current = false;
    }
  };

  return (
    <FadeIn>
      <div className="flex flex-col gap-3 select-none antialiased relative">

        {/* ══════════════════════════════════════════════
            БЛОК 0: ПРОТИВОСТОЯНИЕ 
        ══════════════════════════════════════════════ */}
        <ContainerContent title="Противостояние">
          <div className="w-full flex flex-col items-center py-3 px-1">

            {/* Ряд 1: Логотипы + центральная колонка (статус сверху, счёт снизу) */}
            <div className="w-full flex items-stretch justify-between">

              {/* Хозяева — логотип */}
              <div className="w-[38%] flex justify-center">
                <div className="w-14 h-14 flex items-center justify-center shrink-0">
                  {homeLogo ? (
                    <img src={getImageUrl(homeLogo)} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] font-black bg-white/10 border border-surface-border rounded-2xl py-2 px-4 text-content-muted">НЕТ ЛОГО</span>
                  )}
                </div>
              </div>

              {/* Центр: статус по верху логотипов, счёт/VS по низу */}
              <div className="flex flex-col items-center justify-between shrink-0 min-w-[84px] h-14">
                {isFinished && matchStatusText ? (
                  <span className={clsx('text-[12px] font-bold uppercase tracking-wide leading-none pt-0.5', matchStatusColor)} style={matchStatusStyle}>
                    {matchStatusText}
                  </span>
                ) : isLive ? (
                  <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded-full animate-pulse">
                    <span className="w-1 h-1 rounded-full bg-red-500" />
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-tight">LIVE</span>
                  </div>
                ) : (
                  <span />
                )}

                {isPlayedOrLive ? (
                  <div className="flex items-center gap-1 font-black text-[28px] tracking-tighter justify-center leading-none">
                    <span className={scoreColorClass}>{homeScoreDisplay}</span>
                    <span className="text-content-subtle text-[28px] font-bold pb-0.5 px-1">:</span>
                    <span className={scoreColorClass}>{awayScoreDisplay}</span>
                  </div>
                ) : (
                  <span className="text-[28px] font-black text-content-subtle font-mono tracking-widest opacity-50 leading-none">VS</span>
                )}
              </div>

              {/* Гости — логотип */}
              <div className="w-[38%] flex justify-center">
                <div className="w-14 h-14 flex items-center justify-center shrink-0">
                  {awayLogo ? (
                    <img src={getImageUrl(awayLogo)} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] font-black bg-white/10 border border-surface-border rounded-2xl py-2 px-4 text-content-muted">НЕТ ЛОГО</span>
                  )}
                </div>
              </div>

            </div>

            {/* Ряд 2: Названия команд + бейдж окончания по центру */}
            <div className="w-full flex items-start justify-between mt-4">
              <span className="w-[38%] text-[14px] font-bold text-content-main uppercase tracking-tight px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center text-center">
                {homeName}
              </span>

              <div className="shrink-0 min-w-[84px] flex items-start justify-center">
                {isFinished && (isOvertime || isShootout || isTech) && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded leading-none shadow-xs"
                    style={isTech
                      ? { color: 'var(--color-danger)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.1)' }
                      : { color: activeBrandColor, backgroundColor: `${activeBrandColor}14`, borderColor: `${activeBrandColor}1a` }}
                  >
                    {isOvertime && 'от'}
                    {isShootout && 'булл'}
                    {isTech && 'тех'}
                  </span>
                )}
              </div>

              <span className="w-[38%] text-[14px] font-bold text-content-main uppercase tracking-tight px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center text-center">
                {awayName}
              </span>
            </div>

          </div>
        </ContainerContent>

        {/* ══════════════════════════════════════════════
            БЛОК 1: ТУРНИРНАЯ ИНФОРМАЦИЯ, СУДЕЙСТВО, ТРАНСЛЯЦИИ
        ══════════════════════════════════════════════ */}
        <ContainerContent title="Тип матча">
          <div className="flex flex-col w-full">
            {[
              { icon: 'trophy',     label: 'Лига',     value: leagueValue },
              { icon: 'calendar',   label: 'Сезон',    value: seasonValue },
              { icon: 'divisions',  label: 'Дивизион', value: divisionValue },
              { icon: 'swap',       label: stageRowLabel,  value: stageRowValue },
              { icon: 'puck',       label: seriesRowLabel, value: seriesRowValue },
            ]
              .filter(row => row.value)
              .map((row, idx, arr) => (
                <div
                  key={row.label}
                  className={clsx(
                    'flex items-center justify-between gap-3 py-3',
                    idx !== arr.length - 1 && 'border-b border-surface-level2'
                  )}
                >
                  <div className="flex items-center gap-2 text-content-muted min-w-0 pl-2">
                    <Icon name={row.icon} className="w-4 h-4 shrink-0" />
                    <span className="text-[14px] font-medium truncate">{row.label}</span>
                  </div>
                  <span className="text-[14px] font-bold text-content-main text-right shrink-0">
                    {row.value}
                  </span>
                </div>
              ))}
          </div>

          {(hasRefereesAssigned || hasLiveStreams) && (
            <div className="flex flex-col gap-5 mx-2 my-3 pt-3 border-t border-surface-level2">
              {hasRefereesAssigned && (
                <div className="grid grid-cols-2 gap-4">
                  {mainRefs.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-content-subtle uppercase tracking-wide">Главные судьи:</span>
                      <div className="flex flex-col gap-1 mt-0.5">
                        {mainRefs.map((ref, i) => (
                          <span key={ref.user_id || `main-${i}`} className="text-[14px] font-semibold text-content-main tracking-wide truncate">
                            {ref.last_name} {ref.first_name?.[0]}.
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {linesmenRefs.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-content-subtle uppercase tracking-wide">Линейные судьи:</span>
                      <div className="flex flex-col gap-1 mt-0.5">
                        {linesmenRefs.map((ref, i) => (
                          <span key={ref.user_id || `linesman-${i}`} className="text-[14px] font-semibold text-content-main tracking-wide truncate">
                            {ref.last_name} {ref.first_name?.[0]}.
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasLiveStreams && (
                <div className={clsx('flex flex-col gap-3', hasRefereesAssigned && 'pt-4 border-t border-surface-level2')}>
                  <span className="text-[10px] font-medium text-content-subtle uppercase tracking-wide">Трансляции:</span>
                  <div className="flex flex-col gap-2 pl-1">
                    {localEvent.video_yt_url && (
                      <div className="flex items-center justify-between gap-2">
                        <a href={localEvent.video_yt_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group outline-none min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 group-hover:bg-surface-level3 transition-colors">
                            <Icon name="live_stream" className="w-5 h-5" style={{ color: activeBrandColor }} />
                          </div>
                          <span className="text-[14px] font-bold text-content-main truncate">Трансляция 1</span>
                        </a>
                        <button type="button" onClick={(e) => handleShare(e, localEvent.video_yt_url)}
                          className="w-8 h-8 rounded-lg text-content-muted flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer">
                          <Icon name="share" className="w-5 h-5" style={{ color: activeBrandColor }} />
                        </button>
                      </div>
                    )}
                    {localEvent.video_vk_url && (
                      <div className="flex items-center justify-between gap-2">
                        <a href={localEvent.video_vk_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group outline-none min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 group-hover:bg-surface-level3 transition-colors">
                            <Icon name="live_stream" className="w-5 h-5" style={{ color: activeBrandColor }} />
                          </div>
                          <span className="text-[14px] font-bold text-content-main truncate">Трансляция 2</span>
                        </a>
                        <button type="button" onClick={(e) => handleShare(e, localEvent.video_vk_url)}
                          className="w-8 h-8 rounded-lg text-content-muted flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer">
                          <Icon name="share" className="w-5 h-5" style={{ color: activeBrandColor }} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </ContainerContent>

        {/* ══════════════════════════════════════════════
            БЛОК H2H: ИСТОРИЯ ОЧНЫХ ВСТРЕЧ
        ══════════════════════════════════════════════ */}
        {h2hData && (
          <ContainerContent title="История встреч">
            <div className="flex flex-col w-full text-left p-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Игр',     value: h2hData.summary?.total  || 0 },
                  { label: 'Победы',  value: h2hData.summary?.wins   || 0 },
                  { label: 'Ничьи',   value: h2hData.summary?.draws  || 0 },
                  { label: 'Пораж.',  value: h2hData.summary?.losses || 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl py-2 flex flex-col justify-center">
                    <span className="text-[10px] font-medium text-content-subtle uppercase tracking-wider">{label}</span>
                    <span className="text-[18px] font-bold text-content-muted mt-1">{value}</span>
                  </div>
                ))}
              </div>

              {lastGames.length > 0 ? (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex justify-between items-center px-0.5 text-[10px] font-medium text-content-subtle">
                    <span className="uppercase tracking-wider">Форма команды (последние матчи)</span>
                    <div className="flex gap-2 font-mono font-bold text-[8px] uppercase tracking-widest">
                      <span className="text-success">В</span>
                      <span className="text-content-muted">Н</span>
                      <span className="text-danger">П</span>
                    </div>
                  </div>
                  <div className="w-full rounded-xl p-2 h-14 relative flex items-center justify-center">
                    <svg viewBox="0 0 200 40" className="w-full h-full overflow-visible">
                      <line x1="0" y1="6"  x2="200" y2="6"  stroke="currentColor" className="text-surface-border opacity-20" strokeDasharray="3,3" />
                      <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" className="text-surface-border opacity-40" strokeDasharray="2,2" />
                      <line x1="0" y1="34" x2="200" y2="34" stroke="currentColor" className="text-surface-border opacity-20" strokeDasharray="3,3" />
                      {pathD && <path d={pathD} fill="none" stroke="var(--color-content-subtle)" strokeWidth="1.25" className="opacity-30" strokeLinecap="round" strokeLinejoin="round" />}
                      {sparklinePoints.map((pt, i) => (
                        <circle key={`spark-dot-${i}`} cx={pt.x} cy={pt.y} r="4" fill={pt.dotColor} stroke="var(--color-surface-base)" strokeWidth="1.5" />
                      ))}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-[10px] font-medium uppercase tracking-wider text-content-subtle">
                  История очных встреч отсутствует
                </div>
              )}
            </div>
          </ContainerContent>
        )}

      </div>
    </FadeIn>
  );
};