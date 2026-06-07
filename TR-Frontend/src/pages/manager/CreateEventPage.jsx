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
import { TeamPageHeader, TeamPageHeaderSpacer } from '../../components/TeamPageHeader';

export function CreateEventPage() {
  const { selectedTeam, user, openRightPanel } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  const [eventType, setEventType] = useState('training');
  const [matchType, setMatchType] = useState('friendly');

  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [selectedArena, setSelectedArena] = useState(null); 
  const [feeAmount, setFeeAmount] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [eventTitle, setEventTitle] = useState('');
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

  const hasAccess = checkAccess('MGR_CREATE_EVENT');

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;

  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

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

  const getFeeLabel = () => eventType === 'meeting' ? 'Взнос участника' : 'Взнос игрока';

  const handleToggleFree = (checked) => {
    setIsFree(checked);
    setFeeAmount(checked ? '0' : '');
  };

  const handleFeeChange = (val) => {
    const cleanNum = val.replace(/\D/g, '');
    setFeeAmount(cleanNum);
    if (cleanNum !== '0' && isFree) setIsFree(false);
    if (cleanNum === '0' && !isFree) setIsFree(true);
  };

  const handleSelectArenaClick = () => {
    openRightPanel('arenaSelector', {
      teamId: selectedTeam?.id,
      onSelect: (arena) => setSelectedArena(arena),
      currentTeamColor: hasTeamColor ? activeBrandColor : null
    }, 'Выбор локации');
  };

  const handleSelectOpponentClick = () => {
    openRightPanel('opponentSelectorFriendly', {
      teamId: selectedTeam?.id,
      onSelect: (opponentData) => setSelectedOpponent(opponentData),
      currentTeamColor: hasTeamColor ? activeBrandColor : null
    }, 'Выбор соперника');
  };

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

  const handleSelectExtOpponentClick = () => {
    if (!selectedExtTournament) return;
    openRightPanel('externalOpponentSelector', {
      teamId: selectedTeam?.id,
      tournamentId: selectedExtTournament.id,
      currentTeamColor: hasTeamColor ? activeBrandColor : null,
      onSelect: (opponent) => setSelectedExtOpponent(opponent)
    }, 'Выбор соперника турнира');
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!isFormValid || !selectedTeam?.id) return; 

    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/events/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teamId: selectedTeam.id, eventType, matchType, eventDate, eventTime,
          selectedArena, feeAmount, isFree, eventTitle, videoYtUrl, videoVkUrl,
          myJerseyType, selectedOpponent, deadlineDate, deadlineTime,
          selectedExtTournament, selectedExtOpponent, stageType, seriesNumber,
          regularRound, selectedPlayoffOption, customStageLabel
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) navigate(-1);
        else alert(json.error || 'Не удалось запланировать событие');
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
      className="h-full relative overflow-hidden flex flex-col bg-surface-border transition-colors duration-300"
      style={{ 
        ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}),
        touchAction: 'pan-y' 
      }}
    >
      <TeamPageHeader 
        selectedTeam={selectedTeam}
        activeTeamDetails={cachedDetails}
        activeBrandColor={activeBrandColor}
      />

      <form 
        onSubmit={handleSubmitForm} 
        className="flex-1 overflow-y-auto scrollbar-hide pb-24 relative z-10"
      >
        <TeamPageHeaderSpacer />
        
        <div className="px-4 pt-2 flex flex-col gap-4">
          <div className="transition-colors duration-300">
            <SegmentedControl options={eventTypeOptions} value={eventType} onChange={setEventType} activeColor={hasTeamColor ? activeBrandColor : null} />
          </div>

          {eventType === 'match' && (
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
              <div className="flex flex-col gap-4 text-left py-1 px-3">
                <div className="grid grid-cols-2 gap-3">
                  <DateMaskInputLP label="Дата проведения" placeholder="дд.мм.гггг" value={eventDate} onChange={setEventDate} activeColor={hasTeamColor ? activeBrandColor : null} />
                  <TextInputLP label="Время начала" placeholder="00:00" value={eventTime} onChange={(val) => setEventTime(val.replace(/[^0-9:]/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Место проведения</span>
                  <button type="button" onClick={handleSelectArenaClick} className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40">
                    {selectedArena ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-content-main">{selectedArena.name}</span>
                        <span className="text-[11px] text-content-muted mt-0.5">{selectedArena.isManual ? 'Свой вариант' : selectedArena.city}</span>
                      </div>
                    ) : <span className="text-sm text-content-subtle font-medium">Выбрать место...</span>}
                    <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end pt-1">
                  <TextInputLP label={getFeeLabel()} placeholder="Не указан" value={feeAmount} onChange={handleFeeChange} disabled={isFree} activeColor={hasTeamColor ? activeBrandColor : null} />
                  <div className="pb-3.5 pl-1"><CheckboxLP checked={isFree} onChange={handleToggleFree} label="Бесплатно" activeColor={hasTeamColor ? activeBrandColor : null} /></div>
                </div>
              </div>
            </ContainerContent>
          </FadeIn>

          {eventType === 'match' && (
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
                                <span className="text-sm font-bold text-content-main">{selectedOpponent.name}</span>
                                <span className="text-[10px] text-brand uppercase font-black tracking-widest text-left mt-0.5" style={hasTeamColor ? { color: activeBrandColor } : {}}>{selectedOpponent.isPwa ? 'Вызов внутри экосистемы PWA' : 'Внешний соперник'}</span>
                              </div>
                            </div>
                          ) : <span className="text-sm text-content-subtle font-medium">Выбрать соперника...</span>}
                          <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                        </button>
                      </div>
                    )}

                    {matchType === 'tournament_ext' && (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">Сторонний турнир</span>
                          <button type="button" onClick={handleSelectExternalTournamentClick} className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40">
                            {selectedExtTournament ? <span className="text-sm font-bold text-content-main">{selectedExtTournament.name}</span> : <span className="text-sm text-content-subtle font-medium">Выбрать внешний турнир...</span>}
                            <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">Команда соперника в турнире</span>
                          <button type="button" disabled={!selectedExtTournament} onClick={handleSelectExtOpponentClick} className={clsx("w-full p-4 bg-surface-level2 border rounded-xl text-left flex items-center justify-between outline-none transition-all", !selectedExtTournament ? "opacity-35 cursor-not-allowed border-dashed border-surface-border" : "border-surface-border active:scale-[0.99] hover:border-brand/40")}>
                            {selectedExtOpponent ? <span className="text-sm font-bold text-content-main">{selectedExtOpponent.name}</span> : <span className="text-sm text-content-subtle font-medium">{selectedExtTournament ? "Выбрать соперника турнира..." : "Сначала выберите турнир..."}</span>}
                            <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5 border-t border-surface-border0 pt-3 mt-1">
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
                      <DateMaskInputLP label="Дата дедлайна" placeholder="дд.мм.гггг" value={deadlineDate} onChange={setDeadlineDate} activeColor={hasTeamColor ? activeBrandColor : null} />
                      <TextInputLP label="Время дедлайна" placeholder="19:30" value={deadlineTime} onChange={(val) => setDeadlineTime(val.replace(/[^0-9:]/g, ''))} activeColor={hasTeamColor ? activeBrandColor : null} />
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
                              <button key={preset} type="button" onClick={() => setSelectedPlayoffOption(preset)} style={selectedPlayoffOption === preset ? { backgroundColor: activeBrandColor, color: '#ffffff' } : {}} className={clsx("py-2 rounded-lg text-[11px] font-bold uppercase transition-all outline-none", selectedPlayoffOption !== preset && "text-content-muted bg-surface-level1/60")}>{preset}</button>
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
                <ContainerContent title="Медиа и трансляция" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                  <div className="flex flex-col gap-4 text-left py-1 px-3">
                    <TextInputLP label="Ссылка на YouTube трансляцию" value={videoYtUrl} onChange={setVideoYtUrl} activeColor={hasTeamColor ? activeBrandColor : null} />
                    <TextInputLP label="Ссылка на VK Видео" value={videoVkUrl} onChange={setVideoVkUrl} activeColor={hasTeamColor ? activeBrandColor : null} />
                  </div>
                </ContainerContent>
              </FadeIn>
            </>
          )}

          {(eventType === 'training' || eventType === 'meeting') && (
            /* ИСПРАВЛЕНО: Добавлен flex-col */
            <FadeIn key={`title-panel-${eventType}`} duration={250} delay={200} className="w-full flex flex-col">
              <ContainerContent title="Описание" collapsible={true} defaultExpanded={false} activeBrandColor={hasTeamColor ? activeBrandColor : null}>
                <div className="py-1 px-3 text-left">
                  <TextInputLP placeholder={eventType === 'training' ? 'Например: Бросковая...' : 'Например: Разбор тактики...'} value={eventTitle} onChange={setEventTitle} activeColor={hasTeamColor ? activeBrandColor : null} />
                </div>
              </ContainerContent>
            </FadeIn>
          )}

          <div className="mt-4">
            <ButtonLP type="submit" variant="primary" isLoading={isLoading} disabled={!isFormValid} activeColor={hasTeamColor ? activeBrandColor : null}>Создать событие</ButtonLP>
          </div>
        </div>
      </form>
    </FadeIn>
  );
}