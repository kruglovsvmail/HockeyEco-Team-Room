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
import { Loader2 } from 'lucide-react';

dayjs.extend(isoWeek);
dayjs.extend(utc);       
dayjs.extend(timezone);  
dayjs.extend(isSameOrAfter);
dayjs.locale('ru');

export function SchedulePage() {
  const { openRightPanel, openFullPage } = useOutletContext();

  const [currentDate, setCurrentDate] = useState(dayjs());
  const [isExpanded, setIsExpanded] = useState(false);
  const [events, setEvents] = useState([]);
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
    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        const startDate = currentDate.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
        const endDate = currentDate.add(1, 'month').endOf('month').format('YYYY-MM-DD');

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events?startDate=${startDate}&endDate=${endDate}`, {
          headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
          setEvents(data.cards || []);
        } else {
          console.error('Ошибка загрузки событий:', data.error);
        }
      } catch (err) {
        console.error('Ошибка сети при загрузке событий:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [currentDate.format('YYYY-MM')]);

  useLayoutEffect(() => {
    if (scrollRefs.current[1]) {
      scrollRefs.current[1].scrollTop = 0;
    }
  }, [currentDate]);

  const handleToggleAttendance = async (eventId, eventType, newValue, teamId) => {
    // ИСПРАВЛЕНО: Добавлена проверка по event.my_team_id === teamId
    setEvents(prev => prev.map(event => 
      (event.event_id === eventId && event.event_type === eventType && event.my_team_id === teamId) 
        ? { ...event, is_attending: newValue } 
        : event
    ));

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
      // ИСПРАВЛЕНО: Добавлена проверка по event.my_team_id === teamId при откате ошибки
      setEvents(prev => prev.map(event => 
        (event.event_id === eventId && event.event_type === eventType && event.my_team_id === teamId) 
          ? { ...event, is_attending: !newValue } 
          : event
      ));
    }
  };

  const eventDatesSet = useMemo(() => {
    const dates = new Set();
    events.forEach(event => {
      if (event.event_date) {
        const eventDate = dayjs(event.event_date).tz(event.arena_timezone || 'UTC');
        dates.add(eventDate.format('YYYY-MM-DD'));
      }
    });
    return dates;
  }, [events]);

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

  return (
    <div 
      className="flex flex-col w-full h-full overflow-hidden relative bg-surface-border"
      style={{ touchAction: 'pan-y' }}
    >
      {/* ПЛАВАЮЩАЯ ШАПКА С ЭФФЕКТОМ РАЗМЫТИЯ */}
      <div className="absolute top-0 left-0 right-0 z-40 px-4 pt-4 pb-3 backdrop-blur-md border-b border-surface-level3 shadow-sm">
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

      {/* Контейнер карточек теперь занимает 100% высоты, уходя под шапку */}
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
          {[-1, 0, 1].map(offset => {
            const slideDate = currentDate.add(offset, 'week');
            const slideEvents = events.filter(event => {
              if (!event.event_date) return false;
              const eventDate = dayjs(event.event_date).tz(event.arena_timezone || 'UTC');
              return eventDate.isSame(slideDate, 'isoWeek');
            });

            return (
              <div 
                key={offset} 
                ref={el => scrollRefs.current[offset + 1] = el}
                // pt-[88px] делает так, чтобы первая карточка начиналась точно под шапкой
                className="w-1/3 shrink-0 flex flex-col px-4 h-full overflow-y-auto scrollbar-hide pt-[88px] pb-8"
              >
                <div>
                  {isLoading && offset === 0 ? (
                    <div className="flex justify-center items-center h-32 text-brand">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : slideEvents.length > 0 ? (
                    <div className="flex flex-col gap-0">
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
                    </div>
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
  );
}