import React, { useState } from 'react';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { ChipTabs } from '../../ui/ChipTabs';

// Вспомогательный компонент воздушной карточки для характеристик
const DetailCard = ({ icon, label, value, subValue, className = '' }) => (
  <div className={`flex flex-col p-3.5 bg-surface-level1 rounded-2xl border border-surface-level2 shadow-md relative overflow-hidden ${className}`}>
    {icon && (
      <Icon 
        name={icon} 
        className="absolute -bottom-2 -right-2 w-14 h-14 text-brand opacity-[0.06] rotate-[-10deg] pointer-events-none" 
      />
    )}
    <span className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-1.5 relative z-10">
      {label}
    </span>
    <span className="text-sm font-bold text-content-main leading-tight relative z-10">
      {value || '—'}
    </span>
    {subValue && (
      <span className="text-[11px] font-semibold text-content-subtle mt-0.5 leading-tight relative z-10">
        {subValue}
      </span>
    )}
  </div>
);

// Конфигурация табов
const MATCH_TABS = [
  { id: 'info', label: 'Инфо' },
  { id: 'attendance', label: 'Отметки' },
  { id: 'lines', label: 'Пятерки' },
  { id: 'events', label: 'Ход матча' },
  { id: 'stats', label: 'Статистика' }
];

export const EventDetailsMatch = ({ event }) => {
  const [activeTab, setActiveTab] = useState('info');

  if (!event) return null;

  // --- ВЫЧИСЛЕНИЯ ДЛЯ ШАПКИ МАТЧА ---
  const isHome = event.my_team_id === event.home_team_id;
  const homeName = isHome ? event.my_team_name : (event.opponent_name || 'Неизвестно');
  const awayName = isHome ? (event.opponent_name || 'Неизвестно') : event.my_team_name;
  
  const homeLogo = isHome ? event.my_team_logo_url : event.opponent_logo_url;
  const awayLogo = isHome ? event.opponent_logo_url : event.my_team_logo_url;

  const isFinished = event.status === 'finished';
  let matchStatusText = '';
  let matchStatusColor = '';
  let matchScoreText = '-- : --';
  let matchEndTypeText = '';

  if (isFinished) {
    const myScore = isHome ? event.home_score : event.away_score;
    const oppScore = isHome ? event.away_score : event.home_score;
    
    const isTech = event.is_technical || event.end_type === 'tech';

    if (isTech) {
      let homeDisplay = '-';
      let awayDisplay = '-';

      if (event.home_score > event.away_score) {
        homeDisplay = '+';
        awayDisplay = '-';
      } else if (event.home_score < event.away_score) {
        homeDisplay = '-';
        awayDisplay = '+';
      }

      matchScoreText = `${homeDisplay} : ${awayDisplay}`;

      const myDisplay = isHome ? homeDisplay : awayDisplay;
      const oppDisplay = isHome ? awayDisplay : homeDisplay;

      if (myDisplay === '+') {
        matchStatusText = 'ПОБЕДА';
        matchStatusColor = 'text-success';
      } else if (myDisplay === '-' && oppDisplay === '-') {
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger';
      } else {
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger';
      }
      matchEndTypeText = 'ТЕХНАРЬ';

    } else {
      matchScoreText = `${event.home_score} : ${event.away_score}`;

      if (myScore > oppScore) { 
        matchStatusText = 'ПОБЕДА'; 
        matchStatusColor = 'text-success';
      } else if (myScore < oppScore) { 
        matchStatusText = 'ПОРАЖЕНИЕ';
        matchStatusColor = 'text-danger'; 
      } else { 
        matchStatusText = 'НИЧЬЯ'; 
        matchStatusColor = 'text-brand';
      }

      if (event.end_type === 'ot') matchEndTypeText = 'В ОВЕРТАЙМЕ';
      else if (event.end_type === 'so') matchEndTypeText = 'ПО БУЛЛИТАМ';
    }
  }

  // --- ВЫЧИСЛЕНИЯ ДЛЯ ДЕТАЛЕЙ МАТЧА ---
  // Безопасные фолбэки для турнирной информации
  const isFriendly = event.stage_type === 'friendly';
  const tournamentText = event.league_name || (isFriendly ? 'Товарищеский' : 'Официальный турнир');
  const divisionText = event.division_name || (isFriendly ? 'Матч' : '');
  
  const stageText = event.stage_name || (event.stage_type === 'playoff' ? 'Плей-офф' : isFriendly ? 'Тренировочный' : 'Регулярный чемпионат');
  const tourText = event.tour_number ? `${event.tour_number} тур` : (event.match_number ? `Матч ${event.match_number}` : '');

  // Вычисляем индекс для сдвига слайдера (0 до 4)
  const tabIndex = MATCH_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${tabIndex * 20}%`; // Каждый таб занимает 20% от ширины контейнера 500%

  return (
    <div className="h-full w-full flex flex-col bg-surface-border overflow-hidden">
      
      {/* 1. БЛОК ШАПКИ И МЕНЮ (Статичный верх) */}
      <div className="bg-surface-base shadow-sm shrink-0 pt-6 pb-4 mb-4 relative z-20">
        
        {/* Противостояние */}
        <div className="flex items-start justify-between px-4 pb-5">
          {/* Хозяева (Слева) */}
          <div className="flex flex-col items-center w-[30%] relative z-10">
            <div className="w-12 h-12 shrink-0 mb-2 flex items-center justify-center overflow-hidden drop-shadow-md">
              {homeLogo ? (
                <img src={getImageUrl(homeLogo)} alt="Лого" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] font-black text-content-muted">ЛОГО</span>
              )}
            </div>
            <span className="text-[13px] font-bold text-content-main text-center leading-tight line-clamp-2">
              {homeName}
            </span>
          </div>

          {/* Центр: Счет или Статус */}
          <div className="flex flex-col items-center justify-center w-[40%] mt-1 px-2">
            {event.status === 'live' ? (
              <div className="flex flex-col items-center">
                <span className="text-danger font-black text-2xl tracking-widest animate-pulse">LIVE</span>
                {(event.video_yt_url || event.video_vk_url) && (
                  <div className="flex items-center gap-4 mt-3">
                    {event.video_yt_url && (
                      <a href={event.video_yt_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#FF0000] transition-colors outline-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M21.582 6.186a2.665 2.665 0 0 0-1.882-1.892C18.04 3.84 12 3.84 12 3.84s-6.04 0-7.7.454a2.66 2.66 0 0 0-1.88 1.892C1.96 7.848 1.96 12 1.96 12s0 4.152.46 5.814a2.665 2.665 0 0 0 1.882 1.892c1.66.454 7.7.454 7.7.454s6.04 0 7.7-.454a2.665 2.665 0 0 0 1.882-1.892c.46-1.662.46-5.814.46-5.814s0-4.152-.46-5.814zM9.954 15.354V8.646l5.88 3.354-5.88 3.354z"/></svg>
                      </a>
                    )}
                    {event.video_vk_url && (
                      <a href={event.video_vk_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#0077FF] transition-colors outline-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.625-3.504-1.686-1.543-1.724-1.6-.459-3.27 1.582-2.09 2.62-3.842 2.3-4.56-.316-.718-1.54-.582-1.54-.582l-3.503.018c-.495 0-.759.169-.938.582-1.026 2.68-2.54 5.319-3.642 5.319-.481 0-.737-.306-.737-1.54V6.985c0-.895-.274-1.12-1.084-1.12H8.884c-.456 0-.803.14-.803.49 0 .456.634.606.853 1.95.342 2.052-.081 4.542-.718 4.542-.481 0-1.731-2.457-2.613-5.076-.23-.679-.472-.942-1.096-.942H1.054c-.65 0-.848.337-.848.665 0 .685 1.554 3.738 4.316 7.625 2.56 3.626 5.535 5.875 8.64 5.875z"/></svg>
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : isFinished ? (
              <div className="flex flex-col items-center">
                {matchStatusText && (
                  <span className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${matchStatusColor}`}>
                    {matchStatusText}
                  </span>
                )}
                <span className="text-3xl font-black text-content-main tracking-tight leading-none">
                  {matchScoreText}
                </span>
                {matchEndTypeText && (
                  <span className="text-[9px] font-bold uppercase tracking-widest text-content-muted mt-2 text-center">
                    {matchEndTypeText}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-content-muted tracking-widest">
                  -- : --
                </span>
              </div>
            )}
          </div>

          {/* Гости (Справа) */}
          <div className="flex flex-col items-center w-[30%] relative z-10">
            <div className="w-12 h-12 shrink-0 mb-2 flex items-center justify-center overflow-hidden drop-shadow-md">
              {awayLogo ? (
                <img src={getImageUrl(awayLogo)} alt="Лого" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] font-black text-content-muted">ЛОГО</span>
              )}
            </div>
            <span className="text-[13px] font-bold text-content-main text-center leading-tight line-clamp-2">
              {awayName}
            </span>
          </div>
        </div>

        {/* Чипсы-меню */}
        <div className="mt-1">
          <ChipTabs tabs={MATCH_TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {/* 2. КОНТЕНТНАЯ ЧАСТЬ (Скроллируемый слайдер шириной 500%) */}
      <div className="flex-1 overflow-hidden relative">
        <div 
          className="flex w-[500%] h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
          style={{ transform: `translateX(${translateX})` }}
        >
          
          {/* ВКЛАДКА 1: ИНФО */}
          <div 
            className="w-1/5 h-full overflow-y-auto scrollbar-hide px-4 pb-10 transition-opacity duration-500"
            style={{ opacity: activeTab === 'info' ? 1 : 0.3 }}
          >
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
                  icon="trophy" 
                  label="Турнир" 
                  value={tournamentText} 
                  subValue={divisionText}
                />
                <DetailCard 
                  icon="standings" 
                  label="Стадия" 
                  value={stageText} 
                  subValue={tourText}
                />
              </div>
            </div>
          </div>

          {/* ВКЛАДКА 2: ОТМЕТКИ */}
          <div 
            className="w-1/5 h-full overflow-y-auto scrollbar-hide px-4 pb-10 transition-opacity duration-500"
            style={{ opacity: activeTab === 'attendance' ? 1 : 0.3 }}
          >
            <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
              Явка состава
            </div>
          </div>

          {/* ВКЛАДКА 3: ПЯТЕРКИ */}
          <div 
            className="w-1/5 h-full overflow-y-auto scrollbar-hide px-4 pb-10 transition-opacity duration-500"
            style={{ opacity: activeTab === 'lines' ? 1 : 0.3 }}
          >
            <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
              Звенья и сочетания
            </div>
          </div>

          {/* ВКЛАДКА 4: ХОД МАТЧА */}
          <div 
            className="w-1/5 h-full overflow-y-auto scrollbar-hide px-4 pb-10 transition-opacity duration-500"
            style={{ opacity: activeTab === 'events' ? 1 : 0.3 }}
          >
            <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
              Протокол матча
            </div>
          </div>

          {/* ВКЛАДКА 5: СТАТИСТИКА */}
          <div 
            className="w-1/5 h-full overflow-y-auto scrollbar-hide px-4 pb-10 transition-opacity duration-500"
            style={{ opacity: activeTab === 'stats' ? 1 : 0.3 }}
          >
            <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
              Статистика матча
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};