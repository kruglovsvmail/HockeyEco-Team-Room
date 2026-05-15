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
  
  // --- НОВАЯ МЕХАНИКА: ФИЗИЧЕСКИЙ СВАЙП ---
  const [dragOffset, setDragOffset] = useState(0); // Смещение в пикселях за пальцем
  const [isDragging, setIsDragging] = useState(false); // Состояние активного перетаскивания
  const [offsetIndex, setOffsetIndex] = useState(0); // Индекс для финального переключения слайда
  const [isAnimating, setIsAnimating] = useState(false); // Состояние возврата/переключения

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isHorizontalSwipe = useRef(false);
  const animationTimer = useRef(null); 

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

  // Функция для анимации до нужного слайда
  const slideTo = useCallback((direction) => {
    setIsAnimating(true);
    setDragOffset(0); // Сбрасываем физическое смещение
    setOffsetIndex(direction === 'next' ? 1 : -1);

    if (animationTimer.current) clearTimeout(animationTimer.current);

    animationTimer.current = setTimeout(() => {
      setCurrentDate(prev => direction === 'next' ? prev.add(1, 'week') : prev.subtract(1, 'week'));
      setOffsetIndex(0);
      setIsAnimating(false);
    }, 300); 
  }, []);

  useEffect(() => {
    const handleOpenCalendar = () => setIsExpanded(true);
    window.addEventListener('open-calendar-sheet', handleOpenCalendar);
    return () => {
      window.removeEventListener('open-calendar-sheet', handleOpenCalendar);
      if (animationTimer.current) clearTimeout(animationTimer.current);
    };
  }, []);

  // --- ОБРАБОТЧИКИ ФИЗИЧЕСКОГО СВАЙПА ---
  const handleTouchStart = (e) => {
    if (isExpanded || isAnimating) return;
    
    const startX = e.touches[0].clientX;
    
    // Игнорируем края экрана (защита от жеста "Назад" в iOS)
    if (startX < 30 || startX > window.innerWidth - 30) {
      touchStartX.current = null;
      return;
    }

    touchStartX.current = startX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null || isExpanded || isAnimating) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    if (!isHorizontalSwipe.current) {
      // Определяем направление движения (порог 5px)
      if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
        if (Math.abs(diffX) > Math.abs(diffY)) {
          isHorizontalSwipe.current = true;
        } else {
          // Пошел вертикальный скролл - отменяем горизонтальный свайп
          touchStartX.current = null;
          setIsDragging(false);
          setDragOffset(0);
        }
      }
    }

    // Если мы определили, что свайп горизонтальный - тянем за пальцем
    if (isHorizontalSwipe.current) {
      setDragOffset(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null) {
      setIsDragging(false);
      return;
    }
    
    setIsDragging(false);

    if (isHorizontalSwipe.current) {
      const swipeThreshold = 60; // Достаточно сдвинуть на 60 пикселей для перелистывания

      if (dragOffset > swipeThreshold) {
        // Свайпнули вправо -> предыдущая неделя
        slideTo('prev');
      } else if (dragOffset < -swipeThreshold) {
        // Свайпнули влево -> следующая неделя
        slideTo('next');
      } else {
        // Не дотянули -> возвращаем карточку на место с анимацией
        setIsAnimating(true);
        setDragOffset(0);
        setTimeout(() => setIsAnimating(false), 300);
      }
    }

    touchStartX.current = null;
    isHorizontalSwipe.current = false;
  };

  return (
    <div 
      className="flex flex-col w-full h-full touch-pan-y overflow-x-hidden relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
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
        />
      </div>

      {/* КАРУСЕЛЬ КАРТОЧЕК МАТЧЕЙ (С ФИЗИЧЕСКИМ СМЕЩЕНИЕМ) */}
      <div 
        className="w-[300%] flex items-start flex-1 pt-4 touch-pan-y"
        style={{
          // Сдвигаем на 33.3% для центровки, применяем offsetIndex при переключении и добавляем dragOffset при перетаскивании
          transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}% + ${dragOffset}px))`,
          // Анимация включается только тогда, когда мы ОТПУСТИЛИ палец (isAnimating)
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