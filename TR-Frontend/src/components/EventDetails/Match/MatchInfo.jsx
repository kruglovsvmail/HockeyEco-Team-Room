import React, { useState, useMemo, useRef } from 'react';
import { Icon } from '../../../ui/Icon';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';
import { ContainerContent } from '../../../ui/ContainerContent';
import clsx from 'clsx';

// Интеграция плагинов таймзон Day.js напрямую в файл для надежности вычислений
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

import { FadeIn } from '../../../ui/FadeIn';
import { useAccess } from '../../../hooks/useAccess';
import { HintPopover } from '../../../ui/HintPopover';
import { ButtonLP } from '../../../ui/Button-LP';
import { PERMISSIONS } from '../../../utils/permissions';

// Импорт вынесенных шторок из этой же папки
import { MediaBottomSheet } from './MediaBottomSheet';
import { ScheduleBottomSheet } from './ScheduleBottomSheet';
import { FinancesBottomSheet } from './FinancesBottomSheet';

export const MatchInfo = ({ event, referees = [], h2hData = null }) => {
  // Внедряем локальный стейт для динамического обновления данных без перезагрузки страницы
  const [localEvent, setLocalEvent] = useState(event);
  const [isLeagueExpanded, setIsLeagueExpanded] = useState(false);
  const isSharingRef = useRef(false);

  // Стейты открытия управляющих шторок BottomSheet
  const [isMediaOpen, setIsMediaOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isFinancesOpen, setIsFinancesOpen] = useState(false);

  // Стейты форм редактирования параметров
  const [ytUrl, setYtUrl] = useState(localEvent?.video_yt_url || '');
  const [vkUrl, setVkUrl] = useState(localEvent?.video_vk_url || '');
  
  const targetDate = localEvent?.event_date || localEvent?.game_date;
  const arenaTz = localEvent?.arena_timezone || 'UTC';

  const [gameDate, setGameDate] = useState(targetDate ? dayjs.utc(targetDate).tz(arenaTz).format('YYYY-MM-DD') : '');
  const [gameTime, setGameTime] = useState(targetDate ? dayjs.utc(targetDate).tz(arenaTz).format('HH:mm') : '');
  const [selectedArenaId, setSelectedArenaId] = useState(localEvent?.arena_id !== undefined ? localEvent.arena_id : null);
  const [selectedArenaName, setSelectedArenaName] = useState(localEvent?.arena_name || 'Арена не назначена');
  
  // Стейты для поддержки ручного ввода локаций
  const [customTimezone, setCustomTimezone] = useState(localEvent?.arena_timezone || null);
  const [locationUrl, setLocationUrl] = useState(localEvent?.location_url || '');

  const [playerFee, setPlayerFee] = useState(localEvent?.my_fee ? String(Math.round(Number(localEvent.my_fee))) : '0');
  const [homeJersey, setHomeJersey] = useState(localEvent?.home_jersey_type || localEvent?.home_jersey || 'light');
  const [awayJersey, setAwayJersey] = useState(localEvent?.away_jersey_type || localEvent?.away_jersey || 'dark');

  const [isSaving, setIsSaving] = useState(false);

  // Стабильное извлечение данных авторизации
  const localUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('teampwa_user') || localStorage.getItem('teampwa_cached_user'));
    } catch { return null; }
  }, []);

  const localTeam = useMemo(() => {
    try {
      if (!localUser || !localEvent?.my_team_id) return null;
      return localUser.teams?.find(t => String(t.id) === String(localEvent.my_team_id));
    } catch { return null; }
  }, [localUser, localEvent?.my_team_id]);

  const { user, checkAccess, selectedTeam } = useAccess(localUser, localTeam);

  // Сбор всех доступных ролей пользователя
  const userRoles = useMemo(() => {
    const roles = [];
    const globalRole = String(user?.global_role || user?.globalRole || '').toLowerCase();
    if (globalRole === 'admin') roles.push('admin');
    
    if (selectedTeam?.user_role) {
      const teamRoles = selectedTeam.user_role.split(',').map(r => r.trim().toLowerCase());
      roles.push(...teamRoles);
    }
    
    const targetTeamId = localEvent?.my_team_id || selectedTeam?.id || selectedTeam?.team_id;
    const matrix = user?.accessMatrix || user?.access_matrix || {};
    const teamAccess = matrix[targetTeamId];
    if (teamAccess?.roles) {
      roles.push(...teamAccess.roles.map(r => String(r).toLowerCase()));
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

  if (!localEvent) return null;

  const isMyTeamHome = localEvent.my_team_id === localEvent.home_team_id;

  // Видимость элементов по ролям
  const showMediaButton = hasRoleForAction('MATCH_EDIT_MEDIA');
  const showScheduleButton = hasRoleForAction('MATCH_EDIT_SCHEDULE');
  const showFinancesButton = hasRoleForAction('MATCH_EDIT_FINANCES');
  const showDeleteButton = hasRoleForAction('MATCH_DELETE');

  // Доступность по активной подписке
  const hasMediaSubscription = checkAccess('MATCH_EDIT_MEDIA', localEvent.my_team_id);
  const hasScheduleSubscription = checkAccess('MATCH_EDIT_SCHEDULE', localEvent.my_team_id);
  const hasFinancesSubscription = checkAccess('MATCH_EDIT_FINANCES', localEvent.my_team_id);
  const hasDeleteSubscription = checkAccess('MATCH_DELETE', localEvent.my_team_id);

  // Условия блокировок редактирования
  const isMediaDisabled = localEvent.game_type === 'official' || 
    (localEvent.game_type === 'friendly_pwa' && Number(localEvent.initiator_team_id) !== Number(localEvent.my_team_id));

  const isDateDisabled = localEvent.game_type === 'official' || localEvent.game_type === 'friendly_pwa';
  
  const isTimeDisabled = localEvent.game_type === 'official' || 
    (localEvent.game_type === 'friendly_pwa' && (Number(localEvent.initiator_team_id) !== Number(localEvent.my_team_id) || localEvent.status !== 'pending'));
  
  const isArenaDisabled = isTimeDisabled;
  const isJerseyDisabled = isTimeDisabled;

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!localEvent.team_color;
  const activeBrandColor = hasTeamColor ? localEvent.team_color : 'var(--color-brand)';

  const hasLiveStreams = !!(localEvent.video_yt_url || localEvent.video_vk_url);

  const mainRefs = referees.filter(r => r.role === 'main-1' || r.role === 'main-2');
  const linesmenRefs = referees.filter(r => r.role === 'linesman-1' || r.role === 'linesman-2');
  const hasRefereesAssigned = mainRefs.length > 0 || linesmenRefs.length > 0;

  const canExpandLeague = hasRefereesAssigned || hasLiveStreams;

  let tournamentValue = localEvent.league_name || 'Официальный турнир';
  let tournamentSubValue = localEvent.division_name || '';
  let tournamentIcon = 'trophy';
  let tournamentLogo = localEvent.division_logo_url || localEvent.league_logo_url;

  if (localEvent.game_type === 'friendly_pwa' || localEvent.game_type === 'friendly_ext') {
    tournamentValue = 'Товарищеский матч';
    tournamentSubValue = 'Вне рамок лиги';
    tournamentIcon = 'handshake';
    tournamentLogo = null;
  } else if (localEvent.game_type === 'tournament_ext') {
    tournamentValue = localEvent.league_name || 'Внешний турнир';
    tournamentSubValue = localEvent.division_name ? `Дивизион: ${localEvent.division_name}` : 'Внешний дивизион';
    tournamentIcon = 'trophy';
  }

  const seasonYear = targetDate ? dayjs(targetDate).format('YYYY') : dayjs().format('YYYY');
  const seasonValue = localEvent.season_name || `${seasonYear}/${dayjs(targetDate).add(1, 'year').format('YY')}`;

  // Метки этапа турнира — показываем только для official и tournament_ext
  const isLeagueMatch = localEvent.game_type === 'official' || localEvent.game_type === 'tournament_ext';
  const isPlayoff = localEvent.stage_type === 'playoff';
  const isRegular = localEvent.stage_type === 'regular';
  const isGroup = localEvent.stage_type === 'group';

  const stageTypeLabel = isPlayoff ? 'Плей-офф' : isRegular ? 'Регулярка' : isGroup ? 'Групповой этап' : null;
  // stage_label: для плей-офф это раунд ("Финал", "1/4 финала"), для регулярки — круг ("Круг 1")
  const stageLabelText = localEvent.stage_label || null;
  // series_number: для плей-офф — "Матч №N", для регулярки — "Тур №N"
  const seriesLabel = localEvent.series_number != null
    ? isPlayoff ? `Матч №${localEvent.series_number}` : `Тур №${localEvent.series_number}`
    : null;

  const getJerseyLabel = (type) => {
    if (type === 'light') return 'Светлый комплект';
    if (type === 'dark') return 'Тёмный комплект';
    return 'Не выбрана';
  };

  const currentHomeJerseyType = localEvent.home_jersey_type || localEvent.home_jersey || 'light';
  const currentAwayJerseyType = localEvent.away_jersey_type || localEvent.away_jersey || 'dark';

  const homeJerseyUrl = isMyTeamHome 
    ? (currentHomeJerseyType === 'dark' ? localEvent.my_team_jersey_dark_url : localEvent.my_team_jersey_light_url)
    : (currentHomeJerseyType === 'dark' ? localEvent.opponent_team_jersey_dark_url : localEvent.opponent_team_jersey_light_url);

  const awayJerseyUrl = !isMyTeamHome 
    ? (currentAwayJerseyType === 'dark' ? localEvent.my_team_jersey_dark_url : localEvent.my_team_jersey_light_url)
    : (currentAwayJerseyType === 'dark' ? localEvent.opponent_team_jersey_dark_url : localEvent.opponent_team_jersey_light_url);

  // H2H Расчеты тренда формы встреч
  let goalsScored = 0;
  let goalsConceded = 0;
  let lastGames = [];

  if (h2hData && h2hData.games) {
    const finishedGames = h2hData.games.filter(g => g.status === 'finished');
    finishedGames.forEach(game => {
      const isGameHome = String(game.home_team_id) === String(localEvent.my_team_id);
      goalsScored += isGameHome ? (game.home_score || 0) : (game.away_score || 0);
      goalsConceded += isGameHome ? (game.away_score || 0) : (game.home_score || 0);
    });
    lastGames = finishedGames.slice(0, 5).reverse();
  }

  const sparklinePoints = lastGames.map((game, idx) => {
    const isGameHome = String(game.home_team_id) === String(localEvent.my_team_id);
    const myScore = isGameHome ? game.home_score : game.away_score;
    const oppScore = isGameHome ? game.away_score : game.home_score;

    const x = 16 + idx * 42; 
    let y = 20; 
    let dotColor = '#9ca3af'; 

    if (myScore > oppScore) {
      y = 6; 
      dotColor = '#10b981'; 
    } else if (myScore < oppScore) {
      y = 34; 
      dotColor = '#ef4444'; 
    }
    return { x, y, dotColor };
  });

  const pathD = sparklinePoints.length > 0 ? `M ${sparklinePoints.map(p => `${p.x} ${p.y}`).join(' L ')}` : '';

  const getFormattedDateWithShortDay = (date) => {
    if (!date) return 'Дата не назначена';
    const d = dayjs(date);
    const mainDate = d.format('D MMMM YYYY');
    const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    return `${mainDate}, ${daysMap[d.day()]}`;
  };

  // =============================================================================
  // ОПТИМИЗИРОВАННЫЕ ОБРАБОТЧИКИ СОХРАНЕНИЯ (БЕЗ WINDOW.LOCATION.RELOAD)
  // =============================================================================
  const saveMediaDetails = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${localEvent.event_id || localEvent.id}/media`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_yt_url: ytUrl, video_vk_url: vkUrl, teamId: localEvent.my_team_id })
      });
      if (response.ok) {
        // Точечно меняем локальный стейт, исключая грубый релоад
        setLocalEvent(prev => ({ ...prev, video_yt_url: ytUrl, video_vk_url: vkUrl }));
        window.dispatchEvent(new CustomEvent('tr-events-updated')); // Сигнал для бесшумного обновления календаря
      } else {
        alert('Не удалось сохранить изменения ссылок');
      }
    } catch (err) {
      console.error(err);
    } finally{
      setIsSaving(false);
      setIsMediaOpen(false);
    }
  };

  const saveScheduleDetails = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${localEvent.event_id || localEvent.id}/schedule`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: gameDate, 
          time: gameTime, 
          arena_id: selectedArenaId, 
          teamId: localEvent.my_team_id,
          custom_timezone: customTimezone,
          location: selectedArenaId ? null : selectedArenaName,
          location_url: locationUrl
        })
      });
      if (response.ok) {
        // Пересчитываем ISO Timestamp на клиенте по таймзоне арены для реактивного обновления плашек даты/времени
        const updatedDateIso = dayjs.tz(`${gameDate} ${gameTime}`, customTimezone || arenaTz).utc().format();

        setLocalEvent(prev => ({
          ...prev,
          event_date: updatedDateIso,
          game_date: updatedDateIso,
          arena_id: selectedArenaId,
          arena_name: selectedArenaName,
          arena_timezone: customTimezone || prev.arena_timezone,
          custom_timezone: customTimezone,
          location_url: locationUrl
        }));
        window.dispatchEvent(new CustomEvent('tr-events-updated'));
      } else {
        alert('Ошибка при изменении расписания матча');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
      setIsScheduleOpen(false);
    }
  };

  const saveFinancesDetails = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${localEvent.event_id || localEvent.id}/finances`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_fee: playerFee ? Number(playerFee) : 0, home_jersey_type: homeJersey, away_jersey_type: awayJersey, teamId: localEvent.my_team_id })
      });
      if (response.ok) {
        setLocalEvent(prev => ({
          ...prev,
          my_fee: playerFee,
          home_jersey_type: homeJersey,
          away_jersey_type: awayJersey
        }));
        window.dispatchEvent(new CustomEvent('tr-events-updated'));
      } else {
        alert('Ошибка сохранения финансово-экипировочных параметров');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
      setIsFinancesOpen(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!window.confirm('Вы действительно хотите безвозвратно удалить этот матч из общего календаря?')) return;
    setIsSaving(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${localEvent.event_id || localEvent.id}?teamId=${localEvent.my_team_id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        alert('Матч успешно удален');
        window.location.reload(); // Здесь полный релоад законен, так как события больше нет
      } else {
        const errJson = await response.json();
        alert(errJson.error || 'Не удалось выполнить операцию удаления');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async (e, url) => {
    e.stopPropagation();
    if (isSharingRef.current) return;
    isSharingRef.current = true;
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard?.writeText(url);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    } finally {
      isSharingRef.current = false;
    }
  };

  return (
    <FadeIn>
      <div className="flex flex-col gap-3 select-none antialiased relative">
        
        {/* БЛОК 1: ТУРНИРНАЯ ИНФОРМАЦИЯ, СУДЕЙСТВО И ТРАНСЛЯЦИИ */}
        <ContainerContent>
          <div className="flex flex-col w-full text-left p-3 select-none relative transition-colors duration-200">
            {showMediaButton && (
              hasMediaSubscription ? (
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setIsMediaOpen(true); }}
                  className="absolute -top-1 right-0 text-content-subtle hover:text-brand p-1 active:scale-90 transition-all z-10 cursor-pointer"
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
              ) : (
                <div className="absolute -top-1 right-0 z-10">
                  <HintPopover status="no_subscription">
                    <button type="button" className="text-content-subtle opacity-30 p-1 cursor-pointer outline-none">
                      <Icon name="edit" className="w-4 h-4" />
                    </button>
                  </HintPopover>
                </div>
              )
            )}

            <div 
              onClick={() => { if (canExpandLeague) setIsLeagueExpanded(!isLeagueExpanded); }}
              className={clsx("w-full flex items-center justify-between gap-4 pr-6", canExpandLeague && "cursor-pointer")}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {tournamentLogo ? (
                  <img src={getImageUrl(tournamentLogo)} className="w-12 h-12 object-contain shrink-0" alt="Турнир" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-surface-level2 flex items-center justify-center shrink-0">
                    <Icon name={tournamentIcon} className="w-5 h-5" style={{ color: activeBrandColor }} />
                  </div>
                )}
                
                <div className="flex flex-col min-w-0 flex-1 gap-1">
                  <span className="text-[14px] font-bold text-content-main tracking-tight line-clamp-2 leading-tight">
                    {tournamentValue}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-content-muted">
                    <span className="truncate">{tournamentSubValue || 'Основной этап'}</span>
                    <span className="text-content-subtle text-[9px]">•</span>
                    <span className="shrink-0">{seasonValue}</span>
                  </div>
                  {isLeagueMatch && stageTypeLabel && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                        isPlayoff
                          ? "bg-amber-500/15 text-amber-600"
                          : isGroup
                          ? "bg-blue-500/15 text-blue-600"
                          : "bg-surface-level2 text-content-muted"
                      )}>
                        {stageTypeLabel}
                      </span>
                      {stageLabelText && (
                        <span className="text-[11px] font-semibold text-content-main truncate">
                          {stageLabelText}
                        </span>
                      )}
                      {seriesLabel && (
                        <>
                          <span className="text-content-subtle text-[9px]">·</span>
                          <span className="text-[11px] font-medium text-content-muted shrink-0">
                            {seriesLabel}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {canExpandLeague && (
                <Icon name="chevron" className={clsx("w-5 h-5 -mr-8 mt-6 text-content-subtle transition-transform duration-300 shrink-0", isLeagueExpanded && "rotate-180")} />
              )}
            </div>

            {canExpandLeague && (
              <div className={clsx("grid transition-all duration-300 ease-in-out overflow-hidden", isLeagueExpanded ? "grid-rows-[1fr] mt-3 pt-3 border-t border-surface-level2" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden flex flex-col gap-5">
                  {hasRefereesAssigned && (
                    <div className="grid grid-cols-2 gap-4">
                      {mainRefs.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-medium text-content-subtle uppercase tracking-wide">Главные судьи:</span>
                          <div className="flex flex-col gap-1 mt-0.5">
                            {mainRefs.map((ref, i) => (
                              <span key={ref.user_id || `main-${i}`} className="text-[12px] font-semibold text-content-main tracking-wide truncate">
                                {ref.last_name} {ref.first_name?.[0]}.
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {linesmenRefs.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-medium text-content-subtle uppercase tracking-wide">Линейные судьи:</span>
                          <div className="flex flex-col gap-1 mt-0.5">
                            {linesmenRefs.map((ref, i) => (
                              <span key={ref.user_id || `linesman-${i}`} className="text-[12px] font-semibold text-content-main tracking-wide truncate">
                                {ref.last_name} {ref.first_name?.[0]}.
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {hasLiveStreams && (
                    <div className={clsx("flex flex-col gap-3", hasRefereesAssigned && "pt-4 border-t border-surface-level2")}>
                      <span className="text-[9px] font-medium text-content-subtle uppercase tracking-wide">Трансляции:</span>
                      <div className="flex flex-col gap-2 pl-1">
                        {localEvent.video_yt_url && (
                          <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                            <a href={localEvent.video_yt_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group outline-none min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 group-hover:bg-surface-level3 transition-colors">
                                <Icon name="live_stream" className="w-4 h-4 text-content-muted group-hover:text-brand transition-colors" />
                              </div>
                              <span className="text-[12px] font-bold text-content-main truncate">Трансляция 1</span>
                            </a>
                            <button
                              type="button"
                              onClick={(e) => handleShare(e, localEvent.video_yt_url)}
                              className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 hover:bg-surface-level3 active:scale-90 transition-all cursor-pointer"
                            >
                              <Icon name="share" className="w-4 h-4 text-content-muted" />
                            </button>
                          </div>
                        )}
                        {localEvent.video_vk_url && (
                          <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                            <a href={localEvent.video_vk_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group outline-none min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 group-hover:bg-surface-level3 transition-colors">
                                <Icon name="live_stream" className="w-4 h-4 text-content-muted group-hover:text-brand transition-colors" />
                              </div>
                              <span className="text-[12px] font-bold text-content-main truncate">Трансляция 2</span>
                            </a>
                            <button
                              type="button"
                              onClick={(e) => handleShare(e, localEvent.video_vk_url)}
                              className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 hover:bg-surface-level3 active:scale-90 transition-all cursor-pointer"
                            >
                              <Icon name="share" className="w-4 h-4 text-content-muted" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ContainerContent>

        {/* БЛОК 2: ДАТА, ВРЕМЯ И МЕСТО ПРОВЕДЕНИЯ */}
        <ContainerContent>
          <div className="flex flex-col w-full text-left gap-3 p-3 relative">
            {showScheduleButton && (
              hasScheduleSubscription ? (
                <button 
                  type="button" 
                  onClick={() => setIsScheduleOpen(true)}
                  className="absolute -top-1 right-0 text-content-subtle hover:text-brand p-1 active:scale-90 transition-all z-10 cursor-pointer"
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
              ) : (
                <div className="absolute -top-1 right-0 z-10">
                  <HintPopover status="no_subscription">
                    <button type="button" className="text-content-subtle opacity-30 p-1 cursor-pointer outline-none">
                      <Icon name="edit" className="w-4 h-4" />
                    </button>
                  </HintPopover>
                </div>
              )
            )}

            <div className="flex items-center justify-between border-b border-surface-level2 pb-3 pr-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-level2 flex items-center justify-center shrink-0">
                  <Icon name="calendar" className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-content-main leading-tight">
                    {getFormattedDateWithShortDay(targetDate)}
                  </span>
                  <span className="text-[11px] text-content-muted mt-0.5">Дата проведения</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end shrink-0 pl-2">
                <span className="text-[15px] font-black tracking-tight text-content-main font-mono">
                  {targetDate ? dayjs.utc(targetDate).tz(arenaTz).format('HH:mm') : '—'}
                </span>
                <span className="text-[10px] font-medium text-content-subtle uppercase tracking-wider mt-0.5">Время</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pr-6">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-surface-level2 flex items-center justify-center shrink-0">
                  <Icon name="location_pin" className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] font-bold text-content-main truncate leading-tight">
                    {localEvent.arena_name || 'Арена не назначена'}
                  </span>
                  <span className="text-[11px] text-content-muted truncate mt-0.5">Место проведения</span>
                </div>
              </div>
              {localEvent.game_number && (
                <div className="text-right shrink-0">
                  <span className="text-[11px] font-black text-content-subtle bg-surface-level2 border border-surface-border/40 px-2.5 py-1 rounded-lg">
                    №{localEvent.game_number}
                  </span>
                </div>
              )}
            </div>
          </div>
        </ContainerContent>

        {/* БЛОК 3: ИГРОВАЯ ФОРМА СВОЯ/СОПЕРНИК И ФИНАНСЫ */}
        <ContainerContent>
          <div className="flex flex-col w-full text-left p-3 relative">
            {showFinancesButton && (
              hasFinancesSubscription ? (
                <button 
                  type="button" 
                  onClick={() => setIsFinancesOpen(true)}
                  className="absolute -top-1 right-0 text-content-subtle hover:text-brand p-1 active:scale-90 transition-all z-10 cursor-pointer"
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
              ) : (
                <div className="absolute -top-1 right-0 z-10">
                  <HintPopover status="no_subscription">
                    <button type="button" className="text-content-subtle opacity-30 p-1 cursor-pointer outline-none">
                      <Icon name="edit" className="w-4 h-4" />
                    </button>
                  </HintPopover>
                </div>
              )
            )}

            {/* Блок: форма нашей команды */}
            <div className="flex items-center justify-between gap-4 mb-4 pr-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 flex items-center justify-center shrink-0 drop-shadow-md">
                  {(isMyTeamHome ? homeJerseyUrl : awayJerseyUrl) ? (
                    <img
                      src={getImageUrl(isMyTeamHome ? homeJerseyUrl : awayJerseyUrl)}
                      alt="Наша форма"
                      className="w-full h-full object-contain drop-shadow-sm"
                    />
                  ) : (
                    <Icon name="jersey" className="w-5 h-5 text-content-subtle" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] font-semibold text-content-subtle uppercase tracking-tight mb-0.5">Наша форма</span>
                  <span className="text-[16px] font-bold text-content-main leading-tight">
                    {getJerseyLabel(isMyTeamHome ? currentHomeJerseyType : currentAwayJerseyType)}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-px bg-surface-level2 w-full border-t border-surface-level2" />

            <div className="flex items-center justify-between gap-4 mt-4 pr-1">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-level2  flex items-center justify-center shrink-0">
                  <span className="text-[22px] font-normal text-content-muted">₽</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-medium text-content-subtle uppercase tracking-wider">Стоимость участия</span>
                  <span className="text-[14px] font-medium text-content-muted">Взнос с игрока</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[18px] font-bold tracking-tight" style={{ color: activeBrandColor }}>
                  {localEvent.my_fee && Number(localEvent.my_fee) > 0 ? `${Number(localEvent.my_fee).toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
                </span>
              </div>
            </div>
          </div>
        </ContainerContent>

        {/* БЛОК 4: ИСТОРИЯ ПРОТИВОСТОЯНИЙ (HEAD-TO-HEAD) */}
        {h2hData && (
          <ContainerContent>
            <div className="flex flex-col w-full text-left p-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className=" rounded-xl py-2 flex flex-col justify-center">
                  <span className="text-[9px] font-medium text-content-subtle uppercase tracking-wider">Игр</span>
                  <span className="text-[15px] font-bold text-content-muted mt-1">{h2hData.summary?.total || 0}</span>
                </div>
                <div className=" rounded-xl py-2 flex flex-col justify-center">
                  <span className="text-[9px] font-bold text-content-subtle uppercase tracking-wider">Победы</span>
                  <span className="text-[15px] font-bold text-content-muted mt-1">{h2hData.summary?.wins || 0}</span>
                </div>
                <div className=" rounded-xl py-2 flex flex-col justify-center">
                  <span className="text-[9px] font-medium text-content-subtle uppercase tracking-wider">Ничьи</span>
                  <span className="text-[15px] font-bold text-content-muted mt-1">{h2hData.summary?.draws || 0}</span>
                </div>
                <div className=" rounded-xl py-2 flex flex-col justify-center">
                  <span className="text-[9px] font-bold text-content-subtle uppercase tracking-wider">Пораж.</span>
                  <span className="text-[15px] font-bold text-content-muted mt-1">{h2hData.summary?.losses || 0}</span>
                </div>
              </div>

              {lastGames.length > 0 ? (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex justify-between items-center px-0.5 text-[9px] font-medium text-content-subtle">
                    <span className="uppercase tracking-wider">Форма команды (последние матчи)</span>
                    <div className="flex gap-2 font-mono font-bold text-[8px] uppercase tracking-widest">
                      <span className="text-success">В</span>
                      <span className="text-content-muted">Н</span>
                      <span className="text-danger">П</span>
                    </div>
                  </div>
                  
                  <div className="w-full bg-surface-level2/20 border border-surface-border/40 rounded-xl p-2 h-14 relative flex items-center justify-center">
                    <svg viewBox="0 0 200 40" className="w-full h-full overflow-visible">
                      <line x1="0" y1="6" x2="200" y2="6" stroke="currentColor" className="text-surface-border opacity-20" strokeDasharray="3,3" />
                      <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" className="text-surface-border opacity-40" strokeDasharray="2,2" />
                      <line x1="0" y1="34" x2="200" y2="34" stroke="currentColor" className="text-surface-border opacity-20" strokeDasharray="3,3" />
                      
                      {pathD && <path d={pathD} fill="none" stroke="var(--color-content-subtle)" strokeWidth="1.25" className="opacity-30" strokeLinecap="round" strokeLinejoin="round" />}
                      
                      {sparklinePoints.map((pt, i) => (
                        <g key={`spark-dot-${i}`}>
                          <circle cx={pt.x} cy={pt.y} r="4" fill={pt.dotColor} stroke="var(--color-surface-base)" strokeWidth="1.5" />
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-[10px] font-medium uppercase tracking-wider text-content-subtle">
                  История очных встреч отсутствует
                </div>
              )}
            </div>
          </ContainerContent>
        )}

        {/* КНОПКА УДАЛЕНИЯ МАТЧА */}
        {showDeleteButton && (localEvent.game_type === 'friendly_ext' || localEvent.game_type === 'tournament_ext' || 
          (localEvent.game_type === 'friendly_pwa' && Number(localEvent.initiator_team_id) === Number(localEvent.my_team_id) && localEvent.status === 'pending')) && (
          <div className="w-full mt-4 px-1 pb-4">
            {hasDeleteSubscription ? (
              <ButtonLP 
                variant="outline" 
                disabled={isSaving}
                onClick={handleDeleteMatch}
                className="w-full py-3 text-danger normal-case font-bold text-sm transition-all rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSaving ? 'Удаление...' : 'Удалить матч'}
              </ButtonLP>
            ) : (
              <HintPopover status="no_subscription" className="w-full block">
                <div className="w-full py-3 text-center normal-case font-bold text-sm rounded-2xl opacity-40 cursor-pointer">
                  Удалить матч
                </div>
              </HintPopover>
            )}
          </div>
        )}

        {/* Шторки */}
        <MediaBottomSheet 
          isOpen={isMediaOpen} 
          onClose={() => setIsMediaOpen(false)}
          ytUrl={ytUrl}
          setYtUrl={setYtUrl}
          vkUrl={vkUrl}
          setVkUrl={setVkUrl}
          isMediaDisabled={isMediaDisabled}
          isSaving={isSaving}
          activeBrandColor={activeBrandColor}
          event={localEvent}
          onSave={saveMediaDetails}
        />

        <ScheduleBottomSheet 
          isOpen={isScheduleOpen}
          onClose={() => setIsScheduleOpen(false)}
          gameDate={gameDate}
          setGameDate={setGameDate}
          gameTime={gameTime}
          setGameTime={setGameTime}
          selectedArenaId={selectedArenaId}
          setSelectedArenaId={setSelectedArenaId}
          selectedArenaName={selectedArenaName}
          setSelectedArenaName={setSelectedArenaName}
          customTimezone={customTimezone}
          setCustomTimezone={setCustomTimezone}
          locationUrl={locationUrl}
          setLocationUrl={setLocationUrl}
          isDateDisabled={isDateDisabled}
          isTimeDisabled={isTimeDisabled}
          isArenaDisabled={isArenaDisabled}
          isSaving={isSaving}
          activeBrandColor={activeBrandColor}
          event={localEvent}
          onSave={saveScheduleDetails}
        />

        <FinancesBottomSheet 
          isOpen={isFinancesOpen}
          onClose={() => setIsFinancesOpen(false)}
          playerFee={playerFee}
          setPlayerFee={setPlayerFee}
          homeJersey={homeJersey}
          setHomeJersey={setHomeJersey}
          awayJersey={awayJersey}
          setAwayJersey={setAwayJersey}
          isJerseyDisabled={isJerseyDisabled}
          isSaving={isSaving}
          activeBrandColor={activeBrandColor}
          event={localEvent}
          onSave={saveFinancesDetails}
        />
        
      </div>
    </FadeIn>
  );
};