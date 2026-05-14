// TR-Frontend/src/components/EventCalendar/MatchCard.jsx
import React from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Toggle from '../../ui/Toggle';
import { Youtube, Video } from 'lucide-react';
import { useAccess } from '../../hooks/useAccess';
import { getImageUrl } from '../../utils/helpers';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const MatchCard = ({ game, onToggleAttendance }) => {
  const { selectedTeam } = useAccess();

  // Определяем время матча в таймзоне арены
  const gameDate = dayjs(game.game_date).tz(game.arena_timezone || 'UTC');
  const isStarted = dayjs().isAfter(gameDate);
  const isFriendly = game.stage_type === 'friendly';

  // Вычисляем, какая команда наша
  const isHome = game.my_team_id === game.home_team_id;
  
  // Берем данные нашей команды из хука (или моковые если не загрузились)
  const myTeamName = selectedTeam?.name || 'Моя команда';
  const myTeamLogo = selectedTeam?.logo_url ? getImageUrl(selectedTeam.logo_url) : null;

  // Форма и стоимость
  const myJerseyCode = isHome ? game.home_jersey_type : game.away_jersey_type;
  const jerseyMap = { 'light': 'Светлый', 'dark': 'Темный' };
  const myJersey = jerseyMap[myJerseyCode] || myJerseyCode || 'Не назначен';
  
  const myFee = isHome ? game.home_player_fee : game.away_player_fee;

  // Форматирование счета и определение победителя
  const renderScore = () => {
    let myScore = isHome ? game.home_score : game.away_score;
    let oppScore = isHome ? game.away_score : game.home_score;
    
    // Технический результат
    if (game.is_technical) {
      if (game.home_score < 0 && game.away_score < 0) {
        myScore = '-';
        oppScore = '-';
      } else {
        myScore = isHome ? (game.home_score > 0 ? '+' : '-') : (game.away_score > 0 ? '+' : '-');
        oppScore = isHome ? (game.away_score > 0 ? '+' : '-') : (game.home_score > 0 ? '+' : '-');
      }
    }

    // Определяем цвет счета
    let scoreColorClass = 'text-[var(--color-brand)]'; // Ничья
    if (myScore === '+' || (!game.is_technical && myScore > oppScore)) {
      scoreColorClass = 'text-[var(--color-success)]'; // Зеленый для победы
    } else if (myScore === '-' || (!game.is_technical && myScore < oppScore)) {
      scoreColorClass = 'text-[var(--color-danger)]'; // Красный для поражения
    }

    // Маркеры завершения матча
    let endMarker = '';
    if (game.end_type === 'ot') endMarker = ' (ОТ)';
    if (game.end_type === 'so') endMarker = ' (Б)';
    if (game.end_type === 'tech') endMarker = ' (Тех)';

    return (
      <div className={`text-3xl md:text-4xl font-black tracking-widest ${scoreColorClass}`}>
        {myScore} : {oppScore}
        <span className="text-sm font-bold text-content-muted ml-1 tracking-normal">{endMarker}</span>
      </div>
    );
  };

  // Интерактивный блок в правом нижнем углу (Тумблер, LIVE или Счет)
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
              <a href={game.video_yt_url} target="_blank" rel="noreferrer" className="p-1 text-content-muted hover:text-[var(--color-danger)] transition-colors">
                <Youtube className="w-6 h-6" />
              </a>
            )}
            {game.video_vk_url && (
              <a href={game.video_vk_url} target="_blank" rel="noreferrer" className="p-1 text-content-muted hover:text-[var(--color-brand)] transition-colors">
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
            <span className="text-[10px] text-content-muted text-center max-w-[80px] leading-tight font-medium bg-surface-level2 px-2 py-1 rounded-md">
              Нет доступа к заявке
            </span>
          )}
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="bg-surface-level1 rounded-3xl border-2 border-surface-level2 shadow-sm p-5 mb-4 transition-all w-full select-none">
      
      {/* --- ВЕРХНЯЯ СТРОКА: Дата и Локация --- */}
      <div className="flex justify-between items-start mb-6">
        <div className="text-sm font-bold text-content-main">
          {gameDate.format('D MMMM')}, <span className="uppercase">{gameDate.format('dd')}</span>
        </div>
        <div className="text-sm font-bold text-content-main text-right max-w-[50%] truncate">
          {game.arena_name || 'Локация не указана'}
        </div>
      </div>

      {/* --- ЦЕНТРАЛЬНЫЙ БЛОК: Лого, МАТЧ и Время --- */}
      <div className="flex justify-between items-center mb-6">
        
        {/* Логотип и Название своей команды */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl border border-surface-border bg-surface-base p-1.5 flex shrink-0 items-center justify-center overflow-hidden shadow-inner">
            {myTeamLogo ? (
              <img src={myTeamLogo} alt={myTeamName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold text-content-muted uppercase">ЛОГО</span>
            )}
          </div>
          
          <div className="flex flex-col justify-center">
            <span className="text-xs font-bold text-content-main leading-tight mb-1 truncate max-w-[120px]">
              {myTeamName}
            </span>
            <span className="text-3xl md:text-4xl font-black uppercase tracking-widest text-content-main leading-none">
              Матч
            </span>
          </div>
        </div>

        {/* Время начала */}
        <div className="text-4xl md:text-5xl font-black tracking-tighter text-content-main shrink-0">
          {gameDate.format('HH:mm')}
        </div>

      </div>

      {/* --- НИЖНИЙ БЛОК: Характеристики и Тумблер --- */}
      <div className="flex justify-between items-end">
        
        {/* Список деталей слева */}
        <div className="flex flex-col gap-1.5 text-[11px] md:text-xs text-content-main font-semibold">
          
          <div className="flex gap-1.5">
            <span className="text-content-muted">Тип:</span>
            <span>
              {isFriendly 
                ? 'Товарищеский' 
                : `${game.league_short_name || 'Лига'} | ${game.division_short_name || 'Дивизион'}`}
            </span>
          </div>
          
          <div className="flex gap-1.5">
            <span className="text-content-muted">Соперник:</span>
            <span>{game.opponent_name || 'Неизвестен'}</span>
          </div>

          {!isFriendly && game.stage_label && (
            <div className="flex gap-1.5">
              <span className="text-content-muted">Стадия:</span>
              <span>
                {game.stage_label}
                {game.series_number ? `, Матч N${game.series_number}` : ''}
              </span>
            </div>
          )}

          <div className="flex gap-1.5">
            <span className="text-content-muted">Цвет формы:</span>
            <span>{myJersey}</span>
          </div>

          <div className="flex gap-1.5 mt-0.5">
            <span className="text-content-muted">Стоимость:</span>
            <span className="text-brand font-bold">{myFee ? `${myFee} ₽` : 'не указана'}</span>
          </div>

        </div>

        {/* Правый нижний угол (Тумблер / Счет / LIVE) */}
        <div className="shrink-0 mb-1 pl-4">
          {renderInteractiveBlock()}
        </div>

      </div>

    </div>
  );
};

export default MatchCard;