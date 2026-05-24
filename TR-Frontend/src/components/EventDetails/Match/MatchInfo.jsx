import React from 'react';
import { Icon } from '../../../ui/Icon';
import { getImageUrl } from '../../../utils/helpers';
import { ContainerContent } from '../../../ui/ContainerContent';
import clsx from 'clsx';

// Импортируем наш новый унифицированный компонент производительности
import { FadeIn } from '../../../ui/FadeIn';

export const MatchInfo = ({ event }) => {
  const isFriendly = event.stage_type === 'friendly';
  const isMyTeamHome = event.my_team_id === event.home_team_id;

  // Динамическое определение флага включения цветов из localStorage (по дефолту true)
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  // --- ЛОГИКА БЛОКА "ТУРНИР" ---
  let tournamentValue = 'Официальный турнир';
  let tournamentSubValue = event.division_name || '';
  let tournamentIcon = 'trophy';
  let tournamentLogo = event.league_logo_url || event.division_logo_url;

  if (isFriendly) {
    tournamentValue = 'Товарищеский матч';
    tournamentSubValue = 'Вне рамок лиги';
    tournamentIcon = 'handshake';
    tournamentLogo = null;
  } else if (event.league_name) {
    tournamentValue = event.league_name;
  }

  // --- ЛОГИКА БЛОКА "СТАДИЯ" ---
  let stageValue = '—';
  let stageSubValue = '';

  if (isFriendly) {
    stageValue = 'ТМ';
    stageSubValue = 'Контрольный';
  } else {
    stageValue = event.stage_label || 'Регулярный сезон';
    stageSubValue = event.series_number 
      ? (event.stage_type === 'playoff' ? `Матч №${event.series_number}` : `${event.series_number}-й тур`) 
      : '';
  }

  // --- ЛОГИКА ИГРОВОЙ ФОРМЫ ---
  const homeName = isMyTeamHome ? event.my_team_name : (event.opponent_name || 'Неизвестно');
  const awayName = isMyTeamHome ? (event.opponent_name || 'Неизвестно') : event.my_team_name;

  const homeJerseyUrl = isMyTeamHome
    ? (event.home_jersey === 'dark' ? event.my_team_jersey_dark_url : event.my_team_jersey_light_url)
    : (event.home_jersey === 'dark' ? event.opponent_jersey_dark_url : event.opponent_jersey_light_url);

  const awayJerseyUrl = isMyTeamHome
    ? (event.away_jersey === 'dark' ? event.opponent_jersey_dark_url : event.opponent_jersey_light_url)
    : (event.away_jersey === 'dark' ? event.my_team_jersey_dark_url : event.my_team_jersey_light_url);

  const getJerseyLabel = (type) => {
    if (type === 'light') return 'Светлая';
    if (type === 'dark') return 'Тёмная';
    return 'Не выбрана';
  };

  // Конфигурация динамических прозрачных альфа-слоев (без использования слэшей в tailwind)
  const brandTintBg = hasTeamColor ? `${event.team_color}1a` : 'var(--color-brand-opacity)'; // 10% альфа
  const brandTintBorder = hasTeamColor ? `${event.team_color}33` : 'color-mix(in srgb, var(--color-brand) 20%, transparent)'; // 20% альфа

  return (
    <FadeIn>
      <div className="flex flex-col gap-4">
        
        {/* 1. МЕСТО ПРОВЕДЕНИЯ */}
        <ContainerContent icon="arena">
          <div className="flex items-center gap-3 py-0.5">
            <div className="w-9 h-9 rounded-xl bg-surface-level2 border border-surface-border/40 flex items-center justify-center shrink-0">
              <Icon name="location_pin" className="w-4 h-4" style={{ color: activeBrandColor }} />
            </div>
            <span className="text-xs font-bold text-content-main leading-snug">
              {event.arena_name || 'Локация проведения не назначена'}
            </span>
          </div>
        </ContainerContent>

        {/* 2. ТУРНИР И СТАДИЯ */}
        <ContainerContent>
          <div className="flex items-center justify-between gap-3 py-0.5 w-full">
            
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {tournamentLogo ? (
                <img 
                  src={getImageUrl(tournamentLogo)} 
                  className="w-10 h-10 object-contain rounded-xl bg-surface-level2 p-1 border border-surface-border/30 shrink-0" 
                  alt="Логотип турнира" 
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-surface-level2 border border-surface-border/30 flex items-center justify-center shrink-0">
                  <Icon name={tournamentIcon} className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
              )}
              
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs font-black text-content-main line-clamp-2 break-words leading-tight">
                  {tournamentValue}
                </span>
                {tournamentSubValue && (
                  <span className="text-[11px] font-semibold text-content-muted truncate mt-1 leading-none">
                    {tournamentSubValue}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 bg-surface-level2 border border-surface-border/50 px-2.5 py-1.5 rounded-xl text-right max-w-[35%] min-w-[65px]">
              <span className="text-[10px] font-black text-content-main leading-tight truncate w-full">
                {stageValue}
              </span>
              {stageSubValue && (
                <span className="text-[8px] font-black uppercase tracking-wider mt-1 leading-none truncate w-full" style={{ color: activeBrandColor }}>
                  {stageSubValue}
                </span>
              )}
            </div>

          </div>
        </ContainerContent>

        {/* 3. ИГРОВАЯ ФОРМА КОМАНД (ГЕЙМ-ЦЕНТР С КОМАНДНОЙ ПОДСВЕТКОЙ) */}
        <ContainerContent title="Игровая форма команд">
          <div className="grid grid-cols-2 gap-3 relative mt-0.5">
            
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-surface-base border border-surface-border/60 text-[9px] font-black text-content-muted uppercase tracking-widest w-6 h-6 rounded-full flex items-center justify-center shadow-sm pointer-events-none">
              vs
            </div>
            
            {/* Карточка Хозяев */}
            <div 
              style={isMyTeamHome && hasTeamColor ? {
                borderColor: `${event.team_color}80`,
                boxShadow: `0 8px 25px ${event.team_color}1f`,
                background: `linear-gradient(to bottom, ${event.team_color}0d, transparent)`
              } : {}}
              className={clsx(
                "flex flex-col items-center p-4 rounded-2xl border text-center relative overflow-hidden transition-all duration-300",
                isMyTeamHome 
                  ? (!hasTeamColor ? "bg-gradient-to-b from-brand-glow/15 to-brand-glow/5 border-brand/50 shadow-[0_8px_25px_rgba(var(--color-brand),0.12)] scale-[1.01] z-10" : "scale-[1.01] z-10") 
                  : "bg-surface-level2/40 border-surface-border/40 shadow-sm"
              )}
            >
              {isMyTeamHome && (
                <div className="absolute top-0 inset-x-0 h-1" style={{ backgroundColor: activeBrandColor }} />
              )}
              
              <span className="text-[9px] font-black text-content-muted uppercase tracking-widest block mb-1">
                Хозяева
              </span>
              <span 
                className="text-xs font-black line-clamp-1 mb-3 px-1"
                style={isMyTeamHome ? { color: activeBrandColor } : { color: 'var(--color-content-main)' }}
              >
                {homeName}
              </span>
              
              <div className="w-24 h-24 flex items-center justify-center relative my-1">
                <div className="absolute inset-0 blur-xl rounded-full pointer-events-none" style={{ backgroundColor: brandTintBg }} />
                {homeJerseyUrl ? (
                  <img 
                    src={getImageUrl(homeJerseyUrl)} 
                    alt={`Форма ${homeName}`} 
                    className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.18)] transition-transform duration-300 active:scale-110 relative z-10"
                  />
                ) : (
                  <Icon name="jersey" className="w-12 h-12 text-content-subtle opacity-30 relative z-10" />
                )}
              </div>
              
              <span 
                style={isMyTeamHome ? { backgroundColor: brandTintBg, color: activeBrandColor, borderColor: brandTintBorder } : {}}
                className={clsx(
                  "text-[10px] font-black uppercase tracking-wider mt-2 px-2 py-0.5 rounded-md border",
                  !isMyTeamHome && "bg-surface-level3 text-content-subtle border-surface-border/60",
                  (isMyTeamHome && !hasTeamColor) && "bg-brand/10 text-brand border-brand/20"
                )}
              >
                {getJerseyLabel(event.home_jersey)}
              </span>
            </div>

            {/* Карточка Гостей */}
            <div 
              style={!isMyTeamHome && hasTeamColor ? {
                borderColor: `${event.team_color}80`,
                boxShadow: `0 8px 25px ${event.team_color}1f`,
                background: `linear-gradient(to bottom, ${event.team_color}0d, transparent)`
              } : {}}
              className={clsx(
                "flex flex-col items-center p-4 rounded-2xl border text-center relative overflow-hidden transition-all duration-300",
                !isMyTeamHome 
                  ? (!hasTeamColor ? "bg-gradient-to-b from-brand-glow/15 to-brand-glow/5 border-brand/50 shadow-[0_8px_25px_rgba(var(--color-brand),0.12)] scale-[1.01] z-10" : "scale-[1.01] z-10") 
                  : "bg-surface-level2/40 border-surface-border/40 shadow-sm"
              )}
            >
              {!isMyTeamHome && (
                <div className="absolute top-0 inset-x-0 h-1" style={{ backgroundColor: activeBrandColor }} />
              )}
              
              <span className="text-[9px] font-black text-content-muted uppercase tracking-widest block mb-1">
                Гости
              </span>
              <span 
                className="text-xs font-black line-clamp-1 mb-3 px-1"
                style={!isMyTeamHome ? { color: activeBrandColor } : { color: 'var(--color-content-main)' }}
              >
                {awayName}
              </span>
              
              <div className="w-24 h-24 flex items-center justify-center relative my-1">
                <div className="absolute inset-0 blur-xl rounded-full pointer-events-none" style={{ backgroundColor: brandTintBg }} />
                {awayJerseyUrl ? (
                  <img 
                    src={getImageUrl(awayJerseyUrl)} 
                    alt={`Форма ${awayName}`} 
                    className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.18)] transition-transform duration-300 active:scale-110 relative z-10"
                  />
                ) : (
                  <Icon name="jersey" className="w-12 h-12 text-content-subtle opacity-30 relative z-10" />
                )}
              </div>
              
              <span 
                style={!isMyTeamHome ? { backgroundColor: brandTintBg, color: activeBrandColor, borderColor: brandTintBorder } : {}}
                className={clsx(
                  "text-[10px] font-black uppercase tracking-wider mt-2 px-2 py-0.5 rounded-md border",
                  isMyTeamHome && "bg-surface-level3 text-content-subtle border-surface-border/60",
                  (!isMyTeamHome && !hasTeamColor) && "bg-brand/10 text-brand border-brand/20"
                )}
              >
                {getJerseyLabel(event.away_jersey)}
              </span>
            </div>

          </div>
        </ContainerContent>
        
      </div>
    </FadeIn>
  );
};