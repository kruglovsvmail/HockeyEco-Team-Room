import React from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Toggle from '../../ui/Toggle';
import { Icon } from '../../ui/Icon';
import { getImageUrl } from '../../utils/helpers';
import { HintPopover } from '../../ui/HintPopover';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const EventCard = ({ event, onToggleAttendance }) => {
  const eventDate = dayjs(event.event_date).tz(event.arena_timezone || 'UTC');
  const isFinished = event.status === 'finished';

  // Логика форматирования: если строка слишком длинная, используем сокращенный месяц
  const fullDateStr = eventDate.format('D MMMM, dd');
  const displayDateStr = fullDateStr.length > 12 ? eventDate.format('D MMM, dd') : fullDateStr;
  
  // Обесцвечиваем и "гасим" ВСЮ карточку для ЛЮБОГО завершенного события
  const cardOpacityClass = isFinished ? 'opacity-60 grayscale transition-all duration-300' : 'transition-all duration-300';

  // --- ОПРЕДЕЛЕНИЕ ТИПА СОБЫТИЯ ---
  const isMatch = event.event_type === 'match';
  let eventTitle = '';
  if (isMatch) eventTitle = 'МАТЧ';
  else if (event.event_type.includes('training')) eventTitle = 'ТРЕНИРОВКА';
  else if (event.event_type.includes('meeting')) eventTitle = 'СОБРАНИЕ';

  // --- ЛОГИКА ДЛЯ ЗАВЕРШЕННЫХ МАТЧЕЙ (Победа/Поражение/Ничья) ---
  let matchStatusText = '';
  let matchStatusColor = '';
  let matchScoreText = '';
  let matchEndTypeText = '';

  if (isMatch && isFinished) {
    const isHome = event.my_team_id === event.home_team_id;
    const myScore = isHome ? event.home_score : event.away_score;
    const oppScore = isHome ? event.away_score : event.home_score;
    
    matchScoreText = `${myScore < 0 ? '-' : myScore} : ${oppScore < 0 ? '-' : oppScore}`;

    if (event.is_technical) {
      if (myScore > 0) { matchStatusText = 'ПОБЕДА'; matchStatusColor = 'text-success'; }
      else if (myScore < 0 && oppScore < 0) { matchStatusText = 'НИЧЬЯ'; matchStatusColor = 'text-brand'; }
      else { matchStatusText = 'ПОРАЖЕНИЕ'; matchStatusColor = 'text-danger'; }
      matchEndTypeText = 'ТЕХНИЧЕСКИЙ';
    } else {
      if (myScore > oppScore) { matchStatusText = 'ПОБЕДА'; matchStatusColor = 'text-success'; }
      else if (myScore < oppScore) { matchStatusText = 'ПОРАЖЕНИЕ'; matchStatusColor = 'text-danger'; }
      else { matchStatusText = 'НИЧЬЯ'; matchStatusColor = 'text-brand'; }
      
      if (event.end_type === 'ot') matchEndTypeText = 'В ОВЕРТАЙМЕ';
      else if (event.end_type === 'so') matchEndTypeText = 'ПО БУЛЛИТАМ';
      else matchEndTypeText = 'В ОСНОВНОЕ';
    }
  }

  // --- РЕНДЕР ИКОНКИ ДИВИЗИОНА / ТОВАРИЩЕСКОГО МАТЧА ---
  const renderMatchIcon = () => {
    if (!isMatch) return null;
    if (event.stage_type === 'friendly') {
      return <Icon name="handshake" className="w-6 h-6 text-content-muted ml-2" />;
    }
    if (event.division_logo_url) {
      return <img src={getImageUrl(event.division_logo_url)} alt="Лига" className="w-6 h-6 object-contain ml-2 opacity-80" />;
    }
    return null;
  };

  return (
    <div className={`bg-surface-level1 rounded-3xl shadow-sm mb-4 w-full select-none flex flex-col overflow-hidden ${cardOpacityClass}`}>
      
      {/* 1. ШАПКА: Локация и Челка Даты (Выровнены по высоте) */}
      <div className="flex justify-between items-stretch w-full h-[32px]">
        
        {/* Локация */}
        <div className="flex items-center gap-1 pl-4 flex-1 overflow-hidden">
          <Icon name="location_pin" className="w-3 h-3 text-brand shrink-0" />
          <span className="text-[11px] font-bold text-content-muted uppercase tracking-widest truncate]">
            {event.arena_name || 'Арена не указана'}
          </span>
        </div>

        {/* Дата (Челка фиксированной ширины со скосом и сглаженным радиусом слева внизу) */}
        <div className="relative w-[50%] shrink-0 flex items-center justify-center pl-3">
          {/* Векторный фон челки */}
          <svg 
            className="absolute inset-0 w-full h-full text-[#3f6e92ff]" 
            viewBox="0 0 140 38" 
            fill="currentColor"
            preserveAspectRatio="none"
          >
            {/* M0 0 (верхний левый) -> H140 (верхний правый) -> V38 (нижний правый) -> H24 (идем влево до начала закругления) -> Q... (кривая Безье для радиуса угла) -> L0 0 (линия к началу по скосу) */}
            <path d="M0 0 H140 V38 H24 Q16 38 13.5 32 L0 0 Z" />
          </svg>
          {/* Текст поверх */}
          <span className="relative z-10 text-white text-[11px] font-bold uppercase tracking-widest">
            {displayDateStr}
          </span>
        </div>
      </div>

      {/* 2. ЦЕНТР: Тип события и Время */}
      <div className="flex justify-between items-end px-5 mt-3 mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[28px] font-black text-content-main leading-none uppercase tracking-wide">
            {eventTitle}
          </h2>
          {renderMatchIcon()}
        </div>
        <div className="text-[28px] font-black tracking-tight text-brand leading-none">
          {eventDate.format('HH:mm')}
        </div>
      </div>

      {/* 3. КОМАНДЫ: Логотип и Соперник */}
      <div className="flex w-full px-5 mb-4 min-h-[60px] items-end">
        
        {/* Моя команда (40% ширины) */}
        <div className="w-[40%] flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 overflow-hidden flex items-center justify-center">
            {event.my_team_logo_url ? (
              <img src={getImageUrl(event.my_team_logo_url)} alt="Лого" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[9px] font-bold text-content-muted">ЛОГО</span>
            )}
          </div>
          {/* Убрали max-w и добавили line-clamp-2 для переноса в две строки */}
          <span className="text-xs font-black text-content-muted uppercase leading-tight line-clamp-2 break-words">
            {event.my_team_name}
          </span>
        </div>

        {/* Пустая зона по середине (20% ширины) */}
        <div className="w-[20%] shrink-0"></div>

        {/* Соперник (40% ширины) */}
        <div className="w-[40%] flex justify-end">
          {isMatch && event.opponent_name && (
            <div className="flex flex-col items-end justify-center text-right w-full">
              <span className="text-[11px] italic text-content-subtle leading-tight mb-[4px]">
                соперник:
              </span>
              {/* Также убрали truncate и добавили line-clamp-2 */}
              <span className="text-xs font-bold text-content-muted leading-tight line-clamp-2 break-words text-right mb-[2px]">
                {event.opponent_name}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Разделительная линия */}
      <div className="h-[1px] w-[calc(100%-40px)] mx-auto bg-surface-level3" />

      {/* 4. ПОДВАЛ: Форма, Стоимость, Тумблер */}
      <div className="px-5 py-3 flex justify-between items-center bg-surface-level1 min-h-[56px]">
        
        {isMatch && isFinished ? (
          /* ПОДВАЛ ЗАВЕРШЕННОГО МАТЧА */
          <div className="w-full flex justify-between items-center">
            <span className={`text-sm font-black uppercase tracking-widest ${matchStatusColor}`}>
              {matchStatusText}
            </span>
            <span className="text-xl font-black text-content-main tracking-widest">
              {matchScoreText}
            </span>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest text-right max-w-[80px] leading-tight">
              {matchEndTypeText}
            </span>
          </div>
        ) : (
          /* ОБЫЧНЫЙ ПОДВАЛ */
          <>
            {/* Форма */}
            <div className="flex items-center gap-1.5 w-1/3">
              {isMatch && (
                <>
                  <Icon name="jersey" className="w-5 h-5 text-brand" />
                  <span className="text-sm font-bold text-content-muted">Тёмная</span>
                </>
              )}
            </div>

            {/* Стоимость */}
            <div className="w-1/3 text-center">
              {Number(event.my_fee) > 0 && (
                <span className="text-sm font-bold text-brand">
                  {event.my_fee} руб.
                </span>
              )}
            </div>

            {/* Тумблер или Подсказка */}
            <div className="w-1/3 flex justify-end">
              {event.toggle_status === 'allowed' ? (
                <Toggle 
                  checked={event.is_attending} 
                  disabled={isFinished}
                  onChange={(val) => onToggleAttendance(event.event_id, event.event_type, val, event.my_team_id)} 
                />
              ) : (
                <HintPopover status={event.toggle_status} />
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default EventCard;