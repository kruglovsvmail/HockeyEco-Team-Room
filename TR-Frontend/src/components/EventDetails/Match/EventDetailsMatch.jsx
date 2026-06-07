import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { getImageUrl, getAuthHeaders, getContrastTextColor } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';

import { MatchInfo } from './MatchInfo';

// Импортируем наши новые унифицированные компоненты производительности
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';

import dayjs from 'dayjs';
import clsx from 'clsx';

// Применяем ленивую загрузку с сохранением именованных экспортов.
const MatchAttendance = lazy(() => import('./MatchAttendance').then(module => ({ default: module.MatchAttendance })));
const MatchLines = lazy(() => import('./MatchLines').then(module => ({ default: module.MatchLines })));
const MatchProtocol = lazy(() => import('./MatchProtocol').then(module => ({ default: module.MatchProtocol })));
const MatchStats = lazy(() => import('./MatchStats').then(module => ({ default: module.MatchStats })));

// Конфигурация тагов
const MATCH_TABS = [
  { id: 'info', label: 'Инфо' },
  { id: 'attendance', label: 'Отметки' },
  { id: 'lines', label: 'Пятерки' },
  { id: 'events', label: 'Ход матча' },
  { id: 'stats', label: 'Статистика' }
];

export const EventDetailsMatch = ({ event }) => {
  const [activeTab, setActiveTab] = useState('info');

  // УМНЫЙ СОСТАВНОЙ КЛЮЧ: Привязываем кэш игры к конкретному ID матча И к ID просматривающей команды
  const cacheKey = `tr_cached_match_${event?.event_id}_team_${event?.my_team_id || 'no_team'}`;

  // Централизованное хранилище состояний данных для всех вкладок матча
  const [matchData, setMatchData] = useState({
    attendees: [],
    draftLines: [],
    isPublished: false,
    teamRoster: [],
    staffMembers: [],
    referees: [],   // Hoisted
    h2hData: null   // Hoisted
  });
  
  const [loading, setLoading] = useState(true);

  const scrollContainerRef = useRef(null);
  const matchupHeaderRef = useRef(null);
  const stickyTabsRef = useRef(null);
  const rafRef = useRef(null);
  const wasCollapsedBeforeRef = useRef(false);
  const isSwitchingRef = useRef(false);

  // Динамическое определение флага включения цветов из localStorage (по дефолту true)
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  // КРИТИЧЕСКАЯ РЕАКТИВНАЯ СИНХРОНИЗАЦИЯ КЭША ГЕЙМ-ЦЕНТРА
  useEffect(() => {
    if (!event?.event_id) return;
    
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setMatchData(JSON.parse(cached));
      setLoading(false); 
    } else {
      setMatchData({
        attendees: [],
        draftLines: [],
        isPublished: false,
        teamRoster: [],
        staffMembers: [],
        referees: [],
        h2hData: null
      });
      setLoading(true);
    }
  }, [event?.event_id, cacheKey]);

  // Параллельный атомарный сбор данных со всех эндпоинтов матча за один проход
  const fetchAllMatchData = useCallback(async () => {
    if (!event?.event_id || !event?.my_team_id) return;

    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      // Загружаем абсолютно все данные параллельно
      const [attRes, linesRes, rosterRes, staffRes, h2hRes] = await Promise.all([
        fetch(`${apiUrl}/api/events/${event.event_id}/attendance?eventType=${event.event_type}&teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/lines?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/available-roster?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/staff?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/h2h?teamId=${event.my_team_id}`, { headers })
      ]);

      const attData = await attRes.json();
      const linesData = await linesRes.json();
      const rosterData = await rosterRes.json();
      const staffData = await staffRes.json();
      const h2hData = await h2hRes.json();

      const freshData = {
        attendees: attData.success ? attData.attendees : [],
        draftLines: linesData.success ? (linesData.lines || []) : [],
        isPublished: linesData.success ? !!linesData.isPublished : false,
        teamRoster: rosterData.success ? (rosterData.roster || []) : [],
        staffMembers: rosterData.success ? (rosterData.staff || []) : [],
        referees: staffData.success ? staffData.staff : [],
        h2hData: h2hData.success ? h2hData.h2h : null
      };

      setMatchData(freshData);
      localStorage.setItem(cacheKey, JSON.stringify(freshData));
    } catch (err) {
      console.error('Ошибка централизованной загрузки данных матча:', err);
    } finally {
      setLoading(false);
    }
  }, [event?.event_id, event?.event_type, event?.my_team_id, cacheKey]);

  useEffect(() => {
    fetchAllMatchData();
  }, [fetchAllMatchData]);

  useFocusRevalidate(fetchAllMatchData);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current && wasCollapsedBeforeRef.current) {
      isSwitchingRef.current = true;
      scrollContainerRef.current.scrollTop = 140;

      if (matchupHeaderRef.current) {
        matchupHeaderRef.current.style.opacity = '0';
        matchupHeaderRef.current.style.transform = 'translateY(14px) translateZ(0)';
      }

      if (stickyTabsRef.current) {
        stickyTabsRef.current.dataset.stuck = "true";
        stickyTabsRef.current.classList.add('shadow-md', 'bg-surface-border');
        stickyTabsRef.current.classList.remove('bg-transparent');
      }

      const timeoutId = setTimeout(() => {
        isSwitchingRef.current = false;
      }, 60);

      return () => clearTimeout(timeoutId);
    }
  }, [activeTab]);

  if (!event) return null;

  // --- ВЫЧИСЛЕНИЯ ДЛЯ ШАПКИ МАТЧА ---
  const isHome = event.my_team_id === event.home_team_id;
  const homeName = isHome ? event.my_team_name : (event.opponent_name || 'Неизвестно');
  const awayName = isHome ? (event.opponent_name || 'Неизвестно') : event.my_team_name;
  const homeLogo = isHome ? event.my_team_logo_url : event.opponent_logo_url;
  const awayLogo = isHome ? event.opponent_logo_url : event.my_team_logo_url;
  
  const isFinished = event.status === 'finished';
  const isLive = event.status === 'live';
  const isPlayedOrLive = isFinished || isLive;
  
  const targetDate = event.game_date || event.event_date;
  const hasTime = !!targetDate;
  const formattedTime = hasTime ? dayjs(targetDate).format('HH:mm') : '—';
  const formattedDateShort = hasTime ? dayjs(targetDate).format('DD.MM') : '—'; 

  const isTech = event.end_type === 'tech' || !!event.is_technical;
  const isOvertime = event.end_type === 'ot';
  const isShootout = event.end_type === 'so';

  let homeScoreDisplay = '-';
  let awayScoreDisplay = '-';
  let matchStatusText = '';
  let matchStatusColor = '';
  let matchStatusStyle = {};

  if (isPlayedOrLive) {
    if (isTech) {
      if (event.is_technical === '+/-') {
        homeScoreDisplay = '+';
        awayScoreDisplay = '-';
      } else if (event.is_technical === '-/+') {
        homeScoreDisplay = '-';
        awayScoreDisplay = '+';
      } else if (event.is_technical === '-/-') {
        homeScoreDisplay = '-';
        awayScoreDisplay = '-';
      } else {
        if (event.home_score > event.away_score) {
          homeScoreDisplay = '+';
          awayScoreDisplay = '-';
        } else {
          homeScoreDisplay = '-';
          awayScoreDisplay = '+';
        }
      }

      const myDisplay = isHome ? homeScoreDisplay : awayScoreDisplay;
      if (myDisplay === '+') {
        matchStatusText = 'ПОБЕДА';
        matchStatusColor = 'text-success';
      } else {
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger';
      }
    } else {
      homeScoreDisplay = event.home_score;
      awayScoreDisplay = event.away_score;

      const myScore = isHome ? event.home_score : event.away_score;
      const oppScore = isHome ? event.away_score : event.home_score;

      if (myScore > oppScore) { 
        matchStatusText = 'ПОБЕДА'; 
        matchStatusColor = 'text-success';
      } else if (myScore < oppScore) { 
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger'; 
      } else { 
        matchStatusText = 'НИЧЬЯ'; 
        matchStatusStyle = { color: activeBrandColor };
      }
    }
  }

  const scoreColorClass = (isLive || (isFinished && isTech)) ? "text-red-500" : "text-content-main";

  const handleScroll = (e) => {
    const currentScroll = e.target.scrollTop;

    // Защита от авто-клипа скролла браузером во время пересчета высоты контента
    if (isSwitchingRef.current) {
      if (wasCollapsedBeforeRef.current && currentScroll < 140) {
        scrollContainerRef.current.scrollTop = 140;
        if (matchupHeaderRef.current) {
          matchupHeaderRef.current.style.opacity = '0';
          matchupHeaderRef.current.style.transform = 'translateY(14px) translateZ(0)';
        }
        return;
      }
    }

    if (!isSwitchingRef.current) {
      wasCollapsedBeforeRef.current = currentScroll > 110;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (matchupHeaderRef.current) {
        // НАДЕЖНАЯ ДЕД-ЗОНА В 40PX: Полностью гасит любые ложные паразитные сдвиги мобильного рендера
        const isAtTop = currentScroll <= 40;
        const opacity = isAtTop ? 1 : Math.max(0, 1 - (currentScroll - 40) / 70);
        const translateY = isAtTop ? 0 : (currentScroll - 40) * 0.1;

        matchupHeaderRef.current.style.opacity = opacity;
        matchupHeaderRef.current.style.transform = `translateY(${translateY}px) translateZ(0)`;
      }

      if (stickyTabsRef.current) {
        const isStuck = currentScroll > 110;
        if (String(isStuck) !== stickyTabsRef.current.dataset.stuck) {
          stickyTabsRef.current.dataset.stuck = isStuck;
          if (isStuck) {
            stickyTabsRef.current.classList.add('shadow-md', 'bg-surface-border'); 
            stickyTabsRef.current.classList.remove('bg-transparent');
          } else {
            stickyTabsRef.current.classList.remove('shadow-md', 'bg-surface-border');
            stickyTabsRef.current.classList.add('bg-transparent');
          }
        }
      }
    });
  };

  const tabIndex = MATCH_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${tabIndex * 20}%`;

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      style={{ overflowAnchor: 'none', touchAction: 'pan-y' }}
      className="h-full overflow-y-auto scrollbar-hide relative z-10 scroll-smooth"
    >
      
      {/* 1. БЛОК ШАПКИ (Убран ломающий инерцию snap-start) */}
      <div 
        ref={matchupHeaderRef}
        className={clsx(
          "bg-surface-base border px-2 pb-2 pt-6 flex flex-col shadow-md gap-2 relative overflow-hidden select-none  will-change-transform z-20",
        )}
      >
        <div className="w-full flex items-center justify-between relative">
          
          <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
            <div 
              className="w-11 h-11 flex items-center justify-center shrink-0 transition-all duration-300"
              style={isHome ? { filter: `drop-shadow(0 0 12px ${activeBrandColor})` } : {}}
            >
              {homeLogo ? (
                <img src={getImageUrl(homeLogo)} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[9px] font-black text-content-muted">ЛОГО</span>
              )}
            </div>
            <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
              {homeName}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center text-center shrink-0 px-1 min-w-[84px]">
            {isFinished && matchStatusText && (
              <span className={clsx("text-[9px] font-black uppercase tracking-widest mb-1.5 leading-none", matchStatusColor)} style={matchStatusStyle}>
                {matchStatusText}
              </span>
            )}

            {isPlayedOrLive ? (
              <div className="flex items-center gap-1 font-bold font-black text-[26px] tracking-tighter justify-center leading-none">
                <span className={scoreColorClass}>{homeScoreDisplay}</span>
                <span className="text-content-subtle text-lg font-bold pb-0.5 px-1">:</span>
                <span className={scoreColorClass}>{awayScoreDisplay}</span>
              </div>
            ) : (
              <span className="text-[20px] font-black text-content-subtle font-mono tracking-widest opacity-50 leading-none">VS</span>
            )}

            {isFinished && (isOvertime || isShootout || isTech) && (
              <span className="text-[9px] font-bold uppercase tracking-widest mt-1.5 px-1.5 py-0.5 rounded leading-none border shadow-xs"
                    style={isTech ? { color: 'var(--color-danger)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.1)' } : { color: activeBrandColor, backgroundColor: `${activeBrandColor}14`, borderColor: `${activeBrandColor}1a` }}>
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

            {(event.video_yt_url || event.video_vk_url) && (
              <div className="flex items-center gap-3 mt-2">
                {event.video_yt_url && (
                  <a href={event.video_yt_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#FF0000] transition-colors outline-none">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M21.582 6.186a2.665 2.665 0 0 0-1.882-1.892C18.04 3.84 12 3.84 12 3.84s-6.04 0-7.7.454a2.66 2.66 0 0 0-1.88 1.892C1.96 7.848 1.96 12 1.96 12s0 4.152.46 5.814a2.665 2.665 0 0 0 1.882 1.892c1.66.454 7.7.454 7.7.454s6.04 0 7.7-.454a2.665 2.665 0 0 0 1.882-1.892c.46-1.662.46-5.814.46-5.814s0-4.152-.46-5.814zM9.954 15.354V8.646l5.88 3.354-5.88 3.354z"/></svg>
                  </a>
                )}
                {event.video_vk_url && (
                  <a href={event.video_vk_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#0077FF] transition-colors outline-none">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.625-3.504-1.686-1.543-1.724-1.6-.459-3.27 1.582-2.09 2.62-3.842 2.3-4.56-.316-.718-1.54-.582-1.54-.582l-3.503.018c-.495 0-.759.169-.938.582-1.026 2.68-2.54 5.319-3.642 5.319-.481 0-.737-.306-.737-1.54V6.985c0-.895-.274-1.12-1.084-1.12H8.884c-.456 0-.803.14-.803.49 0 .456.634.606.853 1.95.342 2.052-.081 4.542-.718 4.542-.481 0-1.731-2.457-2.613-5.076-.23-.679-.472-.942-1.096-.942H1.054c-.65 0-.848.337-.848.665 0 .685 1.554 3.738 4.316 7.625 2.56 3.626 5.535 5.875 8.64 5.875z"/></svg>
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
            <div className="w-11 h-11 flex items-center justify-center shrink-0 transition-all duration-300"
                 style={!isHome ? { filter: `drop-shadow(0 0 8px ${activeBrandColor})` } : {}} >
              {awayLogo ? (
                <img src={getImageUrl(awayLogo)} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[9px] font-black text-content-muted">ЛОГО</span>
              )}
            </div>
            <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
              {awayName}
            </span>
          </div>
        </div>

        <div className="w-full grid grid-cols-[1fr,auto,1fr] items-center text-[11px] font-bold text-content-muted border-t border-surface-level3 pt-1 px-0.5 relative mt-1">
          <div className="min-w-0" />
          <div className="flex items-center justify-center gap-3 truncate max-w-[240px] px-2">
            <span className="font-bold text-content-muted shrink-0">{formattedDateShort}</span>
            <span className="text-content-muted font-mono shrink-0">•</span>
            <span className="font-bold text-content-muted shrink-0">{formattedTime}</span>
            <span className="text-content-muted font-mono shrink-0">•</span>
            <span className="truncate">{event.arena_name || 'Арена не назначена'}</span>
          </div>
          <div className="flex justify-end shrink-0 opacity-60 pr-2">
            {event.game_number && <span className="text-content-subtle">№{event.game_number}</span>}
          </div>
        </div>
      </div>

      {/* 2. ЗАКРЕПЛЕННЫЕ ТАБЫ (Убран ломающий инерцию snap-start) */}
      <div ref={stickyTabsRef} data-stuck="false" className="sticky top-0 z-40 shrink-0 transition-all duration-300 ease-in-out border-b border-surface-level2">
        <ChipTabs tabs={MATCH_TABS} activeTab={activeTab} onChange={setActiveTab} className="!px-0" activeColor={hasTeamColor ? event.team_color : null} />
      </div>

      {/* 3. КОНТЕНТНАЯ ЗОНА */}
      <div className="w-full overflow-hidden px-4 min-h-screen pt-4 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div className="flex w-[500%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start" style={{ transform: `translateX(${translateX})` }}>
            
            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'info' ? 1 : 0.3 }}>
              <FadeIn>
                <MatchInfo event={event} referees={matchData.referees} h2hData={matchData.h2hData} />
              </FadeIn>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'attendance' ? 1 : 0.3 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'attendance' && (
                  <FadeIn>
                    <MatchAttendance event={event} initialAttendees={matchData.attendees} initialTeamRoster={matchData.teamRoster} initialStaffMembers={matchData.staffMembers} initialDraftLines={matchData.draftLines} refreshData={fetchAllMatchData} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'lines' ? 1 : 0.3 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    <MatchLines event={event} initialAttendees={matchData.attendees} initialDraftLines={matchData.draftLines} initialIsPublished={matchData.isPublished} initialStaffMembers={matchData.staffMembers} refreshData={fetchAllMatchData} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'events' ? 1 : 0.3 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'events' && (
                  <FadeIn>
                    <MatchProtocol event={event} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'stats' ? 1 : 0.3 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'stats' && (
                  <FadeIn>
                    <MatchStats event={event} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};