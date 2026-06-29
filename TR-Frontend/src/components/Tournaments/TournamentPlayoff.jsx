// TournamentPlayoff.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { HintPopover } from '../../ui/HintPopover';
import { getImageUrl } from '../../utils/helpers';

const STAGE_OPTIONS = [
  { value: 'all', label: 'Общая' },
  { value: 'regular', label: 'Регулярка' },
  { value: 'playoff', label: 'Плей-офф' }
];

export function TournamentPlayoff({ 
  bracket, 
  games, 
  hasTeamColor, 
  activeBrandColor
}) {
  // ЖЕЛЕЗНЫЙ ВХОДНОЙ ГВАРД-ЧЕКЕР: Предотвращает падение React, если данные еще не доехали
  if (!bracket || !bracket.matchups) return null;

  const { id: bracketId, matchups } = bracket;

  const carouselRef = useRef(null);
  const timeoutRef = useRef(null);
  
  // Локальный стейт активного раунда плей-офф
  const [activeRoundId, setActiveRoundId] = useState(null);

  // ЖЕЛЕЗОБЕТОННЫЕ ПРЕДОХРАНИТЕЛИ: Полностью ликвидируют мерцание чипсов и войну систем
  const isScrollingProgrammatically = useRef(false);
  const ignoreNextEffect = useRef(false);

  // Хелпер сокращения названий раундов для спортивных плейсхолдеров дерева
  const getAbbreviatedRound = (roundName) => {
    if (!roundName) return '??';
    const name = roundName.toLowerCase();
    if (name.includes('1/8')) return '1/8';
    if (name.includes('1/4')) return '1/4';
    if (name.includes('1/2') || name.includes('полуфинал')) return '1/2';
    if (name.includes('финал')) return 'Финал';
    return roundName.substring(0, 5);
  };

  // Вычленяем уникальные раунды строго для этой сетки
  const uniqueRounds = useMemo(() => {
    if (!matchups) return [];
    return Object.values(
      matchups.reduce((acc, curr) => {
        if (!acc[curr.round_id]) {
          acc[curr.round_id] = { id: curr.round_id, name: curr.round_name, order_index: curr.order_index };
        }
        return acc;
      }, {})
    ).sort((a, b) => a.order_index - b.order_index);
  }, [matchups]);

  // Автоматическая инициализация первого доступного раунда при монтировании сетки
  useEffect(() => {
    if (uniqueRounds.length > 0) {
      setActiveRoundId(uniqueRounds[0].id);
    }
  }, [uniqueRounds]);

  // Построение карты матчапов этой сетки для текстовых связей (кто откуда выходит)
  const matchupMap = useMemo(() => {
    if (!matchups) return {};
    return matchups.reduce((acc, item) => {
      if (item.matchup_id) {
        acc[item.matchup_id] = {
          number: item.matchup_number,
          roundName: item.round_name
        };
      }
      return acc;
    }, {});
  }, [matchups]);

  // Умный парсер системных плейсхолдеров ожидания соперников
  const parsePlaceholder = (teamName, sourceType, sourceId) => {
    if (teamName) return teamName;
    if (sourceType === 'seed') return `посев ${sourceId}`;
    
    const parentMatchup = matchupMap[sourceId];
    if (parentMatchup) {
      const rCode = getAbbreviatedRound(parentMatchup.roundName);
      const prefix = sourceType === 'winner_of' ? 'W' : 'L';
      return `${prefix} - ${rCode} - ${parentMatchup.number}`;
    }
    return '---';
  };

  // Расчет медалей и мест исключительно для финальной серии
  const getFinalBadge = (matchupNumber, isWinner) => {
    if (matchupNumber === 1) {
      return isWinner 
        ? { text: 'Золото', className: 'bg-amber-500 text-white' } 
        : { text: 'Серебро', className: 'bg-slate-400 text-white' };
    }
    if (matchupNumber === 2) {
      return isWinner 
        ? { text: 'Бронза', className: 'bg-amber-700 text-white' } 
        : { text: '4-е место', className: 'bg-surface-level3 text-content-muted' };
    }
    const place = isWinner ? (matchupNumber * 2 - 1) : (matchupNumber * 2);
    return { 
      text: `${place}-е место`, 
      className: 'bg-surface-level3 text-content-muted' 
    };
  };

  // 1. СИНХРОНИЗАЦИЯ ИЗ ЧИПСОВ: Авто-скролл к раунду при ручном клике по табу
  useEffect(() => {
    if (!carouselRef.current || !activeRoundId) return;

    // Защитный гвард: Если стейт обновился из handleCarouselScroll (свайп пальцем) — блокируем программный скролл
    if (ignoreNextEffect.current) {
      ignoreNextEffect.current = false;
      return;
    }

    const element = document.getElementById(`round-panel-${bracketId}-${activeRoundId}`);
    if (element && carouselRef.current) {
      const containerLeft = carouselRef.current.getBoundingClientRect().left;
      const elementLeft = element.getBoundingClientRect().left;
      
      // Наглухо отключаем реакцию onScroll на время выполнения плавной анимации перехода
      isScrollingProgrammatically.current = true;
      carouselRef.current.scrollBy({ left: elementLeft - containerLeft, behavior: 'smooth' });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 500);
    }
  }, [activeRoundId, bracketId]);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleRoundTabClick = (roundId) => {
    setActiveRoundId(roundId);
  };

  // 2. СИНХРОНИЗАЦИЯ ИЗ СВАЙПА: Подсветка табов при нативном перелистывании экрана пальцем
  const handleCarouselScroll = () => {
    if (isScrollingProgrammatically.current) return;
    if (!carouselRef.current) return;
    
    const { scrollLeft, clientWidth } = carouselRef.current;
    if (clientWidth === 0) return;

    const targetIdx = Math.round(scrollLeft / clientWidth);
    const targetRound = uniqueRounds[targetIdx];
    
    if (targetRound && activeRoundId !== targetRound.id) {
      // Предотвращаем запуск конфликтующего scrollTo внутри useEffect
      ignoreNextEffect.current = true;
      setActiveRoundId(targetRound.id);
    }
  };

  // Рендеринг контента всплывающей подсказки серии игр (HintPopover)
  const renderPopoverContent = (matchupGames) => {
    if (!matchupGames || matchupGames.length === 0) {
      return (
        <div className="text-center py-2 px-8 text-[10px] font-normal tracking-wide text-content-muted leading-normal">
          Еще ни одного матча в серии не было сыграно
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2.5 w-full text-left">
        <div className="flex flex-col max-h-72 overflow-y-auto scrollbar-hide">
          {matchupGames.map((game, idx) => {
            const homeShort = game.home_team_short_name || game.home_team_name?.substring(0, 3);
            const awayShort = game.away_team_short_name || game.away_team_name?.substring(0, 3);
            const isPlayed = game.status === 'finished' || game.status === 'live';
            
            return (
              <div key={game.id || idx} className="flex flex-col p-2">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <div className="flex items-center gap-3 w-[42%] truncate pl-3">
                    {game.home_team_logo ? (
                      <img src={getImageUrl(game.home_team_logo)} alt="" className="w-5 h-5 object-contain shrink-0" />
                    ) : (
                      <div className="w-4 h-4 bg-surface-level3 border border-surface-border text-[8px] text-content-muted font-bold shrink-0 flex items-center justify-center rounded-full">?</div>
                    )}
                    <span className="uppercase tracking-tight text-content-main truncate">{homeShort}</span>
                  </div>
                  
                  <div className={clsx(
                    "font-mono text-center font-black px-1.5 py-0.5 bg-surface-base border border-surface-border rounded min-w-[44px]",
                    game.status === 'live' ? "text-red-500" : "text-brand"
                  )}>
                    {isPlayed ? `${game.home_score}:${game.away_score}` : '—:—'}
                  </div>
                  
                  <div className="flex items-center gap-3 w-[42%] justify-end truncate pr-3">
                    <span className="uppercase tracking-tight text-content-main truncate">{awayShort}</span>
                    {game.away_team_logo ? (
                      <img src={getImageUrl(game.away_team_logo)} alt="" className="w-5 h-5 object-contain shrink-0" />
                    ) : (
                      <div className="w-4 h-4 bg-surface-level3 border border-surface-border text-[8px] text-content-muted font-bold shrink-0 flex items-center justify-center rounded-full">?</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (uniqueRounds.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 w-full">
      
      {/* 1. Навигационные горизонтальные чипсы раундов текущей сетки */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-0.5 pb-1 snap-x">
        {uniqueRounds.map((r) => {
          const isRoundActive = activeRoundId === r.id;
          return (
            <button
              key={r.id}
              onClick={() => handleRoundTabClick(r.id)}
              className={clsx(
                "px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap snap-center transition-all shrink-0 outline-none",
                isRoundActive ? "bg-brand text-white border-brand font-black" : "bg-surface-base text-content-muted border-surface-border"
              )}
              style={isRoundActive && hasTeamColor ? { backgroundColor: activeBrandColor, borderColor: activeBrandColor } : {}}
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {/* 2. Карусель раундов (Свайп-модуль текущей сетки) */}
      <div 
        ref={carouselRef}
        onScroll={handleCarouselScroll}
        className="w-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-6"
      >
        {uniqueRounds.map((round) => {
          const roundMatchups = matchups.filter(m => m.round_id === round.id);
          const isFinalRound = round.name.toLowerCase().includes('финал') && !round.name.toLowerCase().includes('1/');

          return (
            <div 
              key={round.id}
              id={`round-panel-${bracketId}-${round.id}`}
              className="w-full shrink-0 snap-center flex flex-col gap-4"
            >
              <div className="flex flex-col gap-3.5 relative">
                {roundMatchups.map((matchup) => {
                  const matchupGames = (games || []).filter(g => 
                    g.stage_type === 'playoff' && 
                    g.stage_label === matchup.round_name &&
                    matchup.team1_id && matchup.team2_id &&
                    ((g.home_team_id === matchup.team1_id && g.away_team_id === matchup.team2_id) ||
                     (g.home_team_id === matchup.team2_id && g.away_team_id === matchup.team1_id))
                  ).sort((a, b) => (a.game_number || 0) - (b.game_number || 0));

                  const isMultiMatch = matchup.wins_needed > 1;
                  const singleGame = matchupGames[0];
                  const isStarted = matchupGames.some(g => g.status === 'finished' || g.status === 'live') || (matchup.team1_wins > 0 || matchup.team2_wins > 0);

                  const homeName = parsePlaceholder(matchup.team1_name, matchup.team1_source_type, matchup.team1_source_id);
                  const awayName = parsePlaceholder(matchup.team2_name, matchup.team2_source_type, matchup.team2_source_id);

                  let finalPlaceLabel = "";
                  if (isFinalRound) {
                    if (matchup.matchup_number === 1) finalPlaceLabel = "за 1-е место";
                    else if (matchup.matchup_number === 2) finalPlaceLabel = "за 3-е место";
                    else if (matchup.matchup_number === 3) finalPlaceLabel = "за 5-е место";
                    else finalPlaceLabel = `за ${matchup.matchup_number * 2 - 1}-е место`;
                  }

                  let score1 = 0;
                  let score2 = 0;

                  if (isMultiMatch) {
                    score1 = isStarted ? (matchup.team1_wins || 0) : 0;
                    score2 = isStarted ? (matchup.team2_wins || 0) : 0;
                  } else if (singleGame && (singleGame.status === 'finished' || singleGame.status === 'live')) {
                    score1 = singleGame.home_team_id === matchup.team1_id ? singleGame.home_score : singleGame.away_score;
                    score2 = singleGame.home_team_id === matchup.team2_id ? singleGame.home_score : singleGame.away_score;
                  }

                  const isTeam1Winner = matchup.winner_id && matchup.winner_id === matchup.team1_id;
                  const isTeam2Winner = matchup.winner_id && matchup.winner_id === matchup.team2_id;

                  const cardLayout = (
                    <div className="w-full bg-surface-level1 px-4 pb-3 pt-1 flex flex-col shadow-md select-none relative overflow-hidden transition-all rounded-2xl">
                      <div className="flex items-center justify-between w-full mb-3 pb-1 border-b border-b-surface-border">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">
                            серия до {matchup.wins_needed === 1 ? '1-ой победы' : `${matchup.wins_needed}-х побед`}
                          </span>
                        </div>
                        <div>
                          {finalPlaceLabel && (
                            <span 
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white bg-brand rounded-xl opacity-60"
                              style={hasTeamColor ? { backgroundColor: activeBrandColor } : {}}
                            >
                              {finalPlaceLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1 min-w-0 flex flex-col mt-2 gap-3">
                          {/* Команда 1 */}
                          <div className="flex items-center justify-between w-full min-w-0 gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {matchup.team1_logo ? (
                                <img src={getImageUrl(matchup.team1_logo)} alt="" className="w-6 h-6 object-contain shrink-0" />
                              ) : (
                                <div className="w-6 h-6 bg-surface-level2 border border-surface-border text-[14px] text-content-muted font-bold shrink-0 flex items-center justify-center rounded-full">?</div>
                              )}
                              <span 
                                className={clsx("uppercase tracking-tight text-[10px] truncate", isTeam1Winner ? "font-black" : "font-bold text-content-main")}
                                style={isTeam1Winner ? { color: activeBrandColor } : {}}
                              >
                                {homeName}
                              </span>
                            </div>
                            
                            {isFinalRound && matchup.winner_id && (
                              <span className={clsx("text-[8px] font-black uppercase tracking-widest px-1.5 py-1 rounded-xl shrink-0 leading-none", getFinalBadge(matchup.matchup_number, isTeam1Winner).className)}>
                                {getFinalBadge(matchup.matchup_number, isTeam1Winner).text}
                              </span>
                            )}
                          </div>

                          {/* Команда 2 */}
                          <div className="flex items-center justify-between w-full min-w-0 gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {matchup.team2_logo ? (
                                <img src={getImageUrl(matchup.team2_logo)} alt="" className="w-6 h-6 object-contain shrink-0" />
                              ) : (
                                <div className="w-6 h-6 bg-surface-level2 border border-surface-border text-[14px] text-content-muted font-bold shrink-0 flex items-center justify-center rounded-full">?</div>
                              )}
                              <span 
                                className={clsx("uppercase tracking-tight text-[10px] truncate", isTeam2Winner ? "font-black" : "font-bold text-content-main")}
                                style={isTeam2Winner ? { color: activeBrandColor } : {}}
                              >
                                {awayName}
                              </span>
                            </div>

                            {isFinalRound && matchup.winner_id && (
                              <span className={clsx("text-[8px] font-bold uppercase tracking-widest px-1.5 py-1 rounded-xl shrink-0 leading-none", getFinalBadge(matchup.matchup_number, isTeam2Winner).className)}>
                                {getFinalBadge(matchup.matchup_number, isTeam2Winner).text}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* КУБЫ РЕЗУЛЬТАТОВ */}
                        <div className="flex flex-col items-center shrink-0 ml-2">
                          <span className="text-[8px] font-black uppercase tracking-wider text-content-subtle mb-1 text-center block w-full whitespace-nowrap">
                            {isMultiMatch ? 'счет в серии' : 'счет матча'}
                          </span>
                          <div className="flex flex-col gap-1 items-center justify-center bg-surface-level1 border border-surface-border rounded-lg p-1 w-11">
                            <div className="h-6 flex items-center justify-center font-mono text-[14px] font-black text-content-main">
                              {score1}
                            </div>
                            <div className="w-full h-[1px]" />
                            <div className="h-6 flex items-center justify-center font-mono text-[14px] font-black text-content-main">
                              {score2}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  return isMultiMatch ? (
                    <div key={matchup.matchup_id} className="w-full cursor-pointer active:opacity-95">
                      {/* Пробрасываем класс w-full для растягивания inline-block поповера */}
                      <HintPopover className="w-full" customContent={renderPopoverContent(matchupGames)}>
                        {cardLayout}
                      </HintPopover>
                    </div>
                  ) : (
                    <div key={matchup.matchup_id} className="w-full">
                      {cardLayout}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}