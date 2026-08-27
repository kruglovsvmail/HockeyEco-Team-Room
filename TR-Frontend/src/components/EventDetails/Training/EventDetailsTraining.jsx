import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { getAuthHeaders, getImageUrl, uiFixed, getTrainingTypeIcon } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { FeeRow } from '../../../ui/FeeRow';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';
import { usePullToRefresh } from '../../../hooks/usePullToRefresh';
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
const TrainingPlan = lazy(() =>
  import('./TrainingPlan').then(m => ({ default: m.TrainingPlan }))
);

const TRAINING_TABS = [
  { id: 'attendance', label: 'Отметки' },
  { id: 'lines',     label: 'Формация' },
  { id: 'plan',      label: 'Сценарий' },
];

// Ширина ленты вкладок и шаг сдвига считаются от их количества: добавление вкладки
// не должно требовать правки магических процентов в двух местах
const TABS_TRACK_WIDTH = `${TRAINING_TABS.length * 100}%`;
const TAB_PANE_WIDTH = `${100 / TRAINING_TABS.length}%`;

// Высота контейнера 1 (text-[30px]=30) = 30px
const HEADER_1_HEIGHT = 50;
// Высота контекстной строки над типом события (бейдж «Клубная» + чьё событие).
// Строка есть всегда, поэтому К1 всегда выше на эту величину.
const CONTEXT_ROW_HEIGHT = 22;

export const EventDetailsTraining = ({ event, openRightPanel }) => {
  const [activeTab, setActiveTab] = useState('attendance');
  const [localEvent, setLocalEvent] = useState(event);

  useEffect(() => { setLocalEvent(event); }, [event?.event_id]);

  // Клубная тренировка не принадлежит команде: её контекст — клуб (my_club_id).
  // Дальше по файлу владельца события описывают эти три значения.
  const eventClubId = localEvent?.my_club_id || null;
  const isClubEvent = !!eventClubId;
  const scopeQuery = isClubEvent ? `clubId=${eventClubId}` : `teamId=${localEvent?.my_team_id}`;

  const cacheKey = isClubEvent
    ? `tr_cached_training_${localEvent?.event_id}_club_${eventClubId}`
    : `tr_cached_training_${localEvent?.event_id}_team_${localEvent?.my_team_id || 'no_team'}`;

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

  const localClub = React.useMemo(() => {
    try {
      if (!localUser || !eventClubId) return null;
      return localUser.clubs?.find(c => String(c.id) === String(eventClubId));
    } catch { return null; }
  }, [localUser, eventClubId]);

  const { user, checkAccess, checkClubAccess } = useAccess(localUser, localTeam, localClub);

  // ── Права на редактирование ───────────────────────────────────────────────
  const userRoles = React.useMemo(() => {
    const roles = [];
    const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
    if (globalRole === 'admin') roles.push('admin');

    if (isClubEvent) {
      // Клубное событие: роли берём из клубной матрицы, командные сюда не относятся
      if (Array.isArray(localClub?.user_roles)) {
        localClub.user_roles.forEach(r => roles.push(String(r).toLowerCase()));
      } else if (localClub?.user_role) {
        localClub.user_role.split(',').forEach(r => roles.push(r.trim().toLowerCase()));
      }

      const clubMatrix = user?.clubAccessMatrix || user?.club_access_matrix || {};
      const clubAccess = clubMatrix[eventClubId];
      if (clubAccess?.roles) {
        clubAccess.roles.forEach(r => roles.push(String(r).toLowerCase()));
      }
    } else {
      if (localTeam?.user_role) {
        localTeam.user_role.split(',').forEach(r => roles.push(r.trim().toLowerCase()));
      }

      const targetTeamId = localEvent?.my_team_id;
      const matrix = user?.accessMatrix || user?.access_matrix || {};
      const teamAccess = matrix[targetTeamId];
      if (teamAccess?.roles) {
        teamAccess.roles.forEach(r => roles.push(String(r).toLowerCase()));
      }
    }

    if (roles.length === 0) roles.push('player');
    return [...new Set(roles)];
  }, [user, localTeam, localClub, isClubEvent, eventClubId, localEvent?.my_team_id]);

  const hasRoleForAction = (action) => {
    if (userRoles.includes('admin')) return true;
    const perm = PERMISSIONS[action];
    if (!perm) return false;
    return userRoles.some(r => perm.allowedRoles.map(ar => ar.toLowerCase()).includes(r));
  };

  // У клубного события расписание и взнос закрыты одним ключом CLUB_MANAGE_EVENTS
  const scheduleKey = isClubEvent ? 'CLUB_MANAGE_EVENTS' : 'TRAINING_EDIT_SCHEDULE';
  const financesKey = isClubEvent ? 'CLUB_MANAGE_EVENTS' : 'TRAINING_EDIT_FINANCES';

  const showScheduleButton = hasRoleForAction(scheduleKey);
  const showFinancesButton  = hasRoleForAction(financesKey);
  const showEditButton      = showScheduleButton || showFinancesButton;

  const hasScheduleSubscription = isClubEvent
    ? checkClubAccess(scheduleKey, eventClubId)
    : checkAccess(scheduleKey, localEvent?.my_team_id);
  const hasFinancesSubscription = isClubEvent
    ? checkClubAccess(financesKey, eventClubId)
    : checkAccess(financesKey, localEvent?.my_team_id);
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

  // Взнос для формы берём из fixed_fee — это сырая сумма с человека из БД.
  // my_fee сюда брать нельзя: в долевом режиме это доля смотрящего, и сохранение
  // записало бы её вместо общей стоимости события.
  const rawFee = localEvent?.fixed_fee;
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
    const fee = localEvent?.fixed_fee;
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
    if (!localEvent?.event_id || (!localEvent?.my_team_id && !eventClubId)) return;
    if (!navigator.onLine) { setLoading(false); return; }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const [attRes, rosterRes] = await Promise.all([
        fetch(
          `${apiUrl}/api/trainings/${localEvent.event_id}/attendance?eventType=${localEvent.event_type}&${scopeQuery}`,
          { headers }
        ),
        fetch(
          `${apiUrl}/api/trainings/${localEvent.event_id}/roster?${scopeQuery}&eventType=${localEvent.event_type}`,
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
  }, [localEvent?.event_id, localEvent?.event_type, localEvent?.my_team_id, eventClubId, scopeQuery, cacheKey]);

  useEffect(() => { fetchAllTrainingData(); }, [fetchAllTrainingData]);
  useFocusRevalidate(fetchAllTrainingData);

  // «Потяни вниз — обнови»: тот же ре-фетч, что и при возврате на вкладку,
  // только руками. Жест стартует лишь когда экран прокручен в самый верх.
  usePullToRefresh(scrollContainerRef, fetchAllTrainingData);

  // Предзагрузка картинки расстановки из S3 заранее (на уровне страницы деталей, а не вкладки «Расстановка»).
  const [formationFile, setFormationFile] = useState(null);
  useEffect(() => {
    if ((!localEvent?.my_team_id && !eventClubId) || !localEvent?.event_id) { setFormationFile(null); return; }
    const owner = isClubEvent ? `club-${eventClubId}` : `team-${localEvent.my_team_id}`;
    const url = getImageUrl(`/roster-formation/${owner}-formation_training-${localEvent.event_id}.png`);
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) { if (!cancelled) setFormationFile(null); return; }
        const blob = await resp.blob();
        if (!blob || blob.type !== 'image/png') { if (!cancelled) setFormationFile(null); return; }
        if (!cancelled) setFormationFile({ blob, file: new File([blob], 'rasstanovka_trenirovka.png', { type: 'image/png' }) });
      } catch { if (!cancelled) setFormationFile(null); }
    })();
    return () => { cancelled = true; };
  }, [localEvent?.my_team_id, eventClubId, isClubEvent, localEvent?.event_id, trainingData]);

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
              teamId:          isClubEvent ? null : localEvent.my_team_id,
              clubId:          eventClubId,
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
              teamId:     isClubEvent ? null : localEvent.my_team_id,
              clubId:     eventClubId,
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
            fixed_fee: playerFee === '' ? null : Number(playerFee),
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
  // Шапка всегда выше на контекстную строку (бейдж «Клубная» + чьё событие)
  const headerHeight = HEADER_1_HEIGHT + CONTEXT_ROW_HEIGHT;

  // Название владельца события нужно только тому, кому есть что перепутать:
  // при единственной команде (клубе) подпись ничего не добавляет — контекст
  // и так один на всё приложение.
  const showOwnerName = isClubEvent
    ? (localUser?.clubs?.length || 0) > 1
    : (localUser?.teams?.length || 0) > 1;
  const arenaTz = localEvent?.arena_timezone || 'UTC';

  const eventDateObj = targetDate ? dayjs.utc(targetDate).tz(arenaTz) : null;
  const timeDisplay  = eventDateObj ? eventDateObj.format('HH:mm') : '—:——';

  const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  const dateDisplay = eventDateObj
    ? `${eventDateObj.format('D MMMM')}, ${daysMap[eventDateObj.day()]}`
    : 'Дата не назначена';

  const arenaName = localEvent?.arena_name || 'Место не указано';

  const tabIndex = TRAINING_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${(tabIndex * 100) / TRAINING_TABS.length}%`;

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide relative z-10 event-scroll-timeline"
      style={{ overflowAnchor: 'none' }}
    >

      {/* ── К1: БЕЙДЖ «КЛУБНАЯ» + ТРЕНИРОВКА + ВРЕМЯ — sticky, всегда виден ──
          Высота задана явно и растёт на высоту строки бейджа у клубного события:
          sticky-табы ниже прилипают ровно на headerHeight, поэтому обе величины
          обязаны считаться из одного места — иначе между К1 и табами будет дыра. */}
      <div className="sticky top-0 z-30 bg-surface-base select-none flex flex-col justify-center" style={{ height: uiFixed(headerHeight) }}>
        {/* Контекстная строка: чьё это событие. Название команды раньше стояло
            подписью внутри плитки с иконкой справа — в 80 пикселях оно
            обрезалось до нечитаемого и спорило с самой иконкой. Здесь у него
            вся ширина, и оно читается как надзаголовок к «ТРЕНИРОВКЕ». */}
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
              Клубная
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
              Тренировка
            </span>
          </div>
          <div className="w-[30%] flex justify-end items-center gap-2">
            <span className="font-black text-content-main leading-none" style={{ fontSize: uiFixed(30) }}>
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* ── К2: ДАТА / МЕСТО / ВЗНОС + ИКОНКА ТРЕНИРОВКИ — уезжает под К1 при скролле ── */}
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

          {/* Правая часть: иконка типа тренировки вместо джерси. Конкретный тип
              (Бросковая, Катание, Тактическая...) читается из training_type; у
              событий без типа падаем на «Общую» — см. getTrainingTypeIcon. */}
          <div className="shrink-0 w-[80px]">
            <div className="w-full aspect-square rounded-xl bg-surface-border flex items-center justify-center overflow-hidden">
              <Icon
                name={getTrainingTypeIcon(localEvent?.training_type)}
                className="w-14 h-14 text-content-muted"
              />
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
          tabs={TRAINING_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="px-4 pt-3"
          activeColor={hasTeamColor ? localEvent.team_color : null}
        />
      </div>

      {/* ── КОНТЕНТНАЯ ЗОНА ──────────────────────────────────────────────── */}
      <div className="w-full overflow-hidden px-2 min-h-screen pt-6 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div
            className="flex transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ width: TABS_TRACK_WIDTH, transform: `translateX(${translateX})` }}
          >
            {/* Вкладка: Отметки */}
            <div
              className="shrink-0 transition-opacity duration-500"
              style={{ width: TAB_PANE_WIDTH, opacity: activeTab === 'attendance' ? 1 : 0 }}
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
                      openRightPanel={openRightPanel}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            {/* Вкладка: Расстановка */}
            <div
              className="shrink-0 transition-opacity duration-500"
              style={{ width: TAB_PANE_WIDTH, opacity: activeTab === 'lines' ? 1 : 0 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    <TrainingLines
                      event={localEvent}
                      initialAttendees={trainingData.attendees}
                      initialStaffMembers={trainingData.staffMembers}
                      initialFormationFile={formationFile}
                      refreshData={fetchAllTrainingData}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            {/* Вкладка: План — упражнения из личной библиотеки тренера */}
            <div
              className="shrink-0 transition-opacity duration-500"
              style={{ width: TAB_PANE_WIDTH, opacity: activeTab === 'plan' ? 1 : 0 }}
            >
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'plan' && (
                  <FadeIn>
                    <TrainingPlan event={localEvent} />
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