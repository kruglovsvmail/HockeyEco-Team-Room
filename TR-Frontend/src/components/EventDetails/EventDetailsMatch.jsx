import React from 'react';
import dayjs from 'dayjs';
import { getImageUrl } from '../../utils/helpers';

export const EventDetailsMatch = ({ event }) => {
  if (!event) return null;

  // Вычисляем, играет ли наша команда дома
  const isHome = event.my_team_id === event.home_team_id;

  // Распределяем названия и логотипы
  const homeName = isHome ? event.my_team_name : (event.opponent_name || 'Неизвестно');
  const awayName = isHome ? (event.opponent_name || 'Неизвестно') : event.my_team_name;
  
  const homeLogo = isHome ? event.my_team_logo_url : event.opponent_logo_url;
  const awayLogo = isHome ? event.opponent_logo_url : event.my_team_logo_url;

  // Логика текста под счетом (Только для завершенных матчей)
  const isFinished = event.status === 'finished';
  let matchStatusText = '';
  let matchStatusColor = '';
  let matchScoreText = '-- : --';
  let matchEndTypeText = '';

  if (isFinished) {
    const myScore = isHome ? event.home_score : event.away_score;
    const oppScore = isHome ? event.away_score : event.home_score;
    
    // Форматирование счета (для корректного отображения технических +/-)
    const homeScoreDisplay = event.home_score < 0 ? '-' : event.home_score;
    const awayScoreDisplay = event.away_score < 0 ? '-' : event.away_score;
    matchScoreText = `${homeScoreDisplay} : ${awayScoreDisplay}`;

    if (event.is_technical) {
      if (myScore > 0) { matchStatusText = 'ПОБЕДА'; matchStatusColor = 'text-success'; }
      else if (myScore < 0 && oppScore < 0) { matchStatusText = 'НИЧЬЯ'; matchStatusColor = 'text-brand'; }
      else { matchStatusText = 'ПОРАЖЕНИЕ'; matchStatusColor = 'text-danger'; }
      matchEndTypeText = 'ТЕХНИЧЕСКИЙ';
    } else {
      if (myScore > oppScore) { matchStatusText = 'ПОБЕДА'; matchStatusColor = 'text-success'; }
      else if (myScore < oppScore) { matchStatusText = 'ПОРАЖЕНИЕ'; matchStatusColor = 'text-danger'; }
      else { matchStatusText = 'НИЧЬЯ'; matchStatusColor = 'text-brand'; }
      
      if (event.end_type === 'ot') matchEndTypeText = 'В ОВЕРТАЙМЕ';
      else if (event.end_type === 'so') matchEndTypeText = 'ПО БУЛЛИТАМ';
    }
  }

  return (
    <div className="h-full w-full overflow-y-auto scrollbar-hide bg-surface-level1">
      
      {/* 1. БЛОК ПРОТИВОСТОЯНИЯ */}
      <div className="flex items-start justify-between px-4 py-10">
        
        {/* Хозяева (Слева) */}
        <div className="flex flex-col items-center w-[30%]">
          <div className="w-14 h-14 shrink-0 mb-3 flex items-center justify-center overflow-hidden">
            {homeLogo ? (
              <img src={getImageUrl(homeLogo)} alt="Лого" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] font-black text-content-muted">ЛОГО</span>
            )}
          </div>
          <span className="text-[14px] font-bold text-content-main text-center leading-tight line-clamp-2">
            {homeName}
          </span>
        </div>

        {/* Центр: Счет или Статус */}
        <div className="flex flex-col items-center justify-center w-[40%] mt-3 px-2">
          
          {event.status === 'live' ? (
            <div className="flex flex-col items-center">
              <span className="text-danger font-black text-2xl tracking-widest animate-pulse">LIVE</span>
              
              {/* Иконки трансляций */}
              {(event.video_yt_url || event.video_vk_url) && (
                <div className="flex items-center gap-4 mt-3">
                  {event.video_yt_url && (
                    <a href={event.video_yt_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#FF0000] transition-colors">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M21.582 6.186a2.665 2.665 0 0 0-1.882-1.892C18.04 3.84 12 3.84 12 3.84s-6.04 0-7.7.454a2.66 2.66 0 0 0-1.88 1.892C1.96 7.848 1.96 12 1.96 12s0 4.152.46 5.814a2.665 2.665 0 0 0 1.882 1.892c1.66.454 7.7.454 7.7.454s6.04 0 7.7-.454a2.665 2.665 0 0 0 1.882-1.892c.46-1.662.46-5.814.46-5.814s0-4.152-.46-5.814zM9.954 15.354V8.646l5.88 3.354-5.88 3.354z"/></svg>
                    </a>
                  )}
                  {event.video_vk_url && (
                    <a href={event.video_vk_url} target="_blank" rel="noreferrer" className="text-content-muted hover:text-[#0077FF] transition-colors">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.625-3.504-1.686-1.543-1.724-1.6-.459-3.27 1.582-2.09 2.62-3.842 2.3-4.56-.316-.718-1.54-.582-1.54-.582l-3.503.018c-.495 0-.759.169-.938.582-1.026 2.68-2.54 5.319-3.642 5.319-.481 0-.737-.306-.737-1.54V6.985c0-.895-.274-1.12-1.084-1.12H8.884c-.456 0-.803.14-.803.49 0 .456.634.606.853 1.95.342 2.052-.081 4.542-.718 4.542-.481 0-1.731-2.457-2.613-5.076-.23-.679-.472-.942-1.096-.942H1.054c-.65 0-.848.337-.848.665 0 .685 1.554 3.738 4.316 7.625 2.56 3.626 5.535 5.875 8.64 5.875z"/></svg>
                    </a>
                  )}
                </div>
              )}
            </div>
            
          ) : isFinished ? (
            <div className="flex flex-col items-center">
              {matchStatusText && (
                <span className={`text-[11px] font-black uppercase tracking-widest mb-1.5 ${matchStatusColor}`}>
                  {matchStatusText}
                </span>
              )}
              <span className="text-3xl font-black text-content-main tracking-tight leading-none">
                {matchScoreText}
              </span>
              {matchEndTypeText && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-2 text-center">
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
        <div className="flex flex-col items-center w-[30%]">
          <div className="w-14 h-14 shrink-0 mb-3 flex items-center justify-center overflow-hidden">
            {awayLogo ? (
              <img src={getImageUrl(awayLogo)} alt="Лого" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] font-black text-content-muted">ЛОГО</span>
            )}
          </div>
          <span className="text-[14px] font-bold text-content-main text-center leading-tight line-clamp-2">
            {awayName}
          </span>
        </div>

      </div>

      {/* ОСТАЛЬНОЕ ПУСТО, КАК ДОГОВАРИВАЛИСЬ */}
      <div className="p-4 flex flex-col gap-4">
        {/* Будем добавлять следующие блоки сюда */}
      </div>

    </div>
  );
};