import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { TextInputLP, NativeDateInputLP, NativeTimeInputLP } from '../../../ui/Input-LP';
import { ButtonLP } from '../../../ui/Button-LP';
import { HintPopover } from '../../../ui/HintPopover';
import { ArenaSelector } from '../../Manager/ArenaSelector';
import { Icon } from '../../../ui/Icon';
import { FadeIn } from '../../../ui/FadeIn';

export const ScheduleBottomSheet = ({
  isOpen,
  onClose,
  gameDate,
  setGameDate,
  gameTime,
  setGameTime,
  selectedArenaId,
  setSelectedArenaId,
  selectedArenaName,
  setSelectedArenaName,
  customTimezone,
  setCustomTimezone,
  locationUrl,        // Новое поле для ручной ссылки геопозиции
  setLocationUrl,     // Сеттер для ручной ссылки геопозиции
  isDateDisabled,
  isTimeDisabled,
  isArenaDisabled,
  isSaving,
  activeBrandColor,
  event,
  onSave
}) => {
  // Состояние экрана: 'main' (основные инпуты) или 'arena' (чистый поиск площадок)
  const [currentScreen, setCurrentScreen] = useState('main');

  // Сбрасываем экран обратно на главный при закрытии или открытии шторки
  useEffect(() => {
    if (!isOpen) {
      setCurrentScreen('main');
    }
  }, [isOpen]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5 pt-2 text-left min-h-[380px]">
        
        {/* ДИНАМИЧЕСКИЙ ЗАГОЛОВОК ШТОРКИ */}
        <div className="flex items-center gap-3 shrink-0">
          {currentScreen === 'arena' && (
            <button
              type="button"
              onClick={() => setCurrentScreen('main')}
              className="p-1 -ml-1 text-content-muted hover:text-brand active:scale-90 transition-all outline-none cursor-pointer"
            >
              <Icon name="chevron" className="w-6 h-6 rotate-90" />
            </button>
          )}
          <h3 className="text-md font-black text-content-main uppercase tracking-wider">
            {currentScreen === 'main' ? 'Параметры расписания' : 'Выбор локации'}
          </h3>
        </div>

        {/* ЭКРАН 1: РАСПИСАНИЕ (ДАТА, ВРЕМЯ, ПРЕВЬЮ АРЕНЫ) */}
        {currentScreen === 'main' && (
          <FadeIn duration={200} className="flex flex-col gap-5 flex-1">
            
            <div className="flex flex-col">
              {/* Грид 1: Только строки заголовков */}
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="flex items-center gap-2 min-h-[24px]">
                  <span className={clsx("text-[10px] text-content-muted uppercase tracking-widest font-bold", isDateDisabled && "opacity-40")}>
                    Дата
                  </span>
                  {isDateDisabled && (
                    <span className="text-content-muted opacity-100">
                      <HintPopover 
                        customContent={
                          <p className="text-[11px] font-semibold text-content-main text-center leading-snug">
                            {event?.game_type === 'official' 
                              ? 'Запрещено менять дату официального матча лиги' 
                              : 'В PWA-матчах дата фиксирована, можно менять только время'}
                          </p>
                        }
                      />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 min-h-[24px]">
                  <span className={clsx("text-[10px] text-content-muted uppercase tracking-widest font-bold", isTimeDisabled && "opacity-40")}>
                    Время
                  </span>
                  {isTimeDisabled && (
                    <span className="text-content-muted opacity-100">
                      <HintPopover 
                        customContent={
                          <p className="text-[11px] font-semibold text-content-main text-center leading-snug">
                            {event?.game_type === 'official' 
                              ? 'Запрещено менять время официального матча' 
                              : Number(event?.initiator_team_id) !== Number(event?.my_team_id)
                                ? 'Только инициатор может менять время начала'
                                : 'Нельзя изменить время после подтверждения матча соперником'}
                          </p>
                        }
                      />
                    </span>
                  )}
                </div>
              </div>

              {/* Грид 2: Инпуты в одну линию из одной библиотеки */}
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className={clsx("transition-opacity duration-200", isDateDisabled && "opacity-40 pointer-events-none")}>
                  <NativeDateInputLP
                    value={gameDate}
                    onChange={setGameDate}
                    disabled={isDateDisabled || isSaving}
                    activeColor={activeBrandColor}
                  />
                </div>

                <div className={clsx("transition-opacity duration-200", isTimeDisabled && "opacity-40 pointer-events-none")}>
                  <NativeTimeInputLP
                    value={gameTime}
                    onChange={setGameTime}
                    disabled={isTimeDisabled || isSaving}
                    activeColor={activeBrandColor}
                  />
                </div>
              </div>
            </div>

            {/* Выбор ледовой арены */}
            <div className="flex flex-col gap-1.5 relative">
              <div className="flex items-center gap-2">
                <span className={clsx("text-[10px] text-content-muted uppercase tracking-widest font-bold", isArenaDisabled && "opacity-40")}>
                  Локация матча
                </span>
                {isArenaDisabled && (
                  <span className="text-content-muted opacity-100">
                    <HintPopover 
                      customContent={
                        <p className="text-[11px] font-semibold text-content-main text-center leading-snug">
                          {event?.game_type === 'official' 
                            ? 'Локация официального матча регламентируется лигой' 
                            : 'Локация заблокирована (матч подтвержден или вы не инициатор)'}
                        </p>
                      }
                    />
                  </span>
                )}
              </div>
              
              <div className={clsx("transition-opacity duration-200", isArenaDisabled && "opacity-40 pointer-events-none")}>
                {isArenaDisabled ? (
                  <TextInputLP value={selectedArenaName} disabled={true} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentScreen('arena')}
                    className="w-full p-4 bg-surface-level2 border border-surface-border hover:border-brand/40 rounded-2xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-sm font-bold text-content-main truncate">
                        {selectedArenaName}
                      </span>
                    </div>
                    <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* Кнопка сохранения параметров */}
            <div className="mt-auto pt-2">
              <ButtonLP 
                variant="primary" 
                onClick={onSave} 
                disabled={isSaving || (isDateDisabled && isTimeDisabled && isArenaDisabled)}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <span>Сохранить расписание</span>
                )}
              </ButtonLP>
            </div>
          </FadeIn>
        )}

        {/* ЭКРАН 2: ПОЛНОРАЗМЕРНЫЙ СЕЛЕКТОР АРЕНЫ С ПОДДЕРЖКОЙ ГЕОПОЗИЦИИ */}
        {currentScreen === 'arena' && (
          <FadeIn duration={200} className="flex-1 flex flex-col min-h-[300px] -mx-6 ">
            <ArenaSelector 
              data={{
                teamId: event?.my_team_id,
                currentTeamColor: activeBrandColor,
                selectedArenaId: selectedArenaId,
                selectedArenaName: selectedArenaName,
                locationUrl: locationUrl, // Прокидываем сохраненный URL дальше в инпут
                onSelect: (arena) => {
                  setSelectedArenaId(arena.id);
                  setSelectedArenaName(arena.name);
                  if (setCustomTimezone) {
                    setCustomTimezone(arena.custom_timezone || null);
                  }
                  if (setLocationUrl) {
                    setLocationUrl(arena.location_url || null);
                  }
                  setCurrentScreen('main');
                }
              }}
            />
          </FadeIn>
        )}

      </div>
    </BottomSheet>
  );
};