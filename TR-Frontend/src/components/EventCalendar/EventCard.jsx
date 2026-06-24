import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Toggle from '../../ui/Toggle';
import { Icon } from '../../ui/Icon';
import { getImageUrl, getContrastTextColor } from '../../utils/helpers';
import { HintPopover } from '../../ui/HintPopover';
import { ConfirmSheet } from '../../ui/ConfirmSheet';

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

  // Карточка считается «без результата» и по серверному статусу, и виртуально —
  // если game_date уже в прошлом, а БД ещё не успела перевести scheduled→finished_no_result
  // (lazy-update в CalendarController мог не отработать до момента рендера из кэша).
  const isMatchType = event.event_type === 'match';
  const isNonOfficial = event.game_type && event.game_type !== 'official';
  const gameDatePassed = event.event_date
    ? new Date(event.event_date) < new Date()
    : false;
  const isNoResult =
    event.status === 'finished_no_result' ||
    (isMatchType && isNonOfficial && event.status === 'scheduled' && gameDatePassed);

  const fullDateStr = eventDate.format('D MMMM, dd');
  const displayDateStr = fullDateStr.length > 12 ? eventDate.format('D MMM, dd') : fullDateStr;

  const cardOpacityClass = 'transition-all duration-300';

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

  // Активная шторка подтверждения: 'cancel' (инициатор отменяет), 'decline' (вызванный отклоняет), 'confirm' (вызванный подтверждает)
  const [confirmAction, setConfirmAction] = useState(null);

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
      matchEndTypeText = 'ТЕХ.';
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
        matchStatusColor = 'text-brand';
      }
      
      if (event.end_type === 'ot') matchEndTypeText = 'ОТ';
      else if (event.end_type === 'so') matchEndTypeText = 'БУЛ.';
      else matchEndTypeText = '';
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
      
      {/* Верхняя часть карточки — серая у завершённых (включая finished_no_result) */}
      <div className={(isFinished || isNoResult) ? 'opacity-60 grayscale transition-all duration-300' : ''}>

      {/* 1. ШАПКА: Локация и Челка Даты */}
      <div className="flex justify-between items-stretch w-full h-[32px]">
        <div className="flex items-center gap-1 pl-4 flex-1 overflow-hidden text-left">
          <Icon name="location_pin" className="w-3 h-3 shrink-0" style={{ color: activeBrandColor }} />
          <span className="text-[14px] font-bold text-content-muted uppercase tracking-widest truncate">
            {event.arena_name || 'Арена не указана'}
          </span>
        </div>

        <div className="relative w-[40%] shrink-0 flex items-center drop-shadow-md justify-center rounded-tr-3xl overflow-hidden">
          <svg 
            className="absolute inset-0 w-full h-full" 
            viewBox="0 0 140 38" 
            style={{ color: badgeColor }}
            fill="currentColor"
            preserveAspectRatio="none"
          >
            <path d="M0 0 H140 V38 H24 Q16 38 13.5 32 L0 0 Z" />
          </svg>
          <span className={`relative z-10 text-[14px] font-black uppercase tracking-widest drop-shadow-sm ${contrastTextColor}`}>
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

      {/* СЕРАЯ ПОЛОСА FRIENDLY_PWA: PENDING (таймер + кнопки) или CANCELLED ("Матч отменён") */}
      {isMatch && event.game_type === 'friendly_pwa' && (event.status === 'pending' || event.status === 'cancelled') && (
        <div
          className="w-full bg-surface-level2 px-5 py-2 mt-4 flex items-center justify-between gap-3 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {event.status === 'cancelled' ? (
            <div className="w-full text-center text-[14px] font-black text-content-muted uppercase tracking-widest py-2">
              Матч отменён
            </div>
          ) : (
            <>
              <div className="flex flex-col text-left">
                <span className="text-[8px] font-bold text-content-muted uppercase tracking-wider">
                  {isInitiator ? 'Ожидает подтверждения:' : 'До подтверждения осталось:'}
                </span>
                <span className="text-[18px] font-black tracking-widest text-content-muted font-mono">
                  {timeLeft || '--:--:--'}
                </span>
              </div>

              {isRoleAllowed && (
                <div className="flex items-center gap-3 shrink-0">
                  {isInitiator ? (
                    /* Инициатор — кнопка «Отменить» (danger outline) */
                    isSubscriptionMissing ? (
                      <HintPopover status="no_subscription">
                        <button
                          type="button"
                          className="py-1.5 px-3 rounded-xl text-[18px] font-black border border-danger-muted bg-surface-level2 text-danger opacity-50 cursor-pointer outline-none select-none"
                        >
                          ✖
                        </button>
                      </HintPopover>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmAction('cancel'); }}
                        className="py-1.5 px-3 rounded-xl text-[18px] font-black border border-danger-muted bg-surface-level2 text-danger transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
                      >
                        ✖
                      </button>
                    )
                  ) : (
                    /* Вызванная команда — «Отклонить» (danger) + «Подтвердить» (primary в цвет команды) */
                    <>
                      {isSubscriptionMissing ? (
                        <HintPopover status="no_subscription">
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-xl text-[18px] font-black border border-danger-muted bg-surface-level2 text-danger opacity-50 cursor-pointer outline-none select-none"
                          >
                            ✖
                          </button>
                        </HintPopover>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmAction('decline'); }}
                          className="px-3 py-1.5 rounded-xl text-[18px] font-black border border-danger-muted bg-surface-level2 text-danger transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
                        >
                          ✖
                        </button>
                      )}

                      {isSubscriptionMissing ? (
                        <HintPopover status="no_subscription">
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-xl text-[18px] font-semibold border border-success-muted bg-surface-level2 text-success opacity-50 cursor-pointer outline-none select-none"
                          >
                            ✔
                          </button>
                        </HintPopover>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmAction('confirm'); }}
                          className="px-3 py-1.5 rounded-xl text-[18px] font-semibold border border-success-muted bg-surface-level2 text-success transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
                        >
                          ✔
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {/* 3. КОМАНДЫ: Логотип и Соперник */}
      {shouldRenderTeamsBlock && (
        <div className="flex w-full px-5 mt-4 items-end">
          {event.show_team_context ? (
            <>
              <div className="w-[50%] flex items-center gap-3 text-left">
                <div className="w-10 h-10 shrink-0 overflow-hidden drop-shadow-lg flex items-center justify-center">
                  {event.my_team_logo_url ? (
                    <img src={getImageUrl(event.my_team_logo_url)} alt="Лого" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-content-muted">ЛОГО</span>
                  )}
                </div>
                <span className="text-[14px] font-black text-content-muted uppercase tracking-wide leading-tight line-clamp-2 break-words">
                  {event.my_team_name}
                </span>
              </div>

              <div className="w-[10%] shrink-0"></div>

              <div className="w-[40%] flex justify-end">
                {isMatch && event.opponent_name && (
                  <div className="flex flex-col items-end justify-center text-right w-full">
                    <span className="text-[14px] italic text-content-subtle leading-tight mb-0.5">
                      соперник:
                    </span>
                    <span className="text-[14px] font-bold text-content-muted leading-tight line-clamp-2 break-words text-right ">
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
                  <span className="text-[10px] italic text-content-subtle leading-tight mb-[4px]">
                    соперник:
                  </span>
                  <span className="text-[14px] font-bold text-content-muted leading-tight line-clamp-2 break-words text-left">
                    {event.opponent_name}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Разделительная линия */}
      <div className="h-[1px] w-[calc(100%-40px)] mx-auto bg-surface-level3 mt-4" />

      </div>{/* конец верхней части */}

      {/* 4. ПОДВАЛ */}
      <div className="px-5 py-3 flex justify-between items-center bg-surface-level1 min-h-[56px]">
        {isMatch && isNoResult ? (
          <div className="w-full text-center">
            <span className="text-[14px] font-black uppercase tracking-widest text-content-muted">
              Результаты ещё не внесены
            </span>
          </div>
        ) : isMatch && isFinished ? (
          <div className="w-full grid grid-cols-3 items-center">
  <span
    className={`text-[14px] font-black uppercase tracking-widest ${matchStatusColor}`}
  >
    {matchStatusText}
  </span>
  <span className="text-[18px] font-black text-content-main tracking-widest text-end">
    {matchScoreText}
  </span>
  <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest text-right max-w-[80px] leading-tight justify-self-end">
    {matchEndTypeText}
  </span>
</div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 w-1/3 text-content-muted text-left">
              {isMatch && (
                <>
                  <Icon name="jersey" className="w-5 h-5 shrink-0" style={{ color: activeBrandColor }} />
                  <span className="text-[14px] font-bold">{jerseyText}</span>
                </>
              )}
            </div>

            <div className="w-1/3 text-center">
              {event.my_fee != null && (
                <span className="text-[14px] font-bold leading-none" style={{ color: activeBrandColor }}>
                  {Number(event.my_fee) === 0 ? 'Бесплатно' : `${Number(event.my_fee).toLocaleString('ru-RU')} ₽`}
                </span>
              )}
            </div>

            <div
              className="w-1/3 flex justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Для отменённого матча тумблер скрыт — отмечаться некуда */}
              {event.status === 'cancelled' ? null : (
                event.toggle_status === 'allowed' ? (
                  <Toggle
                    checked={event.is_attending}
                    disabled={isFinished}
                    activeColor={activeBrandColor}
                    onChange={(val) => onToggleAttendance(event.event_id, event.event_type, val, event.my_team_id)}
                  />
                ) : (
                  <HintPopover status={event.toggle_status} />
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Шторки подтверждения действий ────────────────────────────────────
          ВАЖНО: BottomSheet идёт через createPortal, но React-события всё равно
          всплывают через JSX-дерево. Оборачиваем в div со stopPropagation,
          иначе клик по «Подтвердить»/«Отмена» внутри шторки пробивается до
          onClick карточки и открывает детали события. */}
      <div onClick={(e) => e.stopPropagation()}>
      <ConfirmSheet
        isOpen={confirmAction === 'cancel'}
        onClose={() => setConfirmAction(null)}
        isLoading={isActionLoading}
        onConfirm={async () => {
          setIsActionLoading(true);
          try {
            if (onCancelFriendlyMatch) {
              await onCancelFriendlyMatch(event.event_id || event.id, event.my_team_id);
            }
          } finally {
            setIsActionLoading(false);
            setConfirmAction(null);
          }
        }}
        title="Отменить матч?"
        description="Матч получит статус «Отменён» и автоматически удалится из системы после прошедшего времени матча."
        confirmLabel="Да"
        variant="danger"
      />

      <ConfirmSheet
        isOpen={confirmAction === 'decline'}
        onClose={() => setConfirmAction(null)}
        isLoading={isActionLoading}
        onConfirm={async () => {
          setIsActionLoading(true);
          try {
            if (onCancelFriendlyMatch) {
              await onCancelFriendlyMatch(event.event_id || event.id, event.my_team_id);
            }
          } finally {
            setIsActionLoading(false);
            setConfirmAction(null);
          }
        }}
        title="Отклонить вызов?"
        description="Матч получит статус «Отменён» и автоматически удалится из системы после прошедшего времени матча."
        confirmLabel="Да"
        variant="danger"
      />

      <ConfirmSheet
        isOpen={confirmAction === 'confirm'}
        onClose={() => setConfirmAction(null)}
        isLoading={isActionLoading}
        onConfirm={async () => {
          setIsActionLoading(true);
          try {
            if (onConfirmFriendlyMatch) {
              await onConfirmFriendlyMatch(event.event_id || event.id, event.my_team_id);
            }
          } finally {
            setIsActionLoading(false);
            setConfirmAction(null);
          }
        }}
        title="Подтвердить матч?"
        description="Матч получит статус «Запланирован» и появится в календарях обеих команд."
        confirmLabel="Да"
        variant="primary"
        activeColor="#10b981"
      />
      </div>

    </div>
  );
};

export default EventCard;