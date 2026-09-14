import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../../ui/Icon';
import { getImageUrl, getAuthHeaders, getStreamPlatformLabel, getPlayoffStageDisplayLabel } from '../../../utils/helpers';
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
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  activeBrandColor,
  hasTeamColor,
}) => {
  // localEvent используется для реактивного обновления медиа-ссылок
  const [localEvent, _setLocalEvent] = useState(event);
  // event — состояние родителя (EventDetailsMatch), которое уже обновляется по
  // broadcast'у tr-events-updated (например, после сохранения результатов матча).
  // useState(event) захватывает значение только при монтировании, поэтому без
  // этого эффекта счёт/статус здесь оставались бы устаревшими до перезахода.
  useEffect(() => { _setLocalEvent(event); }, [event]);
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
  // Сезон в базе есть только у официальных матчей (seasons.name через дивизион).
  // У товарищеских и матчей внешних турниров сезона нет — показываем расчётный
  // по дате матча. Хоккейный сезон начинается летом, поэтому январь–июнь относятся
  // к сезону, начавшемуся в прошлом году: матч 12.02.2027 → «2026/27», а не «2027/28».
  const targetDate  = localEvent?.event_date || localEvent?.game_date;
  const matchDay    = targetDate ? dayjs(targetDate) : dayjs();
  const seasonStart = matchDay.month() >= 6 ? matchDay.year() : matchDay.year() - 1;
  const seasonValue = localEvent.season_name || `${seasonStart}/${String(seasonStart + 1).slice(-2)}`;

  const isFriendly = localEvent.game_type === 'friendly_pwa' || localEvent.game_type === 'friendly_ext';

  const isPlayoff = localEvent.stage_type === 'playoff';
  const isGroup   = localEvent.stage_type === 'group';

  // Лейбл строки «Круг/Раунд» зависит от типа этапа турнира.
  // Для товарищеских матчей стадия не показывается.
  const stageRowLabel = isPlayoff ? 'Раунд' : isGroup ? 'Группа' : 'Круг';
  const stageRowValue = isFriendly ? null : (getPlayoffStageDisplayLabel(localEvent.stage_label, localEvent.playoff_match_type) || null);

  // Лейбл строки «Тур/Номер матча»: в регулярке — это тур, в плей-офф — номер матча в серии
  const seriesRowLabel = isPlayoff ? 'Номер матча' : 'Тур';
  // Номер матча в плей-офф скрываем, если серия играется до 1 победы (wins_needed === 1)
  const hideSeriesNumber = isPlayoff && Number(localEvent.wins_needed) === 1;
  const seriesRowValue  = (localEvent.series_number != null && !hideSeriesNumber)
    ? (isPlayoff ? `Матч №${localEvent.series_number}` : `Тур №${localEvent.series_number}`)
    : null;

  let leagueValue   = localEvent.league_name || 'Официальный турнир';
  let divisionValue = localEvent.division_short_name || localEvent.division_name || null;
  let tournamentIcon = 'trophy';
  let tournamentLogo = localEvent.division_logo_url || localEvent.league_logo_url;

  if (isFriendly) {
    leagueValue    = 'Товарищеский матч';
    divisionValue  = null;
    tournamentIcon = 'handshake';
    tournamentLogo = null;
  } else if (localEvent.game_type === 'tournament_ext') {
    leagueValue    = localEvent.league_name || 'Внешний турнир';
    divisionValue  = localEvent.division_short_name || localEvent.division_name || null;
    tournamentIcon = 'trophy';
  }

  const hasLiveStreams      = !!(localEvent.video_yt_url || localEvent.video_vk_url);
  const mainRefs            = referees.filter(r => r.role === 'main-1' || r.role === 'main-2');
  const linesmenRefs        = referees.filter(r => r.role === 'linesman-1' || r.role === 'linesman-2');
  const hasRefereesAssigned = mainRefs.length > 0 || linesmenRefs.length > 0;

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
                    {isShootout && 'Б'}
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
            {/* Логотип дивизиона + название лиги/турнира */}
            <div className="flex items-center gap-3 py-2 px-2">
              <div className="w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden">
                {tournamentLogo ? (
                  <img src={getImageUrl(tournamentLogo)} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Icon name={tournamentIcon} className="w-5 h-5 text-content-muted" />
                )}
              </div>
              <span className="text-[14px] font-bold text-content-main leading-tight line-clamp-3 min-w-0">
                {leagueValue}
              </span>
            </div>

            {[
              { icon: 'calendar',   label: 'Сезон',    value: seasonValue },
              { icon: 'divisions',  label: localEvent.is_tournament ? 'Турнир' : 'Дивизион', value: divisionValue },
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
                          <span className="text-[14px] font-bold text-content-main truncate">{getStreamPlatformLabel(localEvent.video_yt_url)}</span>
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
                          <span className="text-[14px] font-bold text-content-main truncate">{getStreamPlatformLabel(localEvent.video_vk_url)}</span>
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

      </div>
    </FadeIn>
  );
};