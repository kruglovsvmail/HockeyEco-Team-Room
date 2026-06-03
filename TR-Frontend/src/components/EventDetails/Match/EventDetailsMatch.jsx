import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { getImageUrl, getAuthHeaders, getContrastTextColor } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';

import { MatchInfo } from './MatchInfo';

// Импортируем наши новые унифицированные компоненты производительности
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';

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
    staffMembers: []
  });
  
  const [loading, setLoading] = useState(true);

  const scrollContainerRef = useRef(null);
  const matchupHeaderRef = useRef(null);
  const stickyTabsRef = useRef(null);
  const rafRef = useRef(null);

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
        staffMembers: []
      });
      setLoading(true);
    }
  }, [event?.event_id, cacheKey]);

  // Параллельный атомарный сбор данных со всех эндпоинтов матча за один проход
  const fetchAllMatchData = useCallback(async () => {
    if (!event?.event_id) return;

    // ПРЕВЕНТИВНЫЙ ОФФЛАЙН-ВЫХОД: Если сети нет — мгновенно прекращаем запрос, убирая микро-фризы
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const [attRes, linesRes, rosterRes] = await Promise.all([
        fetch(`${apiUrl}/api/events/${event.event_id}/attendance?eventType=${event.event_type}&teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/lines?teamId=${event.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/events/${event.event_id}/available-roster?teamId=${event.my_team_id}`, { headers })
      ]);

      const attData = await attRes.json();
      const linesData = await linesRes.json();
      const rosterData = await rosterRes.json();

      const freshData = {
        attendees: attData.success ? attData.attendees : [],
        draftLines: linesData.success ? (linesData.lines || []) : [],
        isPublished: linesData.success ? !!linesData.isPublished : false,
        teamRoster: rosterData.success ? (rosterData.roster || []) : [],
        staffMembers: rosterData.success ? (rosterData.staff || []) : []
      };

      setMatchData(freshData);
      
      // Перезаписываем изолированный кэш строго по связке ID матча и ID команды
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
    if (scrollContainerRef.current) {
      const currentScroll = scrollContainerRef.current.scrollTop;
      if (currentScroll > 110) {
        scrollContainerRef.current.scrollTo({ top: 140, behavior: 'auto' });
      }
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

  let matchStatusText = '';
  let matchStatusColor = '';
  let matchStatusStyle = {};
  let matchScoreText = '-- : --';
  let matchEndTypeText = '';

  if (isFinished) {
    const myScore = isHome ? event.home_score : event.away_score;
    const oppScore = isHome ? event.away_score : event.home_score;
    
    const isTech = event.is_technical || event.end_type === 'tech';

    if (isTech) {
      let homeDisplay = '-';
      let awayDisplay = '-';

      if (event.home_score > event.away_score) {
        homeDisplay = '+';
        awayDisplay = '-';
      } else if (event.home_score < event.away_score) {
        homeDisplay = '-';
        awayDisplay = '+';
      }

      matchScoreText = `${homeDisplay} : ${awayDisplay}`;

      const myDisplay = isHome ? homeDisplay : awayDisplay;
      const oppDisplay = isHome ? awayDisplay : homeDisplay;

      if (myDisplay === '+') {
        matchStatusText = 'ПОБЕДА';
        matchStatusColor = 'text-success';
      } else if (myDisplay === '-' && oppDisplay === '-') {
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger';
      } else {
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger';
      }
      matchEndTypeText = 'ТЕХ';

    } else {
      matchScoreText = `${event.home_score} : ${event.away_score}`;

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

      if (event.end_type === 'ot') matchEndTypeText = 'ОТ';
      else if (event.end_type === 'so') matchEndTypeText = 'Б';
    }
  }

  const handleScroll = (e) => {
    const currentScroll = e.target.scrollTop;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const isStuck = currentScroll > 110;

      if (matchupHeaderRef.current) {
        const opacity = Math.max(0, 1 - currentScroll / 80);
        const translateY = currentScroll * 0.1;
        matchupHeaderRef.current.style.opacity = opacity;
        matchupHeaderRef.current.style.transform = `translateY(${translateY}px) translateZ(0)`;
      }

      if (stickyTabsRef.current) {
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
      className="h-full overflow-y-auto scrollbar-hide relative z-10 snap-y snap-proximity"
    >
      
      {/* 1. БЛОК ШАПКИ */}
      <div 
        ref={matchupHeaderRef}
        className="snap-start bg-surface-base shadow-lg rounded-3xl shrink-0 pt-6 pb-6 will-change-transform z-20 relative mx-4"
      >
        <div className="flex items-start justify-between px-6">
        
          {/* Хозяева */}
          <div className="flex flex-col items-center w-[30%] relative z-10">
            <div className="w-12 h-12 shrink-0 mb-2 flex items-center justify-center overflow-hidden drop-shadow-md">
              {homeLogo ? (
                <img src={getImageUrl(homeLogo)} alt="Лого" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] font-black text-content-muted">ЛОГО</span>
              )}
            </div>
            <span className="text-[13px] font-bold text-content-main text-center leading-tight line-clamp-2">
              {homeName}
            </span>
          </div>

          {/* Центр */}
          <div className="flex flex-col items-center justify-center w-[40%] px-2">
            {event.status === 'live' ? (
              <div className="flex flex-col items-center">
                <span className="text-danger font-black text-2xl tracking-widest animate-pulse">LIVE</span>
                {(event.video_yt_url || event.video_vk_url) && (
                  <div className="flex items-center gap-4 mt-3">
                    {event.video_yt_url && (
                      <a href={event.video_yt_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#FF0000] transition-colors outline-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M21.582 6.186a2.665 2.665 0 0 0-1.882-1.892C18.04 3.84 12 3.84 12 3.84s-6.04 0-7.7.454a2.66 2.66 0 0 0-1.88 1.892C1.96 7.848 1.96 12 1.96 12s0 4.152.46 5.814a2.665 2.665 0 0 0 1.882 1.892c1.66.454 7.7.454 7.7.454s6.04 0 7.7-.454a2.665 2.665 0 0 0 1.882-1.892c.46-1.662.46-5.814.46-5.814s0-4.152-.46-5.814zM9.954 15.354V8.646l5.88 3.354-5.88 3.354z"/></svg>
                      </a>
                    )}
                    {event.video_vk_url && (
                      <a href={event.video_vk_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#0077FF] transition-colors outline-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.625-3.504-1.686-1.543-1.724-1.6-.459-3.27 1.582-2.09 2.62-3.842 2.3-4.56-.316-.718-1.54-.582-1.54-.582l-3.503.018c-.495 0-.759.169-.938.582-1.026 2.68-2.54 5.319-3.642 5.319-.481 0-.737-.306-.737-1.54V6.985c0-.895-.274-1.12-1.084-1.12H8.884c-.456 0-.803.14-.803.49 0 .456.634.606.853 1.95.342 2.052-.081 4.542-.718 4.542-.481 0-1.731-2.457-2.613-5.076-.23-.679-.472-.942-1.096-.942H1.054c-.65 0-.848.337-.848.665 0 .685 1.554 3.738 4.316 7.625 2.56 3.626 5.535 5.875 8.64 5.875z"/></svg>
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : isFinished ? (
              <div className="flex flex-col items-center">
                {matchStatusText && (
                  <span 
                    className={`text-[12px] font-black uppercase tracking-widest mb-2 ${matchStatusColor}`}
                    style={matchStatusStyle}
                  >
                    {matchStatusText}
                  </span>
                )}
                <span className="text-3xl font-black text-content-main tracking-tight leading-none">
                  {matchScoreText}
                </span>
                {matchEndTypeText && (
                  <span className="text-[12px] font-bold uppercase tracking-widest text-content-muted mt-2 text-center">
                    {matchEndTypeText}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-content-muted tracking-widest">
                  -- : --
                </span>
              </div>
            )}
          </div>

          {/* Гости */}
          <div className="flex flex-col items-center w-[30%] relative z-10">
            <div className="w-12 h-12 shrink-0 mb-2 flex items-center justify-center overflow-hidden drop-shadow-md">
              {awayLogo ? (
                <img src={getImageUrl(awayLogo)} alt="Лого" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] font-black text-content-muted">ЛОГО</span>
              )}
            </div>
            <span className="text-[13px] font-bold text-content-main text-center leading-tight line-clamp-2">
              {awayName}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ЗАКРЕПЛЕННЫЕ ЧИПСЫ-МЕНЮ */}
      <div 
        ref={stickyTabsRef}
        data-stuck="false"
        className="snap-start sticky top-0 z-40 shrink-0 transition-all duration-300 ease-in-out border-b border-surface-level2"
      >
        <ChipTabs 
          tabs={MATCH_TABS} 
          activeTab={activeTab} 
          onChange={setActiveTab} 
          className="!px-0"
          activeColor={hasTeamColor ? event.team_color : null}
        />
      </div>

      {/* 3. КОНТЕНТНАЯ ЧАСТЬ */}
      <div className="w-full overflow-hidden px-4 min-h-screen pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div 
            className="flex w-[500%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ transform: `translateX(${translateX})` }}
          >
            
            <div 
              className="w-1/5 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'info' ? 1 : 0.3 }}
            >
              <FadeIn>
                <MatchInfo event={event} />
              </FadeIn>
            </div>

            <div 
              className="w-1/5 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'attendance' ? 1 : 0.3 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'attendance' && (
                  <FadeIn>
                    <MatchAttendance 
                      event={event} 
                      initialAttendees={matchData.attendees}
                      initialTeamRoster={matchData.teamRoster}
                      initialStaffMembers={matchData.staffMembers}
                      initialDraftLines={matchData.draftLines}
                      refreshData={fetchAllMatchData}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div 
              className="w-1/5 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'lines' ? 1 : 0.3 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    <MatchLines 
                      event={event} 
                      initialAttendees={matchData.attendees}
                      initialDraftLines={matchData.draftLines}
                      initialIsPublished={matchData.isPublished}
                      initialStaffMembers={matchData.staffMembers}
                      refreshData={fetchAllMatchData}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div 
              className="w-1/5 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'events' ? 1 : 0.3 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'events' && (
                  <FadeIn>
                    <MatchProtocol event={event} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div 
              className="w-1/5 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'stats' ? 1 : 0.3 }}
            >
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