import React, { useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { ContainerContent } from '../../ui/ContainerContent';
import { TextInputLP, DateMaskInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { getImageUrl, getAuthHeaders } from '../../utils/helpers';

export function CreateEventPage() {
  const { selectedTeam, user, openRightPanel } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  // Основные стейты типов событий верхнего уровня
  const [eventType, setEventType] = useState('training');
  // Две чистые хоккейные вкладки для матча: 'friendly' (Товарищеский) и 'tournament_ext' (Турнир)
  const [matchType, setMatchType] = useState('friendly');

  // Стейты общих полей формы
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [selectedArena, setSelectedArena] = useState(null); 
  const [feeAmount, setFeeAmount] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Специфичные названия для тренировок и собраний (team_training.title, team_meeting.title)
  const [eventTitle, setEventTitle] = useState('');

  // Медиа-трансляции для матчей (games.video_yt_url, games.video_vk_url)
  const [videoYtUrl, setVideoYtUrl] = useState('');
  const [videoVkUrl, setVideoVkUrl] = useState('');

  // Комплект формы нашей команды (Jersey общий для всех подтипов)
  const [myJerseyType, setMyJerseyType] = useState('dark'); 
  
  // Универсальный стейт выбранного соперника для товарищеского матча
  const [selectedOpponent, setSelectedOpponent] = useState(null); 
  
  // friendly_pwa: Стейты дедлайна вызова (games.confirm_deadline)
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  
  // Стейты сторонних кубков на базе обновленной архитектуры БД (Без дивизионов)
  const [selectedExtTournament, setSelectedExtTournament] = useState(null);
  const [selectedExtOpponent, setSelectedExtOpponent] = useState(null); 

  // tournament_ext: Специфичные поля турнирного этапа (games.stage_type, games.stage_label, games.series_number)
  const [stageType, setStageType] = useState('regular'); // 'regular' | 'playoff'
  const [selectedPlayoffOption, setSelectedPlayoffOption] = useState('1/4 финала'); // Выбранный быстрый пресет
  const [customStageLabel, setCustomStageLabel] = useState(''); // Свой вариант для стадии плей-офф
  const [regularRound, setRegularRound] = useState(''); // Номер круга для регулярки (stage_label)
  const [seriesNumber, setSeriesNumber] = useState(''); // Номер тура (regular) или матча в серии (playoff)

  const hasAccess = checkAccess('MGR_CREATE_EVENT');

  // Вытягиваем цвет из локального кэша fullDetails, обеспечивая бесперебойную подмену темы
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;

  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  // СТРОГАЯ ИНТЕРАКТИВНАЯ ВАЛИДАЦИЯ ФОРМЫ
  const isFormValid = useMemo(() => {
    if (!eventDate || !eventTime || !selectedArena) return false;

    if (eventType === 'match') {
      if (matchType === 'friendly') {
        return !!selectedOpponent;
      }
      if (matchType === 'tournament_ext') {
        return !!selectedExtTournament && !!selectedExtOpponent;
      }
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

  const eventTypeOptions = [
    { value: 'training', label: 'Тренировка' },
    { value: 'match', label: 'Матч' },
    { value: 'meeting', label: 'Собрание' }
  ];

  const matchTypeOptions = [
    { value: 'friendly', label: 'Товарищеский' },
    { value: 'tournament_ext', label: 'Турнир' }
  ];

  const stageTypeOptions = [
    { value: 'regular', label: 'Регулярка' },
    { value: 'playoff', label: 'Плей-офф' }
  ];

  const playoffPresets = ['1/8 финала', '1/4 финала', '1/2 финала', 'Финал', 'За 3-е место', 'Другое'];

  const getFeeLabel = () => {
    if (eventType === 'meeting') return 'Взнос участника';
    return 'Взнос игрока';
  };

  const handleToggleFree = (checked) => {
    setIsFree(checked);
    if (checked) {
      setFeeAmount('0');
    } else {
      setFeeAmount('');
    }
  };

  const handleFeeChange = (val) => {
    const cleanNum = val.replace(/\D/g, '');
    setFeeAmount(cleanNum);
    if (cleanNum !== '0' && isFree) setIsFree(false);
    if (cleanNum === '0' && !isFree) setIsFree(true);
  };

  // Вызов нативной боковой панели выбора арен
  const handleSelectArenaClick = () => {
    openRightPanel('arenaSelector', {
      teamId: selectedTeam?.id,
      onSelect: (arena) => setSelectedArena(arena),
      currentTeamColor: hasTeamColor ? activeBrandColor : null
    }, 'Выбор локации');
  };

  // Вызов нативной боковой панели выбора товарищеских соперников
  const handleSelectOpponentClick = () => {
    openRightPanel('opponentSelectorFriendly', {
      teamId: selectedTeam?.id,
      onSelect: (opponentData) => setSelectedOpponent(opponentData),
      currentTeamColor: hasTeamColor ? activeBrandColor : null
    }, 'Выбор соперника');
  };

  // Вызов нативной боковой панели выбора стороннего турнира
  const handleSelectExternalTournamentClick = () => {
    openRightPanel('externalTournamentSelector', {
      teamId: selectedTeam?.id,
      currentTeamColor: hasTeamColor ? activeBrandColor : null,
      onSelect: (tournament) => {
        setSelectedExtTournament(tournament);
        setSelectedExtOpponent(null); 
      }
    }, 'Выбор турнира');
  };

  // Вызов нативной боковой панели выбора соперников из связей выбранного турнира
  const handleSelectExtOpponentClick = () => {
    if (!selectedExtTournament) return;

    openRightPanel('externalOpponentSelector', {
      teamId: selectedTeam?.id,
      tournamentId: selectedExtTournament.id,
      currentTeamColor: hasTeamColor ? activeBrandColor : null,
      onSelect: (opponent) => {
        setSelectedExtOpponent(opponent);
      }
    }, 'Выбор соперника турнира');
  };

  // ИСПРАВЛЕНО: Реализована асинхронная отправка формы планирования на бэкенд
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!isFormValid || !selectedTeam?.id) return; 

    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/events/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          eventType,
          matchType,
          eventDate,
          eventTime,
          selectedArena,
          feeAmount,
          isFree,
          eventTitle,
          videoYtUrl,
          videoVkUrl,
          myJerseyType,
          selectedOpponent,
          deadlineDate,
          deadlineTime,
          selectedExtTournament,
          selectedExtOpponent,
          stageType,
          seriesNumber,
          regularRound,
          selectedPlayoffOption,
          customStageLabel
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Успешно сохранено — плавно возвращаем менеджера в календарь расписания
          navigate(-1);
        } else {
          alert(json.error || 'Не удалось запланировать событие');
        }
      } else {
        alert('Ошибка при связи с сервером');
      }
    } catch (err) {
      console.error('Ошибка создания события:', err);
      alert('Сетевая ошибка. Проверьте подключение к серверу');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="flex flex-col w-full h-full overflow-hidden relative bg-surface-border transition-colors duration-300"
      style={{ 
        ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}),
        touchAction: 'pan-y' 
      }}
    >
      {/* ФИКСИРОВАННАЯ ШАПКА С ЭКОНОМИЧНЫМ ГРАДИЕНТНЫМ ШЛЕЙФОМ */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-transparent pointer-events-none flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-surface-border from-60% to-transparent z-10" />

        <div className="px-4 pb-1 pointer-events-auto relative z-20">
          {selectedTeam && (
            <div className="bg-surface-base pt-4 px-5 pb-4 rounded-3xl flex items-center gap-4 shadow-lg border-b border-surface-level2 text-left">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm shrink-0 ml-4">
                <img src={getImageUrl(cachedDetails?.logo_url || selectedTeam?.logo_url)} alt="" className="w-full h-full object-contain p-1" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight truncate">
                  {cachedDetails?.name || selectedTeam?.name}
                </h2>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-1" style={{ color: activeBrandColor }}>
                  Создание события
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ОСНОВНОЙ КОНТЕНТНЫЙ БЛОК ФОРМЫ (Изолированный скролл) */}
      <div className="w-full h-full relative overflow-hidden">
        <form 
          onSubmit={handleSubmitForm} 
          className="w-full h-full overflow-y-auto scrollbar-hide pt-[116px] pb-16 flex flex-col gap-4"
        >
          
          {/* СЕЛЕКТОР ТИПА СОБЫТИЯ */}
          <div className="mx-4 transition-colors duration-300">
            <SegmentedControl options={eventTypeOptions} value={eventType} onChange={setEventType} />
          </div>

          {/* СЕЛЕКТОР ПОДТИПА МАТЧА */}
          {eventType === 'match' && (
            <FadeIn duration={200} delay={50} className="mx-4">
              <div className="transition-colors duration-300">
                <SegmentedControl options={matchTypeOptions} value={matchType} onChange={setMatchType} />
              </div>
            </FadeIn>
          )}

          {/* КАРТОЧКА: ОСНОВНАЯ ИНФОРМАЦИЯ */}
          <FadeIn key={`base-info-${eventType}-${matchType}`} duration={250} delay={100}>
            <ContainerContent title="Основная информация" icon="calendar" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
              <div className="flex flex-col gap-4 text-left py-1 px-3">
                
                {/* Ряд: Дата и Время */}
                <div className="grid grid-cols-2 gap-3">
                  <DateMaskInputLP label="Дата проведения" placeholder="дд.мм.гггг" value={eventDate} onChange={setEventDate} activeColor={hasTeamColor ? activeBrandColor : null} />
                  <TextInputLP label="Время начала" placeholder="00:00" value={eventTime} onChange={(val) => setEventTime(val.replace(/[^0-9:]/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                </div>

                {/* Выбор места */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Место проведения</span>
                  <button
                    type="button"
                    onClick={handleSelectArenaClick}
                    className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                  >
                    {selectedArena ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-content-main">{selectedArena.name}</span>
                        <span className="text-[11px] text-content-muted mt-0.5">
                          {selectedArena.isManual ? 'Свой вариант' : selectedArena.city} {selectedArena.location_url && '📍'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-content-subtle font-medium">Выбрать место...</span>
                    )}
                    <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                  </button>
                </div>

                {/* Компактный financial-блок */}
                <div className="grid grid-cols-2 gap-3 items-end pt-1">
                  <TextInputLP label={getFeeLabel()} placeholder="Не указан" value={feeAmount} onChange={handleFeeChange} disabled={isFree} activeColor={hasTeamColor ? activeBrandColor : null} />
                  <div className="pb-3.5 pl-1">
                    <CheckboxLP checked={isFree} onChange={handleToggleFree} label="Бесплатно" activeColor={hasTeamColor ? activeBrandColor : null} />
                  </div>
                </div>

              </div>
            </ContainerContent>
          </FadeIn>

          {eventType === 'match' && (
            <>
              {/* КАРТОЧКА: ПАРАМЕТРЫ СОПЕРНИКА */}
              <FadeIn key={`opponent-panel-${matchType}`} duration={250} delay={150}>
                <ContainerContent title="Параметры соперника" icon="users" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                  <div className="flex flex-col gap-4 text-left py-1 px-3">
                    
                    {/* СЦЕНАРИЙ А: Товарищеский матч */}
                    {matchType === 'friendly' && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Команда соперника</span>
                        <button
                          type="button"
                          onClick={handleSelectOpponentClick}
                          className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                        >
                          {selectedOpponent ? (
                            <div className="flex items-center gap-3">
                              {selectedOpponent.logo_url && (
                                <div className="w-6 h-6 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
                                  <img src={getImageUrl(selectedOpponent.logo_url)} alt="" className="w-full h-full object-contain" />
                                </div>
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-content-main">{selectedOpponent.name}</span>
                                <span className="text-[10px] text-brand uppercase font-black tracking-widest text-left mt-0.5" style={hasTeamColor ? { color: activeBrandColor } : {}}>
                                  {selectedOpponent.isPwa ? 'Вызов внутри экосистемы PWA' : 'Внешний соперник'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-content-subtle font-medium">Выбрать соперника...</span>
                          )}
                          <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                        </button>
                      </div>
                    )}

                    {/* СЦЕНАРИЙ Б: Внешний сторонний турнир */}
                    {matchType === 'tournament_ext' && (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">Сторонний турнир</span>
                          <button
                            type="button"
                            onClick={handleSelectExternalTournamentClick}
                            className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                          >
                            {selectedExtTournament ? (
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-content-main">{selectedExtTournament.name}</span>
                                <span className="text-[10px] text-green-500 font-black uppercase tracking-widest mt-0.5">
                                  Активный чемпионат
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-content-subtle font-medium">Выбрать внешний турнир...</span>
                            )}
                            <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                          </button>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">Команда соперника в турнире</span>
                          <button
                            type="button"
                            disabled={!selectedExtTournament}
                            onClick={handleSelectExtOpponentClick}
                            className={clsx(
                              "w-full p-4 bg-surface-level2 border rounded-xl text-left flex items-center justify-between outline-none transition-all",
                              !selectedExtTournament 
                                ? "opacity-35 cursor-not-allowed border-surface-border border-dashed" 
                                : "border-surface-border active:scale-[0.99] hover:border-brand/40"
                            )}
                          >
                            {selectedExtOpponent ? (
                              <div className="flex flex-col text-left">
                                <span className="text-sm font-bold text-content-main">{selectedExtOpponent.name}</span>
                                <span className="text-[10px] text-content-muted uppercase tracking-wider mt-0.5">
                                  {selectedExtOpponent.city} ({selectedExtOpponent.short_name})
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-content-subtle font-medium">
                                {selectedExtTournament ? "Выбрать соперника турнира..." : "Сначала выберите турнир..."}
                              </span>
                            )}
                            <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Комплект игровой формы */}
                    <div className="flex flex-col gap-1.5 border-t border-surface-border/50 pt-3 mt-1">
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Комплект формы нашей команды</span>
                      <SegmentedControl
                        options={[
                          { value: 'dark', label: 'Темная' },
                          { value: 'light', label: 'Светлая' }
                        ]}
                        value={myJerseyType}
                        onChange={setMyJerseyType}
                      />
                    </div>

                  </div>
                </ContainerContent>
              </FadeIn>

              {/* АВТОМАТИЧЕСКИЙ АККОРДЕОН: ДЕДЛАЙН ПОДТВЕРЖДЕНИЯ */}
              {matchType === 'friendly' && selectedOpponent?.isPwa && (
                <FadeIn key="deadline-panel" duration={250} delay={200}>
                  <ContainerContent title="Дедлайн подтверждения вызова" icon="clock" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                    <div className="grid grid-cols-2 gap-3 text-left py-1 px-3">
                      <DateMaskInputLP label="Дата дедлайна" placeholder="дд.мм.гггг" value={deadlineDate} onChange={setDeadlineDate} activeColor={hasTeamColor ? activeBrandColor : null} />
                      <TextInputLP label="Время дедлайна" placeholder="19:30" value={deadlineTime} onChange={(val) => setDeadlineTime(val.replace(/[^0-9:]/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                    </div>
                  </ContainerContent>
                </FadeIn>
              )}

              {/* ОТДЕЛЬНЫЙ АККОРДЕОН: ЭТАП И СТАДИЯ ВНЕШНЕГО ТУРНИРА */}
              {matchType === 'tournament_ext' && (
                <FadeIn key="stage-panel" duration={250} delay={250}>
                  <ContainerContent title="Этап и турнирная стадия" icon="trophy" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                    <div className="py-1 px-3 flex flex-col gap-4 text-left">
                      <div className="flex flex-col gap-1.5">
                        <SegmentedControl options={stageTypeOptions} value={stageType} onChange={setStageType} />
                      </div>

                      {stageType === 'regular' && (
                        <div className="grid grid-cols-2 gap-3 animate-fade-in">
                          <TextInputLP label="Номер круга" placeholder="Например: 2" value={regularRound} onChange={(val) => setRegularRound(val.replace(/\D/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                          <TextInputLP label="Номер тура" placeholder="Например: 14" value={seriesNumber} onChange={(val) => setSeriesNumber(val.replace(/\D/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                        </div>
                      )}

                      {stageType === 'playoff' && (
                        <div className="flex flex-col gap-3 animate-fade-in">
                          <div className="flex flex-col gap-1.5">
                            <div className="grid grid-cols-3 gap-1.5 bg-surface-level2 p-1.5 border border-surface-border rounded-xl">
                              {playoffPresets.map(preset => (
                                <button
                                  key={preset} type="button" onClick={() => setSelectedPlayoffOption(preset)}
                                  style={selectedPlayoffOption === preset ? { backgroundColor: activeBrandColor, color: '#ffffff' } : {}}
                                  className={clsx(
                                    "py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all outline-none",
                                    selectedPlayoffOption !== preset && "text-content-muted hover:text-content-main bg-surface-level1/60"
                                  )}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>

                          {selectedPlayoffOption === 'Другое' && (
                            <FadeIn duration={200}>
                              <TextInputLP label="Укажите свой вариант стадии" placeholder="Например: Утешительный финал" value={customStageLabel} onChange={setCustomStageLabel} activeColor={hasTeamColor ? activeBrandColor : null} />
                            </FadeIn>
                          )}

                          <TextInputLP label="Номер матча в серии" placeholder="Например: 3" value={seriesNumber} onChange={(val) => setSeriesNumber(val.replace(/\D/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                        </div>
                      )}
                    </div>
                  </ContainerContent>
                </FadeIn>
              )}

              {/* КАРТОЧКА: МЕДИА И ТРАНСЛЯЦИИ */}
              <FadeIn key={`media-panel-${matchType}`} duration={250} delay={300}>
                <ContainerContent title="Медиа и трансляция" icon="video" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                  <div className="flex flex-col gap-4 text-left py-1 px-3">
                    <TextInputLP label="Ссылка на YouTube трансляцию" placeholder="https://youtube.com/watch?v=..." value={videoYtUrl} onChange={setVideoYtUrl} activeColor={hasTeamColor ? activeBrandColor : null} />
                    <TextInputLP label="Ссылка на VK Видео" placeholder="https://vk.com/video-..." value={videoVkUrl} onChange={setVideoVkUrl} activeColor={hasTeamColor ? activeBrandColor : null} />
                  </div>
                </ContainerContent>
              </FadeIn>
            </>
          )}

          {/* КАРТОЧКА: ТЕМА И НАЗВАНИЕ СОБЫТИЯ В САМОМ НИЗУ */}
          {(eventType === 'training' || eventType === 'meeting') && (
            <FadeIn key={`title-panel-${eventType}`} duration={250} delay={200}>
              <ContainerContent title="Описание" icon="hint" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                <div className="py-1 px-3 text-left">
                  <TextInputLP placeholder={eventType === 'training' ? 'Например: Бросковая...' : 'Например: Разбор тактики...'} value={eventTitle} onChange={setEventTitle} activeColor={hasTeamColor ? activeBrandColor : null} />
                </div>
              </ContainerContent>
            </FadeIn>
          )}

          {/* ГЛОБАЛЬНАЯ КНОПКА ОТПРАВКИ ФОРМЫ С АВТОМАТИЧЕСКОЙ ПОДСВЕТКОЙ ВАЛИДАЦИИ */}
          <div className="mx-4 mt-4">
            <ButtonLP 
              type="submit" 
              variant="primary" 
              isLoading={isLoading} 
              disabled={!isFormValid} 
              activeColor={hasTeamColor ? activeBrandColor : null}
            >
              Создать событие
            </ButtonLP>
          </div>

        </form>
      </div>
    </div>
  );
}