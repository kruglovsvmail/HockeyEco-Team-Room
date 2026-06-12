import React from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { TextInputLP } from '../../../ui/Input-LP';
import { ButtonLP } from '../../../ui/Button-LP';
import { HintPopover } from '../../../ui/HintPopover';

export const FinancesBottomSheet = ({
  isOpen,
  onClose,
  playerFee,
  setPlayerFee,
  homeJersey,
  setHomeJersey,
  awayJersey,
  setAwayJersey,
  isJerseyDisabled,
  isSaving,
  activeBrandColor,
  event,
  onSave
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5 pt-2 text-left">
        <h3 className="text-md font-black text-content-main uppercase tracking-wider">Форма и Финансы</h3>

        {/* Взнос с игрока */}
        <TextInputLP 
          label="Стоимость взноса с игрока (₽)" 
          placeholder="Введите сумму..." 
          type="number"
          value={playerFee} 
          onChange={setPlayerFee} 
          disabled={isSaving}
          activeColor={activeBrandColor}
        />

        {/* Выбор цвета джерси комплектов команд */}
        <div className="flex flex-col gap-3 relative border-t border-surface-level2/60 pt-4 mt-1">
          <div className="flex items-center gap-2">
            <h4 className={clsx("text-xs font-black text-content-main uppercase tracking-wide", isJerseyDisabled && "opacity-30")}>Комплекты игровой формы</h4>
            {isJerseyDisabled && (
              <span className="text-content-muted opacity-100">
                <HintPopover 
                  customContent={
                    <p className="text-[11px] font-semibold text-content-main text-center leading-snug">
                      {event?.game_type === 'official' 
                        ? 'Комплекты формы официального матча регламентируются лигой' 
                        : 'Форма заблокирована (матч подтвержден или вы не инициатор)'}
                    </p>
                  }
                />
              </span>
            )}
          </div>

          <div className={clsx("flex flex-col gap-3 transition-opacity duration-200", isJerseyDisabled && "opacity-30 pointer-events-none")}>
            {/* джерси Хозяев */}
            <div className="flex flex-col gap-2 mt-1">
              <span className="text-[10px] text-content-muted font-bold uppercase tracking-wider">Форма команды ХОЗЯЕВА</span>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  disabled={isJerseyDisabled || isSaving}
                  onClick={() => setHomeJersey('light')}
                  className={clsx("flex-1 py-2 rounded-xl border text-xs font-bold transition-all outline-none", homeJersey === 'light' ? "bg-surface-level3" : "bg-surface-level1 border-surface-border text-content-subtle")}
                  style={homeJersey === 'light' ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}
                >
                  Светлая
                </button>
                <button 
                  type="button" 
                  disabled={isJerseyDisabled || isSaving}
                  onClick={() => setHomeJersey('dark')}
                  className={clsx("flex-1 py-2 rounded-xl border text-xs font-bold transition-all outline-none", homeJersey === 'dark' ? "bg-surface-level3" : "bg-surface-level1 border-surface-border text-content-subtle")}
                  style={homeJersey === 'dark' ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}
                >
                  Тёмная
                </button>
              </div>
            </div>

            {/* джерси Гостей */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-[10px] text-content-muted font-bold uppercase tracking-wider">Форма команды ГОСТИ</span>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  disabled={isJerseyDisabled || isSaving}
                  onClick={() => setAwayJersey('light')}
                  className={clsx("flex-1 py-2 rounded-xl border text-xs font-bold transition-all outline-none", awayJersey === 'light' ? "bg-surface-level3" : "bg-surface-level1 border-surface-border text-content-subtle")}
                  style={awayJersey === 'light' ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}
                >
                  Светлая
                </button>
                <button 
                  type="button" 
                  disabled={isJerseyDisabled || isSaving}
                  onClick={() => setAwayJersey('dark')}
                  className={clsx("flex-1 py-2 rounded-xl border text-xs font-bold transition-all outline-none", awayJersey === 'dark' ? "bg-surface-level3" : "bg-surface-level1 border-surface-border text-content-subtle")}
                  style={awayJersey === 'dark' ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}
                >
                  Тёмная
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <ButtonLP 
            variant="primary" 
            onClick={onSave} 
            disabled={isSaving}
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
              <span>Сохранить параметры</span>
            )}
          </ButtonLP>
        </div>
      </div>
    </BottomSheet>
  );
};