import React, { useState, useEffect } from 'react';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';

// Вспомогательная функция для генерации инициалов (заглушка)
const getInitials = (firstName, lastName) => {
  const f = firstName ? firstName.charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.charAt(0).toUpperCase() : '';
  return `${l}${f}` || '?';
};

export const MatchAttendance = ({ event }) => {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        
        // Используем твою функцию из helpers для правильного заголовка
        const headers = getAuthHeaders();
        
        const res = await fetch(`${apiUrl}/api/events/${event.event_id}/attendance?eventType=${event.event_type}&teamId=${event.my_team_id}`, {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
        
        if (!res.ok) {
          throw new Error(`Ошибка сервера: ${res.status}`);
        }

        const data = await res.json();
        
        if (data.success) {
          setAttendees(data.attendees);
        }
      } catch (err) {
        console.error('Ошибка при загрузке списка отметившихся:', err);
      } finally {
        setLoading(false);
      }
    };

    if (event?.event_id) {
      fetchAttendance();
    }
  }, [event.event_id, event.event_type, event.my_team_id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
        Загрузка состава...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-[10vh]">
      <span className="text-[10px] font-black text-content-muted uppercase tracking-widest px-1">
        Отметились ({attendees.length})
      </span>
      
      <div className="bg-surface-level1 rounded-2xl border border-surface-level2 shadow-sm overflow-hidden p-1">
        {attendees.length > 0 ? (
          <div className="flex flex-col">
            {attendees.map((user) => {
              // Каскадный фоллбэк: фото команды -> личный аватар
              const photoUrl = user.team_photo || user.avatar_url;
              
              return (
                <div key={user.id} className="flex items-center gap-3 p-3 border-b border-surface-border/50 last:border-0">
                  {/* Аватарка */}
                  <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-surface-level2 relative border border-surface-border">
                    {photoUrl ? (
                      <img 
                        src={getImageUrl(photoUrl)} 
                        alt="Аватар" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold">
                        {getInitials(user.first_name, user.last_name)}
                      </div>
                    )}
                  </div>
                  
                  {/* Имя и Фамилия */}
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-content-main leading-tight">
                      {user.last_name} {user.first_name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex justify-center items-center h-24 text-[11px] font-black text-content-muted uppercase tracking-widest text-center">
            Пока никто не отметился
          </div>
        )}
      </div>
    </div>
  );
};