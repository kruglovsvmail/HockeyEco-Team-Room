import React from 'react';
import { Icon } from '../../../ui/Icon';
import { getImageUrl } from '../../../utils/helpers';
import { ContainerContent } from '../../../ui/ContainerContent';
import clsx from 'clsx';
import dayjs from 'dayjs';

// Импортируем наш новый унифицированный компонент производительности
import { FadeIn } from '../../../ui/FadeIn';

export const MatchInfo = ({ event, referees = [], h2hData = null }) => {
  if (!event) return null;

  const isMyTeamHome = event.my_team_id === event.home_team_id;

  // Динамическое определение цветов команды из настроек
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  // Разделение судей по категориям ролей
  const mainRefs = referees.filter(r => r.role === 'main-1' || r.role === 'main-2');
  const linesmenRefs = referees.filter(r => r.role === 'linesman-1' || r.role === 'linesman-2');
  const hasRefereesAssigned = mainRefs.length > 0 || linesmenRefs.length > 0;

  // Полное длинное название лиги
  let tournamentValue = event.league_name || 'Официальный турнир';
  let tournamentSubValue = event.division_name || '';
  let tournamentIcon = 'trophy';
  let tournamentLogo = event.division_logo_url || event.league_logo_url;

  if (event.game_type === 'friendly_pwa' || event.game_type === 'friendly_ext') {
    tournamentValue = 'Товарищеский матч';
    tournamentSubValue = 'Вне рамок лиги';
    tournamentIcon = 'handshake';
    tournamentLogo = null;
  } else if (event.game_type === 'tournament_ext') {
    tournamentValue = event.league_name || 'Внешний турнир';
    tournamentSubValue = event.division_name ? `Дивизион: ${event.division_name}` : 'Внешний дивизион';
    tournamentIcon = 'trophy';
  }

  const targetDate = event.event_date || event.game_date;
  const seasonYear = targetDate ? dayjs(targetDate).format('YYYY') : dayjs().format('YYYY');
  const seasonValue = event.season_name || `Сезон ${seasonYear}/${dayjs(targetDate).add(1, 'year').format('YY')}`;

  // Определение параметров и правильного склонения игровой формы
  const myJerseyType = isMyTeamHome ? event.home_jersey : event.away_jersey;
  const myJerseyUrl = myJerseyType === 'dark' ? event.my_team_jersey_dark_url : event.my_team_jersey_light_url;

  const getJerseyLabel = (type) => {
    if (type === 'light') return 'Светлый';
    if (type === 'dark') return 'Тёмный';
    return 'Не выбран';
  };

  // Вычисление забитых и пропущенных шайб в очных противостояниях (только по завершенным)
  let goalsScored = 0;
  let goalsConceded = 0;
  let lastGames = [];

  if (h2hData && h2hData.games) {
    const finishedGames = h2hData.games.filter(g => g.status === 'finished');
    
    finishedGames.forEach(game => {
      const isGameHome = String(game.home_team_id) === String(event.my_team_id);
      goalsScored += isGameHome ? (game.home_score || 0) : (game.away_score || 0);
      goalsConceded += isGameHome ? (game.away_score || 0) : (game.home_score || 0);
    });

    // Берем последние 5 матчей в хронологическом порядке (слева направо)
    lastGames = finishedGames.slice(0, 5).reverse();
  }

  // Построение координат для SVG линейного графика тренда последних 5 встреч
  const sparklinePoints = lastGames.map((game, idx) => {
    const isGameHome = String(game.home_team_id) === String(event.my_team_id);
    const myScore = isGameHome ? game.home_score : game.away_score;
    const oppScore = isGameHome ? game.away_score : game.home_score;

    const x = 16 + idx * 42; 
    let y = 20; 
    let dotColor = '#9ca3af'; 

    if (myScore > oppScore) {
      y = 6; 
      dotColor = '#10b981'; 
    } else if (myScore < oppScore) {
      y = 34; 
      dotColor = '#ef4444'; 
    }

    return { x, y, dotColor };
  });

  const pathD = sparklinePoints.length > 0 
    ? `M ${sparklinePoints.map(p => `${p.x} ${p.y}`).join(' L ')}` 
    : '';

  return (
    <FadeIn>
      <div className="flex flex-col gap-4 select-none">
        
        {/* БЛОК 1: ТУРНИРНАЯ ИНФОРМАЦИЯ И СУДЕЙСТВО */}
        <ContainerContent>
          <div className="flex flex-col w-full text-left gap-4 py-1">
            
            <div className="flex items-center gap-3.5">
              {tournamentLogo ? (
                <img 
                  src={getImageUrl(tournamentLogo)} 
                  className="w-11 h-11 object-contain rounded-xl bg-surface-level2 p-1 border border-surface-border shrink-0" 
                  alt="Турнир" 
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-surface-level2 border border-surface-border flex items-center justify-center shrink-0">
                  <Icon name={tournamentIcon} className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
              )}
              
              <div className="flex flex-col min-w-0 flex-1">
                {/* Разрешаем перенос длинного названия лиги на 2 строки */}
                <span className="text-[13px] font-black text-content-main uppercase tracking-tight line-clamp-2 break-words leading-tight">
                  {tournamentValue}
                </span>
                <div className="flex items-center gap-2 mt-1 text-[11px] font-semibold text-content-muted">
                  <span className="truncate">{tournamentSubValue || 'Основной этап'}</span>
                  <span className="text-surface-border">•</span>
                  <span className="shrink-0">{seasonValue}</span>
                </div>
              </div>
            </div>

            {hasRefereesAssigned && (
              <>
                <div className="h-px bg-surface-level2/60 w-full" />
                <div className="flex flex-col gap-2.5">
                  <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest">
                    Судейская бригада
                  </span>
                  
                  <div className="grid grid-cols-2 gap-4 mt-0.5">
                    {/* Главные судьи */}
                    {mainRefs.length > 0 && (
                      <div className="flex flex-col pl-1">
                        <span className="text-[8px] font-black text-content-subtle uppercase tracking-wider opacity-75">
                          Главные арбитры
                        </span>
                        <div className="flex flex-col gap-1 mt-1.5">
                          {mainRefs.map((ref, i) => (
                            <span key={ref.user_id || `main-${i}`} className="text-[12px] font-bold text-content-main tracking-tight leading-none truncate block">
                              {ref.last_name} {ref.first_name?.[0]}.
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Линейные судьи */}
                    {linesmenRefs.length > 0 && (
                      <div className="flex flex-col pl-1">
                        <span className="text-[8px] font-black text-content-subtle uppercase tracking-wider opacity-75">
                          Линейные арбитры
                        </span>
                        <div className="flex flex-col gap-1 mt-1.5">
                          {linesmenRefs.map((ref, i) => (
                            <span key={ref.user_id || `linesman-${i}`} className="text-[12px] font-bold text-content-main tracking-tight leading-none truncate block">
                              {ref.last_name} {ref.first_name?.[0]}.
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

          </div>
        </ContainerContent>

        {/* БЛОК 2: ЭКИПИРОВКА НАШЕЙ КОМАНДЫ И ФИНАНСЫ */}
        <ContainerContent>
          <div className="flex flex-col w-full text-left gap-4 py-1">
            
            {/* Игровая форма нашей команды */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 flex items-center justify-center relative shrink-0">
                {myJerseyUrl ? (
                  <img 
                    src={getImageUrl(myJerseyUrl)} 
                    alt="Форма" 
                    className="w-full h-full object-contain drop-shadow-md"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-surface-level2 border border-surface-border flex items-center justify-center">
                    <Icon name="jersey" className="w-5 h-5 text-content-subtle opacity-40" />
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest leading-none">Наша игровая форма</span>
                <span className="text-[13px] font-black text-content-main uppercase tracking-tight mt-1.5 leading-none">
                  {getJerseyLabel(myJerseyType)} комплект
                </span>
              </div>
            </div>

            <div className="h-px bg-surface-level2/60 w-full" />

            {/* Взнос за игру с игрока */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-surface-level2 border border-surface-border flex items-center justify-center shrink-0">
                  <span className="text-sm font-black text-content-muted">₽</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-content-subtle uppercase tracking-wider leading-none">Стоимость участия</span>
                  <span className="text-[12px] font-bold text-content-muted mt-1 leading-none">
                    Взнос с игрока
                  </span>
                </div>
              </div>

              <div className="text-right flex flex-col items-end">
                {/* Подсветка суммы взноса активным цветом бренда/команбы */}
                <span 
                  className="text-[16px] font-black font-mono tracking-tight leading-none"
                  style={{ color: activeBrandColor }}
                >
                  {event.my_fee && Number(event.my_fee) > 0 ? `${Number(event.my_fee).toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
                </span>
              </div>
            </div>

          </div>
        </ContainerContent>

        {/* БЛОК 3: ИСТОРИЯ ПРОТИВОСТОЯНИЙ (HEAD-TO-HEAD) */}
        {h2hData && (
          <ContainerContent>
            <div className="flex flex-col w-full text-left gap-4 py-1">
              <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest">
                История очных встреч
              </span>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-surface-level2/50 border border-surface-border rounded-xl p-2 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-content-muted uppercase">Игр</span>
                  <span className="text-md font-black text-content-main mt-0.5 font-mono">{h2hData.summary?.total || 0}</span>
                </div>
                <div className="bg-success/5 border border-success/10 rounded-xl p-2 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-success uppercase">В</span>
                  <span className="text-md font-black text-success mt-0.5 font-mono">{h2hData.summary?.wins || 0}</span>
                </div>
                <div className="bg-surface-level3 border border-surface-border rounded-xl p-2 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-content-muted uppercase">Н</span>
                  <span className="text-md font-black text-content-muted mt-0.5 font-mono">{h2hData.summary?.draws || 0}</span>
                </div>
                <div className="bg-danger/5 border border-danger/10 rounded-xl p-2 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-danger uppercase">П</span>
                  <span className="text-md font-black text-danger mt-0.5 font-mono">{h2hData.summary?.losses || 0}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-surface-level2/40 border border-surface-border/60 rounded-xl text-[12px] font-bold">
                <span className="text-content-muted font-medium uppercase text-[10px] tracking-wider">Забитые / пропущенные шайбы:</span>
                <span className="font-mono text-content-main font-black tracking-tight text-[13px] bg-surface-base border border-surface-border px-2.5 py-0.5 rounded-lg">
                  {goalsScored} : {goalsConceded}
                </span>
              </div>

              {/* Линейный график тренда последних 5 игр */}
              {lastGames.length > 0 ? (
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex justify-between items-center px-1 text-[8px] font-black uppercase tracking-widest text-content-subtle opacity-60">
                    <span>Форма серии (последние {lastGames.length} игр):</span>
                    <span className="text-success font-mono">П</span>
                    <span className="text-content-muted font-mono">Н</span>
                    <span className="text-danger font-mono">П</span>
                  </div>
                  
                  <div className="w-full bg-surface-level2/30 border border-surface-border/50 rounded-xl p-2 h-14 relative flex items-center justify-center">
                    <svg viewBox="0 0 200 40" className="w-full h-full overflow-visible">
                      <line x1="0" y1="6" x2="200" y2="6" stroke="currentColor" className="text-surface-border opacity-30" strokeDasharray="3,3" />
                      <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" className="text-surface-border opacity-60" strokeDasharray="2,2" />
                      <line x1="0" y1="34" x2="200" y2="34" stroke="currentColor" className="text-surface-border opacity-30" strokeDasharray="3,3" />
                      
                      {pathD && (
                        <path 
                          d={pathD} 
                          fill="none" 
                          stroke="var(--color-content-subtle)" 
                          strokeWidth="1.5" 
                          className="opacity-40" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                        />
                      )}
                      
                      {sparklinePoints.map((pt, i) => (
                        <g key={`spark-dot-${i}`}>
                          <circle 
                            cx={pt.x} 
                            cy={pt.y} 
                            r="4.5" 
                            fill={pt.dotColor} 
                            stroke="var(--color-surface-base)" 
                            strokeWidth="1.5" 
                            className="shadow-sm" 
                          />
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-40">
                  История очных встреч отсутствует
                </div>
              )}

            </div>
          </ContainerContent>
        )}
        
      </div>
    </FadeIn>
  );
};