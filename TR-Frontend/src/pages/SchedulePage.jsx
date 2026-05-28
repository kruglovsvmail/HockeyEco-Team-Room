import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useAccess } from '../hooks/useAccess';
import { useOutletContext } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

import { CompactWeek } from '../components/EventCalendar/CompactWeek';
import { ExpandedGrid } from '../components/EventCalendar/ExpandedGrid';
import { TopSheet } from '../ui/TopSheet';
import EventCard from '../components/EventCalendar/EventCard';
import { getAuthHeaders } from '../utils/helpers';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { PageLoader } from '../ui/Loader';
import { FadeIn } from '../ui/FadeIn';

dayjs.extend(isoWeek);
dayjs.extend(utc);       
dayjs.extend(timezone);  
dayjs.extend(isSameOrAfter);
dayjs.locale('ru');

export function SchedulePage() {
  const { selectedTeam, openRightPanel, openFullPage } = useOutletContext();

  const [currentDate, setCurrentDate] = useState(dayjs());
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPageReady, setIsPageReady] = useState(false);

  // Состояние активных фильтров для клиентской фильтрации
  const [activeFilters, setActiveFilters] = useState({
    teams: {},
    showClub: true
  });

  const { user } = useAccess();
  const filterStorageKey = user?.id ? `tr_filter_${user.id}` : null;

  const loadFiltersFromStorage = useCallback(() => {
    if (!filterStorageKey) return;
    const saved = localStorage.getItem(filterStorageKey);
    if (saved) {
      try {
        setActiveFilters(JSON.parse(saved));
      } catch (e) {
        console.error('Ошибка чтения фильтров на SchedulePage:', e);
      }
    } else {
      setActiveFilters({
        teams: {},
        showClub: true
      });
    }
  }, [filterStorageKey]);

  useEffect(() => {
    loadFiltersFromStorage();

    const handleFilterChange = () => {
      loadFiltersFromStorage();
    };

    window.addEventListener('tr-filter-changed', handleFilterChange);
    return () => {
      window.removeEventListener('tr-filter-changed', handleFilterChange);
    };
  }, [loadFiltersFromStorage]);

  const currentMonthKey = currentDate.format('YYYY-MM');
  const teamId = selectedTeam?.id || 'no_team';
  const cacheKey = `tr_cached_events_team_${teamId}_month_${currentMonthKey}`;

  const [events, setEvents] = useState(() => {
    const cached = localStorage.getItem(`tr_cached_events_team_${selectedTeam?.id || 'no_team'}_month_${dayjs().format('YYYY-MM')}`);
    return cached ? JSON.parse(cached) : [];
  });
  
  const [isLoading, setIsLoading] = useState(true);
  
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isHorizontalSwipe = useRef(false);
  const isSwipeLocked = useRef(false);
  
  const scrollRefs = useRef([]);
  
  const [offsetIndex, setOffsetIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimer = useRef(null);

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setEvents(JSON.parse(cached));
      setIsLoading(false);
    } else {
      setEvents([]);
      setIsLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // КЛИЕНТСКАЯ ФИЛЬТРАЦИЯ С УЧЕТОМ АКТИВНЫХ КОМАНД
  const processedEvents = useMemo(() => {
    return events
      .filter(event => {
        if (event.my_team_id) {
          // Если у события есть ID команды, и этот ID явно выключен в фильтрах — скрываем его
          if (activeFilters.teams[event.my_team_id] === false) {
            return false;
          }
        } else {
          // Клубное событие — проверяем общую клубную галочку
          if (!activeFilters.showClub) {
            return false;
          }
        }
        return true;
      })
      .map(event => {
        if (!event.event_date) return { ...event, _weekYearKey: null, _formattedDateStr: null };
        
        const eventDate = dayjs.utc(event.event_date).tz(event.arena_timezone || 'UTC');
        return {
          ...event,
          _weekYearKey: `${eventDate.isoWeekYear()}-${eventDate.isoWeek()}`,
          _formattedDateStr: eventDate.format('YYYY-MM-DD')
        };
      });
  }, [events, activeFilters]);

  const fetchEvents = useCallback(async () => {
    if (!navigator.onLine) {
      setIsLoading(false);
      return;
    }

    if (events.length === 0) setIsLoading(true);
    
    try {
      const baseDate = dayjs(currentMonthKey, 'YYYY-MM');
      const startDate = baseDate.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
      const endDate = baseDate.add(1, 'month').endOf('month').format('YYYY-MM-DD');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events?startDate=${startDate}&endDate=${endDate}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        const fetchedCards = data.cards || [];
        setEvents(fetchedCards);
        localStorage.setItem(cacheKey, JSON.stringify(fetchedCards));
      } else {
        console.error('Ошибка загрузки событий:', data.error);
      }
    } catch (err) {
      console.error('Ошибка сети при загрузке событий:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonthKey, events.length, cacheKey]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useFocusRevalidate(fetchEvents);

  useLayoutEffect(() => {
    if (scrollRefs.current[1]) {
      scrollRefs.current[1].scrollTop = 0;
    }
  }, [currentDate]);

  const handleToggleAttendance = async (eventId, eventType, newValue, teamId) => {
    const updatedEvents = events.map(event => 
      (event.event_id === eventId && event.event_type === eventType && event.my_team_id === teamId) 
        ? { ...event, is_attending: newValue } 
        : event
    );
    
    setEvents(updatedEvents);
    localStorage.setItem(cacheKey, JSON.stringify(updatedEvents));

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${eventId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ isAttending: newValue, eventType, teamId })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ошибка сохранения');
      }
    } catch (err) {
      console.error('Ошибка переключения тумблера:', err);
      const rolledBackEvents = events.map(event => 
        (event.event_id === eventId && event.event_type === eventType && event.my_team_id === teamId) 
          ? { ...event, is_attending: !newValue } 
          : event
      );
      setEvents(rolledBackEvents);
      localStorage.setItem(cacheKey, JSON.stringify(rolledBackEvents));
    }
  };

  const eventDatesSet = useMemo(() => {
    const dates = new Set();
    processedEvents.forEach(event => {
      if (event._formattedDateStr) {
        dates.add(event._formattedDateStr);
      }
    });
    return dates;
  }, [processedEvents]);

  const slideTo = useCallback((direction) => {
    if (isAnimating) return;

    const targetIndex = direction === 'next' ? 2 : 0;
    if (scrollRefs.current[targetIndex]) {
      scrollRefs.current[targetIndex].scrollTop = 0;
    }

    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    if (animationTimer.current) clearTimeout(animationTimer.current);

    animationTimer.current = setTimeout(() => {
      setCurrentDate(prev => direction === 'next' ? prev.add(1, 'week') : prev.subtract(1, 'week'));
      setOffsetIndex(0);
      setIsAnimating(false);
    }, 340); 
  }, [isAnimating]);

  useEffect(() => {
    const handleOpenCalendar = () => setIsExpanded(true);
    window.addEventListener('open-calendar-sheet', handleOpenCalendar);
    return () => {
      window.removeEventListener('open-calendar-sheet', handleOpenCalendar);
      if (animationTimer.current) clearTimeout(animationTimer.current);
    };
  }, []);

  const handleTouchStart = (e) => {
    if (isExpanded || isAnimating) return;

    const x = e.touches[0].clientX;
    if (x < 40 || x > window.innerWidth - 40) return;

    touchStartX.current = x;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;
    isSwipeLocked.current = false;
  };

  const handleTouchMove = (e) => {
    if (isExpanded || touchStartX.current === null || isAnimating) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    const diffX = touchStartX.current - currentX;
    const diffY = touchStartY.current - currentY;

    if (!isSwipeLocked.current) {
      if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
        isSwipeLocked.current = true;
        if (Math.abs(diffX) > Math.abs(diffY)) {
          isHorizontalSwipe.current = true;
        } else {
          touchStartX.current = null;
        }
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (isExpanded || touchStartX.current === null || isAnimating) {
      touchStartX.current = null;
      return;
    }
    
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX.current - touchEndX;

    if (isHorizontalSwipe.current && Math.abs(diffX) > 40) {
      if (diffX > 0) slideTo('next');
      else slideTo('prev');
    }

    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = false;
  };

  if (!isPageReady) {
    return <PageLoader />;
  }

  return (
    <FadeIn className="w-full h-full">
      <div 
        className="flex flex-col w-full h-full overflow-hidden relative bg-surface-border"
        style={{ touchAction: 'pan-y' }}
      >
        {/* ШАПКА: Контейнер плашки календаря и градиентного шлейфа */}
        <div className="absolute top-0 left-0 right-0 z-40 bg-transparent pointer-events-none flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-surface-border from-50% to-transparent z-10" />

          <div className="px-4 pt-2 pb-1 pointer-events-auto relative z-20">
            <CompactWeek 
              date={currentDate} 
              offsetIndex={offsetIndex}
              isAnimating={isAnimating}
              onChangeDate={(newDate) => {
                if (newDate.isBefore(currentDate, 'day')) slideTo('prev');
                else if (newDate.isAfter(currentDate, 'day')) slideTo('next');
                else setCurrentDate(newDate);
              }}
              onToggleExpand={() => setIsExpanded(true)} 
            />
          </div>
        </div>

        {/* Контейнер карточек занимает 100% высоты */}
        <div 
          className="w-full h-full relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="w-[300%] flex items-start h-full"
            style={{
              transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}%))`,
              transition: isAnimating ? 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
              pointerEvents: isAnimating ? 'none' : 'auto',
              willChange: 'transform'
            }}
          >
            {[-1, 0, 1].map((offset, idx) => {
              const slideDate = currentDate.add(offset, 'week');
              const slideWeekKey = slideDate.startOf('isoWeek').format('YYYY-MM-DD');
              
              const targetWeekYearKey = `${slideDate.isoWeekYear()}-${slideDate.isoWeek()}`;
              const slideEvents = processedEvents.filter(event => event._weekYearKey === targetWeekYearKey);

              return (
                <div 
                  key={slideWeekKey} 
                  ref={el => scrollRefs.current[idx] = el}
                  className="w-1/3 shrink-0 flex flex-col px-4 h-full overflow-y-auto scrollbar-hide pt-[80px] pb-4"
                >
                  <div>
                    {isLoading && offset === 0 ? (
                      <PageLoader />
                    ) : slideEvents.length > 0 ? (
                      <FadeIn className="flex flex-col gap-0">
                        {slideEvents.map(event => {
                          let panelType = 'matchDetails';
                          let panelTitle = 'Детали матча';

                          if (event.event_type.includes('training')) {
                            panelType = 'trainingDetails';
                            panelTitle = 'Детали тренировки';
                          } else if (event.event_type.includes('meeting')) {
                            panelType = 'meetingDetails';
                            panelTitle = 'Детали собрания';
                          }

                          return (
                            <EventCard 
                              key={`${event.event_type}-${event.event_id}-${event.my_team_id || 'club'}`} 
                              event={event} 
                              onToggleAttendance={handleToggleAttendance}
                              onClick={() => openFullPage(panelType, event, panelTitle)}
                            />
                          );
                        })}
                      </FadeIn>
                    ) : (
                      <div className="text-center p-10">
                        <p className="text-sm text-content-muted italic leading-relaxed">
                          На эту неделю событий не запланировано.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div 
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <TopSheet isOpen={isExpanded} onClose={() => setIsExpanded(false)}>
            <div className="pb-2">
              <ExpandedGrid 
                date={currentDate} 
                onChangeDate={(newDate) => {
                  setCurrentDate(newDate);
                }} 
                matchDatesSet={eventDatesSet} 
              />
            </div>
          </TopSheet>
        </div>
      </div>
    </FadeIn>
  );
}