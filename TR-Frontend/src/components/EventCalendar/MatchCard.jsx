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
  const isFinished = game.status === 'finished';
  
  // Эффект затухания для шапки и подвала в завершенных матчах
  const fadedClasses = isFinished ? 'opacity-40 grayscale transition-all duration-500' : 'transition-all duration-300';
  
  // Определение контекста пользователя
  const isHome = game.my_team_id === game.home_team_id;
  
  // Данные команд (Хозяева всегда слева, Гости всегда справа)
  const homeName = isHome ? game.my_team_name : game.opponent_name;
  const homeLogo = isHome ? getImageUrl(game.my_team_logo_url) : getImageUrl(game.opponent_logo_url);
  
  const awayName = isHome ? game.opponent_name : game.my_team_name;
  const awayLogo = isHome ? getImageUrl(game.opponent_logo_url) : getImageUrl(game.my_team_logo_url);

  const myFee = isHome ? game.home_player_fee : game.away_player_fee;

  /**
   * Рендер центрального блока счета и результата
   */
  const renderScoreBlock = () => {
    if (game.status === 'live') {
      return (
        <div className="flex flex-col items-center animate-pulse">
          <span className="text-[10px] font-black text-danger tracking-widest uppercase">LIVE</span>
          <div className="flex gap-1.5 mt-1">
            {game.video_yt_url && <Youtube className="w-5 h-5 text-danger" />}
            {game.video_vk_url && <Video className="w-5 h-5 text-brand" />}
          </div>
        </div>
      );
    }

    if (isFinished) {
      const myScore = isHome ? game.home_score : game.away_score;
      const oppScore = isHome ? game.away_score : game.home_score;
      
      let statusText = 'НИЧЬЯ';
      let statusColor = 'text-brand';

      // Логика определения результата (с учетом технических поражений/побед)
      if (game.is_technical) {
        if (myScore > 0) { statusText = 'ПОБЕДА'; statusColor = 'text-success'; }
        else if (myScore < 0 && oppScore < 0) { statusText = 'НИЧЬЯ'; statusColor = 'text-brand'; }
        else { statusText = 'ПОРАЖЕНИЕ'; statusColor = 'text-danger'; }
      } else {
        if (myScore > oppScore) { statusText = 'ПОБЕДА'; statusColor = 'text-success'; }
        else if (myScore < oppScore) { statusText = 'ПОРАЖЕНИЕ'; statusColor = 'text-danger'; }
      }

      // Определение типа концовки
      let endTypeText = '';
      if (game.is_technical || game.end_type === 'tech') endTypeText = 'Технический';
      else if (game.end_type === 'ot') endTypeText = 'В Овертайме';
      else if (game.end_type === 'so') endTypeText = 'По буллитам';

      return (
        <div className="flex flex-col items-center justify-center py-2 px-4 rounded-2xl border-surface-border/20">
          {/* Верх: Результат для пользователя */}
          <span className={`text-[10px] font-black tracking-[0.2em] uppercase ${statusColor}`}>
            {statusText}
          </span>
          
          {/* Центр: Счет (Хозяева : Гости) */}
          <div className="text-3xl font-black text-content-main leading-tight my-0.5">
            {game.home_score < 0 ? '-' : game.home_score} : {game.away_score < 0 ? '-' : game.away_score}
          </div>
          
          {/* Низ: Тип завершения */}
          <span className="text-[8px] font-bold text-content-muted uppercase tracking-wider">
            {endTypeText}
          </span>
        </div>
      );
    }

    return (
      <span className="text-2xl font-black text-surface-border uppercase tracking-widest">VS</span>
    );
  };

  return (
    <div className={`bg-surface-level1 h-[248px] md:h-full rounded-3xl shadow-lg p-5 mb-4 w-full select-none flex flex-col relative overflow-hidden ${isFinished ? 'pointer-events-none' : ''}`}>
      
      {/* 1. ШАПКА: Дата и Локация */}
      <div className={`flex justify-between items-center mb-2 ${fadedClasses}`}>
        <span className="text-[11px] font-bold text-content-muted uppercase tracking-widest">
          {gameDate.format('D MMMM')} • {gameDate.format('dd')}
        </span>
        <span className="text-[11px] font-bold text-content-muted uppercase tracking-widest truncate max-w-[160px] text-right">
          {game.arena_name || 'Арена не указана'}
        </span>
      </div>

      {/* 2. ПОДШАПОК: МАТЧ и Время */}
      <div className={`flex justify-between items-end ${fadedClasses}`}>
        <h2 className="text-[24px] font-black text-content-main tracking-wide tracking-tighter leading-none uppercase">
          Матч
        </h2>
        <div className="text-[24px] font-black tracking-wide text-brand-dark leading-none">
          {gameDate.format('HH:mm')}
        </div>
      </div>

      {/* 3. ОСНОВНОЙ БЛОК: Команды и Счет */}
      <div className="flex items-center justify-between pt-5 pb-3">
        {/* Хозяева (Слева) */}
        <div className="flex flex-col items-center gap-3 w-[32%]">
          <div className={`shrink-0 w-12 h-12 md:w-20 md:h-20 flex items-center justify-center p-1 rounded-xl bg-surface-base border transition-all ${isHome ? 'shadow-[0_0_10px_var(--color-brand)] border-brand/60' : ''}`}>
            {homeLogo ? (
              <img src={homeLogo} alt={homeName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold text-content-muted">ЛОГО</span>
            )}
          </div>
          {/* Заменено items-start на items-center для выравнивания текста по середине */}
          <div className="h-8 w-full flex items-center justify-center">
            <span className="text-[12px] font-bold text-content-main uppercase text-center leading-tight line-clamp-2">
              {homeName}
            </span>
          </div>
        </div>

        {/* Центр: Счет или Статус */}
        <div className="flex-1 flex justify-center">
          {renderScoreBlock()}
        </div>

        {/* Гости (Справа) */}
        <div className="flex flex-col items-center gap-3 w-[32%]">
          <div className={`shrink-0 w-12 h-12 md:w-20 md:h-20 flex items-center justify-center p-1 rounded-xl bg-surface-base border transition-all ${!isHome ? 'shadow-[0_0_10px_var(--color-brand)] border-brand/60' : ''}`}>
            {awayLogo ? (
              <img src={awayLogo} alt={awayName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold text-content-muted">ЛОГО</span>
            )}
          </div>
          {/* Заменено items-start на items-center для выравнивания текста по середине */}
          <div className="h-8 w-full flex items-center justify-center">
            <span className="text-[12px] font-bold text-content-main uppercase text-center leading-tight line-clamp-2">
              {awayName}
            </span>
          </div>
        </div>
      </div>

      {/* 4. ПОДВАЛ: Стоимость и Отметка */}
      <div className="mt-auto pt-3 border-t border-surface-level3 flex justify-between items-center">
        <div className={`flex flex-col ${fadedClasses}`}>
          <span className="text-sm font-black text-brand">
            {myFee ? `${myFee} ₽` : 'Бесплатно'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!isFinished && !isStarted ? (
            <div className="flex items-center">
              {game.toggle_status === 'allowed' ? (
                <Toggle 
                  checked={game.is_attending} 
                  disabled={false}
                  onChange={(val) => onToggleAttendance(game.id, val, game.my_team_id)} 
                />
              ) : (
                <span className="text-[10px] text-content-muted text-center leading-tight font-medium bg-surface-base px-2 py-1.5 rounded-lg">
                  {game.toggle_status === 'unregistered' ? 'Отзаявлен' :
                   game.toggle_status === 'not_approved' ? 'Нет допуска к матчу' :
                   game.toggle_status === 'not_in_team' ? 'Не в составе команды' :
                   game.toggle_status === 'not_in_tournament' ? 'Не заявлены на турнир' :
                   ''}
                </span>
              )}
            </div>
          ) : isFinished ? (
            <span className="text-[10px] font-bold text-content-subtle uppercase tracking-widest">Матч завершен</span>
          ) : null}
        </div>
      </div>

    </div>
  );
};

export default MatchCard;