import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccess } from '../hooks/useAccess';
import { removeToken, getAuthHeaders } from '../utils/helpers';
import { CalendarX2, Loader2 } from 'lucide-react';

import { WeeklyPicker } from '../components/Calendar/WeeklyPicker';
import { GameCard } from '../components/Calendar/GameCard';
import { TrainingCard } from '../components/Calendar/TrainingCard';
import { MeetingCard } from '../components/Calendar/MeetingCard';

export function DashboardPage() {
  const { user } = useAccess();
  const navigate = useNavigate();
  const teams = user?.teams || [];

  const [currentWeek, setCurrentWeek] = useState({ start: new Date(), end: new Date() });
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    const allTeamIds = teams.map(t => t.id);
    if (allTeamIds.length === 0) {
      setEvents([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/weekly`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...getAuthHeaders()},
        body: JSON.stringify({
          teamIds: allTeamIds,
          startDate: currentWeek.start.toISOString(),
          endDate: currentWeek.end.toISOString()
        })
      });
      const data = await response.json();
      if (data.success) {
        setEvents(data.events);
      }
    } catch (err) {
      console.error('Ошибка загрузки событий:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWeek, teams]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleToggleAttendance = async (eventId, eventType, shouldAttend) => {
    const oldEvents = [...events];
    
    setEvents(prev => prev.map(evt => {
        if (evt.id === eventId && evt.event_type === eventType) {
            const currentUserName = [user?.lastName, user?.firstName].filter(Boolean).join(' ') || 'Без имени';
            const currentUserAttendee = {id: user.id, name: currentUserName, avatar_url: user?.avatarUrl};
            
            const nextAttendees = shouldAttend 
                ? [...(evt.attendees || []), currentUserAttendee] 
                : (evt.attendees || []).filter(u => u.id !== user.id);

            return {...evt, is_user_attending: shouldAttend, attendees: nextAttendees};
        }
        return evt;
    }));

    try {
      const baseRoute = eventType === 'game' ? 'games/attendance' : 'internal/attendance';
      const url = `${import.meta.env.VITE_API_URL}/api/events/${baseRoute}`;
      
      const response = await fetch(url, {
        method: shouldAttend ? 'POST' : 'DELETE', 
        headers: {'Content-Type': 'application/json', ...getAuthHeaders()},
        body: JSON.stringify({ targetId: eventId })
      });
      const data = await response.json();
      if (!data.success) setEvents(oldEvents);
    } catch (err) {
      setEvents(oldEvents);
    }
  };

  const handleLogout = () => { removeToken(); navigate('/login'); };

  return (
    <div className="flex flex-col h-full">
      {/* Шапка с пикером */}
      <div className="shrink-0 pt-2 pb-1 relative z-20">
        <WeeklyPicker onWeekChange={setCurrentWeek} />
      </div>

      {/* Лента событий */}
      <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col relative z-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
          </div>
        ) : events.length > 0 ? (
          <div className="pb-8 px-1">
            {events.map(event => {
              const props = { event: event, onToggleAttendance: handleToggleAttendance };
              if (event.event_type === 'game') return <GameCard key={`game-${event.id}`} {...props} />;
              if (event.event_type === 'training') return <TrainingCard key={`train-${event.id}`} {...props} />;
              if (event.event_type === 'meeting') return <MeetingCard key={`meet-${event.id}`} {...props} />;
              return null;
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 opacity-60">
            <div className="w-20 h-20 mb-6 rounded-full bg-surface-level2/40 backdrop-blur-md border border-surface-border/30 flex items-center justify-center text-content-muted shadow-sm">
              <CalendarX2 size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold text-content-main mb-2 tracking-wide">Нет событий</h3>
            <p className="text-sm text-content-subtle max-w-[240px] leading-relaxed">На этой неделе мероприятий не запланировано.</p>
          </div>
        )}
        
        <button onClick={handleLogout} className="mt-auto pt-8 mb-safe pb-4 self-center text-[10px] font-bold uppercase tracking-widest text-danger/60 hover:text-danger transition-colors outline-none">
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}