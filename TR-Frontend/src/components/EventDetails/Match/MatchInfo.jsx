import React from 'react';
import { Icon } from '../../../ui/Icon';
import { getImageUrl } from '../../../utils/helpers';
import clsx from 'clsx';

// Вспомогательный компонент воздушной карточки для характеристик матча
const DetailCard = ({ icon, label, value, subValue, logoUrl, className = '' }) => (
  <div className={`flex flex-col p-3.5 bg-surface-level1 rounded-2xl border border-surface-level2 shadow-md relative overflow-hidden ${className}`}>
    {/* Если есть иконка и нет логотипа лиги/дивизиона */}
    {icon && !logoUrl && (
      <Icon 
        name={icon} 
        className="absolute -bottom-2 -right-2 w-14 h-14 text-brand opacity-[0.06] rotate-[-10deg] pointer-events-none" 
      />
    )}
    {/* Если пришел логотип (например, лиги) — показываем его на фоне вместо иконки */}
    {logoUrl && (
      <img 
        src={getImageUrl(logoUrl)} 
        alt="Лого" 
        className="absolute -bottom-2 -right-2 w-14 h-14 opacity-[0.15] rotate-[-10deg] pointer-events-none object-contain" 
      />
    )}
    
    <span className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-1.5 relative z-10">
      {label}
    </span>
    
    {/* Значение (value) */}
    <span className="text-sm font-bold text-content-main leading-tight relative z-10 flex items-center gap-2">
      {value || '—'}
    </span>
    
    {/* Подпись (subValue) */}
    {subValue && (
      <span className="text-[11px] font-semibold text-content-subtle mt-0.5 leading-tight relative z-10">
        {subValue}
      </span>
    )}
  </div>
);

export const MatchInfo = ({ event }) => {
  const isFriendly = event.stage_type === 'friendly';
  const isMyTeamHome = event.my_team_id === event.home_team_id;

  // --- ЛОГИКА БЛОКА "ТУРНИР" ---
  let tournamentValue = 'Официальный турнир';
  let tournamentSubValue = event.division_name || '';
  let tournamentIcon = 'trophy';
  let tournamentLogo = event.league_logo_url || event.division_logo_url; // Логотип лиги или дивизиона

  if (isFriendly) {
    tournamentValue = 'Товарищеский';
    tournamentSubValue = 'Матч';
    tournamentIcon = 'handshake';
    tournamentLogo = null;
  } else if (event.league_name) {
    tournamentValue = event.league_name;
  }

  // --- ЛОГИКА БЛОКА "СТАДИЯ" ---
  let stageValue = '—';
  let stageSubValue = '';

  if (isFriendly) {
    stageValue = 'Тренировочный';
    stageSubValue = '';
  } else if (event.stage_type === 'regular') {
    stageValue = event.stage_label || 'Регулярный чемпионат'; 
    stageSubValue = event.tour_number ? `${event.tour_number}-й тур` : '';
  } else if (event.stage_type === 'playoff') {
    stageValue = event.stage_label || 'Плей-офф';
    stageSubValue = event.match_number ? `Матч №${event.match_number}` : '';
  } else {
    // Фолбэк на случай других стадий или их отсутствия
    stageValue = event.stage_label || 'Не указана';
    stageSubValue = event.tour_number ? `${event.tour_number}-й тур` : (event.match_number ? `Матч №${event.match_number}` : '');
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

  return (
    <div className="flex flex-col gap-3">
      {/* Широкий блок Арены */}
      <DetailCard 
        icon="arena" 
        label="Место проведения" 
        value={event.arena_name || 'Локация не назначена'} 
      />

      {/* Блок Турнира и Этапа */}
      <div className="grid grid-cols-2 gap-3">
        <DetailCard 
          icon={tournamentIcon}
          logoUrl={tournamentLogo}
          label="Турнир" 
          value={
            <>
              {isFriendly && <Icon name="handshake" className="w-4 h-4 text-brand shrink-0" />}
              <span className="truncate">{tournamentValue}</span>
            </>
          } 
          subValue={tournamentSubValue}
        />
        <DetailCard 
          icon="standings" 
          label="Стадия" 
          value={stageValue} 
          subValue={stageSubValue}
        />
      </div>

      {/* Блок: Игровая форма команд */}
      <div className="flex flex-col p-4 bg-surface-level1 rounded-2xl border border-surface-level2 shadow-md mt-1 relative">
        <span className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-3">
          Игровая форма команд
        </span>
        
        <div className="grid grid-cols-2 gap-4">
          
          {/* Карточка Хозяев */}
          <div className={clsx(
            "flex flex-col items-center p-3 rounded-xl border text-center relative",
            isMyTeamHome 
              ? "bg-brand/10 border-brand/40 shadow-[inset_0_0_15px_rgba(var(--color-brand),0.1)]" 
              : "bg-surface-level2/30 border-surface-border/30"
          )}>
            {/* Плашка "Моя команда" */}
            {isMyTeamHome && (
              <div className="absolute top-0 inset-x-0 h-1 bg-brand rounded-t-xl" />
            )}
            
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider truncate w-full mb-1 mt-1">
              Хозяева
            </span>
            <span className={clsx(
              "text-xs font-black line-clamp-1 mb-3",
              isMyTeamHome ? "text-brand" : "text-content-main"
            )}>
              {homeName}
            </span>
            <div className="w-20 h-20 flex items-center justify-center relative mb-2">
              {homeJerseyUrl ? (
                <img 
                  src={getImageUrl(homeJerseyUrl)} 
                  alt={`Форма ${homeName}`} 
                  className="w-full h-full object-contain drop-shadow-md transition-transform duration-300 active:scale-105"
                />
              ) : (
                <Icon name="jersey" className="w-12 h-12 text-content-subtle opacity-40" />
              )}
            </div>
            <span className={clsx(
              "text-[11px] font-bold",
              isMyTeamHome ? "text-brand" : "text-content-subtle"
            )}>
              {getJerseyLabel(event.home_jersey)}
            </span>
          </div>

          {/* Карточка Гостей */}
          <div className={clsx(
            "flex flex-col items-center p-3 rounded-xl border text-center relative",
            !isMyTeamHome 
              ? "bg-brand/10 border-brand/40 shadow-[inset_0_0_15px_rgba(var(--color-brand),0.1)]" 
              : "bg-surface-level2/30 border-surface-border/30"
          )}>
            {/* Плашка "Моя команда" */}
            {!isMyTeamHome && (
              <div className="absolute top-0 inset-x-0 h-1 bg-brand rounded-t-xl" />
            )}
            
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider truncate w-full mb-1 mt-1">
              Гости
            </span>
            <span className={clsx(
              "text-xs font-black line-clamp-1 mb-3",
              !isMyTeamHome ? "text-brand" : "text-content-main"
            )}>
              {awayName}
            </span>
            <div className="w-20 h-20 flex items-center justify-center relative mb-2">
              {awayJerseyUrl ? (
                <img 
                  src={getImageUrl(awayJerseyUrl)} 
                  alt={`Форма ${awayName}`} 
                  className="w-full h-full object-contain drop-shadow-md transition-transform duration-300 active:scale-105"
                />
              ) : (
                <Icon name="jersey" className="w-12 h-12 text-content-subtle opacity-40" />
              )}
            </div>
            <span className={clsx(
              "text-[11px] font-bold",
              !isMyTeamHome ? "text-brand" : "text-content-subtle"
            )}>
              {getJerseyLabel(event.away_jersey)}
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};