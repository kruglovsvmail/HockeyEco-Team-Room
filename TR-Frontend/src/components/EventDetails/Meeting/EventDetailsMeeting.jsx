import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAuthHeaders } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';
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
const HEADER_1_HEIGHT = 46;

export const EventDetailsMeeting = ({ event }) => {
  const [activeTab, setActiveTab] = useState('attendance');
  const [localEvent, setLocalEvent] = useState(event);

  useEffect(() => { setLocalEvent(event); }, [event?.event_id]);

  const cacheKey = `tr_cached_meeting_${localEvent?.event_id}_team_${localEvent?.my_team_id || 'no_team'}`;

  const [meetingData, setMeetingData] = useState({
    attendees:    [],
    teamRoster:   [],
    staffMembers: [],
  });
  const [loading, setLoading] = useState(true);

  const scrollContainerRef = useRef(null);

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
    if (!localEvent?.event_id || !localEvent?.my_team_id) return;
    if (!navigator.onLine) { setLoading(false); return; }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const [attRes, rosterRes] = await Promise.all([
        fetch(
          `${apiUrl}/api/meetings/${localEvent.event_id}/attendance?eventType=${localEvent.event_type}&teamId=${localEvent.my_team_id}`,
          { headers }
        ),
        fetch(
          `${apiUrl}/api/meetings/${localEvent.event_id}/roster?teamId=${localEvent.my_team_id}&eventType=${localEvent.event_type}`,
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
  }, [localEvent?.event_id, localEvent?.event_type, localEvent?.my_team_id, cacheKey]);

  useEffect(() => { fetchAllMeetingData(); }, [fetchAllMeetingData]);
  useFocusRevalidate(fetchAllMeetingData);

  // ── Синхронизация event при редактировании через панель ──────────────────
  useEffect(() => {
    const onUpdate = () => {
      const routeType = 'meeting';
      const key = `tr_event_${routeType}_${localEvent?.event_id}`;
      const cached = sessionStorage.getItem(key);
      if (cached) setLocalEvent(JSON.parse(cached));
    };
    window.addEventListener('tr-events-updated', onUpdate);
    return () => window.removeEventListener('tr-events-updated', onUpdate);
  }, [localEvent?.event_id]);

  if (!localEvent) return null;

  const isClub = localEvent?.event_type === 'club_meeting';
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
      className="h-full overflow-y-auto scrollbar-hide relative z-10"
      style={{ overflowAnchor: 'none' }}
    >

      {/* ── К1: СОБРАНИЕ + ВРЕМЯ — sticky, всегда виден ── */}
      <div className="sticky top-0 z-30 bg-surface-base select-none pt-4">
        <div className="flex items-center w-full px-5">
          <div className="w-[70%] pr-2 flex items-center gap-2 flex-wrap">
            <span
              className="text-[30px] font-black uppercase leading-none"
              style={{ color: activeBrandColor }}
            >
              Собрание
            </span>
            {isClub && (
              <span
                className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0"
                style={{
                  color:            activeBrandColor,
                  borderColor:      `${activeBrandColor}40`,
                  backgroundColor:  `${activeBrandColor}12`,
                }}
              >
                Клубное
              </span>
            )}
          </div>
          <div className="w-[30%] flex justify-end items-center gap-2">
            <span className="text-[30px] font-black text-content-main leading-none">
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* ── К2: ДАТА / МЕСТО / ВЗНОС + ИКОНКА СОБРАНИЯ ── */}
      <div className="relative z-10 bg-surface-base">
        <div className="flex items-stretch gap-3 w-full px-5 pt-4 pb-1">

          {/* Левая часть: дата, место, взнос */}
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <Icon name="calendar" className="w-4 h-4 shrink-0 text-content-main" />
              <span className="text-[18px] font-normal text-content-main leading-none truncate">{dateDisplay}</span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <Icon name="location_pin" className="w-4 h-4 shrink-0 text-content-main" />
              <span className="text-[18px] font-normal text-content-main leading-none truncate">{arenaName}</span>
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
            <div className="flex items-center gap-4 min-w-0 mt-4">
              <Icon
                name="currency"
                className="w-4 h-4 shrink-0"
                style={{
                  color: localEvent?.my_fee === null || localEvent?.my_fee === undefined
                    ? 'var(--color-content-subtle)' : activeBrandColor
                }}
              />
              {localEvent?.my_fee !== null && localEvent?.my_fee !== undefined && Number(localEvent.my_fee) !== 0 && (
                <span className="text-[18px] font-black leading-none truncate" style={{ color: activeBrandColor }}>
                  {Number(localEvent.my_fee).toLocaleString('ru-RU')} ₽
                </span>
              )}
              {localEvent?.my_fee !== null && localEvent?.my_fee !== undefined && Number(localEvent.my_fee) === 0 && (
                <span className="text-[18px] font-medium leading-none truncate" style={{ color: activeBrandColor }}>
                  Бесплатно
                </span>
              )}
              {(localEvent?.my_fee === null || localEvent?.my_fee === undefined) && (
                <span className="text-[14px] font-medium leading-none truncate text-content-subtle">
                  Взнос не назначен
                </span>
              )}
            </div>
          </div>

          {/* Правая часть: иконка собрания */}
          <div className="shrink-0 w-[80px]">
            <div className="w-full aspect-square rounded-xl bg-surface-border flex flex-col items-center justify-center gap-0 overflow-hidden">
              <Icon name="users" className="w-12 h-12 text-content-muted" />
              <span className="text-[8px] opacity-60 text-content-muted font-normal uppercase text-center px-1.5 w-full">
                {localEvent?.my_team_name || ''}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* ── ТАБЫ — sticky, прилипают ровно под К1 ── */}
      <div
        className="sticky z-20 bg-surface-base shadow-lg pb-1"
        style={{ top: `${HEADER_1_HEIGHT}px` }}
      >
        <ChipTabs
          tabs={MEETING_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="px-4"
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
              />
            )}
          </FadeIn>
        )}
      </div>
    </div>
  );
};
