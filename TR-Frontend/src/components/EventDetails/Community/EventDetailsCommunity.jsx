import React, { useState, useEffect, useMemo, useRef, Suspense, lazy, useCallback } from 'react';
import { getAuthHeaders, uiFixed, getTrainingTypeIcon, COMMUNITY_CATEGORIES } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { FeeRow } from '../../../ui/FeeRow';
import { ChipTabs } from '../../../ui/ChipTabs';
import { HintPopover } from '../../../ui/HintPopover';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const CommunityAttendance = lazy(() =>
  import('./CommunityAttendance').then(m => ({ default: m.CommunityAttendance }))
);
const TrainingLines = lazy(() =>
  import('../Training/TrainingLines').then(m => ({ default: m.TrainingLines }))
);
const TrainingPlan = lazy(() =>
  import('../Training/TrainingPlan').then(m => ({ default: m.TrainingPlan }))
);

// Набор вкладок зависит от категории сообщества. У солянки нет плана: она не
// тренировка, упражнений там не разбирают — только расстановка.
const TABS_BY_TYPE = {
  community_training: [
    { id: 'attendance', label: 'Отметки' },
    { id: 'lines',      label: 'Формация' },
    { id: 'plan',       label: 'Сценарий' },
  ],
  community_game: [
    { id: 'attendance', label: 'Отметки' },
    { id: 'lines',      label: 'Формации' },
  ],
};

// На солянке делятся на несколько небольших составов — шести звеньев тренировки
// там мало.
const GAME_MAX_BLOCKS = 10;

const WEEKDAYS_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

const HEADER_1_HEIGHT = 50;
const CONTEXT_ROW_HEIGHT = 22;

export const EventDetailsCommunity = ({ event, openRightPanel }) => {
  const [localEvent, setLocalEvent] = useState(event);
  useEffect(() => { setLocalEvent(event); }, [event?.event_id]);

  const eventType = localEvent?.event_type;
  const isGame = eventType === 'community_game';
  const tabs = TABS_BY_TYPE[eventType] || TABS_BY_TYPE.community_training;

  const [activeTab, setActiveTab] = useState('attendance');

  // Смена типа события (переход по прямой ссылке из другой карточки) может
  // оставить активной вкладку, которой в новом наборе нет
  useEffect(() => {
    if (!tabs.some(t => t.id === activeTab)) setActiveTab('attendance');
  }, [tabs, activeTab]);

  const category = COMMUNITY_CATEGORIES.find(c => c.eventType === eventType);
  const heading = category?.eventOne || 'Событие';

  const scrollContainerRef = useRef(null);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!localEvent?.team_color;
  const activeBrandColor = hasTeamColor ? localEvent.team_color : 'var(--color-brand)';

  const headerHeight = HEADER_1_HEIGHT + CONTEXT_ROW_HEIGHT;

  // ── Дата и место ──────────────────────────────────────────────────────────
  const tz = localEvent?.arena_timezone || 'UTC';
  const eventDay = localEvent?.event_date ? dayjs.utc(localEvent.event_date).tz(tz) : null;
  const timeDisplay = eventDay ? eventDay.format('HH:mm') : '--:--';
  // День недели сокращением, как в деталях командных событий: полное
  // «воскресенье» рядом с датой занимает строку и читается хуже.
  const dateDisplay = eventDay ? `${eventDay.format('D MMMM')}, ${WEEKDAYS_SHORT[eventDay.day()]}` : '';
  const arenaName = localEvent?.arena_name || 'Локация не указана';

  // ── Данные вкладок ────────────────────────────────────────────────────────
  // Отметки грузит сама вкладка: у неё пять блоков и своя логика очереди.
  // Здесь держим только то, что нужно «Формации» — список тех, кого можно
  // расставлять, то есть основной состав.
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAttendees = useCallback(async () => {
    if (!localEvent?.event_id || !localEvent?.my_community_id) { setLoading(false); return; }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/community-events/${localEvent.event_id}/attendance`
        + `?eventType=${eventType}&communityId=${localEvent.my_community_id}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (json.success) {
        // На лёд выходит только основа: резерв расставлять не по чему
        setAttendees((json.attendees || []).filter(a => a.slot_status === 'main' && !a.withdrawn_at));
      }
    } catch {
      // Молча: вкладка отметок покажет свою ошибку, дублировать её незачем
    } finally {
      setLoading(false);
    }
  }, [localEvent?.event_id, localEvent?.my_community_id, eventType]);

  useEffect(() => { fetchAttendees(); }, [fetchAttendees]);

  // Карточка события живёт в кэше календаря: после отметки её надо перечитать,
  // иначе стоимость и счётчики останутся старыми.
  useEffect(() => {
    const onUpdate = () => fetchAttendees();
    window.addEventListener('tr-events-updated', onUpdate);
    return () => window.removeEventListener('tr-events-updated', onUpdate);
  }, [fetchAttendees]);

  const tabIndex = Math.max(0, tabs.findIndex(t => t.id === activeTab));
  const trackWidth = `${tabs.length * 100}%`;
  const paneWidth = `${100 / tabs.length}%`;
  const translateX = `-${tabIndex * (100 / tabs.length)}%`;

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide relative z-10 event-scroll-timeline"
      style={{ overflowAnchor: 'none' }}
    >
      {/* ── К1: бейдж категории, заголовок и время ── */}
      <div
        className="sticky top-0 z-30 bg-surface-base select-none flex flex-col justify-center"
        style={{ height: uiFixed(headerHeight) }}
      >
        <div className="flex items-center gap-2 w-full px-5 min-w-0" style={{ marginBottom: uiFixed(2) }}>
          <span
            className="font-black uppercase tracking-widest rounded-full border shrink-0 whitespace-nowrap"
            style={{
              color: activeBrandColor,
              borderColor: `${activeBrandColor}40`,
              backgroundColor: `${activeBrandColor}12`,
              fontSize: uiFixed(10),
              paddingLeft: uiFixed(8), paddingRight: uiFixed(8),
              paddingTop: uiFixed(2), paddingBottom: uiFixed(2),
            }}
          >
            Сообщество
          </span>
          {localEvent?.my_team_name && (
            <span
              className="font-black uppercase tracking-widest text-content-muted truncate min-w-0"
              style={{ fontSize: uiFixed(10) }}
            >
              {localEvent.my_team_name}
            </span>
          )}
        </div>

        <div className="flex items-center w-full px-5">
          <div className="w-[70%] pr-2 flex items-center gap-2 flex-nowrap min-w-0">
            <span
              className="font-black uppercase leading-none shrink-0"
              style={{ color: activeBrandColor, fontSize: uiFixed(30) }}
            >
              {heading}
            </span>
          </div>
          <div className="w-[30%] flex justify-end items-center gap-2">
            <span className="font-black text-content-main leading-none" style={{ fontSize: uiFixed(30) }}>
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* ── К2: дата, место, взнос, состав ── */}
      <div className="relative z-10 bg-surface-base">
        <div
          className="event-fade-on-scroll flex items-stretch gap-3 w-full px-5 pt-3 pb-2"
          style={{ '--fade-distance': '110px' }}
        >
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            {localEvent?.title && (
              <div className="flex items-center gap-3 min-w-0">
                <Icon name="text_size" className="w-4 h-4 shrink-0 text-content-main" />
                <span className="text-[18px] font-normal text-content-main leading-none truncate">
                  {localEvent.title}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 min-w-0">
              <Icon name="calendar" className="w-4 h-4 shrink-0 text-content-main" />
              <span className="text-[18px] font-normal text-content-main leading-none truncate">{dateDisplay}</span>
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <Icon name="location_pin" className="w-4 h-4 shrink-0 text-content-main" />
              {(localEvent?.arena_city || localEvent?.arena_address) ? (
                <HintPopover
                  className="min-w-0 max-w-full"
                  customContent={
                    <div className="flex flex-col gap-1 text-center">
                      <span className="text-[13px] font-bold text-content-main leading-snug">{arenaName}</span>
                      {localEvent.arena_city && (
                        <span className="text-[12px] font-semibold text-content-muted leading-snug">{localEvent.arena_city}</span>
                      )}
                      {localEvent.arena_address && (
                        <span className="text-[11px] font-medium text-content-muted leading-snug">{localEvent.arena_address}</span>
                      )}
                    </div>
                  }
                >
                  <span className="text-[18px] font-normal text-content-main leading-none truncate block">{arenaName}</span>
                </HintPopover>
              ) : (
                <span className="text-[18px] font-normal text-content-main leading-none truncate">{arenaName}</span>
              )}
            </div>

            {localEvent?.location_url && (
              <a
                href={localEvent.location_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-semibold ml-7 -mt-1"
                style={{ color: activeBrandColor }}
                onClick={e => e.stopPropagation()}
              >
                На карте →
              </a>
            )}

            {/* Занятость состава прямо в шапке: от неё зависит, попадёт человек
                на лёд или в очередь, и узнавать это со вкладки — поздно. */}
            <div className="flex items-center gap-3 min-w-0 mt-1">
              <Icon name="users" className="w-4 h-4 shrink-0 text-content-main" />
              <span className="text-[14px] font-normal text-content-muted leading-none truncate">
                {localEvent?.max_skaters
                  ? `Полевые ${localEvent.main_skaters || 0} / ${localEvent.max_skaters}`
                  : `Полевые ${localEvent?.main_skaters || 0}`}
                {' · '}
                {Number(localEvent?.max_goalies) === 0
                  ? 'без вратарей'
                  : localEvent?.max_goalies
                    ? `вратари ${localEvent.main_goalies || 0} / ${localEvent.max_goalies}`
                    : `вратари ${localEvent?.main_goalies || 0}`}
                {localEvent?.reserve_count ? ` · резерв ${localEvent.reserve_count}` : ''}
              </span>
            </div>

            <FeeRow event={localEvent} activeBrandColor={activeBrandColor} />
          </div>

          <div className="shrink-0 w-[80px]">
            <div className="w-full aspect-square rounded-xl bg-surface-border flex items-center justify-center overflow-hidden">
              <Icon
                name={isGame ? 'puck' : getTrainingTypeIcon(localEvent?.training_type)}
                className="w-14 h-14 text-content-muted"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Табы ── */}
      <div className="sticky z-20 bg-surface-base shadow-lg pb-1" style={{ top: uiFixed(headerHeight) }}>
        <ChipTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="px-4 pt-3"
          activeColor={hasTeamColor ? localEvent.team_color : null}
        />
      </div>

      {/* ── Контент ── */}
      <div className="w-full overflow-hidden px-2 min-h-screen pt-6 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div
            className="flex transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ width: trackWidth, transform: `translateX(${translateX})` }}
          >
            <div
              className="shrink-0 transition-opacity duration-500"
              style={{ width: paneWidth, opacity: activeTab === 'attendance' ? 1 : 0 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'attendance' && (
                  <FadeIn>
                    <CommunityAttendance
                      event={localEvent}
                      refreshData={fetchAttendees}
                      openRightPanel={openRightPanel}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div
              className="shrink-0 transition-opacity duration-500"
              style={{ width: paneWidth, opacity: activeTab === 'lines' ? 1 : 0 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    {/* Один редактор на оба типа: расстановка на солянке устроена
                        так же, как на тренировке, — те же звенья и те же позиции.
                        Отличается только потолок числа блоков. */}
                    <TrainingLines
                      event={localEvent}
                      initialAttendees={attendees}
                      initialStaffMembers={[]}
                      refreshData={fetchAttendees}
                      maxBlocks={isGame ? GAME_MAX_BLOCKS : undefined}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            {!isGame && (
              <div
                className="shrink-0 transition-opacity duration-500"
                style={{ width: paneWidth, opacity: activeTab === 'plan' ? 1 : 0 }}
              >
                <Suspense fallback={<PageLoader />}>
                  {activeTab === 'plan' && (
                    <FadeIn>
                      <TrainingPlan event={localEvent} openRightPanel={openRightPanel} />
                    </FadeIn>
                  )}
                </Suspense>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
