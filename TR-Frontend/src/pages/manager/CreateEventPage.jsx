import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { ContainerContent } from '../../ui/ContainerContent';
import { TextInputLP, NativeDateInputLP, NativeTimeInputLP } from '../../ui/Input-LP';
import { FeeSettingsFields } from '../../ui/FeeSettingsFields';
import { ButtonLP } from '../../ui/Button-LP';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { ChipTabs } from '../../ui/ChipTabs';
import { RadioLP } from '../../ui/Radio-LP';
import { getImageUrl, getAuthHeaders, TRAINING_TYPES, getTeamUiColor, COMMUNITY_CATEGORIES } from '../../utils/helpers';
import { TeamPageHeader, TeamPageHeaderSpacer } from '../../components/TeamPageHeader';
import { buildEventTargets, EVENT_TARGET_STORAGE_KEY } from '../../utils/eventTargets';

// Идентификатор чипса «Без группы». Строка, а не число: рядом стоят настоящие
// id групп, и спутать их нельзя даже случайно.
const UNGROUPED_CHIP = 'ungrouped';

export function CreateEventPage() {
  const { teams, clubs, communities, selectedTeam, user, openRightPanel, registerHeaderMenu } = useOutletContext();
  const navigate = useNavigate();

  // Владелец будущего события выбирается здесь и только здесь. Глобальный контекст
  // приложения (выбранная команда) при этом не трогается: поставить событие чужому
  // составу — не повод перетаскивать туда весь интерфейс. Раньше этим занимался
  // аккордеон в сайдбаре, он же менял selectedTeam и дописывал в адрес ?scope=club.
  const targets = useMemo(() => buildEventTargets(teams, clubs, communities, user), [teams, clubs, communities, user]);

  // Выбор запоминается на устройстве: события почти всегда ставят одному и тому же
  // составу, и переспрашивать при каждом заходе незачем.
  const [targetKey, setTargetKey] = useState(() => localStorage.getItem(EVENT_TARGET_STORAGE_KEY));

  // Сохранённый ключ мог протухнуть — человек ушёл из команды или потерял права.
  // Тогда откатываемся на текущую команду приложения, если она в списке, иначе на первую.
  const activeTarget = useMemo(() => {
    if (targets.length === 0) return null;
    return targets.find(t => t.key === targetKey)
      || targets.find(t => t.type === 'team' && t.id === selectedTeam?.id)
      || targets[0];
  }, [targets, targetKey, selectedTeam?.id]);

  const handleTargetSelect = useCallback((target) => {
    setTargetKey(target.key);
    localStorage.setItem(EVENT_TARGET_STORAGE_KEY, target.key);
  }, []);

  const isClubScope = activeTarget?.type === 'club';
  const isCommunityScope = activeTarget?.type === 'community';
  const targetTeam = activeTarget?.type === 'team' ? activeTarget.entity : null;
  const targetClub = activeTarget?.type === 'club' ? activeTarget.entity : null;
  const targetCommunity = isCommunityScope ? activeTarget.entity : null;

  // Категория сообщества жёстко задаёт единственный тип события: тренировки не
  // устраивают солянок и наоборот — это же правило проверяет сервер.
  const communityCategory = COMMUNITY_CATEGORIES.find(c => c.id === targetCommunity?.category) || null;
  const isSkatingCommunity = targetCommunity?.category === 'skating';

  const { checkAccess, checkClubAccess, checkCommunityAccess } = useAccess(user, targetTeam, targetClub, targetCommunity);

  const [eventType, setEventType] = useState('training');
  const [matchType, setMatchType] = useState('friendly');

  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [selectedArena, setSelectedArena] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Параметры взноса держим одним объектом — его целиком принимает FeeSettingsFields.
  // Дедлайн снятия отметки по умолчанию 4 часа, «вратари бесплатно» включено:
  // те же значения стоят дефолтами в БД.
  const [feeSettings, setFeeSettings] = useState({
    costMode: 'per_person',
    playerFee: '',
    totalCost: '',
    isFree: false,
    goaliesFree: true,
    minParticipants: 1,
    deadlineHours: 4,
  });

  const [eventTitle, setEventTitle] = useState('');
  // Тип тренировки — выбор из закрытого списка, свободного ввода нет.
  // 'general' («Общая») стоит по умолчанию, он же дефолт колонки в БД.
  const [trainingType, setTrainingType] = useState('general');
  const [videoYtUrl, setVideoYtUrl] = useState('');
  const [videoVkUrl, setVideoVkUrl] = useState('');
  const [myJerseyType, setMyJerseyType] = useState('dark'); 
  const [selectedOpponent, setSelectedOpponent] = useState(null); 
  
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  
  const [selectedExtTournament, setSelectedExtTournament] = useState(null);
  const [selectedExtOpponent, setSelectedExtOpponent] = useState(null); 

  const [stageType, setStageType] = useState('regular'); 
  const [selectedPlayoffOption, setSelectedPlayoffOption] = useState('1/4 финала'); 
  const [customStageLabel, setCustomStageLabel] = useState(''); 
  const [regularRound, setRegularRound] = useState(''); 
  const [seriesNumber, setSeriesNumber] = useState(''); 

  // Переключились на клуб, а в форме был выбран матч — возвращаемся к тренировке:
  // матч у клуба невозможен, и блоки соперника ему не нужны.
  useEffect(() => {
    if (isClubScope && eventType === 'match') setEventType('training');
  }, [isClubScope, eventType]);

  // У сообщества тип события не выбирают — он вытекает из категории
  useEffect(() => {
    if (!isCommunityScope) return;
    const forced = isSkatingCommunity ? 'training' : 'game';
    if (eventType !== forced) setEventType(forced);
  }, [isCommunityScope, isSkatingCommunity, eventType]);

  // Лимиты состава и адресация по группам — только у событий сообщества.
  // Пустая строка означает «без лимита»: у max_goalies ноль — это отдельный
  // осмысленный случай («вратари не нужны»), и путать его с пустотой нельзя.
  const [maxSkaters, setMaxSkaters] = useState('');
  const [maxGoalies, setMaxGoalies] = useState('');
  const [includeUngrouped, setIncludeUngrouped] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [communityGroups, setCommunityGroups] = useState([]);

  // Публикация: когда участники увидят событие. Умолчание приходит из настроек
  // сообщества — обычно оно там одно и то же для всего расписания.
  const [publishMode, setPublishMode] = useState('immediate');
  const [publishHours, setPublishHours] = useState('24');

  useEffect(() => {
    if (!isCommunityScope || !targetCommunity?.id) {
      setCommunityGroups([]);
      return;
    }
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_URL}/api/communities/${targetCommunity.id}/details`, {
      headers: getAuthHeaders(),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json) return;
        setCommunityGroups(json.groups || []);

        // Форма открывается уже заполненной: у сообщества расписание однотипное,
        // и вбивать один и тот же взнос с лимитами каждый раз незачем.
        const c = json.community || {};
        const isSplit = c.default_cost_mode === 'split';
        const amount = isSplit ? c.default_total_cost : c.default_cost;
        setFeeSettings({
          costMode: c.default_cost_mode || 'per_person',
          playerFee: !isSplit && c.default_cost != null ? String(c.default_cost) : '',
          totalCost: isSplit && c.default_total_cost != null ? String(c.default_total_cost) : '',
          isFree: amount === 0,
          goaliesFree: c.default_goalies_free ?? true,
          minParticipants: c.default_cost_min_participants ?? 1,
          deadlineHours: c.default_attendance_deadline_hours ?? 4,
        });
        setMaxSkaters(c.default_max_skaters != null ? String(c.default_max_skaters) : '');
        setMaxGoalies(c.default_max_goalies != null ? String(c.default_max_goalies) : '');
        setPublishMode(c.default_publish_mode || 'immediate');
        setPublishHours(
          c.default_publish_hours_before != null ? String(c.default_publish_hours_before) : '24'
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isCommunityScope, targetCommunity?.id]);

  const hasAccess = isCommunityScope
    ? checkCommunityAccess('COMMUNITY_MANAGE_EVENTS', targetCommunity?.id)
    : isClubScope
      ? checkClubAccess('CLUB_MANAGE_EVENTS', targetClub?.id)
      : checkAccess('MGR_CREATE_EVENT');

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  // Кэш команды парсится один раз на ключ, а не на каждый рендер: в нём лежат состав,
  // ростер и штаб целиком, и синхронный JSON.parse такого объёма посреди анимации
  // перехода — это заметный фриз на телефоне.
  const teamCacheKey = targetTeam?.id ? `tr_cached_team_${targetTeam.id}` : null;
  const cachedDetails = useMemo(() => {
    if (!teamCacheKey) return null;
    try {
      const raw = localStorage.getItem(teamCacheKey);
      return raw ? JSON.parse(raw)?.fullDetails ?? null : null;
    } catch { return null; }
  }, [teamCacheKey]);

  const teamColorSource = isCommunityScope
    ? targetCommunity?.color_1
    : isClubScope
      ? targetClub?.color_1
      : (getTeamUiColor(cachedDetails) || getTeamUiColor(targetTeam));
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  // В шапке страницы — владелец события: клуб либо команда
  const headerEntity = isCommunityScope ? targetCommunity : isClubScope ? targetClub : targetTeam;
  const headerDetails = isCommunityScope ? targetCommunity : isClubScope ? targetClub : cachedDetails;

  // Кнопка «swap» справа в системной шапке — смена владельца события. Цель одна,
  // выбирать не из чего — кнопки нет. Обработчик держим в ref: он зависит от цели
  // и от цвета, и без ref перерегистрировался бы после каждого выбора.
  const openTargetSelectorRef = useRef(null);
  openTargetSelectorRef.current = () => {
    openRightPanel('eventTarget', {
      targets,
      activeKey: activeTarget?.key,
      onSelect: handleTargetSelect,
      activeBrandColor: hasTeamColor ? activeBrandColor : null,
    }, 'Для кого событие');
  };

  const canSwitchTarget = targets.length > 1;

  useEffect(() => {
    if (!registerHeaderMenu) return;
    registerHeaderMenu(
      canSwitchTarget ? () => openTargetSelectorRef.current?.() : null,
      { icon: 'swap', label: 'Для кого событие' }
    );
    return () => registerHeaderMenu(null);
  }, [canSwitchTarget, registerHeaderMenu]);

  const isFormValid = useMemo(() => {
    if (!eventDate || !eventTime || !selectedArena) return false;
    if (eventType === 'match') {
      if (matchType === 'friendly') return !!selectedOpponent;
      if (matchType === 'tournament_ext') return !!selectedExtTournament && !!selectedExtOpponent;
    }
    return true;
  }, [eventType, matchType, eventDate, eventTime, selectedArena, selectedOpponent, selectedExtTournament, selectedExtOpponent]);

  if (!hasAccess) {
    return (
      <SubscriptionStub 
        isOpen={true} 
        onClose={() => navigate(-1)} 
        title="Доступ ограничен"
        description="Для создания новых событий, необходимо оформить или продлить подписку."
      />
    );
  }

  // У клуба матчей не бывает: играет всегда конкретный состав, а клуб ставит
  // общий лёд и общие собрания.
  const eventTypeOptions = isCommunityScope
    ? [{ value: isSkatingCommunity ? 'training' : 'game', label: communityCategory?.eventOne || 'Событие' }]
    : isClubScope
      ? [
          { value: 'training', label: 'Тренировка' },
          { value: 'meeting', label: 'Собрание' }
        ]
      : [
          { value: 'training', label: 'Тренировка' },
          { value: 'match', label: 'Матч' },
          { value: 'meeting', label: 'Собрание' }
        ];

  const matchTypeOptions = [
    { value: 'friendly', label: 'Товарищеский' },
    { value: 'tournament_ext', label: 'Турнир' }
  ];

  // Раздел "Турнир" в разработке — блоки параметров временно подменяются заглушкой.
  const isTournamentExtDisabled = true;

  const stageTypeOptions = [
    { value: 'regular', label: 'Регулярка' },
    { value: 'playoff', label: 'Плей-офф' }
  ];

  const playoffPresets = ['1/8 финала', '1/4 финала', '1/2 финала', 'Финал', 'За 3-е место', 'Другое'];

  const handleSelectArenaClick = () => {
    openRightPanel('arenaSelector', {
      teamId: (isClubScope || isCommunityScope) ? null : targetTeam?.id,
      clubId: isClubScope ? targetClub?.id : null,
      communityId: isCommunityScope ? targetCommunity?.id : null,
      onSelect: (arena) => setSelectedArena(arena),
      currentTeamColor: hasTeamColor ? activeBrandColor : null
    }, 'Выбор локации');
  };

  const handleSelectOpponentClick = () => {
    openRightPanel('opponentSelectorFriendly', {
      teamId: targetTeam?.id,
      onSelect: (opponentData) => setSelectedOpponent(opponentData),
      currentTeamColor: hasTeamColor ? activeBrandColor : null
    }, 'Выбор соперника');
  };

  const handleSelectExternalTournamentClick = () => {
    openRightPanel('externalTournamentSelector', {
      teamId: targetTeam?.id,
      currentTeamColor: hasTeamColor ? activeBrandColor : null,
      onSelect: (tournament) => {
        setSelectedExtTournament(tournament);
        setSelectedExtOpponent(null); 
      }
    }, 'Выбор турнира');
  };

  const handleSelectExtOpponentClick = () => {
    if (!selectedExtTournament) return;
    openRightPanel('externalOpponentSelector', {
      teamId: targetTeam?.id,
      tournamentId: selectedExtTournament.id,
      currentTeamColor: hasTeamColor ? activeBrandColor : null,
      onSelect: (opponent) => setSelectedExtOpponent(opponent)
    }, 'Выбор соперника турнира');
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    if (isCommunityScope ? !targetCommunity?.id : isClubScope ? !targetClub?.id : !targetTeam?.id) return;

    setIsLoading(true);

    // У события сообщества своя ручка: другая таблица, лимиты состава и
    // адресация по тренировочным группам, которых нет ни у команд, ни у клубов.
    if (isCommunityScope) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/communities/${targetCommunity.id}/events`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              eventType: communityCategory?.eventType,
              title: eventTitle || communityCategory?.eventOne,
              eventDate, eventTime, selectedArena,
              training_type: trainingType,
              player_fee: feeSettings.isFree ? 0 : feeSettings.playerFee,
              cost_mode: feeSettings.costMode,
              total_cost: feeSettings.totalCost,
              goalies_free: feeSettings.goaliesFree,
              cost_min_participants: feeSettings.minParticipants,
              attendance_deadline_hours: feeSettings.deadlineHours,
              max_skaters: maxSkaters,
              max_goalies: maxGoalies,
              include_ungrouped: includeUngrouped,
              group_ids: selectedGroupIds,
              publish_mode: publishMode,
              publish_hours_before: publishMode === 'before_event'
                ? Math.max(1, Number(publishHours) || 24)
                : null,
            }),
          }
        );
        const json = await res.json();
        if (!res.ok) {
          alert(json.error || 'Не удалось запланировать событие');
          return;
        }

        // Событие сообщества видно во всех календарях его участников —
        // чистим кэш расписания целиком, как для клубного
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('tr_cached_events_')) keysToRemove.push(k);
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch {}

        window.dispatchEvent(new CustomEvent('tr-events-updated'));
        navigate('/');
        return;
      } catch (err) {
        console.error(err);
        alert('Ошибка при связи с сервером');
        return;
      } finally {
        setIsLoading(false);
      }
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/events/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teamId: isClubScope ? null : targetTeam.id,
          clubId: isClubScope ? targetClub.id : null,
          eventType, matchType, eventDate, eventTime,
          selectedArena,
          // Взнос: feeAmount/isFree остались как были (режим «с человека»),
          // остальные поля описывают долевой режим и правила показа цены.
          feeAmount: feeSettings.playerFee,
          isFree: feeSettings.isFree,
          costMode: feeSettings.costMode,
          totalCost: feeSettings.totalCost,
          goaliesFree: feeSettings.goaliesFree,
          costMinParticipants: feeSettings.minParticipants,
          attendanceDeadlineHours: feeSettings.deadlineHours,
          eventTitle, trainingType, videoYtUrl, videoVkUrl,
          myJerseyType, selectedOpponent, deadlineDate, deadlineTime,
          selectedExtTournament, selectedExtOpponent, stageType, seriesNumber,
          regularRound, selectedPlayoffOption, customStageLabel
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Инвалидируем кэш календаря, чтобы свежее событие появилось сразу.
          // Клубное событие видно во всех командных календарях клуба — поэтому
          // для него чистим кэш целиком, а не по одной команде.
          try {
            const prefix = isClubScope
              ? 'tr_cached_events_'
              : `tr_cached_events_team_${targetTeam.id}_month_`;
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith(prefix)) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
          } catch {}

          // Уведомляем уже смонтированные слушатели календаря
          window.dispatchEvent(new CustomEvent('tr-events-updated'));

          // Возвращаемся в календарь
          navigate('/');
        } else {
          alert(json.error || 'Не удалось запланировать событие');
        }
      } else {
        alert('Ошибка при связи с сервером');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <FadeIn 
      className="h-full relative overflow-hidden flex flex-col transition-colors duration-300"
      style={{ 
        ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}),
        touchAction: 'pan-y' 
      }}
    >
      <TeamPageHeader
        selectedTeam={headerEntity}
        activeTeamDetails={headerDetails}
        activeBrandColor={activeBrandColor}
      />

      <form 
        onSubmit={handleSubmitForm} 
        className="flex-1 overflow-y-auto scrollbar-hide pb-24 relative z-10"
      >
        <TeamPageHeaderSpacer />
        
        <div className="px-3 pt-2 flex flex-col gap-4">
          <div className="transition-colors duration-300">
            <SegmentedControl options={eventTypeOptions} value={eventType} onChange={setEventType} activeColor={hasTeamColor ? activeBrandColor : null} />
          </div>

          {eventType === 'match' && !isClubScope && (
            /* ИСПРАВЛЕНО: Добавлен flex-col для выравнивания ширины селектора подтипа */
            <FadeIn duration={200} delay={50} className="w-full flex flex-col">
              <div className="transition-colors duration-300">
                <SegmentedControl options={matchTypeOptions} value={matchType} onChange={setMatchType} activeColor={hasTeamColor ? activeBrandColor : null} />
              </div>
            </FadeIn>
          )}

          {/* ИСПРАВЛЕНО: Каждая карточка теперь принудительно расправляется на w-full flex flex-col */}
          <FadeIn key={`base-info-${eventType}-${matchType}`} duration={250} delay={100} className="w-full flex flex-col">
            <ContainerContent title="Основная информация" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
              <div className="flex flex-col gap-8 text-left py-1 px-3">
                <div className="grid grid-cols-2 gap-12">
                  <NativeDateInputLP label="Дата" value={eventDate} onChange={setEventDate} activeColor={hasTeamColor ? activeBrandColor : null} />
                  <NativeTimeInputLP label="Время" value={eventTime} onChange={setEventTime} activeColor={hasTeamColor ? activeBrandColor : null} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Место проведения</span>
                  <button type="button" onClick={handleSelectArenaClick} className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40">
                    {selectedArena ? (
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-content-main">{selectedArena.name}</span>
                        <span className="text-[10px] text-content-muted mt-0.5">{selectedArena.isManual ? 'Свой вариант' : selectedArena.city}</span>
                      </div>
                    ) : <span className="text-[14px] text-content-subtle font-medium">Выбрать место...</span>}
                    <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                  </button>
                </div>
                <div className="pt-1">
                  <FeeSettingsFields
                    value={feeSettings}
                    onChange={setFeeSettings}
                    isMeeting={eventType === 'meeting'}
                    activeColor={hasTeamColor ? activeBrandColor : null}
                  />
                </div>
              </div>
            </ContainerContent>
          </FadeIn>

          {/* Лимиты состава и адресация по группам — только у событий сообщества.
              Когда лимит набран, следующие отметившиеся уходят в резервную очередь. */}
          {isCommunityScope && (
            <FadeIn key="community-limits" duration={250} delay={150} className="w-full flex flex-col">
              <ContainerContent title="Состав и резерв" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                <div className="flex flex-col gap-6 text-left py-1 px-3">
                  <div className="grid grid-cols-2 gap-8">
                    <TextInputLP
                      label="Полевых, максимум"
                      value={maxSkaters}
                      onChange={setMaxSkaters}
                      type="number"
                      placeholder="Без лимита"
                      activeColor={hasTeamColor ? activeBrandColor : null}
                    />
                    <TextInputLP
                      label="Вратарей, максимум"
                      value={maxGoalies}
                      onChange={setMaxGoalies}
                      type="number"
                      placeholder="Без лимита"
                      activeColor={hasTeamColor ? activeBrandColor : null}
                    />
                  </div>

                  <p className="text-[11px] text-content-subtle leading-relaxed">
                    Пусто — лимита нет. При наборе лимита следующие отметившиеся уходят
                    в резерв: когда место освободится, первому в очереди придёт
                    предложение с таймером. Ноль вратарей означает, что вратари на это
                    событие не набираются вовсе.
                  </p>

                  {isSkatingCommunity && (
                    <div className="flex flex-col gap-3">
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">
                        Для каких групп
                      </span>

                      {communityGroups.length > 0 ? (
                        /* «Без группы» — такой же чипс, как остальные: новички
                           без группы это ровно такой же адресат тренировки,
                           и отдельный чекбокс рядом со списком только путал. */
                        <ChipTabs
                          wrap
                          tabs={[
                            { id: UNGROUPED_CHIP, label: 'Без группы' },
                            ...communityGroups.map(g => ({ id: g.id, label: g.name })),
                          ]}
                          activeTab={[
                            ...(includeUngrouped ? [UNGROUPED_CHIP] : []),
                            ...selectedGroupIds,
                          ]}
                          onChange={(id) => {
                            if (id === UNGROUPED_CHIP) {
                              setIncludeUngrouped(prev => !prev);
                              return;
                            }
                            setSelectedGroupIds(prev => (
                              prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                            ));
                          }}
                          activeColor={hasTeamColor ? activeBrandColor : null}
                        />
                      ) : (
                        <p className="text-[11px] text-content-subtle leading-relaxed">
                          Групп пока нет — событие будет открыто всем участникам.
                          Группы создаются на странице сообщества.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Публикация. Лёд бронируют заранее, а запись открывают, когда
                      решили, кого собирать: до публикации событие видит только штаб. */}
                  <div className="flex flex-col gap-3 pt-2 border-t border-surface-border">
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">
                      Когда участники увидят событие
                    </span>

                    <RadioLP
                      name="community-publish"
                      checked={publishMode === 'immediate'}
                      onChange={() => setPublishMode('immediate')}
                      label="Сразу после создания"
                      activeColor={hasTeamColor ? activeBrandColor : null}
                    />

                    <RadioLP
                      name="community-publish"
                      checked={publishMode === 'manual'}
                      onChange={() => setPublishMode('manual')}
                      label="Вручную"
                      description="По кнопке «Опубликовать» на карточке события"
                      activeColor={hasTeamColor ? activeBrandColor : null}
                    />
                    <RadioLP
                      name="community-publish"
                      checked={publishMode === 'before_event'}
                      onChange={() => setPublishMode('before_event')}
                      label="За сколько часов до начала"
                      activeColor={hasTeamColor ? activeBrandColor : null}
                    />
                    {publishMode === 'before_event' && (
                      <TextInputLP
                        label="За сколько часов до начала"
                        value={publishHours}
                        onChange={setPublishHours}
                        type="number"
                        activeColor={hasTeamColor ? activeBrandColor : null}
                      />
                    )}
                  </div>
                </div>
              </ContainerContent>
            </FadeIn>
          )}

          {eventType === 'match' && matchType === 'tournament_ext' && isTournamentExtDisabled && (
            <FadeIn key="tournament-ext-stub" duration={250} delay={150} className="w-full flex flex-col">
              <div className="w-full bg-surface-level2 border border-dashed border-surface-border rounded-2xl p-6 text-center">
                <Icon name="trophy" className="w-8 h-8 mx-auto mb-3 text-content-subtle opacity-60" />
                <p className="text-[14px] font-bold text-content-main mb-1">Раздел в разработке</p>
                <p className="text-[14px] text-content-muted leading-relaxed">
                  Внешние турниры команд находятся в разработке и появятся позже.
                </p>
              </div>
            </FadeIn>
          )}

          {eventType === 'match' && !(matchType === 'tournament_ext' && isTournamentExtDisabled) && (
            <>
              {/* ИСПРАВЛЕНО: Добавлен flex-col */}
              <FadeIn key={`opponent-panel-${matchType}`} duration={250} delay={150} className="w-full flex flex-col">
                <ContainerContent title="Параметры соперника" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                  <div className="flex flex-col gap-4 text-left py-1 px-3">
                    {matchType === 'friendly' && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Команда соперника</span>
                        <button type="button" onClick={handleSelectOpponentClick} className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40">
                          {selectedOpponent ? (
                            <div className="flex items-center gap-3">
                              {selectedOpponent.logo_url && <div className="w-6 h-6 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0"><img src={getImageUrl(selectedOpponent.logo_url)} alt="" className="w-full h-full object-contain" /></div>}
                              <div className="flex flex-col">
                                <span className="text-[14px] font-bold text-content-main">{selectedOpponent.name}</span>
                                <span className="text-[10px] text-brand uppercase font-black tracking-widest text-left mt-0.5" style={hasTeamColor ? { color: activeBrandColor } : {}}>{selectedOpponent.isPwa ? 'Вызов внутри приложения' : 'Внешний соперник'}</span>
                              </div>
                            </div>
                          ) : <span className="text-[14px] text-content-subtle font-medium">Выбрать соперника...</span>}
                          <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                        </button>
                      </div>
                    )}

                    {matchType === 'tournament_ext' && (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[14px] font-bold text-content-muted uppercase tracking-wider pl-1">Сторонний турнир</span>
                          <button type="button" onClick={handleSelectExternalTournamentClick} className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40">
                            {selectedExtTournament ? <span className="text-[14px] font-bold text-content-main">{selectedExtTournament.name}</span> : <span className="text-[14px] text-content-subtle font-medium">Выбрать внешний турнир...</span>}
                            <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[14px] font-bold text-content-muted uppercase tracking-wider pl-1">Команда соперника в турнире</span>
                          <button type="button" disabled={!selectedExtTournament} onClick={handleSelectExtOpponentClick} className={clsx("w-full p-4 bg-surface-level2 border rounded-xl text-left flex items-center justify-between outline-none transition-all", !selectedExtTournament ? "opacity-35 cursor-not-allowed border-dashed border-surface-border" : "border-surface-border active:scale-[0.99] hover:border-brand/40")}>
                            {selectedExtOpponent ? <span className="text-[14px] font-bold text-content-main">{selectedExtOpponent.name}</span> : <span className="text-[14px] text-content-subtle font-medium">{selectedExtTournament ? "Выбрать соперника турнира..." : "Сначала выберите турнир..."}</span>}
                            <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5 pt-3 mt-1">
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Комплект формы нашей команды</span>
                      <SegmentedControl options={[{ value: 'dark', label: 'Темная' }, { value: 'light', label: 'Светлая' }]} value={myJerseyType} onChange={setMyJerseyType} activeColor={hasTeamColor ? activeBrandColor : null} />
                    </div>
                  </div>
                </ContainerContent>
              </FadeIn>

              {matchType === 'friendly' && selectedOpponent?.isPwa && (
                /* ИСПРАВЛЕНО: Добавлен flex-col */
                <FadeIn key="deadline-panel" duration={250} delay={200} className="w-full flex flex-col">
                  <ContainerContent title="Дедлайн подтверждения вызова" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                    <div className="grid grid-cols-2 gap-3 text-left py-1 px-3">
                      <NativeDateInputLP label="Дата дедлайна" value={deadlineDate} onChange={setDeadlineDate} activeColor={hasTeamColor ? activeBrandColor : null} />
                      <NativeTimeInputLP label="Время дедлайна" value={deadlineTime} onChange={setDeadlineTime} activeColor={hasTeamColor ? activeBrandColor : null} />
                    </div>
                  </ContainerContent>
                </FadeIn>
              )}

              {matchType === 'tournament_ext' && (
                /* ИСПРАВЛЕНО: Добавлен flex-col */
                <FadeIn key="stage-panel" duration={250} delay={250} className="w-full flex flex-col">
                  <ContainerContent title="Этап и турнирная стадия" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                    <div className="py-1 px-3 flex flex-col gap-4 text-left">
                      <SegmentedControl options={stageTypeOptions} value={stageType} onChange={setStageType} activeColor={hasTeamColor ? activeBrandColor : null} />
                      {stageType === 'regular' && (
                        <div className="grid grid-cols-2 gap-3 animate-fade-in">
                          <TextInputLP label="Номер круга" value={regularRound} onChange={(val) => setRegularRound(val.replace(/\D/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                          <TextInputLP label="Номер тура" value={seriesNumber} onChange={(val) => setSeriesNumber(val.replace(/\D/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                        </div>
                      )}
                      {stageType === 'playoff' && (
                        <div className="flex flex-col gap-3 animate-fade-in">
                          <div className="grid grid-cols-3 gap-1.5 bg-surface-level2 p-1.5 border border-surface-border rounded-xl">
                            {playoffPresets.map(preset => (
                              <button key={preset} type="button" onClick={() => setSelectedPlayoffOption(preset)} style={selectedPlayoffOption === preset ? { backgroundColor: activeBrandColor, color: '#ffffff' } : {}} className={clsx("py-2 rounded-lg text-[10px] font-bold uppercase transition-all outline-none", selectedPlayoffOption !== preset && "text-content-muted bg-surface-level1/60")}>{preset}</button>
                            ))}
                          </div>
                          {selectedPlayoffOption === 'Другое' && <TextInputLP label="Укажите свой вариант стадии" value={customStageLabel} onChange={setCustomStageLabel} activeColor={hasTeamColor ? activeBrandColor : null} />}
                          <TextInputLP label="Номер матча в серии" value={seriesNumber} onChange={(val) => setSeriesNumber(val.replace(/\D/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                        </div>
                      )}
                    </div>
                  </ContainerContent>
                </FadeIn>
              )}

              {/* ИСПРАВЛЕНО: Добавлен flex-col */}
              <FadeIn key={`media-panel-${matchType}`} duration={250} delay={300} className="w-full flex flex-col">
                <ContainerContent title="Ссылки на трансляции" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                  <div className="flex flex-col gap-4 text-left py-1 px-3">
                    <TextInputLP label="Ссылка 1" value={videoYtUrl} onChange={setVideoYtUrl} activeColor={hasTeamColor ? activeBrandColor : null} />
                    <TextInputLP label="Ссылка 2" value={videoVkUrl} onChange={setVideoVkUrl} activeColor={hasTeamColor ? activeBrandColor : null} />
                  </div>
                </ContainerContent>
              </FadeIn>
            </>
          )}

          {/* У тренировки вместо свободного описания — выбор типа из закрытого списка.
              Блок раскрыт сразу: с дефолтом «Общая» и свёрнутой панелью тип никто бы
              не менял, и вся статистика по типам состояла бы из одних «Общих». */}
          {eventType === 'training' && (
            <FadeIn key="training-type-panel" duration={250} delay={200} className="w-full flex flex-col">
              <ContainerContent title="Тип тренировки" collapsible={true} defaultExpanded={true} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                <div className="py-2 px-3 text-left">
                  <ChipTabs
                    wrap
                    tabs={TRAINING_TYPES}
                    activeTab={trainingType}
                    onChange={setTrainingType}
                    activeColor={hasTeamColor ? activeBrandColor : null}
                  />
                </div>
              </ContainerContent>
            </FadeIn>
          )}

          {/* У собрания описание остаётся свободным текстом: закрытым списком
              «Разбор тактики» или «Итоги сезона» не опишешь. */}
          {eventType === 'meeting' && (
            /* ИСПРАВЛЕНО: Добавлен flex-col */
            <FadeIn key="title-panel-meeting" duration={250} delay={200} className="w-full flex flex-col">
              <ContainerContent title="Описание" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                <div className="py-1 px-3 text-left">
                  <TextInputLP placeholder="Например: Разбор тактики..." value={eventTitle} onChange={setEventTitle} activeColor={hasTeamColor ? activeBrandColor : null} />
                </div>
              </ContainerContent>
            </FadeIn>
          )}

          <div className="mt-4">
  <ButtonLP 
    type="submit" 
    variant="primary" 
    isLoading={isLoading} 
    disabled={!isFormValid || isLoading} /* Жестко блокируем кнопку, пока идет отправка первого запроса */
    activeColor={hasTeamColor ? activeBrandColor : null}
  >
    Создать событие
  </ButtonLP>
</div>
        </div>
      </form>
    </FadeIn>
  );
}