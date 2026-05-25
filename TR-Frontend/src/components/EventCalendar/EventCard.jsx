import React from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Toggle from '../../ui/Toggle';
import { Icon } from '../../ui/Icon';
import { getImageUrl, getContrastTextColor } from '../../utils/helpers';
import { HintPopover } from '../../ui/HintPopover';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const EventCard = ({ event, onToggleAttendance, onClick }) => {
  const eventDate = dayjs.utc(event.event_date).tz(event.arena_timezone || 'UTC');
  const isFinished = event.status === 'finished';

  const fullDateStr = eventDate.format('D MMMM, dd');
  const displayDateStr = fullDateStr.length > 12 ? eventDate.format('D MMM, dd') : fullDateStr;

  const cardOpacityClass = isFinished ? 'opacity-60 grayscale transition-all duration-300' : 'transition-all duration-300';

  const isMatch = event.event_type === 'match';
  const isHome = isMatch ? event.my_team_id === event.home_team_id : false;

  let eventTitle = '';
  if (isMatch) eventTitle = 'МАТЧ';
  else if (event.event_type.includes('training')) eventTitle = 'ТРЕНИРОВКА';
  else if (event.event_type.includes('meeting')) eventTitle = 'СОБРАНИЕ';

  // Динамическое определение флага включения цветов из localStorage (по дефолту true)
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event.team_color;

  // Конфигурация динамической палитры бренда для карточки
  const badgeColor = hasTeamColor ? event.team_color : 'var(--color-content-subtle)';
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';
  const contrastTextColor = getContrastTextColor(hasTeamColor ? event.team_color : null);

  let matchStatusText = '';
  let matchStatusColor = '';
  let matchStatusStyle = {};
  let matchScoreText = '';
  let matchEndTypeText = '';

  if (isMatch && isFinished) {
    const myScore = isHome ? event.home_score : event.away_score;
    const oppScore = isHome ? event.away_score : event.home_score;
    const isTech = event.is_technical || event.end_type === 'tech';

    if (isTech) {
      let homeDisplay = '-';
      let awayDisplay = '-';

      if (event.home_score > event.away_score) {
        homeDisplay = '+';
        awayDisplay = '-';
      } else if (event.home_score < event.away_score) {
        homeDisplay = '-';
        awayDisplay = '+';
      }

      matchScoreText = `${homeDisplay} : ${awayDisplay}`;
      const myDisplay = isHome ? homeDisplay : awayDisplay;

      if (myDisplay === '+') {
        matchStatusText = 'ПОБЕДА';
        matchStatusColor = 'text-success';
      } else {
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger';
      }
      matchEndTypeText = 'ТЕХНАРЬ';
    } else {
      matchScoreText = `${event.home_score} : ${event.away_score}`;

      if (myScore > oppScore) { 
        matchStatusText = 'ПОБЕДА'; 
        matchStatusColor = 'text-success'; 
      } else if (myScore < oppScore) { 
        matchStatusText = 'ПОРАЖЕНИЕ'; 
        matchStatusColor = 'text-danger'; 
      } else { 
        matchStatusText = 'НИЧЬЯ'; 
        matchStatusStyle = 'text-brand';
      }
      
      if (event.end_type === 'ot') matchEndTypeText = 'В ОВЕРТАЙМЕ';
      else if (event.end_type === 'so') matchEndTypeText = 'ПО БУЛЛИТАМ';
      else matchEndTypeText = 'В ОСНОВНОЕ';
    }
  }

  let jerseyText = 'Не определено';
  if (isMatch) {
    const jerseyType = isHome ? event.home_jersey : event.away_jersey;
    if (jerseyType === 'light') jerseyText = 'Светлая';
    else if (jerseyType === 'dark') jerseyText = 'Тёмная';
  }

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

  const shouldRenderTeamsBlock = event.show_team_context || isMatch;

  return (
    <div 
      onClick={() => onClick && onClick(event)}
      /* ИСПРАВЛЕНО: Добавлен класс isolate для принудительного создания stacking context в WebKit */
      className={`bg-surface-level1 rounded-3xl shadow-lg mb-4 w-full select-none flex flex-col overflow-hidden isolate cursor-pointer active:scale-[0.98] ${cardOpacityClass}`}
    >
      
      {/* 1. ШАПКА: Локация и Челка Даты */}
      <div className="flex justify-between items-stretch w-full h-[32px]">
        
        {/* Локация */}
        <div className="flex items-center gap-1 pl-4 flex-1 overflow-hidden">
          <Icon name="location_pin" className="w-3 h-3 shrink-0" style={{ color: activeBrandColor }} />
          <span className="text-[11px] font-bold text-content-muted uppercase tracking-widest truncate">
            {event.arena_name || 'Арена не указана'}
          </span>
        </div>

        {/* Дата */}
        {/* ИСПРАВЛЕНО: Добавлены классы rounded-tr-3xl и overflow-hidden, чтобы закругление дублировалось на сам контейнер челки */}
        <div className="relative w-[50%] shrink-0 flex items-center drop-shadow-md justify-center pl-3 rounded-tr-3xl overflow-hidden">
          <svg 
            className="absolute inset-0 w-full h-full" 
            viewBox="0 0 140 38" 
            style={{ color: badgeColor }}
            fill="currentColor"
            preserveAspectRatio="none"
          >
            {/* Основной фон челки (без градиента объема) */}
            <path d="M0 0 H140 V38 H24 Q16 38 13.5 32 L0 0 Z" />
          </svg>
          <span className={`relative z-10 text-[11px] font-black uppercase tracking-widest drop-shadow-sm ${contrastTextColor}`}>
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
        <div className="text-[28px] font-black tracking-tight leading-none" style={{ color: activeBrandColor }}>
          {eventDate.format('HH:mm')}
        </div>
      </div>

      {/* 3. КОМАНДЫ: Логотип и Соперник */}
      {shouldRenderTeamsBlock && (
        <div className="flex w-full px-5 mb-4 min-h-[60px] items-end">
          
          {event.show_team_context ? (
            <>
              {/* Моя команда */}
              <div className="w-[50%] flex items-center gap-2.5">
                <div className="w-12 h-12 shrink-0 overflow-hidden drop-shadow-lg flex items-center justify-center">
                  {event.my_team_logo_url ? (
                    <img src={getImageUrl(event.my_team_logo_url)} alt="Лого" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-content-muted">ЛОГО</span>
                  )}
                </div>
                <span className="text-xs font-black text-content-muted uppercase leading-tight line-clamp-2 break-words">
                  {event.my_team_name}
                </span>
              </div>

              <div className="w-[10%] shrink-0"></div>

              {/* Соперник */}
              <div className="w-[40%] flex justify-end">
                {isMatch && event.opponent_name && (
                  <div className="flex flex-col items-end justify-center text-right w-full">
                    <span className="text-[11px] italic text-content-subtle leading-tight mb-[4px]">
                      соперник:
                    </span>
                    <span className="text-xs font-bold text-content-muted leading-tight line-clamp-2 break-words text-right mb-[2px]">
                      {event.opponent_name}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="w-full flex items-center">
              {isMatch && event.opponent_name && (
                <div className="flex flex-col items-start justify-center w-full">
                  <span className="text-[11px] italic text-content-subtle leading-tight mb-[4px]">
                    соперник:
                  </span>
                  <span className="text-xs font-bold text-content-muted leading-tight line-clamp-2 break-words text-left">
                    {event.opponent_name}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Разделительная линия */}
      <div className="h-[1px] w-[calc(100%-40px)] mx-auto bg-surface-level3" />

      {/* 4. ПОДВАЛ */}
      <div className="px-5 py-3 flex justify-between items-center bg-surface-level1 min-h-[56px]">
        
        {isMatch && isFinished ? (
          <div className="w-full flex justify-between items-center">
            <span 
              className={`text-sm font-black uppercase tracking-widest ${matchStatusColor}`}
              style={matchStatusStyle}
            >
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
          <>
            {/* Форма */}
            <div className="flex items-center gap-1.5 w-1/3 text-content-muted">
              {isMatch && (
                <>
                  <Icon name="jersey" className="w-5 h-5 shrink-0 " style={{ color: activeBrandColor }} />
                  <span className="text-sm font-bold">{jerseyText}</span>
                </>
              )}
            </div>

            {/* Стоимость */}
            <div className="w-1/3 text-center">
              {Number(event.my_fee) > 0 && (
                <span className="text-sm font-bold leading-none" style={{ color: activeBrandColor }}>
                  {event.my_fee} руб.
                </span>
              )}
            </div>

            {/* Тумблер или Подсказка */}
            <div 
              className="w-1/3 flex justify-end"
              onClick={(e) => e.stopPropagation()} 
            >
              {event.toggle_status === 'allowed' ? (
                <Toggle 
                  checked={event.is_attending} 
                  disabled={isFinished}
                  activeColor={activeBrandColor}
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