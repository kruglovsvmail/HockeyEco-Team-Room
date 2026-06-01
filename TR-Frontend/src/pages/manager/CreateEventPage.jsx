import React, { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { ContainerContent } from '../../ui/ContainerContent';
import { TextInputLP, DateMaskInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { getImageUrl } from '../../utils/helpers';

export function CreateEventPage() {
  const { selectedTeam, user, openRightPanel } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  // Основные стейты типов событий
  const [eventType, setEventType] = useState('training');
  const [matchType, setMatchType] = useState('friendly_pwa');

  // Стейты общих полей формы
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [selectedArena, setSelectedArena] = useState(null); // Объект выбранного места
  const [feeAmount, setFeeAmount] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Стейты параметров формы для матчей (Jersey общий для всех подтипов)
  const [myJerseyType, setMyJerseyType] = useState('dark'); 
  
  // friendly_pwa: Выбранная команда из экосистемы платформы
  const [selectedOpponentTeam, setSelectedOpponentTeam] = useState(null); 
  
  // friendly_ext & tournament_ext: Выбранный внешний соперник из справочника external_opponents
  const [selectedExtOpponent, setSelectedExtOpponent] = useState(null); 
  
  // tournament_ext: Выбранные кастомные турнир и дивизион команды
  const [selectedExtTournament, setSelectedExtTournament] = useState(null);
  const [selectedExtDivision, setSelectedExtDivision] = useState(null);

  const hasAccess = checkAccess('MGR_CREATE_EVENT');

  // Определение кастомного брендового цвета команды
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

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
    { value: 'friendly_pwa', label: 'Внутри PWA' },
    { value: 'friendly_ext', label: 'Внешний ХК' },
    { value: 'tournament_ext', label: 'Турнир' }
  ];

  // Динамический лейбл для финансового поля
  const getFeeLabel = () => {
    if (eventType === 'meeting') return 'Взнос участника';
    return 'Взнос игрока';
  };

  // Переключатель чекбокса "Бесплатно"
  const handleToggleFree = (checked) => {
    setIsFree(checked);
    if (checked) {
      setFeeAmount('0');
    } else {
      setFeeAmount('');
    }
  };

  // Обработчик ручного ввода стоимости
  const handleFeeChange = (val) => {
    const cleanNum = val.replace(/\D/g, '');
    setFeeAmount(cleanNum);
    if (cleanNum !== '0' && isFree) {
      setIsFree(false);
    }
    if (cleanNum === '0' && !isFree) {
      setIsFree(true);
    }
  };

  // Панель выбора локации
  const handleSelectArenaClick = () => {
    openRightPanel('arenaSelector', {
      onSelect: (arena) => setSelectedArena(arena)
    }, 'Выбор локации');
  };

  // Панель выбора команды из лиги (friendly_pwa)
  const handleSelectOpponentPwaClick = () => {
    openRightPanel('teamSelectorPwa', {
      currentTeamId: selectedTeam?.id,
      onSelect: (team) => setSelectedOpponentTeam(team)
    }, 'Выбор соперника');
  };

  // Панель выбора внешнего соперника из справочника (friendly_ext / tournament_ext)
  const handleSelectExtOpponentClick = () => {
    openRightPanel('externalOpponentSelector', {
      teamId: selectedTeam?.id,
      onSelect: (opponent) => setSelectedExtOpponent(opponent)
    }, 'Выбор соперника');
  };

  // Панель сквозного выбора кастомного Внешнего турнира + Дивизиона (tournament_ext)
  const handleSelectExternalTournamentClick = () => {
    openRightPanel('externalTournamentSelector', {
      teamId: selectedTeam?.id,
      onSelect: (tournament, division) => {
        setSelectedExtTournament(tournament);
        setSelectedExtDivision(division);
      }
    }, 'Выбор турнира');
  };

  // Сборщик отправки формы на сервер
  const handleSubmitForm = (e) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Интеграция с MgrEventController.js на следующем шаге
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <form onSubmit={handleSubmitForm} className="flex flex-col h-full overflow-y-auto scrollbar-hide transition-colors duration-300 pb-16">
      
      {/* 1. ЭТАЛОННАЯ ШАПКА ПРОФИЛЯ КОМАНДЫ */}
      {selectedTeam && (
        <div className="bg-surface-base pt-4 px-5 pb-4 mb-2 mx-4 rounded-3xl flex items-center gap-4 shadow-lg shrink-0 border-b border-surface-level2 snap-start text-left mt-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm shrink-0 ml-4">
            <img 
              src={getImageUrl(selectedTeam?.logo_url)} 
              alt={selectedTeam?.name} 
              className="w-full h-full object-contain p-1" 
            />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight truncate">
              {selectedTeam?.name}
            </h2>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-1" style={{ color: activeBrandColor }}>
              Создание события
            </span>
          </div>
        </div>
      )}

      {/* Контентный блок планирования */}
      <div className="flex-1 flex flex-col gap-4 pt-4">
        
        {/* 2. СЕЛЕКТОР ТИПА СОБЫТИЯ */}
        <div className="mx-4 transition-colors duration-300">
          <SegmentedControl 
            options={eventTypeOptions} 
            value={eventType} 
            onChange={setEventType} 
          />
        </div>

        {/* 3. СЕЛЕКТОР ПОДТИПА МАТЧА */}
        {eventType === 'match' && (
          <FadeIn duration={250} className="mx-4">
            <div className="transition-colors duration-300">
              <SegmentedControl 
                options={matchTypeOptions} 
                value={matchType} 
                onChange={setMatchType} 
              />
            </div>
          </FadeIn>
        )}

        {/* 4. КАРТОЧКА: ОСНОВНАЯ ИНФОРМАЦИЯ */}
        <ContainerContent title="Основная информация" icon="calendar">
          <div className="flex flex-col gap-4 text-left py-1">
            
            <div className="grid grid-cols-2 gap-3">
              <DateMaskInputLP 
                label="Дата проведения"
                placeholder="дд.мм.гггг"
                value={eventDate}
                onChange={setEventDate}
                activeColor={hasTeamColor ? activeBrandColor : null}
              />
              <TextInputLP 
                label="Время начала"
                placeholder="00:00"
                value={eventTime}
                onChange={(val) => setEventTime(val.replace(/[^0-9:]/g, ''))}
                activeColor={hasTeamColor ? activeBrandColor : null}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">
                Место проведения
              </span>
              <button
                type="button"
                onClick={handleSelectArenaClick}
                className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
              >
                {selectedArena ? (
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-content-main">{selectedArena.name}</span>
                    <span className="text-[11px] text-content-muted mt-0.5">{selectedArena.city}</span>
                  </div>
                ) : (
                  <span className="text-sm text-content-subtle font-medium">Выбрать место...</span>
                )}
                <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end pt-1">
              <TextInputLP 
                label={getFeeLabel()}
                placeholder="Не указан"
                value={feeAmount}
                onChange={handleFeeChange}
                disabled={isFree}
                activeColor={hasTeamColor ? activeBrandColor : null}
              />
              <div className="pb-3.5 pl-1">
                <CheckboxLP 
                  checked={isFree}
                  onChange={handleToggleFree}
                  label="Бесплатно"
                  activeColor={hasTeamColor ? activeBrandColor : null}
                />
              </div>
            </div>

          </div>
        </ContainerContent>

        {/* 5. ДИНАМИЧЕСКАЯ КАРТОЧКА: ПАРАМЕТРЫ СОПЕРНИКА (Для матчей) */}
        {eventType === 'match' && (
          <FadeIn duration={200}>
            <ContainerContent title="Параметры соперника" icon="users">
              <div className="flex flex-col gap-4 text-left py-1">
                
                {/* КАТЕГОРИЯ 1: Внутри PWA */}
                {matchType === 'friendly_pwa' && (
                  <FadeIn duration={200} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">
                        Команда соперника (внутри платформы)
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectOpponentPwaClick}
                        className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                      >
                        {selectedOpponentTeam ? (
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
                              <img src={getImageUrl(selectedOpponentTeam.logo_url)} alt="" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-sm font-bold text-content-main">{selectedOpponentTeam.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-content-subtle font-medium">Выбрать команду из лиги...</span>
                        )}
                        <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                      </button>
                    </div>
                  </FadeIn>
                )}

                {/* КАТЕГОРИЯ 2: Внешний ХК из локального справочника */}
                {matchType === 'friendly_ext' && (
                  <FadeIn duration={200} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">
                        Карточка внешнего соперника
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectExtOpponentClick}
                        className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                      >
                        {selectedExtOpponent ? (
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
                              <img src={getImageUrl(selectedExtOpponent.logo_url)} alt="" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-sm font-bold text-content-main">{selectedExtOpponent.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-content-subtle font-medium">Выбрать из справочника соперников...</span>
                        )}
                        <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                      </button>
                    </div>
                  </FadeIn>
                )}

                {/* КАТЕГОРИЯ 3: Сторонний турнир (Каскадный выбор контекста) */}
                {matchType === 'tournament_ext' && (
                  <FadeIn duration={200} className="flex flex-col gap-4">
                    
                    {/* Выбор кастомного турнира + дивизиона */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">
                        Сторонний турнир и дивизион
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectExternalTournamentClick}
                        className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                      >
                        {selectedExtTournament && selectedExtDivision ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-content-main">{selectedExtTournament.name}</span>
                            <span className="text-[11px] text-content-muted mt-0.5">Дивизион: {selectedExtDivision.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-content-subtle font-medium">Выбрать внешний турнир...</span>
                        )}
                        <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                      </button>
                    </div>

                    {/* Выбор внешнего соперника */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">
                        Команда соперника в турнире
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectExtOpponentClick}
                        className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] hover:border-brand/40"
                      >
                        {selectedExtOpponent ? (
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
                              <img src={getImageUrl(selectedExtOpponent.logo_url)} alt="" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-sm font-bold text-content-main">{selectedExtOpponent.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-content-subtle font-medium">Выбрать соперника турнира...</span>
                        )}
                        <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                      </button>
                    </div>

                  </FadeIn>
                )}

                {/* Сквозной выбор комплекта игровой формы для любого типа матча */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <span className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1">
                    Комплект формы нашей команды
                  </span>
                  <SegmentedControl
                    options={[
                      { value: 'dark', label: 'Темная комплектация' },
                      { value: 'light', label: 'Светлая комплектация' }
                    ]}
                    value={myJerseyType}
                    onChange={setMyJerseyType}
                  />
                </div>

              </div>
            </ContainerContent>
          </FadeIn>
        )}

        {/* 6. ГЛОБАЛЬНАЯ КНОПКА ОТПРАВКИ ФОРМЫ */}
        <div className="mx-4 mt-4">
          <ButtonLP
            type="submit"
            variant="primary"
            isLoading={isLoading}
            activeColor={hasTeamColor ? activeBrandColor : null}
          >
            Создать событие
          </ButtonLP>
        </div>

      </div>
    </form>
  );
}