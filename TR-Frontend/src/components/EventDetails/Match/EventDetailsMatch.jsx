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
        fetch(`${apiUrl}/api/matches/${event.event_id}/lines?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/available-roster?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/matches/${event.event_id}/staff?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/matches/${event.event_id}/h2h?teamId=${event.my_team_id}`, { headers })
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

  // Упрощенный эффект переключения вкладок — убрано динамическое управление стилями чипсов
  useEffect(() => {
    if (scrollContainerRef.current && wasCollapsedBeforeRef.current) {
      isSwitchingRef.current = true;
      scrollContainerRef.current.scrollTop = 140;

      if (matchupHeaderRef.current) {
        matchupHeaderRef.current.style.opacity = '0';
        matchupHeaderRef.current.style.transform = 'translateY(14px) translateZ(0)';
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

  // Упрощенный обработчик скролла — убрана сложная система динамических классов панели вкладок
  const handleScroll = (e) => {
    const currentScroll = e.target.scrollTop;

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
        const isAtTop = currentScroll <= 40;
        const opacity = isAtTop ? 1 : Math.max(0, 1 - (currentScroll - 40) / 70);
        const translateY = isAtTop ? 0 : (currentScroll - 40) * 0.1;

        matchupHeaderRef.current.style.opacity = opacity;
        matchupHeaderRef.current.style.transform = `translateY(${translateY}px) translateZ(0)`;
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
      
      {/* 1. БЛОК ШАПКИ */}
      <div 
        ref={matchupHeaderRef}
        className={clsx(
          "bg-surface-base px-2 pb-4 pt-6 flex flex-col gap-2 relative overflow-hidden select-none will-change-transform z-20",
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
                <span className="text-[10px] font-black font-black bg-white/10 border border-surface-border rounded-2xl py-2 px-4 text-content-muted">НЕТ ЛОГО</span>
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
              <span className="text-[9px] font-bold uppercase tracking-widest mt-1.5 px-1.5 py-0.5 rounded leading-none shadow-xs"
                    style={isTech ? { color: 'var(--color-danger)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.1)' } : { color: activeBrandColor, backgroundColor: `${activeBrandColor}14`, borderColor: `${activeBrandColor}1a` }}>
                {isOvertime && 'от'}
                {isShootout && 'булл'}
                {isTech && 'тех'}
              </span>
            )}

            {isLive && (
              <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded-full animate-pulse mt-1.5">
                <span className="w-1 h-1 rounded-full bg-red-500" />
                <span className="text-[9px] font-black text-red-500 uppercase tracking-tight">LIVE</span>
              </div>
            )}
          </div>

          <div className="w-[38%] flex flex-col items-center text-center gap-1.5 min-w-0">
            <div className="w-11 h-11 flex items-center justify-center shrink-0 transition-all duration-300"
                 style={!isHome ? { filter: `drop-shadow(0 0 12px ${activeBrandColor})` } : {}} >
              {awayLogo ? (
                <img src={getImageUrl(awayLogo)} alt="" className="w-full h-full  object-contain" />
              ) : (
                <span className="text-[10px] font-black bg-white/10 border border-surface-border rounded-2xl py-2 px-4 text-content-muted">НЕТ ЛОГО</span>
              )}
            </div>
            <span className="text-[10px] font-bold text-content-main uppercase tracking-tight w-full px-1 break-words leading-tight line-clamp-2 h-7 flex items-center justify-center">
              {awayName}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ЗАКРЕПЛЕННЫЕ ТАБЫ (УПРОЩЕНО: ТЕНЬ И ТЕМНЫЙ ФОН ПРИСУТСТВУЮТ ВСЕГДА КЛАССАМИ ТЕЙЛВИНДА) */}
      <div ref={stickyTabsRef} className="sticky top-0 z-40 shrink-0 bg-surface-border shadow-md">
        <ChipTabs tabs={MATCH_TABS} activeTab={activeTab} onChange={setActiveTab} className="!px-0" activeColor={hasTeamColor ? event.team_color : null} />
      </div>

      {/* 3. КОНТЕНТНАЯ ЗОНА */}
      <div className="w-full overflow-hidden px-4 min-h-screen pt-4 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div className="flex w-[500%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start" style={{ transform: `translateX(${translateX})` }}>
            
            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'info' ? 1 : 0 }}>
              <FadeIn>
                <MatchInfo event={event} referees={matchData.referees} h2hData={matchData.h2hData} />
              </FadeIn>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'attendance' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'attendance' && (
                  <FadeIn>
                    <MatchAttendance event={event} initialAttendees={matchData.attendees} initialTeamRoster={matchData.teamRoster} initialStaffMembers={matchData.staffMembers} initialDraftLines={matchData.draftLines} refreshData={fetchAllMatchData} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'lines' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    <MatchLines event={event} initialAttendees={matchData.attendees} initialDraftLines={matchData.draftLines} initialIsPublished={matchData.isPublished} initialStaffMembers={matchData.staffMembers} refreshData={fetchAllMatchData} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'events' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'events' && (
                  <FadeIn>
                    <MatchProtocol event={event} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'stats' ? 1 : 0 }}>
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