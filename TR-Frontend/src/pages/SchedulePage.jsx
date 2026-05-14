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
import MatchCard from '../components/EventCalendar/MatchCard';
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
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const touchStartX = useRef(null);
  const pageRef = useRef(null);

  // --- СОСТОЯНИЯ ДЛЯ АНИМАЦИИ КАРУСЕЛИ ---
  const [offsetIndex, setOffsetIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const fetchMatches = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/games`, {
          headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
          setMatches(data.cards || []);
        } else {
          console.error('Ошибка загрузки матчей:', data.error);
        }
      } catch (err) {
        console.error('Ошибка сети при загрузке матчей:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, []);

  const handleToggleAttendance = async (gameId, newValue, teamId) => {
    setMatches(prev => prev.map(game => 
      (game.id === gameId && game.my_team_id === teamId) ? { ...game, is_attending: newValue } : game
    ));

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ isAttending: newValue, teamId })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ошибка сохранения');
      }
    } catch (err) {
      console.error('Ошибка переключения тумблера:', err);
      setMatches(prev => prev.map(game => 
        (game.id === gameId && game.my_team_id === teamId) ? { ...game, is_attending: !newValue } : game
      ));
    }
  };

  const matchDatesSet = useMemo(() => {
    const dates = new Set();
    matches.forEach(game => {
      if (game.game_date) {
        const gameDate = dayjs(game.game_date).tz(game.arena_timezone || 'UTC');
        dates.add(gameDate.format('YYYY-MM-DD'));
      }
    });
    return dates;
  }, [matches]);

  // --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ СЛАЙДОВ ---
  const slideTo = useCallback((direction) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    setTimeout(() => {
      setIsAnimating(false);
      setCurrentDate(prev => direction === 'next' ? prev.add(1, 'week') : prev.subtract(1, 'week'));
      setOffsetIndex(0);
      
      // Сброс скролла наверх сразу после окончания анимации
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        if (pageRef.current) {
          pageRef.current.scrollTop = 0;
        }
      });
    }, 300);
  }, [isAnimating]);

  useEffect(() => {
    const handleOpenCalendar = () => setIsExpanded(true);
    window.addEventListener('open-calendar-sheet', handleOpenCalendar);
    return () => window.removeEventListener('open-calendar-sheet', handleOpenCalendar);
  }, []);

  // --- СВАЙПЫ ---
  const handleTouchStart = (e) => {
    if (isExpanded || isAnimating) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (isExpanded || touchStartX.current === null || isAnimating) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) slideTo('next');
      else slideTo('prev');
    }
    touchStartX.current = null;
  };

  return (
    <div 
      ref={pageRef}
      className="flex flex-col w-full h-full touch-pan-y overflow-x-hidden relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* СТАТИЧНАЯ ШАПКА КАЛЕНДАРЯ */}
      <div className="shrink-0 z-30 relative w-full px-4">
        <CompactWeek 
          date={currentDate} 
          onChangeDate={(newDate) => {
            if (newDate.isBefore(currentDate)) slideTo('prev');
            else if (newDate.isAfter(currentDate)) slideTo('next');
            else setCurrentDate(newDate);
          }}
          onToggleExpand={() => setIsExpanded(true)} 
          offsetIndex={offsetIndex}
          isAnimating={isAnimating}
        />
      </div>

      {/* КАРУСЕЛЬ КАРТОЧЕК МАТЧЕЙ */}
      <div 
        className="w-[300%] flex items-start will-change-transform flex-1 pt-4"
        style={{
          transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}%))`,
          transition: isAnimating ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
        }}
      >
        {[-1, 0, 1].map(offset => {
          const slideDate = currentDate.add(offset, 'week');
          const slideMatches = matches.filter(game => {
            if (!game.game_date) return false;
            const gameDate = dayjs(game.game_date).tz(game.arena_timezone || 'UTC');
            return gameDate.isSame(slideDate, 'isoWeek');
          });

          return (
            <div key={offset} className="w-1/3 shrink-0 flex flex-col gap-0 px-4 h-full">
              <div className="flex-1 pb-8">
                {isLoading && offset === 0 ? (
                  <div className="flex justify-center items-center h-32 text-brand">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                ) : slideMatches.length > 0 ? (
                  <div className="flex flex-col gap-0">
                    {slideMatches.map(game => (
                      <MatchCard 
                        key={`${game.id}-${game.my_team_id}`} 
                        game={game} 
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

      {/* Шторка календаря */}
      <TopSheet isOpen={isExpanded} onClose={() => setIsExpanded(false)}>
        <div className="pb-2">
          <ExpandedGrid 
            date={currentDate} 
            onChangeDate={(newDate) => {
              setCurrentDate(newDate);
            }} 
            matchDatesSet={matchDatesSet} 
          />
        </div>
      </TopSheet>

    </div>
  );
}