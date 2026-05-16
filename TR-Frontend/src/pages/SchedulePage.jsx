import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAccess } from '../hooks/useAccess';
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
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [isExpanded, setIsExpanded] = useState(false);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Рефы для обработки жестов
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isHorizontalSwipe = useRef(false);
  const isSwipeLocked = useRef(false);
  
  // --- СОСТОЯНИЯ ДЛЯ АНИМАЦИИ КАРУСЕЛИ ---
  const [offsetIndex, setOffsetIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimer = useRef(null);

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        // Чтобы не перегружать сеть, запрашиваем события за месяц до и месяц после текущей даты
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
  // Перезапрашиваем данные при смене месяца в календаре
  }, [currentDate.format('YYYY-MM')]);

  const handleToggleAttendance = async (eventId, eventType, newValue, teamId) => {
    // Оптимистичное обновление
    setEvents(prev => prev.map(event => 
      (event.event_id === eventId && event.event_type === eventType) ? { ...event, is_attending: newValue } : event
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
      // Откат при ошибке
      setEvents(prev => prev.map(event => 
        (event.event_id === eventId && event.event_type === eventType) ? { ...event, is_attending: !newValue } : event
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

    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    if (animationTimer.current) clearTimeout(animationTimer.current);

    animationTimer.current = setTimeout(() => {
      setCurrentDate(prev => direction === 'next' ? prev.add(1, 'week') : prev.subtract(1, 'week'));
      setOffsetIndex(0);
      setIsAnimating(false);
    }, 240); 
  }, [isAnimating]);

  useEffect(() => {
    const handleOpenCalendar = () => setIsExpanded(true);
    window.addEventListener('open-calendar-sheet', handleOpenCalendar);
    return () => {
      window.removeEventListener('open-calendar-sheet', handleOpenCalendar);
      if (animationTimer.current) clearTimeout(animationTimer.current);
    };
  }, []);

  // --- ОБРАБОТКА СВАЙПОВ ---
  const handleTouchStart = (e) => {
    if (isExpanded || isAnimating) return;
    
    const x = e.touches[0].clientX;
    // Блокируем Edge Swipe Safari (зоны по 40px по краям)
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
          // Если пошел вертикальный скролл — отменяем отслеживание горизонтали
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
      style={{ touchAction: 'pan-y' }} // Жесткое указание браузеру
    >
      {/* СТАТИЧНАЯ ШАПКА КАЛЕНДАРЯ (Всегда кликабельна) */}
      <div className="shrink-0 z-30 relative w-full px-4">
        <CompactWeek 
          date={currentDate} 
          onChangeDate={(newDate) => {
            if (newDate.isBefore(currentDate, 'day')) slideTo('prev');
            else if (newDate.isAfter(currentDate, 'day')) slideTo('next');
            else setCurrentDate(newDate);
          }}
          onToggleExpand={() => setIsExpanded(true)} 
        />
      </div>

      {/* КАРУСЕЛЬ КАРТОЧЕК СОБЫТИЙ */}
      <div 
        className="flex-1 relative mt-4 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          className="w-[300%] flex items-start h-full"
          style={{
            transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}%))`,
            transition: isAnimating ? 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
            pointerEvents: isAnimating ? 'none' : 'auto', // Блокируем только саму карусель
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
              <div key={offset} className="w-1/3 shrink-0 flex flex-col px-4 h-full overflow-y-auto scrollbar-hide">
                <div className="pb-8">
                  {isLoading && offset === 0 ? (
                    <div className="flex justify-center items-center h-32 text-brand">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : slideEvents.length > 0 ? (
                    <div className="flex flex-col gap-0">
                      {slideEvents.map(event => (
                        <EventCard 
                          key={`${event.event_type}-${event.event_id}`} 
                          event={event} 
                          onToggleAttendance={handleToggleAttendance} 
                        />
                      ))}
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

      {/* Шторка календаря */}
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