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
  const gameDate = dayjs(game.game_date).tz(game.arena_timezone || 'UTC');
  const isStarted = dayjs().isAfter(gameDate);
  const isFriendly = game.stage_type === 'friendly';
  
  const isFinished = game.status === 'finished';
  
  // Класс для обесцвечивания и прозрачности (применяется точечно)
  const fadedClasses = isFinished ? 'opacity-40 grayscale' : '';

  const isHome = game.my_team_id === game.home_team_id;
  const myTeamName = game.my_team_name || 'Команда';
  const myTeamLogo = game.my_team_logo_url ? getImageUrl(game.my_team_logo_url) : null;

  const myJerseyCode = isHome ? game.home_jersey_type : game.away_jersey_type;
  let jerseyImageUrl = null;
  
  if (myJerseyCode === 'light') {
    const url = game.custom_jersey_light_url || game.jersey_light_url || 'default/jersey_light.webp';
    jerseyImageUrl = getImageUrl(url);
  } else if (myJerseyCode === 'dark') {
    const url = game.custom_jersey_dark_url || game.jersey_dark_url || 'default/jersey_dark.webp';
    jerseyImageUrl = getImageUrl(url);
  }

  const myFee = isHome ? game.home_player_fee : game.away_player_fee;

  const renderScore = () => {
    let myScore = isHome ? game.home_score : game.away_score;
    let oppScore = isHome ? game.away_score : game.home_score;
    
    if (game.is_technical) {
      if (game.home_score < 0 && game.away_score < 0) {
        myScore = '-';
        oppScore = '-';
      } else {
        myScore = isHome ? (game.home_score > 0 ? '+' : '-') : (game.away_score > 0 ? '+' : '-');
        oppScore = isHome ? (game.away_score > 0 ? '+' : '-') : (game.home_score > 0 ? '+' : '-');
      }
    }

    let scoreColorClass = 'text-[var(--color-brand)]';
    if (myScore === '+' || (!game.is_technical && myScore > oppScore)) {
      scoreColorClass = 'text-[var(--color-success)]';
    } else if (myScore === '-' || (!game.is_technical && myScore < oppScore)) {
      scoreColorClass = 'text-[var(--color-danger)]';
    }

    let endMarker = null;
    if (game.end_type === 'ot') endMarker = 'овертайм';
    if (game.end_type === 'so') endMarker = 'буллиты';
    if (game.end_type === 'tech') endMarker = 'Технарь';

    return (
      <div className="flex flex-col items-center gap-1">
        <div className={`text-4xl font-black leading-none ${scoreColorClass}`}>
          {myScore} : {oppScore}
        </div>
        {endMarker && (
          <span className="bg-surface-base px-8 text-[8px] rounded md:text-[10px] font-semibold text-content-muted uppercase">
            {endMarker}
          </span>
        )}
      </div>
    );
  };

  const renderInteractiveBlock = () => {
    if (game.status === 'live') {
      return (
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-danger)] animate-pulse"></span>
            <span className="text-sm font-black text-[var(--color-danger)] tracking-widest uppercase">LIVE</span>
          </div>
          <div className="flex gap-2">
            {game.video_yt_url && (
              <a href={game.video_yt_url} target="_blank" rel="noreferrer" className="p-1 text-content-muted hover:text-[var(--color-danger)] outline-none">
                <Youtube className="w-5 h-5 md:w-6 md:h-6" />
              </a>
            )}
            {game.video_vk_url && (
              <a href={game.video_vk_url} target="_blank" rel="noreferrer" className="p-1 text-content-muted hover:text-[var(--color-brand)] outline-none">
                <Video className="w-5 h-5 md:w-6 md:h-6" />
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
              onChange={(val) => onToggleAttendance(game.id, val, game.my_team_id)} 
            />
          ) : (
            <span className="text-[10px] text-content-muted text-center max-w-[90px] leading-tight font-medium bg-surface-base px-2 py-1.5 rounded-lg">
              Не заявлены на турнир
            </span>
          )}
        </div>
      );
    }
    
    return null;
  };

  // С главного контейнера убрали fadedClasses, оставили только pointer-events-none для блокировки кликов
  return (
    <div className={`bg-surface-level1 rounded-2xl shadow-sm border p-4 mb-4 w-full select-none flex flex-col gap-3 transition-all ${isFinished ? 'pointer-events-none' : ''}`}>
      
      {/* ВЕРХНИЙ БЛОК: Контекст, Команда и Время */}
      <div className={`flex justify-between items-start gap-0 transition-all duration-300 ${fadedClasses}`}>
        
        {/* Левая часть: Статус и Моя команда */}
        <div className="flex flex-col gap-3">
          <div className="bg-brand-opacity text-brand px-2.5 py-1 rounded-lg text-xl font-black uppercase tracking-widest w-fit shadow-sm">
            Матч
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-base border p-1 flex shrink-0 items-center justify-center overflow-hidden">
              {myTeamLogo ? (
                <img src={myTeamLogo} alt={myTeamName} className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] font-bold text-content-muted uppercase">ЛОГО</span>
              )}
            </div>
            <span className="text-sm font-bold text-content-main leading-tight line-clamp-2 max-w-[130px]">
              {myTeamName}
            </span>
          </div>
        </div>

        {/* Правая часть: Время, Дата, Локация */}
        <div className="flex flex-col items-end text-right shrink-0">
          <div className="text-3xl md:text-4xl font-black tracking-wider text-brand-dark leading-none mb-5">
            {gameDate.format('HH:mm')}
          </div>
          <div className="text-xs font-bold uppercase text-content-main tracking-wide">
            {gameDate.format('D MMMM')}, <span className="text-content-muted">{gameDate.format('dd')}</span>
          </div>
          <div className="text-[11px] font-medium text-content-muted uppercase mt-1 max-w-[130px] truncate">
            {game.arena_name || 'Локация не указана'}
          </div>
        </div>
      </div>

      {/* РАЗДЕЛИТЕЛЬ */}
      <div className={`h-[1px] w-full bg-surface-base rounded-full transition-all duration-300 ${fadedClasses}`} />

      {/* НИЖНИЙ БЛОК: Детали и Интерактив */}
      <div className="flex justify-between gap-2">
        
        {/* Детали матча (Сетка) - скрываем/обесцвечиваем */}
        <div className={`flex flex-col gap-1.5 text-[10px] md:text-xs text-content-main font-medium transition-all duration-300 ${fadedClasses}`}>
          <div className="flex">
            <span className="text-content-subtle w-16">Соперник:</span>
            <span className="font-semibold">{game.opponent_name || 'Неизвестен'}</span>
          </div>
          <div className="flex">
            <span className="text-content-subtle w-16">Турнир:</span>
            <span className="truncate max-w-[140px] md:max-w-[200px]">
              {isFriendly 
                ? 'Товарищеский' 
                : `${game.league_short_name || 'Лига'} | ${game.division_short_name || 'Дивизион'}`}
            </span>
          </div>
          {!isFriendly && game.stage_label && (
            <div className="flex">
              <span className="text-content-subtle w-16">Стадия:</span>
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

        {/* Правый нижний угол: Форма и Действия */}
        <div className="shrink-0 flex flex-col items-end gap-3.5">
          {jerseyImageUrl && (
            <div className={`w-11 h-11 md:w-10 md:h-10 rounded-lg bg-surface-base border p-1 flex items-center justify-center transition-all duration-300 ${fadedClasses}`}>
              <img src={jerseyImageUrl} alt="Игровая форма" className="max-w-full max-h-full object-contain drop-shadow-sm" />
            </div>
          )}
          
          {/* Интерактивный блок (тут счет) — БЕЗ fadedClasses, остается 100% видимым */}
          <div className="min-h-[32px] flex items-end">
            {renderInteractiveBlock()}
          </div>
        </div>
      </div>

    </div>
  );
};

export default MatchCard;