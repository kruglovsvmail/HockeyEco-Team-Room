import React from 'react';
import { getImageUrl } from '../utils/helpers';
import { Icon } from '../ui/Icon';

// ЕДИНЫЙ СТАНДАРТ ОТСТУПА ДЛЯ СХОЖДЕНИЯ КОНТЕНТА ПОД ФИКСИРОВАННУЮ ШАПКУ
export function TeamPageHeaderSpacer() {
  return <div className="h-24 shrink-0 snap-start pointer-events-none" />;
}

export function TeamPageHeader({ selectedTeam, activeTeamDetails, activeBrandColor, onEditClick }) {
  if (!selectedTeam) return null;

  const logoUrl = activeTeamDetails?.logo_url || selectedTeam?.logo_url;
  const teamName = activeTeamDetails?.name || selectedTeam?.name;

  return (
    <div className="absolute top-0 left-0 right-0 z-40 bg-transparent pointer-events-none flex flex-col">
      {/* ФИКСИРОВАННАЯ ШАПКА С ЭКОНОМИЧНЫМ ГРАДИЕНТНЫМ ШЛЕЙФОМ */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-surface-border from-80% to-transparent z-10" />

      <div className="px-4 pointer-events-auto relative z-20">
        <div className="bg-surface-base p-4 rounded-3xl flex items-center gap-4 shadow-lg text-left">
          {/* ЛОГОТИП КЛУБА */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm shrink-0 ml-4">
            <img 
              src={getImageUrl(logoUrl)} 
              alt={teamName} 
              className="w-full h-full object-contain" 
            />
          </div>

          {/* ИНФОРМАЦИОННЫЙ БЛОК */}
          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight whitespace-normal break-words line-clamp-2">
              {teamName}
            </h2>
          </div>

          {/* ДИНАМИЧЕСКАЯ КНОПКА РЕДАКТИРОВАНИЯ ПРОФИЛЯ КЛУБА (ДЛЯ МЕНЕДЖЕРОВ) */}
          {onEditClick && (
            <button
              type="button"
              onClick={onEditClick}
              className="w-9 h-9 rounded-xl bg-surface-level2 flex items-center justify-center border border-surface-border transition-all active:scale-90 outline-none cursor-pointer mr-2 shrink-0 hover:border-brand/30"
            >
              <Icon name="edit" className="w-4 h-4 text-content-main" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}