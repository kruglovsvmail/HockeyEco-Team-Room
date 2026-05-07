/********** ФАЙЛ: TR-Frontend\src\components\Calendar\GameCard.jsx **********/

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { getImageUrl } from '../../utils/helpers';

export function GameCard({ event }) {
  // Форматирование даты (только дата)
  const eventDate = new Date(event.date);
  const formattedDate = new Intl.DateTimeFormat('ru-RU', { 
    day: 'numeric', 
    month: 'long', 
    weekday: 'short' 
  }).format(eventDate).toUpperCase();

  // Форматирование времени с учетом часового пояса арены (если timezone нет, используем локальное)
  const formattedTime = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  }).format(eventDate);

  // Для счета проверяем статусы завершения (из предыдущей логики)
  const isFinished = event.status === 'finished' || event.status === 'tech';

  return (
    /* КОНТЕЙНЕР 1: Родительский */
    <div className="w-full bg-surface-level1/50 backdrop-blur-sheet rounded-2xl overflow-hidden mb-4 flex flex-col">
      
      {/* КОНТЕЙНЕР 2: Шапка (90px, прозрачный фон, 3 строки) */}
      <div className="w-full px-4 pt-3 pb-1 flex flex-col justify-between">
        
        {/* Верхняя часть */}
        <div className="flex items-center justify-between text-[12px] font-medium italic text-content-muted tracking-wide uppercase mb-1">
          <span>{formattedDate}</span>
          {/* Выводим название локации/арены (подразумевая arenas.name по arena_id) */}
          <span>{event.location_name || event.arena_id}</span>
        </div>

        {/* Средняя часть */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[24px] font-black text-content-main/90 uppercase tracking-wider">
            МАТЧ
          </span>
          <span className="text-[24px] font-black text-brand tracking-wide">
            {formattedTime}
          </span>
        </div>

        {/* Нижняя (третья) часть */}
        <div className="flex items-center justify-between text-[10px] font-normal text-content-muted/60 uppercase tracking-wider">
          <span>
            {event.league_short_name} {event.season_name}
          </span>
          <span>
            {event.division_short_name}
          </span>
        </div>
      </div>

      {/* КОНТЕЙНЕР 3: Противостояние (Фон bg-black/50, 3 колонки) */}
      <div className="w-full bg-surface-level1/50 flex items-stretch px-4 py-6">
        
        {/* Левая часть: Хозяева */}
        <div className="flex-1 flex flex-col items-center justify-start gap-4">
          {/* Верхняя (Логотип) */}
          <div className="w-12 h-12 bg-surface-base border border-surface-border/40 p-0.5 rounded-lg flex items-center justify-center">
            {event.home_logo ? (
              <img src={getImageUrl(event.home_logo)} alt={event.home_name} className="max-w-full max-h-full object-contain" />
            ) : (
              <ShieldAlert size={32} className="text-content-subtle" strokeWidth={1} />
            )}
          </div>
          {/* Нижняя (Название) */}
<span className="inline-flex items-center justify-center text-[12px] font-black text-content-main/60 uppercase text-center leading-tight tracking-widest h-4">
            {event.home_name}
          </span>
        </div>

        {/* Центральная часть: Счет и Стадия */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {/* Верхняя (Счет) */}
          <div className="flex items-center justify-center gap-1 text-[32px] font-black text-content-main font-mono mb-1">
            <span>{isFinished ? event.home_score : '--'}</span>
            <span className="text-content-muted/50 pb-1">:</span>
            <span>{isFinished ? event.away_score : '--'}</span>
          </div>
          {/* Нижняя (Стадия и Серия) */}
        <div className="flex flex-col items-center text-[10px] uppercase tracking-wide text-content-muted/80 items-center justify-center text-center leading-tight">
          <span>{event.stage_label}</span>
          {event.series_number && (
            <span>Игра №{event.series_number}</span>
          )}
         </div>
        </div>

        {/* Правая часть: Гости */}
        <div className="flex-1 flex flex-col items-center justify-start gap-4">
          {/* Верхняя (Логотип) */}
          <div className="w-12 h-12 bg-surface-base border border-surface-border/40 p-0.5 rounded-lg flex items-center justify-center">
            {event.away_logo ? (
              <img src={getImageUrl(event.away_logo)} alt={event.away_name} className="max-w-full max-h-full object-contain" />
            ) : (
              <ShieldAlert size={32} className="text-content-subtle" strokeWidth={1} />
            )}
          </div>
          {/* Нижняя (Название) */}
<span className="inline-flex items-center justify-center text-[12px] font-black text-content-main/60 uppercase text-center leading-tight tracking-widest h-4">
            {event.away_name}
          </span>
        </div>

      </div>

    </div>
  );
}