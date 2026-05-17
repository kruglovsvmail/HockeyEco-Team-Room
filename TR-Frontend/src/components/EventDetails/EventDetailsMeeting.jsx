import React from 'react';
import dayjs from 'dayjs';

export const EventDetailsMeeting = ({ event }) => {
  if (!event) return null;

  return (
    <div className="h-full w-full bg-surface-level1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
      
      <div className="bg-surface-level2 p-3 rounded-xl">
        <span className="text-[10px] text-content-muted uppercase tracking-widest font-bold">Организатор встречи</span>
        <div className="text-sm font-bold text-content-main mt-1">{event.my_team_name}</div>
      </div>

      <div className="bg-surface-level2 p-3 rounded-xl">
        <span className="text-[10px] text-content-muted uppercase tracking-widest font-bold">Время сбора</span>
        <div className="text-sm font-bold text-content-main mt-1">
          {dayjs.utc(event.event_date).tz(event.arena_timezone || 'UTC').format('DD.MM.YYYY HH:mm')}
        </div>
      </div>

      <div className="bg-surface-level2 p-3 rounded-xl">
        <span className="text-[10px] text-content-muted uppercase tracking-widest font-bold">Локация / Кабинет</span>
        <div className="text-sm font-bold text-content-main mt-1">{event.arena_name || 'Теоретический класс / Раздевалка'}</div>
      </div>

      <div className="bg-surface-level2 p-3 rounded-xl">
        <span className="text-[10px] text-content-muted uppercase tracking-widest font-bold">Организационный сбор</span>
        <div className="text-sm font-bold text-content-main mt-1">
          {event.my_fee ? `${event.my_fee} руб.` : 'Без оплаты'}
        </div>
      </div>

      <div className="bg-surface-level2 p-3 rounded-xl">
        <span className="text-[10px] text-content-muted uppercase tracking-widest font-bold font-bold">Уровень собрания</span>
        <div className="text-sm font-bold text-content-main mt-1">
          {event.event_type === 'club_meeting' ? 'Клубное собрание' : 'Командный разбор'}
        </div>
      </div>

    </div>
  );
};