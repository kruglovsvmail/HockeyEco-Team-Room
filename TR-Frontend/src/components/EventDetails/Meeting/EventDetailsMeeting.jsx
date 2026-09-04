import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAuthHeaders, uiFixed } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { FeeRow } from '../../../ui/FeeRow';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';
import { usePullToRefresh } from '../../../hooks/usePullToRefresh';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';
import { HintPopover } from '../../../ui/HintPopover';
import { MeetingAttendance } from './MeetingAttendance';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const MEETING_TABS = [
  { id: 'attendance', label: 'Отметки' },
];

// Высота контейнера 1 (text-[30px]=30) = 30px
const HEADER_1_HEIGHT = 50;
// Высота контекстной строки над типом события (бейдж «Клубное» + чьё событие).
// Строка есть всегда, поэтому К1 всегда выше на эту величину.
const CONTEXT_ROW_HEIGHT = 22;

export const EventDetailsMeeting = ({ event, openRightPanel }) => {
  const [activeTab, setActiveTab] = useState('attendance');
  const [localEvent, setLocalEvent] = useState(event);

  useEffect(() => { setLocalEvent(event); }, [event?.event_id]);

  // Клубное собрание не принадлежит команде: его контекст — клуб (my_club_id)
  const eventClubId = localEvent?.my_club_id || null;
  const isClubEvent = !!eventClubId;
  const scopeQuery = isClubEvent ? `clubId=${eventClubId}` : `teamId=${localEvent?.my_team_id}`;

  const cacheKey = isClubEvent
    ? `tr_cached_meeting_${localEvent?.event_id}_club_${eventClubId}`
    : `tr_cached_meeting_${localEvent?.event_id}_team_${localEvent?.my_team_id || 'no_team'}`;

  const [meetingData, setMeetingData] = useState({
    attendees:    [],
    teamRoster:   [],
    staffMembers: [],
  });
  const [loading, setLoading] = useState(true);

  const scrollContainerRef = useRef(null);

  // Кэш пользователя нужен ровно для одного: понять, одна у него команда (клуб)
  // или несколько — от этого зависит, показывать ли владельца события в шапке.
  const localUser = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem('teampwa_user') ||
        localStorage.getItem('teampwa_cached_user')
      );
    } catch { return null; }
  }, []);

  // ── Цвет бренда ──────────────────────────────────────────────────────────
  const isColorsEnabled  = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor     = isColorsEnabled && !!localEvent?.team_color;
  const activeBrandColor = hasTeamColor ? localEvent.team_color : 'var(--color-brand)';

  // ── Инициализация из кэша ─────────────────────────────────────────────────
  useEffect(() => {
    if (!localEvent?.event_id) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setMeetingData(JSON.parse(cached));
      setLoading(false);
    } else {
      setMeetingData({ attendees: [], teamRoster: [], staffMembers: [] });
      setLoading(true);
    }
  }, [localEvent?.event_id, cacheKey]);

  // ── Загрузка данных ───────────────────────────────────────────────────────
  const fetchAllMeetingData = useCallback(async () => {
    if (!localEvent?.event_id || (!localEvent?.my_team_id && !eventClubId)) return;
    if (!navigator.onLine) { setLoading(false); return; }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const [attRes, rosterRes] = await Promise.all([
        fetch(
          `${apiUrl}/api/meetings/${localEvent.event_id}/attendance?eventType=${localEvent.event_type}&${scopeQuery}`,
          { headers }
        ),
        fetch(
          `${apiUrl}/api/meetings/${localEvent.event_id}/roster?${scopeQuery}&eventType=${localEvent.event_type}`,
          { headers }
        ),
      ]);

      const attData    = await attRes.json();
      const rosterData = await rosterRes.json();

      const freshData = {
        attendees:    attData.success    ? attData.attendees              : [],
        teamRoster:   rosterData.success ? (rosterData.roster   || [])   : [],
        staffMembers: rosterData.success ? (rosterData.staff    || [])   : [],
      };

      setMeetingData(freshData);
      localStorage.setItem(cacheKey, JSON.stringify(freshData));
    } catch (err) {
      console.error('Ошибка загрузки данных собрания:', err);
    } finally {
      setLoading(false);
    }
  }, [localEvent?.event_id, localEvent?.event_type, localEvent?.my_team_id, eventClubId, scopeQuery, cacheKey]);

  useEffect(() => { fetchAllMeetingData(); }, [fetchAllMeetingData]);
  useFocusRevalidate(fetchAllMeetingData);

  // «Потяни вниз — обнови»: тот же ре-фетч, что и при возврате на вкладку,
  // только руками. Жест стартует лишь когда экран прокручен в самый верх.
  usePullToRefresh(scrollContainerRef, fetchAllMeetingData);

  // ── Синхронизация event при редактировании через панель ──────────────────
  // Заодно перечитываем отметки: состав могли изменить не отсюда — тумблером
  // на карточке календаря прямо перед входом в событие, и тогда загрузка при
  // монтировании обгоняет отметку и приносит список без человека. Сигнал
  // приходит уже по ответу сервера, так что этот список заведомо полный.
  useEffect(() => {
    const onUpdate = () => {
      fetchAllMeetingData();
      const routeType = 'meeting';
      const key = `tr_event_${routeType}_${localEvent?.event_id}`;
      const cached = sessionStorage.getItem(key);
      if (cached) setLocalEvent(JSON.parse(cached));
    };
    window.addEventListener('tr-events-updated', onUpdate);
    return () => window.removeEventListener('tr-events-updated', onUpdate);
  }, [fetchAllMeetingData, localEvent?.event_id]);

  if (!localEvent) return null;

  const isClub = localEvent?.event_type === 'club_meeting';
  // Шапка всегда выше на контекстную строку (бейдж «Клубное» + чьё событие)
  const headerHeight = HEADER_1_HEIGHT + CONTEXT_ROW_HEIGHT;

  // Название владельца события нужно только тому, кому есть что перепутать:
  // при единственной команде (клубе) подпись ничего не добавляет — контекст
  // и так один на всё приложение.
  const showOwnerName = isClubEvent
    ? (localUser?.clubs?.length || 0) > 1
    : (localUser?.teams?.length || 0) > 1;
  const arenaTz = localEvent?.arena_timezone || 'UTC';
  const targetDate = localEvent?.event_date;

  const eventDateObj = targetDate ? dayjs.utc(targetDate).tz(arenaTz) : null;
  const timeDisplay  = eventDateObj ? eventDateObj.format('HH:mm') : '—:——';

  const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  const dateDisplay = eventDateObj
    ? `${eventDateObj.format('D MMMM')}, ${daysMap[eventDateObj.day()]}`
    : 'Дата не назначена';

  const arenaName = localEvent?.arena_name || 'Место не указано';

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide relative z-10 event-scroll-timeline"
      style={{ overflowAnchor: 'none' }}
    >

      {/* ── К1: БЕЙДЖ «КЛУБНОЕ» + СОБРАНИЕ + ВРЕМЯ — sticky, всегда виден ──
          Высота задана явно и растёт на высоту строки бейджа у клубного события:
          sticky-табы ниже прилипают ровно на headerHeight, поэтому обе величины
          обязаны считаться из одного места — иначе между К1 и табами будет дыра. */}
      <div className="sticky top-0 z-30 bg-surface-base select-none flex flex-col justify-center" style={{ height: uiFixed(headerHeight) }}>
        {/* Контекстная строка: чьё это событие. Название команды раньше стояло
            подписью внутри плитки с иконкой справа — в 80 пикселях оно
            обрезалось до нечитаемого и спорило с самой иконкой. Здесь у него
            вся ширина, и оно читается как надзаголовок к «СОБРАНИЮ». */}
        <div className="flex items-center gap-2 w-full px-5 min-w-0" style={{ marginBottom: uiFixed(2) }}>
          {isClub && (
            <span
              className="font-black uppercase tracking-widest rounded-full border shrink-0 whitespace-nowrap"
              style={{
                color:            activeBrandColor,
                borderColor:      `${activeBrandColor}40`,
                backgroundColor:  `${activeBrandColor}12`,
                fontSize: uiFixed(10),
                paddingLeft: uiFixed(8), paddingRight: uiFixed(8), paddingTop: uiFixed(2), paddingBottom: uiFixed(2)
              }}
            >
              Клубное
            </span>
          )}
          {showOwnerName && localEvent?.my_team_name && (
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
              Собрание
            </span>
          </div>
          <div className="w-[30%] flex justify-end items-center gap-2">
            <span className="font-black text-content-main leading-none" style={{ fontSize: uiFixed(30) }}>
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* ── К2: ДАТА / МЕСТО / ВЗНОС + ИКОНКА СОБРАНИЯ — уезжает под К1 при скролле ── */}
      <div className="relative z-10 bg-surface-base">
        <div
          className="event-fade-on-scroll flex items-stretch gap-3 w-full px-5 pt-3 pb-2"
          style={{ '--fade-distance': '110px' }}
        >

          {/* Левая часть: дата, место, взнос */}
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
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
            {/* Стоимость. В долевом режиме сумма приходит со знаком «≈» и с
                пояснением: она пересчитывается на каждое изменение состава. */}
            <FeeRow event={localEvent} activeBrandColor={activeBrandColor} />
          </div>

          {/* Правая часть: иконка собрания */}
          <div className="shrink-0 w-[80px]">
            <div className="w-full aspect-square rounded-xl bg-surface-border flex items-center justify-center overflow-hidden">
              <Icon name="users" className="w-14 h-14 text-content-muted" />
            </div>
          </div>

        </div>
      </div>

      {/* ── ТАБЫ — sticky, прилипают ровно под К1 ── */}
      <div
        className="sticky z-20 bg-surface-base shadow-lg pb-1"
        style={{ top: uiFixed(headerHeight) }}
      >
        <ChipTabs
          tabs={MEETING_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="px-4 pt-3"
          activeColor={hasTeamColor ? localEvent.team_color : null}
        />
      </div>

      {/* ── КОНТЕНТНАЯ ЗОНА ── */}
      <div className="w-full overflow-hidden px-2 min-h-screen pt-6 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <FadeIn>
            {activeTab === 'attendance' && (
              <MeetingAttendance
                event={localEvent}
                initialAttendees={meetingData.attendees}
                initialTeamRoster={meetingData.teamRoster}
                initialStaffMembers={meetingData.staffMembers}
                refreshData={fetchAllMeetingData}
                openRightPanel={openRightPanel}
              />
            )}
          </FadeIn>
        )}
      </div>
    </div>
  );
};
