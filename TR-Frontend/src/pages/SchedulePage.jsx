import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAccess } from '../hooks/useAccess';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';           
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { EventCalendar } from '../components/EventCalendar/EventCalendar';
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
    // Оптимистичное обновление UI: меняем тумблер только для конкретной команды
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
      // Откат при ошибке (для конкретной команды)
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

  const filteredMatches = useMemo(() => {
    return matches.filter(game => {
      if (!game.game_date) return false;
      const gameDate = dayjs(game.game_date).tz(game.arena_timezone || 'UTC');
      return gameDate.isSame(currentDate, 'isoWeek');
    });
  }, [matches, currentDate]);

  useEffect(() => {
    const handleOpenCalendar = () => setIsExpanded(true);
    window.addEventListener('open-calendar-sheet', handleOpenCalendar);
    return () => window.removeEventListener('open-calendar-sheet', handleOpenCalendar);
  }, []);

  const handleTouchStart = (e) => {
    if (isExpanded) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (isExpanded || touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) setCurrentDate(currentDate.add(1, 'week'));
      else setCurrentDate(currentDate.subtract(1, 'week'));
    }
    touchStartX.current = null;
  };

  return (
    <div 
      className="flex flex-col h-full gap-4 px-4 touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ИСПРАВЛЕНИЕ: Понизили z-index до z-30, чтобы элемент уходил под шапку (у которой z-40) */}
      <div className="shrink-0 z-30 w-full relative">
        <EventCalendar 
          currentDate={currentDate} 
          setCurrentDate={setCurrentDate}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          matchDatesSet={matchDatesSet} 
        />
      </div>

      <div className="flex-1 pb-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-brand">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="flex flex-col gap-0">
            {filteredMatches.map(game => (
              <MatchCard 
                key={`${game.id}-${game.my_team_id}`} 
                game={game} 
                onToggleAttendance={handleToggleAttendance} 
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface-level1 p-6 text-center rounded-3xl shadow-sm border border-surface-border mt-4">
            <p className="text-sm text-content-muted leading-relaxed">
              На эту неделю событий не запланировано.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}