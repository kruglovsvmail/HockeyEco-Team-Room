import React from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Toggle from '../../ui/Toggle';
import { Youtube, Video } from 'lucide-react';
import { getImageUrl } from '../../utils/helpers';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const MatchCard = ({ game, onToggleAttendance }) => {
  // Определяем время и статусы
  const gameDate = dayjs(game.game_date).tz(game.arena_timezone || 'UTC');
  const isStarted = dayjs().isAfter(gameDate);
  const isFriendly = game.stage_type === 'friendly';
  
  // Визуальный эффект для завершенного матча
  const isFinished = game.status === 'finished';
  const finishedClasses = isFinished ? 'opacity-50 grayscale pointer-events-none' : '';

  // Определение контекста команды (кто "мы")
  const isHome = game.my_team_id === game.home_team_id;
  const myTeamName = game.my_team_name || 'Команда';
  const myTeamLogo = game.my_team_logo_url ? getImageUrl(game.my_team_logo_url) : null;

  // Логика выбора изображения формы (Jersey)
  const myJerseyCode = isHome ? game.home_jersey_type : game.away_jersey_type;
  let jerseyImageUrl = null;
  
  if (myJerseyCode === 'light') {
    const url = game.custom_jersey_light_url || game.jersey_light_url || 'default/jersey_light.webp';
    jerseyImageUrl = getImageUrl(url);
  } else if (myJerseyCode === 'dark') {
    const url = game.custom_jersey_dark_url || game.jersey_dark_url || 'default/jersey_dark.webp';
    jerseyImageUrl = getImageUrl(url);
  }

  // Стоимость участия
  const myFee = isHome ? game.home_player_fee : game.away_player_fee;

  // Рендер счета и текстового результата
  const renderScore = () => {
    let myScore = isHome ? game.home_score : game.away_score;
    let oppScore = isHome ? game.away_score : game.home_score;
    
    // Обработка технического результата (+/-)
    if (game.is_technical) {
      if (game.home_score < 0 && game.away_score < 0) {
        myScore = '-';
        oppScore = '-';
      } else {
        myScore = isHome ? (game.home_score > 0 ? '+' : '-') : (game.away_score > 0 ? '+' : '-');
        oppScore = isHome ? (game.away_score > 0 ? '+' : '-') : (game.home_score > 0 ? '+' : '-');
      }
    }

    // Определение цвета счета на основе результата
    let scoreColorClass = 'text-[var(--color-brand)]'; 
    if (myScore === '+' || (!game.is_technical && myScore > oppScore)) {
      scoreColorClass = 'text-[var(--color-success)]'; 
    } else if (myScore === '-' || (!game.is_technical && myScore < oppScore)) {
      scoreColorClass = 'text-[var(--color-danger)]'; 
    }

    // Текстовые маркеры завершения под счетом
    let endMarker = null;
    if (game.end_type === 'ot') endMarker = 'в овертайме';
    if (game.end_type === 'so') endMarker = 'по буллитам';
    if (game.end_type === 'tech') endMarker = 'Технарь';

    return (
      <div className="flex flex-col items-end gap-1">
        <div className={`text-3xl md:text-4xl font-black tracking-wide leading-none ${scoreColorClass}`}>
          {myScore} : {oppScore}
        </div>
        {endMarker && (
          <span className="text-[9px] md:text-[10px] font-bold text-content-muted tracking-wider uppercase">
            {endMarker}
          </span>
        )}
      </div>
    );
  };

  // Правый интерактивный блок (LIVE / Счет / Тумблер)
  const renderInteractiveBlock = () => {
    if (game.status === 'live') {
      return (
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-danger)] animate-pulse"></span>
            <span className="text-sm font-black text-[var(--color-danger)] tracking-widest uppercase">LIVE</span>
          </div>
          <div className="flex gap-2">
            {game.video_yt_url && (
              <a href={game.video_yt_url} target="_blank" rel="noreferrer" className="p-1 text-content-muted hover:text-[var(--color-danger)]">
                <Youtube className="w-6 h-6" />
              </a>
            )}
            {game.video_vk_url && (
              <a href={game.video_vk_url} target="_blank" rel="noreferrer" className="p-1 text-content-muted hover:text-[var(--color-brand)]">
                <Video className="w-6 h-6" />
              </a>
            )}
          </div>
        </div>
      );
    }
    
    if (game.status === 'finished') {
      return renderScore();
    }
    
    if (!isStarted) {
      return (
        <div className="flex flex-col items-center">
          {game.can_toggle ? (
            <Toggle 
              checked={game.is_attending} 
              onChange={(val) => onToggleAttendance(game.id, val)} 
            />
          ) : (
            <span className="text-[8px] text-content-muted text-center max-w-[78px] leading-tight font-normal bg-surface-level2 px-1 py-1 rounded-lg">
              Вы не в заявлены на турнир
            </span>
          )}
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="bg-surface-level1 rounded-2xl shadow-md p-4 mb-4 transition-all w-full select-none">
      
      {/* --- ВЕРХНЯЯ СТРОКА: Дата и Локация --- */}
      <div className={`flex justify-between items-start mb-2 transition-all ${finishedClasses}`}>
        <div className="text-sm font-bold uppercase text-content-muted">
          {gameDate.format('D MMMM')}, <span className="uppercase">{gameDate.format('dd')}</span>
        </div>
        <div className="text-sm font-bold text-content-muted uppercase text-right max-w-[50%] truncate">
          {game.arena_name || 'Локация не указана'}
        </div>
      </div>

      {/* --- ЦЕНТРАЛЬНЫЙ БЛОК: Лого, МАТЧ и Время --- */}
      <div className={`flex justify-between items-end mb-2 transition-all ${finishedClasses}`}>
        
        {/* Инфо текущей команды */}
        <div className="flex items-end gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-base p-0.5 flex shrink-0 items-center justify-center overflow-hidden">
            {myTeamLogo ? (
              <img src={myTeamLogo} alt={myTeamName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold text-content-muted uppercase">ЛОГО</span>
            )}
          </div>
          
          <div className="flex flex-col justify-end">
            <span className="text-[10px] font-medium text-content-main leading-tight mb-0.5 truncate max-w-[200px]">
              {myTeamName}
            </span>
            <span className="text-[22px] font-black uppercase tracking-wide text-brand-dark leading-none">
              Матч
            </span>
          </div>
        </div>

        {/* Время начала (выровнено по базовой линии с МАТЧ) */}
        <div className="text-[24px] font-black tracking-wider text-brand-dark shrink-0 leading-none">
          {gameDate.format('HH:mm')}
        </div>

      </div>

      {/* --- НИЖНИЙ БЛОК: Характеристики и Правая Колонка --- */}
      <div className="flex justify-between items-end">
        
        {/* Список деталей слева */}
        <div className={`flex flex-col gap-1 text-[9px] md:text-xs text-content-muted font-semibold transition-all ${finishedClasses}`}>

          <div className="flex gap-2">
            <span className="text-content-subtle font-normal">Соперник:</span>
            <span>{game.opponent_name || 'Неизвестен'}</span>
          </div>

          <div className="flex gap-2">
            <span className="text-content-subtle font-normal">Турнир:</span>
            <span>
              {isFriendly 
                ? 'Товарищеский' 
                : `${game.league_short_name || 'Лига'} | ${game.division_short_name || 'Дивизион'}`}
            </span>
          </div>

          {!isFriendly && game.stage_label && (
            <div className="flex gap-2">
              <span className="text-content-subtle font-normal">Стадия:</span>
              <span>
                {game.stage_label}
                {game.series_number ? `, ${game.series_number}-й тур` : ''}
              </span>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <span className="text-brand font-bold">{myFee ? `${myFee} ₽` : 'Стоимость еще не указана'}</span>
          </div>

        </div>

        {/* Правый нижний угол (Джерси + Тумблер/Счет/LIVE) */}
        <div className="shrink-0 mb-1 pl-4 flex flex-col items-end gap-3">
          
          {/* Изображение игровой формы */}
          {jerseyImageUrl && (
            <div className={`w-9 h-9 rounded-lg bg-surface-base p-1 md:w-11 md:h-11 flex items-end justify-end transition-all ${finishedClasses}`}>
              <img 
                src={jerseyImageUrl} 
                alt="Игровая форма" 
                className="max-w-full max-h-full object-contain" 
              />
            </div>
          )}

          {/* Интерактивный блок (остается ярким при isFinished) */}
          <div className="transition-all">
            {renderInteractiveBlock()}
          </div>
          
        </div>

      </div>

    </div>
  );
};

export default MatchCard;