import React, { useState, useEffect, useRef, useMemo, Suspense, lazy, useCallback } from 'react';
import { getImageUrl, getAuthHeaders, getContrastTextColor, uiFixed } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { ChipTabs } from '../../../ui/ChipTabs';
import { useFocusRevalidate } from '../../../hooks/useFocusRevalidate';
import { HintPopover } from '../../../ui/HintPopover';
import { useAccess } from '../../../hooks/useAccess';
import { PERMISSIONS } from '../../../utils/permissions';

import { MatchInfo } from './MatchInfo';

import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import clsx from 'clsx';

dayjs.extend(utc);
dayjs.extend(timezone);

const MatchAttendance = lazy(() => import('./MatchAttendance').then(module => ({ default: module.MatchAttendance })));
const MatchLines = lazy(() => import('./MatchLines').then(module => ({ default: module.MatchLines })));
const MatchProtocol = lazy(() => import('./MatchProtocol').then(module => ({ default: module.MatchProtocol })));
const MatchStats = lazy(() => import('./MatchStats').then(module => ({ default: module.MatchStats })));

const MATCH_TABS = [
  { id: 'info',       label: 'О матче' },
  { id: 'attendance', label: 'Отметки' },
  { id: 'lines',      label: 'Состав' },
  { id: 'stats',      label: 'Статистика' },
  { id: 'events',     label: 'Ход матча' },
];

// Высота контейнера 1 (text-[30px]=30) = 30px
const HEADER_1_HEIGHT = 50;

export const EventDetailsMatch = ({ event, user: userProp, selectedTeam: selectedTeamProp, openRightPanel }) => {
  const [activeTab, setActiveTab]   = useState('info');
  const [localEvent, setLocalEvent] = useState(event);

  useEffect(() => { setLocalEvent(event); }, [event?.event_id]);

  const isColorsEnabled  = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor     = isColorsEnabled && !!localEvent?.team_color;
  const activeBrandColor = hasTeamColor ? localEvent.team_color : 'var(--color-brand)';

  const cacheKey = `tr_cached_match_${localEvent?.event_id}_team_${localEvent?.my_team_id || 'no_team'}`;

  const [matchData, setMatchData] = useState({
    attendees: [], draftLines: [], isPublished: false,
    teamRoster: [], staffMembers: [], referees: [], h2hData: null,
  });
  const [loading, setLoading] = useState(true);

  const scrollContainerRef = useRef(null);
  const rafRef             = useRef(null);

  // ── Права доступа ─────────────────────────────────────────────────────────
  const localUser = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem('teampwa_user') ||
        localStorage.getItem('teampwa_cached_user')
      );
    } catch { return null; }
  }, []);

  const localTeam = useMemo(() => {
    try {
      if (!localUser || !localEvent?.my_team_id) return null;
      return localUser.teams?.find(t => String(t.id) === String(localEvent.my_team_id));
    } catch { return null; }
  }, [localUser, localEvent?.my_team_id]);

  const { user, checkAccess, selectedTeam } = useAccess(localUser, localTeam);

  const userRoles = useMemo(() => {
    const roles = [];
    const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
    if (globalRole === 'admin') roles.push('admin');
    if (selectedTeam?.user_role) {
      selectedTeam.user_role.split(',').map(r => r.trim().toLowerCase()).forEach(r => roles.push(r));
    }
    const matrix = user?.accessMatrix || user?.access_matrix || {};
    const teamAccess = matrix[localEvent?.my_team_id];
    if (teamAccess?.roles) {
      teamAccess.roles.map(r => String(r).toLowerCase()).forEach(r => roles.push(r));
    }
    if (roles.length === 0) roles.push('player');
    return [...new Set(roles)];
  }, [user, selectedTeam, localEvent?.my_team_id]);

  const hasRoleForAction = (action) => {
    if (userRoles.includes('admin')) return true;
    const perm = PERMISSIONS[action];
    if (!perm) return false;
    return userRoles.some(r => perm.allowedRoles.map(ar => ar.toLowerCase()).includes(r));
  };

  // Локальное обновление события при изменениях через панель редактирования
  useEffect(() => {
    const onUpdate = () => {
      const key = `tr_event_match_${localEvent?.event_id}`;
      const cached = sessionStorage.getItem(key);
      if (cached) setLocalEvent(JSON.parse(cached));
    };
    window.addEventListener('tr-events-updated', onUpdate);
    return () => window.removeEventListener('tr-events-updated', onUpdate);
  }, [localEvent?.event_id]);

  const targetDate = localEvent?.event_date || localEvent?.game_date;
  const arenaTz    = localEvent?.arena_timezone || 'UTC';

  useEffect(() => {
    if (!localEvent?.event_id) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setMatchData(JSON.parse(cached)); setLoading(false); }
    else {
      setMatchData({ attendees: [], draftLines: [], isPublished: false, teamRoster: [], staffMembers: [], referees: [], h2hData: null });
      setLoading(true);
    }
  }, [localEvent?.event_id, cacheKey]);

  const fetchAllMatchData = useCallback(async () => {
    if (!localEvent?.event_id || !localEvent?.my_team_id) return;
    if (!navigator.onLine) { setLoading(false); return; }
    try {
      const apiUrl  = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const [attRes, linesRes, rosterRes, staffRes, h2hRes] = await Promise.all([
        fetch(`${apiUrl}/api/matches/${localEvent.event_id}/attendance?eventType=${localEvent.event_type}&teamId=${localEvent.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/matches/${localEvent.event_id}/lines?teamId=${localEvent.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/matches/${localEvent.event_id}/available-roster?teamId=${localEvent.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/matches/${localEvent.event_id}/staff?teamId=${localEvent.my_team_id}`, { headers }),
        fetch(`${apiUrl}/api/matches/${localEvent.event_id}/h2h?teamId=${localEvent.my_team_id}`, { headers }),
      ]);
      const [attData, linesData, rosterData, staffData, h2hData] = await Promise.all([
        attRes.json(), linesRes.json(), rosterRes.json(), staffRes.json(), h2hRes.json(),
      ]);
      const freshData = {
        attendees:    attData.success    ? attData.attendees          : [],
        draftLines:   linesData.success  ? (linesData.lines   || []) : [],
        isPublished:  linesData.success  ? !!linesData.isPublished   : false,
        teamRoster:   rosterData.success ? (rosterData.roster || []) : [],
        staffMembers: rosterData.success ? (rosterData.staff  || []) : [],
        referees:     staffData.success  ? staffData.staff            : [],
        h2hData:      h2hData.success    ? h2hData.h2h                : null,
      };
      setMatchData(freshData);
      localStorage.setItem(cacheKey, JSON.stringify(freshData));
    } catch (err) { console.error('Ошибка загрузки данных матча:', err); }
    finally { setLoading(false); }
  }, [localEvent?.event_id, localEvent?.event_type, localEvent?.my_team_id, cacheKey]);

  useEffect(() => { fetchAllMatchData(); }, [fetchAllMatchData]);
  useFocusRevalidate(fetchAllMatchData);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Предзагрузка картинки состава из S3 заранее (на уровне страницы деталей, а не вкладки «Состав»).
  // Готовый файл прокидывается в MatchLines, чтобы шеринг был мгновенным без проверки при клике на вкладку.
  const [formationFile, setFormationFile] = useState(null);
  useEffect(() => {
    if (!localEvent?.my_team_id || !localEvent?.event_id) { setFormationFile(null); return; }
    const url = getImageUrl(`/roster-formation/team-${localEvent.my_team_id}-formation_game-${localEvent.event_id}.png`);
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) { if (!cancelled) setFormationFile(null); return; }
        const blob = await resp.blob();
        if (!blob || blob.type !== 'image/png') { if (!cancelled) setFormationFile(null); return; }
        if (!cancelled) setFormationFile({ blob, file: new File([blob], 'sostav.png', { type: 'image/png' }) });
      } catch { if (!cancelled) setFormationFile(null); }
    })();
    return () => { cancelled = true; };
  }, [localEvent?.my_team_id, localEvent?.event_id, matchData]);

  if (!localEvent) return null;

  // ── Вычисления для шапки ──────────────────────────────────────────────────
  const isMyTeamHome = localEvent.my_team_id === localEvent.home_team_id;

  const currentHomeJerseyType = localEvent.home_jersey_type || localEvent.home_jersey || 'light';
  const currentAwayJerseyType = localEvent.away_jersey_type || localEvent.away_jersey || 'dark';
  const myJerseyType  = isMyTeamHome ? currentHomeJerseyType : currentAwayJerseyType;
  const myJerseyLabel = myJerseyType === 'dark' ? 'Тёмные' : 'Светлые';
  const myJerseyUrl   = isMyTeamHome
    ? (currentHomeJerseyType === 'dark' ? localEvent.my_team_jersey_dark_url : localEvent.my_team_jersey_light_url)
    : (currentAwayJerseyType === 'dark' ? localEvent.my_team_jersey_dark_url : localEvent.my_team_jersey_light_url);

  const eventDateObj = targetDate ? dayjs.utc(targetDate).tz(arenaTz) : null;
  const timeDisplay  = eventDateObj ? eventDateObj.format('HH:mm') : '—:——';

  const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  const dateDisplay = eventDateObj
    ? `${eventDateObj.format('D MMMM')}, ${daysMap[eventDateObj.day()]}`
    : 'Дата не назначена';
  const arenaDisplay = localEvent.arena_name || 'Арена не назначена';

  const homeName = isMyTeamHome ? localEvent.my_team_name : (localEvent.opponent_name || 'Неизвестно');
  const awayName = isMyTeamHome ? (localEvent.opponent_name || 'Неизвестно') : localEvent.my_team_name;
  const homeLogo = isMyTeamHome ? localEvent.my_team_logo_url : localEvent.opponent_logo_url;
  const awayLogo = isMyTeamHome ? localEvent.opponent_logo_url : localEvent.my_team_logo_url;

  const tabIndex   = MATCH_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${tabIndex * 20}%`;

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide relative z-10 event-scroll-timeline"
      style={{ overflowAnchor: 'none' }}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          АРХИТЕКТУРА ШАПКИ:
          
          Один скролл-контейнер. Внутри — четыре блока подряд:
          
          1. К1 (МАТЧ + время) — sticky top-0, z-30, с фоном.
             Всегда прибит к верху. Контейнер 2 уезжает ПОД него.
          
          2. К2 (дата/арена/взнос/джерси) — обычный блок, z-10.
             При скролле уходит вверх за экран, скрываясь ПОД К1
             (К1 имеет фон и выше по z-index → К2 прячется за ним).
          
          3. Табы — sticky top-[50px] (ровно под К1), z-20, с фоном.
             Стикаются к нижнему краю К1, когда К2 полностью ушёл.
          
          4. Контент — обычный блок, скроллится нативно.
          
          Весь скролл нативный. Никакого JS-перехвата.
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── К1: МАТЧ + ВРЕМЯ + КАРАНДАШИК — sticky, всегда виден ──
          Высота жёстко зафиксирована uiFixed(HEADER_1_HEIGHT) — иначе при масштабе
          шапка растёт, а sticky-табы снизу залипают на старом отступе top:50px,
          образуя видимую дыру между К1 и табами. */}
      <div className="sticky top-0 z-30 bg-surface-base select-none flex items-center" style={{ height: uiFixed(HEADER_1_HEIGHT) }}>
        <div className="flex items-center w-full px-5">
          <div className="w-[70%] pr-2">
            <span
              className="font-black uppercase leading-none"
              style={{ color: activeBrandColor, fontSize: uiFixed(30) }}
            >
              МАТЧ
            </span>
          </div>
          <div className="w-[30%] flex justify-end items-center gap-2">
            <span className="font-black text-content-main leading-none" style={{ fontSize: uiFixed(30) }}>
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* ── К2: ДАТА / АРЕНА / ВЗНОС + ДЖЕРСИ — уезжает под К1 при скролле ── */}
      <div className="relative z-10 bg-surface-base">
        <div
          className="event-fade-on-scroll flex items-stretch gap-3 w-full px-5 pt-3 pb-2"
          style={{ '--fade-distance': '110px' }}
        >

          {/* Левая часть: дата, арена, взнос */}
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <Icon name="calendar" className="w-4 h-4 shrink-0 text-content-main" />
              <span className="text-[18px] font-normal text-content-main leading-none truncate">{dateDisplay}</span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <Icon name="location_pin" className="w-4 h-4 shrink-0 text-content-main" />
              {(localEvent.arena_city || localEvent.arena_address) ? (
                <HintPopover
                  className="min-w-0 max-w-full"
                  customContent={
                    <div className="flex flex-col gap-1 text-center">
                      <span className="text-[13px] font-bold text-content-main leading-snug">{arenaDisplay}</span>
                      {localEvent.arena_city && (
                        <span className="text-[12px] font-semibold text-content-muted leading-snug">г. {localEvent.arena_city}</span>
                      )}
                      {localEvent.arena_address && (
                        <span className="text-[11px] font-medium text-content-muted leading-snug">{localEvent.arena_address}</span>
                      )}
                    </div>
                  }
                >
                  <span className="text-[18px] font-normal text-content-main leading-none truncate block underline decoration-dotted decoration-content-subtle underline-offset-4">{arenaDisplay}</span>
                </HintPopover>
              ) : (!localEvent.arena_id && localEvent.location_url) ? (
                <a
                  href={localEvent.location_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[18px] font-normal text-content-main leading-none truncate block underline decoration-dotted decoration-content-subtle underline-offset-4">{arenaDisplay}</span>
                </a>
              ) : (
                <span className="text-[18px] font-normal text-content-main leading-none truncate">{arenaDisplay}</span>
              )}
            </div>
            <div className="flex items-center gap-4 min-w-0 mt-4">
              <Icon
                name="currency"
                className="w-4 h-4 shrink-0"
                style={{
                  color: localEvent.my_fee === null || localEvent.my_fee === undefined
                    ? 'var(--color-content-subtle)' : activeBrandColor
                }}
              />
              {localEvent.my_fee !== null && localEvent.my_fee !== undefined && Number(localEvent.my_fee) !== 0 && (
                <span className="text-[18px] font-black leading-none truncate" style={{ color: activeBrandColor }}>
                  {Number(localEvent.my_fee).toLocaleString('ru-RU')} ₽
                </span>
              )}
              {localEvent.my_fee !== null && localEvent.my_fee !== undefined && Number(localEvent.my_fee) === 0 && (
                <span className="text-[18px] font-medium leading-none truncate" style={{ color: activeBrandColor }}>
                  Бесплатно
                </span>
              )}
              {(localEvent.my_fee === null || localEvent.my_fee === undefined) && (
                <span className="text-[14px] font-medium leading-none truncate text-content-subtle">
                  Взнос не назначен
                </span>
              )}
            </div>
          </div>

          {/* Правая часть: блок джерси */}
          <div className="shrink-0 w-[80px]">
            <div className="w-full aspect-square rounded-xl border border-surface-border flex flex-col items-center justify-center gap-1.5 overflow-hidden">
              {myJerseyUrl
                ? <img src={getImageUrl(myJerseyUrl)} alt="Форма" className="w-12 h-12 object-contain drop-shadow-sm" />
                : <Icon name="jersey" className="w-7 h-7 text-content-subtle" />
              }
              <span className="text-[10px] text-content-main font-bold uppercase tracking-widest leading-none text-center">{myJerseyLabel}</span>
            </div>
          </div>

        </div>
      </div>

      {/* ── ТАБЫ — sticky, прилипают ровно под К1 ── */}
      <div
        className="sticky z-20 bg-surface-base shadow-lg pb-1"
        style={{ top: uiFixed(HEADER_1_HEIGHT) }}
      >
        <ChipTabs
          tabs={MATCH_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="px-4 pt-3"
          activeColor={hasTeamColor ? localEvent.team_color : null}
        />
      </div>

      {/* ══════════════════════════════════════════════
          КОНТЕНТНАЯ ЗОНА
      ══════════════════════════════════════════════ */}
      <div className="w-full overflow-hidden px-2 min-h-screen pt-6 pb-[30vh]">
        {loading ? (
          <PageLoader />
        ) : (
          <div
            className="flex w-[500%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ transform: `translateX(${translateX})` }}
          >
            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'info' ? 1 : 0 }}>
              <FadeIn>
                <MatchInfo
                  event={localEvent}
                  setLocalEvent={setLocalEvent}
                  referees={matchData.referees}
                  h2hData={matchData.h2hData}
                  homeName={homeName}
                  awayName={awayName}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                  activeBrandColor={activeBrandColor}
                  hasTeamColor={hasTeamColor}
                />
              </FadeIn>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'attendance' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'attendance' && (
                  <FadeIn>
                    <MatchAttendance
                      event={localEvent}
                      initialAttendees={matchData.attendees}
                      initialTeamRoster={matchData.teamRoster}
                      initialStaffMembers={matchData.staffMembers}
                      initialDraftLines={matchData.draftLines}
                      refreshData={fetchAllMatchData}
                      openRightPanel={openRightPanel}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'lines' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'lines' && (
                  <FadeIn>
                    <MatchLines
                      event={localEvent}
                      initialAttendees={matchData.attendees}
                      initialDraftLines={matchData.draftLines}
                      initialIsPublished={matchData.isPublished}
                      initialStaffMembers={matchData.staffMembers}
                      initialFormationFile={formationFile}
                      refreshData={fetchAllMatchData}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'stats' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'stats' && (
                  <FadeIn>
                    <MatchStats event={localEvent} openRightPanel={openRightPanel} />
                  </FadeIn>
                )}
              </Suspense>
            </div>

            <div className="w-1/5 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'events' ? 1 : 0 }}>
              <Suspense fallback={<PageLoader />}>
                {activeTab === 'events' && (
                  <FadeIn>
                    <MatchProtocol
                      event={localEvent}
                      user={userProp}
                      selectedTeam={selectedTeamProp}
                      openRightPanel={openRightPanel}
                    />
                  </FadeIn>
                )}
              </Suspense>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};