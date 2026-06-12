import React from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { TextInputLP } from '../../../ui/Input-LP';
import { ButtonLP } from '../../../ui/Button-LP';
import { HintPopover } from '../../../ui/HintPopover';
import { Icon } from '../../../ui/Icon';

export const MediaBottomSheet = ({
  isOpen,
  onClose,
  ytUrl,
  setYtUrl,
  vkUrl,
  setVkUrl,
  isMediaDisabled,
  isSaving,
  activeBrandColor,
  onSave,
  event
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5 pt-2 text-left">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-black text-content-main uppercase tracking-wider">Ссылки на трансляции</h3>
          {isMediaDisabled && (
            <HintPopover 
              customContent={
                <p className="text-[11px] font-semibold text-content-main text-center leading-snug">
                  {event?.game_type === 'official' 
                    ? 'В официальных матчах ссылки регламентируются лигой' 
                    : 'Медиа-ссылки PWA-встречи может менять только команда-инициатор'}
                </p>
              }
            />
          )}
        </div>

        <div className={clsx("flex flex-col gap-5 transition-opacity duration-200", isMediaDisabled && "opacity-30 pointer-events-none")}>
          <TextInputLP 
            label="Ссылка 1" 
            placeholder="https://youtube.com/live/..." 
            value={ytUrl} 
            onChange={setYtUrl} 
            disabled={isMediaDisabled || isSaving}
            activeColor={activeBrandColor}
          />

          <TextInputLP 
            label="Ссылка 2" 
            placeholder="https://vk.com/video..." 
            value={vkUrl} 
            onChange={setVkUrl} 
            disabled={isMediaDisabled || isSaving}
            activeColor={activeBrandColor}
          />

          <div className="mt-2">
            <ButtonLP 
              variant="primary" 
              onClick={onSave} 
              disabled={isMediaDisabled || isSaving}
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
                <span>Сохранить media</span>
              )}
            </ButtonLP>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};