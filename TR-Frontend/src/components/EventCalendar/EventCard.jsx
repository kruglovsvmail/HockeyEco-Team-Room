import React, { useState, useEffect } from 'react';
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

const EventCard = ({ 
  event, 
  onToggleAttendance, 
  onClick, 
  onConfirmFriendlyMatch, 
  onCancelFriendlyMatch,
  userRole,
  hasSubscription
}) => {
  const eventDate = dayjs.utc(event.event_date).tz(event.arena_timezone || 'UTC');
  const isFinished = event.status === 'finished';

  const fullDateStr = eventDate.format('D MMMM, dd');
  const displayDateStr = fullDateStr.length > 12 ? eventDate.format('D MMM, dd') : fullDateStr;

  const cardOpacityClass = isFinished ? 'opacity-60 grayscale transition-all duration-300' : 'transition-all duration-300';

  const isMatch = event.event_type === 'match';
  const isHome = isMatch ? event.my_team_id === event.home_team_id : false;
  const isInitiator = isMatch ? Number(event.initiator_team_id) === Number(event.my_team_id) : false;

  let eventTitle = '';
  if (isMatch) eventTitle = 'МАТЧ';
  else if (event.event_type.includes('training')) eventTitle = 'ТРЕНИРОВКА';
  else if (event.event_type.includes('meeting')) eventTitle = 'СОБРАНИЕ';

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event.team_color;

  const badgeColor = hasTeamColor ? event.team_color : 'var(--color-content-subtle)';
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';
  const contrastTextColor = getContrastTextColor(hasTeamColor ? event.team_color : null);

  // ПРИОРИТЕТ ДАННЫХ ИЗ БАЗЫ
  const currentUserRole = event.user_role || userRole || 'player';
  const currentUserHasSub = event.has_subscription !== undefined ? event.has_subscription : (hasSubscription || false);

  const allowedRoles = ['owner', 'team_manager', 'team_admin'];
  const requiresSubscriptionRoles = ['team_manager', 'team_admin'];

  const isRoleAllowed = allowedRoles.includes(currentUserRole);
  const isSubscriptionMissing = isRoleAllowed && requiresSubscriptionRoles.includes(currentUserRole) && !currentUserHasSub;

  // Локальное состояние для индикатора загрузки на кнопках
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!isMatch || event.game_type !== 'friendly_pwa' || event.status !== 'pending' || !event.confirm_deadline) {
      return;
    }

    const calculateTimeLeft = () => {
      const now = dayjs();
      const deadline = dayjs(event.confirm_deadline);
      const diffSeconds = deadline.diff(now, 'second');

      if (diffSeconds <= 0) {
        setTimeLeft('Время истекло');
        return;
      }

      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;

      const pad = (val) => String(val).padStart(2, '0');
      setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    calculateTimeLeft();
    const timerId = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timerId);
  }, [event.confirm_deadline, event.status, event.game_type, isMatch]);

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

  const jerseyType = isMatch ? (isHome ? event.home_jersey : event.away_jersey) : null;
  let jerseyText = 'Не определено';
  if (jerseyType === 'light') jerseyText = 'Светлая';
  else if (jerseyType === 'dark') jerseyText = 'Тёмная';

  const renderMatchIcon = () => {
    if (!isMatch) return null;
    
    if (event.game_type === 'friendly_pwa' || event.game_type === 'friendly_ext') {
      return <Icon name="handshake" className="w-6 h-6 text-content-muted ml-2" />;
    }
    
    if (event.game_type === 'tournament_ext') {
      return <Icon name="trophy" className="w-6 h-6 text-content-muted ml-2" />;
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
      className={`bg-surface-level1 rounded-3xl shadow-lg mb-4 w-full select-none flex flex-col overflow-hidden isolate cursor-pointer active:scale-[0.98] ${cardOpacityClass}`}
    >
      
      {/* 1. ШАПКА: Локация и Челка Даты */}
      <div className="flex justify-between items-stretch w-full h-[32px]">
        <div className="flex items-center gap-1 pl-4 flex-1 overflow-hidden text-left">
          <Icon name="location_pin" className="w-3 h-3 shrink-0" style={{ color: activeBrandColor }} />
          <span className="text-[11px] font-bold text-content-muted uppercase tracking-widest truncate">
            {event.arena_name || 'Арена не указана'}
          </span>
        </div>

        <div className="relative w-[50%] shrink-0 flex items-center drop-shadow-md justify-center pl-3 rounded-tr-3xl overflow-hidden">
          <svg 
            className="absolute inset-0 w-full h-full" 
            viewBox="0 0 140 38" 
            style={{ color: badgeColor }}
            fill="currentColor"
            preserveAspectRatio="none"
          >
            <path d="M0 0 H140 V38 H24 Q16 38 13.5 32 L0 0 Z" />
          </svg>
          <span className={`relative z-10 text-[11px] font-black uppercase tracking-widest drop-shadow-sm ${contrastTextColor}`}>
            {displayDateStr}
          </span>
        </div>
      </div>

      {/* 2. ЦЕНТР: Тип события и Время */}
      <div className="flex justify-between items-end px-5 mt-4">
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

      {/* СЕРАЯ ПОЛОСА С ТАЙМЕРОМ ДЛЯ FRIENDLY_PWA В СТАТУСЕ PENDING */}
      {isMatch && event.game_type === 'friendly_pwa' && event.status === 'pending' && (
        <div className="w-full bg-surface-level2 px-5 py-2 mt-4 flex items-center justify-between gap-3 select-none">
          <div className="flex flex-col text-left">
            <span className="text-[8px] font-bold text-content-muted uppercase tracking-wider">
              {isInitiator ? 'Ожидает подтверждения:' : 'До подтверждения осталось:'}
            </span>
            <span className="text-lg font-black tracking-widest text-content-muted font-mono">
              {timeLeft || '--:--:--'}
            </span>
          </div>

          {isRoleAllowed && (
            <div className="flex items-center shrink-0">
              {isInitiator ? (
                isSubscriptionMissing ? (
                  <HintPopover status="no_subscription">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-danger text-[10px] font-black uppercase tracking-widest rounded-xl opacity-50 cursor-pointer"
                    >
                      Отменить
                    </button>
                  </HintPopover>
                ) : (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={async (e) => {
                      e.stopPropagation(); // Изолируем клик прямо в кнопке
                      setIsActionLoading(true);
                      try {
                        if (onCancelFriendlyMatch) {
                          // Попробуй поменять на event.id, если event.event_id будет падать
                          await onCancelFriendlyMatch(event.event_id || event.id, event.my_team_id);
                        } else {
                          alert("Критическая ошибка: Пропс onCancelFriendlyMatch не передан в карточку родителем!");
                        }
                      } catch (err) {
                        alert(`Ошибка при отмене матча: ${err.message}`);
                      } finally {
                        setIsActionLoading(false);
                      }
                    }}
                    className="px-2 py-2 text-danger text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center min-w-[75px]"
                  >
                    {isActionLoading ? <div className="w-3 h-3 rounded-full animate-spin" /> : 'Отменить'}
                  </button>
                )
              ) : (
                isSubscriptionMissing ? (
                  <HintPopover status="no_subscription">
                    <button
                      type="button"
                      className="px-2 py-2 text-success text-[10px] font-black uppercase tracking-widest rounded-xl opacity-50 cursor-pointer"
                    >
                      Подтвердить
                    </button>
                  </HintPopover>
                ) : (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={async (e) => {
                      e.stopPropagation(); // Изолируем клик прямо в кнопке
                      setIsActionLoading(true);
                      try {
                        if (onConfirmFriendlyMatch) {
                          // Попробуй поменять на event.id, если event.event_id будет падать
                          await onConfirmFriendlyMatch(event.event_id || event.id, event.my_team_id);
                        } else {
                          alert("Критическая ошибка: Пропс onConfirmFriendlyMatch не передан в карточку родителем!");
                        }
                      } catch (err) {
                        alert(`Ошибка при подтверждении матча: ${err.message}`);
                      } finally {
                        setIsActionLoading(false);
                      }
                    }}
                    className="px-2 py-2 text-success text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center min-w-[95px]"
                  >
                    {isActionLoading ? <div className="w-3 h-3 border-2 border-success border-t-transparent rounded-full animate-spin" /> : 'Подтвердить'}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
      
      {/* 3. КОМАНДЫ: Логотип и Соперник */}
      {shouldRenderTeamsBlock && (
        <div className="flex w-full px-5 mb-4 mt-4 items-end">
          {event.show_team_context ? (
            <>
              <div className="w-[50%] flex items-center gap-3 text-left">
                <div className="w-10 h-10 shrink-0 overflow-hidden drop-shadow-lg flex items-center justify-center">
                  {event.my_team_logo_url ? (
                    <img src={getImageUrl(event.my_team_logo_url)} alt="Лого" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-content-muted">ЛОГО</span>
                  )}
                </div>
                <span className="text-xs font-black text-content-muted uppercase tracking-wide leading-tight line-clamp-2 break-words">
                  {event.my_team_name}
                </span>
              </div>

              <div className="w-[10%] shrink-0"></div>

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
                <div className="flex flex-col items-start justify-center text-left w-full">
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
            <div className="flex items-center gap-1.5 w-1/3 text-content-muted text-left">
              {isMatch && (
                <>
                  <Icon name="jersey" className="w-5 h-5 shrink-0" style={{ color: activeBrandColor }} />
                  <span className="text-sm font-bold">{jerseyText}</span>
                </>
              )}
            </div>

            <div className="w-1/3 text-center">
              {Number(event.my_fee) > 0 && (
                <span className="text-sm font-bold leading-none" style={{ color: activeBrandColor }}>
                  {event.my_fee} руб.
                </span>
              )}
            </div>

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