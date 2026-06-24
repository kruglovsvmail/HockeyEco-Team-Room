import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { getAuthHeaders } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';
import { useAccess } from '../../../hooks/useAccess';
import { PERMISSIONS } from '../../../utils/permissions';
import { HintPopover } from '../../../ui/HintPopover';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

// Ленивая загрузка вкладок
const TrainingAttendance = lazy(() =>
  import('./TrainingAttendance').then(m => ({ default: m.TrainingAttendance }))
);
const TrainingLines = lazy(() =>
  import('./TrainingLines').then(m => ({ default: m.TrainingLines }))
);

const TRAINING_TABS = [
  { id: 'attendance', label: 'Отметки' },
  { id: 'lines',     label: 'Расстановка' },
];

// Высота контейнера 1 (text-[30px]=30) = 30px
const HEADER_1_HEIGHT = 46;

export const EventDetailsTraining = ({ event }) => {
  const [activeTab, setActiveTab] = useState('attendance');
  const [localEvent, setLocalEvent] = useState(event);

  useEffect(() => { setLocalEvent(event); }, [event?.event_id]);

  const cacheKey = `tr_cached_training_${localEvent?.event_id}_team_${localEvent?.my_team_id || 'no_team'}`;

  const [trainingData, setTrainingData] = useState({
    attendees:    [],
    teamRoster:   [],
    staffMembers: [],
  });

  const [loading, setLoading]                     = useState(true);
  const [isBottomSheetOpen, setIsBottomSheetOpen]  = useState(false);
  const [isSaving, setIsSaving]                    = useState(false);

  const scrollContainerRef = useRef(null);

  // ── Цвет бренда ──────────────────────────────────────────────────────────
  const isColorsEnabled  = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor     = isColorsEnabled && !!localEvent?.team_color;
  const activeBrandColor = hasTeamColor ? localEvent.team_color : 'var(--color-brand)';

  // ── Авторизация ───────────────────────────────────────────────────────────
  const localUser = React.useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem('teampwa_user') ||
        localStorage.getItem('teampwa_cached_user')
      );
    } catch { return null; }
  }, []);

  const localTeam = React.useMemo(() => {
    try {
      if (!localUser || !localEvent?.my_team_id) return null;
      return localUser.teams?.find(t => String(t.id) === String(localEvent.my_team_id));
    } catch { return null; }
  }, [localUser, localEvent?.my_team_id]);

  const { user, checkAccess } = useAccess(localUser, localTeam);

  // ── Права на редактирование ───────────────────────────────────────────────
  const userRoles = React.useMemo(() => {
    const roles = [];
    const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
    if (globalRole === 'admin') roles.push('admin');

    if (localTeam?.user_role) {
      localTeam.user_role.split(',').forEach(r => roles.push(r.trim().toLowerCase()));
    }

    const targetTeamId = localEvent?.my_team_id;
    const matrix = user?.accessMatrix || user?.access_matrix || {};
    const teamAccess = matrix[targetTeamId];
    if (teamAccess?.roles) {
      teamAccess.roles.forEach(r => roles.push(String(r).toLowerCase()));
    }

    if (roles.length === 0) roles.push('player');
    return [...new Set(roles)];
  }, [user, localTeam, localEvent?.my_team_id]);

  const hasRoleForAction = (action) => {
    if (userRoles.includes('admin')) return true;
    const perm = PERMISSIONS[action];
    if (!perm) return false;
    return userRoles.some(r => perm.allowedRoles.map(ar => ar.toLowerCase()).includes(r));
  };

  const showScheduleButton = hasRoleForAction('TRAINING_EDIT_SCHEDULE');
  const showFinancesButton  = hasRoleForAction('TRAINING_EDIT_FINANCES');
  const showEditButton      = showScheduleButton || showFinancesButton;

  const hasScheduleSubscription = checkAccess('TRAINING_EDIT_SCHEDULE', localEvent?.my_team_id);
  const hasFinancesSubscription  = checkAccess('TRAINING_EDIT_FINANCES',  localEvent?.my_team_id);
  const hasEditSubscription      = hasScheduleSubscription || hasFinancesSubscription;

  // ── Состояние шторки редактирования (поднято сюда, как в EventDetailsMatch) ──
  const targetDate = localEvent?.event_date;
  const arenaTz0    = localEvent?.arena_timezone || 'UTC';

  const [gameDate,          setGameDate]          = useState(targetDate ? dayjs.utc(targetDate).tz(arenaTz0).format('YYYY-MM-DD') : '');
  const [gameTime,          setGameTime]          = useState(targetDate ? dayjs.utc(targetDate).tz(arenaTz0).format('HH:mm') : '');
  const [selectedArenaId,   setSelectedArenaId]   = useState(localEvent?.arena_id ?? null);
  const [selectedArenaName, setSelectedArenaName] = useState(localEvent?.arena_name || '');
  const [customTimezone,    setCustomTimezone]    = useState(localEvent?.arena_timezone || null);
  const [locationUrl,       setLocationUrl]       = useState(localEvent?.location_url || '');

  const rawFee = localEvent?.my_fee;
  const [playerFee, setPlayerFee] = useState(
    rawFee === null || rawFee === undefined ? '' : String(Math.round(Number(rawFee)))
  );

  // Пересинхронизируем поля шторки при каждом открытии — на случай,
  // если localEvent обновился пока шторка была закрыта.
  useEffect(() => {
    if (!isBottomSheetOpen) return;
    const arenaTz = localEvent?.arena_timezone || 'UTC';
    const date = localEvent?.event_date;
    setGameDate(date ? dayjs.utc(date).tz(arenaTz).format('YYYY-MM-DD') : '');
    setGameTime(date ? dayjs.utc(date).tz(arenaTz).format('HH:mm') : '');
    setSelectedArenaId(localEvent?.arena_id ?? null);
    setSelectedArenaName(localEvent?.arena_name || '');
    setCustomTimezone(localEvent?.arena_timezone || null);
    setLocationUrl(localEvent?.location_url || '');
    const fee = localEvent?.my_fee;
    setPlayerFee(fee === null || fee === undefined ? '' : String(Math.round(Number(fee))));
  }, [isBottomSheetOpen, localEvent]);

  const isDateDisabled  = !(showScheduleButton && hasScheduleSubscription);
  const isTimeDisabled  = isDateDisabled;
  const isArenaDisabled = isDateDisabled;
  const isFeeDisabled   = !(showFinancesButton && hasFinancesSubscription);

  // ── Инициализация из кэша ─────────────────────────────────────────────────
  useEffect(() => {
    if (!localEvent?.event_id) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setTrainingData(JSON.parse(cached));
      setLoading(false);
    } else {
      setTrainingData({ attendees: [], teamRoster: [], staffMembers: [] });
      setLoading(true);
    }
  }, [localEvent?.event_id, cacheKey]);

  // ── Загрузка данных ───────────────────────────────────────────────────────
  const fetchAllTrainingData = useCallback(async () => {
    if (!localEvent?.event_id || !localEvent?.my_team_id) return;
    if (!navigator.onLine) { setLoading(false); return; }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const [attRes, rosterRes] = await Promise.all([
        fetch(
          `${apiUrl}/api/trainings/${localEvent.event_id}/attendance?eventType=${localEvent.event_type}&teamId=${localEvent.my_team_id}`,
          { headers }
        ),
        fetch(
          `${apiUrl}/api/trainings/${localEvent.event_id}/roster?teamId=${localEvent.my_team_id}&eventType=${localEvent.event_type}`,
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

      setTrainingData(freshData);
      localStorage.setItem(cacheKey, JSON.stringify(freshData));
    } catch (err) {
      console.error('Ошибка загрузки данных тренировки:', err);
    } finally {
      setLoading(false);
    }
  }, [localEvent?.event_id, localEvent?.event_type, localEvent?.my_team_id, cacheKey]);

  useEffect(() => { fetchAllTrainingData(); }, [fetchAllTrainingData]);
  useFocusRevalidate(fetchAllTrainingData);

  // ── Сохранение из шторки — расписание и взнос одним общим запросом ────────
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const apiUrl  = import.meta.env.VITE_API_URL || '';
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

      const canSaveSchedule = showScheduleButton && hasScheduleSubscription;
      const canSaveFinances = showFinancesButton && hasFinancesSubscription;

      const promises = [];

      if (canSaveSchedule) {
        promises.push(
          fetch(`${apiUrl}/api/trainings/${localEvent.event_id}/schedule`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              teamId:          localEvent.my_team_id,
              eventType:       localEvent.event_type,
              date:            gameDate,
              time:            gameTime,
              arena_id:        selectedArenaId || null,
              // Ручной ввод локации — текстовое название обязательно для CHECK-ограничения в БД
              location:        selectedArenaId ? null : (selectedArenaName || null),
              location_url:    locationUrl     || null,
              custom_timezone: customTimezone  || null,
            }),
          })
        );
      }

      if (canSaveFinances) {
        promises.push(
          fetch(`${apiUrl}/api/trainings/${localEvent.event_id}/finances`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              teamId:     localEvent.my_team_id,
              eventType:  localEvent.event_type,
              player_fee: playerFee === '' ? null : Number(playerFee),
            }),
          })
        );
      }

      const results = await Promise.all(promises);
      const allOk    = results.every(r => r.ok);

      if (allOk) {
        const arenaTz  = customTimezone || localEvent?.arena_timezone || 'UTC';
        const newDate  = dayjs.tz(`${gameDate} ${gameTime}`, arenaTz).utc().format();

        setLocalEvent(prev => ({
          ...prev,
          ...(canSaveSchedule && {
            event_date:      newDate,
            arena_id:        selectedArenaId,
            arena_name:      selectedArenaName,
            arena_timezone:  customTimezone || prev.arena_timezone,
            custom_timezone: customTimezone,
            location_url:    locationUrl,
          }),
          ...(canSaveFinances && {
            my_fee: playerFee === '' ? null : Number(playerFee),
          }),
        }));
        window.dispatchEvent(new CustomEvent('tr-events-updated'));
        localStorage.removeItem(cacheKey);
        setIsBottomSheetOpen(false);
      } else {
        alert('Ошибка сохранения параметров тренировки');
      }
    } catch (err) {
      console.error('Ошибка сохранения тренировки:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!localEvent) return null;

  const isClub = localEvent?.event_type === 'club_training';
  const arenaTz = localEvent?.arena_timezone || 'UTC';

  const eventDateObj = targetDate ? dayjs.utc(targetDate).tz(arenaTz) : null;
  const timeDisplay  = eventDateObj ? eventDateObj.format('HH:mm') : '—:——';

  const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  const dateDisplay = eventDateObj
    ? `${eventDateObj.format('D MMMM')}, ${daysMap[eventDateObj.day()]}`
    : 'Дата не назначена';

  const arenaName = localEvent?.arena_name || 'Место не указано';

  const tabIndex = TRAINING_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${tabIndex * 50}%`;

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide relative z-10"
      style={{ overflowAnchor: 'none' }}
    >

      {/* ── К1: ТРЕНИРОВКА + ВРЕМЯ + КАРАНДАШИК — sticky, всегда виден ── */}
      <div className="sticky top-0 z-30 bg-surface-base select-none pt-4">
        <div className="flex items-center w-full px-5">
          <div className="w-[70%] pr-2 flex items-center gap-2 flex-wrap">
            <span
              className="text-[30px] font-black uppercase tracking-tight leading-none"
              style={{ color: activeBrandColor }}
            >
              Тренировка
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
                Клубная
              </span>
            )}
          </div>
          <div className="w-[30%] flex justify-end items-center gap-2">
            <span className="text-[30px] font-black text-content-main tracking-tight leading-none">
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* ── К2: ДАТА / МЕСТО / ВЗНОС + ИКОНКА ТРЕНИРОВКИ — уезжает под К1 при скролле ── */}
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

          {/* Правая часть: иконка тренировки (секундомер) вместо джерси */}
          <div className="shrink-0 w-[80px]">
            <div className="w-full aspect-square rounded-xl bg-surface-border flex flex-col items-center justify-center gap-0 overflow-hidden">
              <Icon name="training_activity" className="w-12 h-12 text-content-muted" />
              <span className="text-[10px] text-content-muted font-normal uppercase text-center px-1.5 w-full">
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
          tabs={TRAINING_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="px-4"
          activeColor={hasTeamColor ? localEvent.team_color : null}
        />
      </div>

      {/* ── КОНТЕНТНАЯ ЗОНА ──────────────────────────────────────────────── */}
      <div className="w-full overflow-hidden px-2 min-h-screen pt-6 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div
            className="flex w-[200%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ transform: `translateX(${translateX})` }}
          >
            {/* Вкладка: Отметки */}
            <div
              className="w-1/2 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'attendance' ? 1 : 0 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'attendance' && (
                  <FadeIn>
                    <TrainingAttendance
                      event={localEvent}
                      initialAttendees={trainingData.attendees}
                      initialTeamRoster={trainingData.teamRoster}
                      initialStaffMembers={trainingData.staffMembers}
                      refreshData={fetchAllTrainingData}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            {/* Вкладка: Расстановка */}
            <div
              className="w-1/2 shrink-0 transition-opacity duration-500"
              style={{ opacity: activeTab === 'lines' ? 1 : 0 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    <TrainingLines
                      event={localEvent}
                      initialAttendees={trainingData.attendees}
                      initialStaffMembers={trainingData.staffMembers}
                      refreshData={fetchAllTrainingData}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>
          </div>
        )}
      </div>

      {/* Подписка на обновления event при изменениях через панель редактирования — синхронизация локального state */}
      <SyncEventOnUpdate eventId={localEvent?.event_id} eventType={localEvent?.event_type} setLocalEvent={setLocalEvent} />
    </div>
  );
};

// Локальный хелпер — слушает событие tr-events-updated и перечитывает event из sessionStorage
function SyncEventOnUpdate({ eventId, eventType, setLocalEvent }) {
  useEffect(() => {
    const onUpdate = () => {
      const routeType = eventType?.includes('training') ? 'training' : eventType?.includes('meeting') ? 'meeting' : 'match';
      const key = `tr_event_${routeType}_${eventId}`;
      const cached = sessionStorage.getItem(key);
      if (cached) setLocalEvent(JSON.parse(cached));
    };
    window.addEventListener('tr-events-updated', onUpdate);
    return () => window.removeEventListener('tr-events-updated', onUpdate);
  }, [eventId, eventType, setLocalEvent]);
  return null;
}