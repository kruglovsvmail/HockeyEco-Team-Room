import React, { useState } from 'react';
import clsx from 'clsx';
import { ShieldAlert } from 'lucide-react';
import { getImageUrl } from '../../utils/helpers';
import { Toggle } from '../../ui/Toggle';
import { AttendanceList } from './AttendanceList';
import { Icon } from '../../ui/Icon';

export function GameCard({ event, onToggleAttendance }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Форматирование даты и времени
  const eventDate = new Date(event.date);
  const formattedDate = new Intl.DateTimeFormat('ru-RU', { 
    day: 'numeric', month: 'long', weekday: 'short' 
  }).format(eventDate).toUpperCase();
  
  const formattedTime = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit', minute: '2-digit',
    timeZone: event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  }).format(eventDate);

  const isFinished = event.status === 'finished' || event.status === 'tech';

  // Логика цвета формы и стоимости для текущего игрока
  const jerseyColor = event.user_side === 'home' 
    ? (event.home_jersey_type === 'dark' ? 'темной' : 'светлой')
    : (event.away_jersey_type === 'dark' ? 'темной' : 'светлой');

  const playerFee = event.user_side === 'home' ? event.home_player_fee : event.away_player_fee;

  return (
    <div className="w-full bg-surface-level1/50 backdrop-blur-sheet rounded-3xl overflow-hidden mb-4 flex flex-col border border-surface-border/20 shadow-sm">
      
      {/* КОНТЕЙНЕР 2: Шапка */}
      <div className="w-full px-5 pt-4 pb-2 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] font-bold italic text-content-muted tracking-widest uppercase mb-1">
          <span>{formattedDate}</span>
          <span className="max-w-[150px] truncate text-right">{event.location_name || 'Арена не указана'}</span>
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="text-[22px] font-black text-content-main uppercase tracking-tighter">МАТЧ</span>
          <span className="text-[22px] font-black text-brand tracking-tight">{formattedTime}</span>
        </div>

        <div className="flex items-center justify-between text-[10px] font-bold text-content-subtle uppercase tracking-widest opacity-80">
          <span>{event.league_short_name} {event.season_name}</span>
          <span>{event.division_short_name}</span>
        </div>
      </div>

      {/* КОНТЕЙНЕР 3: Противостояние */}
      <div className="w-full bg-black/20 flex items-stretch px-5 py-6 border-y border-surface-border/10">
        <div className="flex-1 flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-surface-level2 border border-surface-border/30 p-1 rounded-xl flex items-center justify-center shadow-inner">
            {event.home_logo ? (
              <img src={getImageUrl(event.home_logo)} alt="" className="max-w-full max-h-full object-contain" />
            ) : <ShieldAlert size={28} className="text-content-subtle/40" />}
          </div>
          <span className="text-[11px] font-black text-content-muted uppercase text-center leading-none tracking-wider h-7 flex items-center">
            {event.home_name}
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-1.5 text-[34px] font-black text-content-main font-mono leading-none">
            <span>{isFinished ? event.home_score : '--'}</span>
            <span className="text-brand/40">:</span>
            <span>{isFinished ? event.away_score : '--'}</span>
          </div>
          <div className="flex flex-col items-center text-[10px] font-normal uppercase tracking-widest text-content-muted/40 mt-2 text-center leading-tight">
            <span>{event.stage_label}</span>
            {event.series_number && <span>Игра №{event.series_number}</span>}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-surface-level2 border border-surface-border/30 p-1 rounded-xl flex items-center justify-center shadow-inner">
            {event.away_logo ? (
              <img src={getImageUrl(event.away_logo)} alt="" className="max-w-full max-h-full object-contain" />
            ) : <ShieldAlert size={28} className="text-content-subtle/40" />}
          </div>
          <span className="text-[11px] font-black text-content-muted uppercase text-center leading-none tracking-wider h-7 flex items-center">
            {event.away_name}
          </span>
        </div>
      </div>

      {/* КОНТЕЙНЕР 4: Инфо и Отметка */}
      <div className="w-full px-5 py-4 flex items-center justify-between bg-white/[0.02]">
        <div className="flex flex-col gap-1.5">
          {event.user_side && (
            <div className="text-[10px] font-bold italic uppercase tracking-wide text-content-muted flex items-center gap-2">
              Мы в {jerseyColor} форме
            </div>
          )}
          
          <div className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            {playerFee !== null && playerFee !== undefined ? (
              <span className="text-content-main/80">
                Стоимость: <span className="text-brand">{playerFee} ₽</span>
              </span>
            ) : (
              <span className="text-content-muted/40 font-medium lowercase italic text-[10px] tracking-normal">
                стоимость еще не указана
              </span>
            )}
          </div>
        </div>

        {event.is_approved_roster_player && (
          <div className="flex flex-col items-end gap-1">
            <Toggle 
              checked={event.is_user_attending} 
              onChange={(checked) => onToggleAttendance(event.id, 'game', checked)} 
            />
          </div>
        )}
      </div>

      {/* КОНТЕЙНЕР 5: Разворачивание */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2 flex items-center justify-center border-t border-surface-border/10 active:bg-white/5 transition-colors"
      >
        <div className={clsx("transition-transform duration-300", isExpanded ? "rotate-180" : "")}>
          <Icon name="chevron" className="w-5 h-5 text-content-subtle" />
        </div>
      </button>

      <div className={clsx(
        "transition-all duration-500 ease-in-out bg-black/10",
        isExpanded ? "max-h-[1000px] opacity-100 p-5 pt-2" : "max-h-0 opacity-0 overflow-hidden"
      )}>
        <AttendanceList attendees={event.attendees} />
      </div>
    </div>
  );
}