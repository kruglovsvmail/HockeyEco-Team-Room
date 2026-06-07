// TournamentStat.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { Avatar } from '../../ui/Avatar';
import { FadeIn } from '../../ui/FadeIn';

const STAGE_OPTIONS = [
  { value: 'all', label: 'Общая' },
  { value: 'regular', label: 'Регулярка' },
  { value: 'playoff', label: 'Плей-офф' }
];

export function TournamentStat({ 
  skaters, 
  goalies, 
  stageType, 
  onStageTypeChange,
  hasTeamColor,
  activeBrandColor
}) {
  const carouselRef = useRef(null);
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);

  // Локальный стейт амплуа
  const [playerType, setPlayerType] = useState('skaters'); 
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // ПРЕДОХРАНИТЕЛИ: Разделяют программный клик и физический свайп
  const isScrollingProgrammatically = useRef(false);
  const ignoreNextEffect = useRef(false);

  // Настройки интерактивной сортировки колонок таблиц
  const [skaterSort, setSkaterSort] = useState({ key: 'points', order: 'desc' });
  const [goalieSort, setGoalieSort] = useState({ key: 'save_percent', order: 'desc' });

  const selectedStage = STAGE_OPTIONS.find(opt => opt.value === stageType) || STAGE_OPTIONS[0];

  // Автозакрытие выпадающего списка при клике в любую пустую область экрана
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. СИНХРОНИЗАЦИЯ ИЗ КНОПОК-СТРЕЛКАМИ: Плавный авто-скролл
  useEffect(() => {
    if (!carouselRef.current) return;

    // Если стейт изменился от физического свайпа пальцем — игнорируем scrollTo, чтобы не было отскока
    if (ignoreNextEffect.current) {
      ignoreNextEffect.current = false;
      return;
    }

    const container = carouselRef.current;
    const targetLeft = playerType === 'goalies' ? container.clientWidth : 0;
    
    // Включаем режим программного скролла (блокирует onScroll от ложных срабатываний на время пути)
    isScrollingProgrammatically.current = true;
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isScrollingProgrammatically.current = false;
    }, 500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [playerType]);

  // 2. СИНХРОНИЗАЦИЯ ИЗ СВАЙПА: Изменение трека шапки при нативном перелистывании экрана
  const handleCarouselScroll = () => {
    // Если карусель едет сама от нажатия кнопки — полностью игнорируем событие
    if (isScrollingProgrammatically.current) return;
    
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const { scrollLeft, clientWidth } = container;
    if (clientWidth === 0) return;

    // Считаем индекс слайда строго в момент пересечения экватора (50% ширины экрана)
    const currentIdx = Math.round(scrollLeft / clientWidth);
    const newType = currentIdx === 1 ? 'goalies' : 'skaters';
    
    if (newType !== playerType) {
      // Говорим ЮзЭффекту: «Это сделал палец пользователя, не надо вызывать scrollTo!»
      ignoreNextEffect.current = true;
      setPlayerType(newType);
    }
  };

  const handleSkaterSortClick = (key) => {
    setSkaterSort(prev => ({
      key,
      order: prev.key === key ? (prev.order === 'desc' ? 'asc' : 'desc') : 'desc'
    }));
  };

  const handleGoalieSortClick = (key) => {
    setGoalieSort(prev => ({
      key,
      order: prev.key === key ? (prev.order === 'desc' ? 'asc' : 'desc') : 'desc'
    }));
  };

  const sortedSkaters = useMemo(() => {
    if (!skaters) return [];
    return [...skaters].sort((a, b) => {
      const valA = Number(a[skaterSort.key]) || 0;
      const valB = Number(b[skaterSort.key]) || 0;
      return skaterSort.order === 'desc' ? valB - valA : valA - valB;
    });
  }, [skaters, skaterSort]);

  const sortedGoalies = useMemo(() => {
    if (!goalies) return [];
    return [...goalies].sort((a, b) => {
      const valA = Number(a[goalieSort.key]) || 0;
      const valB = Number(b[goalieSort.key]) || 0;
      return goalieSort.order === 'desc' ? valB - valA : valA - valB;
    });
  }, [goalies, goalieSort]);

  const renderSortIndicator = (sortState, currentKey) => {
    if (sortState.key !== currentKey) return <span className="opacity-20 ml-0.5">↕</span>;
    return sortState.order === 'desc' ? <span className="text-brand ml-0.5">↓</span> : <span className="text-brand ml-0.5">↑</span>;
  };

  // Хелпер изоляции тач-событий (останавливает всплытие жеста к родительской карусели)
  const handleTouchIsolation = (e) => {
    e.stopPropagation();
  };

  const isSkatersActive = playerType === 'skaters';
  const isGoaliesActive = playerType === 'goalies';

  return (
    <div className="flex flex-col gap-4 w-full">
      
      {/* 1. ИНТЕГРИРОВАННАЯ ВЕРХНЯЯ ПАНЕЛЬ УПРАВЛЕНИЯ ФИЛЬТРАМИ */}
      <div className="flex items-center gap-2 w-full justify-between select-none">
        
        {/* Капсула карусели амплуа (Полевые / Вратари) */}
        <div className="flex flex-1 items-center justify-between bg-surface-level1 shadow-md rounded-2xl h-[40px] px-1.5">
          <button 
            disabled={isSkatersActive}
            onClick={() => setPlayerType('skaters')}
            className={clsx(
              "p-1 transition-all outline-none z-10",
              isSkatersActive ? "opacity-20 pointer-events-none text-content-muted" : "text-content-main hover:text-brand active:scale-90"
            )}
          >
            <Icon name="chevron_left" className="w-5 h-5" />
          </button>

          <div className="flex items-center overflow-hidden flex-1 justify-center">
            <div className="relative overflow-hidden w-[150px] h-5 flex items-center justify-center">
              <div 
                className="w-[200%] flex items-start h-full absolute left-0 top-0.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
                style={{ transform: `translateX(-${isGoaliesActive ? 50 : 0}%)` }}
              >
                <div className="w-1/2 shrink-0 text-center text-[10px] font-bold uppercase tracking-wider text-content-main truncate">
                  Полевые игроки
                </div>
                <div className="w-1/2 shrink-0 text-center text-[10px] font-bold uppercase tracking-wider text-content-main truncate">
                  Вратари
                </div>
              </div>
            </div>
          </div>

          <button 
            disabled={isGoaliesActive}
            onClick={() => setPlayerType('goalies')}
            className={clsx(
              "p-1 transition-all outline-none rotate-180 z-10",
              isGoaliesActive ? "opacity-20 pointer-events-none text-content-muted" : "text-content-main hover:text-brand active:scale-90"
            )}
          >
            <Icon name="chevron_left" className="w-5 h-5" />
          </button>
        </div>

        {/* Выпадающий список этапов со строго фиксированной шириной 124px */}
        <div ref={dropdownRef} className="relative bg-surface-level1 shadow-md rounded-2xl w-[124px] shrink-0 h-[40px] flex items-center justify-center">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full h-full px-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-content-main outline-none active:opacity-75 transition-opacity"
          >
            <span className="truncate">{selectedStage.label}</span>
            <Icon name="chevron_left" className={clsx("w-4 h-4 transition-transform duration-200 text-content-muted shrink-0", isDropdownOpen ? "rotate-90" : "-rotate-90")} />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-[50px] w-[124px] bg-surface-level1 border border-surface-border shadow-2xl rounded-2xl overflow-hidden z-50 animate-fade-in">
              {STAGE_OPTIONS.map((opt) => {
                const isSelected = opt.value === stageType;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onStageTypeChange(opt.value);
                      setIsDropdownOpen(false);
                    }}
                    className={clsx("w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-wide transition-colors outline-none", isSelected ? "bg-brand text-white" : "text-content-muted active:bg-surface-level2 hover:text-content-main")}
                    style={isSelected && hasTeamColor ? { backgroundColor: activeBrandColor } : {}}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. АППАРАТНАЯ СВАЙП-ЛЕНТА АМПЛУА */}
      <div 
        ref={carouselRef}
        onScroll={handleCarouselScroll}
        className="w-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-6"
      >
        
        {/* СЛАЙД 1: МОНОЛИТНАЯ ТАБЛИЦА ПОЛЕВЫХ ИГРОКОВ */}
        <div className="w-full shrink-0 snap-center">
          <FadeIn key={stageType} duration={300}>
            <div className="bg-surface-level1 rounded-2xl overflow-hidden shadow-md flex w-full">
              
              {/* Левая липкая (фиксированная) часть: Игрок */}
              <div className="w-[178px] shrink-0 z-10 flex flex-col">
                <div className="h-[38px] flex items-center px-2 text-[10px] font-normal uppercase tracking-wider text-content-muted border-b border-surface-border">
                  <div className="w-4 text-center shrink-0">#</div>
                  <div className="pl-3">Игрок</div>
                </div>
                {sortedSkaters.length > 0 && sortedSkaters.map((row, idx) => (
                  <div key={row.player_id} className="h-16 flex items-center px-2 border-b border-surface-border last:border-0 text-left font-semibold text-content-main">
                    <div className="w-4 text-[10px] font-mono text-content-muted text-center shrink-0">{idx + 1}</div>
                    <div className="flex items-center gap-4 min-w-0 flex-1 pl-2">
                      <div className="relative shrink-0 w-7 h-7">
                        <Avatar 
                          photoUrl={row.photo_url || row.avatar_url}
                          firstName={row.first_name}
                          lastName={row.last_name}
                          className="w-9 h-9 rounded-lg bg-surface-level2 -mt-1"
                          fallbackClassName="text-brand text-[10px] font-black"
                        />
                        {row.team_logo && (
                          <img src={getImageUrl(row.team_logo)} alt="" className="absolute -bottom-2 -left-1 w-4 h-4 rounded-full bg-surface-base object-contain" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="uppercase tracking-tight text-[11px] font-bold text-content-main truncate">{row.last_name}</span>
                        <span className="text-[10px] text-content-muted font-bold truncate">{row.first_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Правая прокручиваемая часть: Хоккейные метрики с ТАЧ-ИЗОЛЯЦИЕЙ */}
              <div 
                onTouchStart={handleTouchIsolation}
                onTouchMove={handleTouchIsolation}
                className="flex-1 overflow-x-auto scrollbar-hide flex flex-col"
              >
                {/* Шапка цифр */}
                <div className="h-[38px] flex items-center bg-surface-level1 text-[11px] font-normal uppercase tracking-wider text-content-muted text-center select-none border-b border-surface-border min-w-[240px]">
                  <div onClick={() => handleSkaterSortClick('games_played')} className="w-10 shrink-0 cursor-pointer active:opacity-60">И{renderSortIndicator(skaterSort, 'games_played')}</div>
                  <div onClick={() => handleSkaterSortClick('goals')} className="w-10 shrink-0 cursor-pointer active:opacity-60">Г{renderSortIndicator(skaterSort, 'goals')}</div>
                  <div onClick={() => handleSkaterSortClick('assists')} className="w-10 shrink-0 cursor-pointer active:opacity-60">П{renderSortIndicator(skaterSort, 'assists')}</div>
                  <div onClick={() => handleSkaterSortClick('points')} className="w-11 shrink-0 cursor-pointer active:opacity-60 text-brand" style={hasTeamColor ? { color: activeBrandColor } : {}}>О{renderSortIndicator(skaterSort, 'points')}</div>
                  <div onClick={() => handleSkaterSortClick('plus_minus')} className="w-11 shrink-0 cursor-pointer active:opacity-60">+/-{renderSortIndicator(skaterSort, 'plus_minus')}</div>
                  <div onClick={() => handleSkaterSortClick('penalty_minutes')} className="w-12 shrink-0 cursor-pointer active:opacity-60">Штр{renderSortIndicator(skaterSort, 'penalty_minutes')}</div>
                </div>
                
                {/* Строки цифр */}
                {sortedSkaters.length === 0 ? (
                  <div className="h-16 flex items-center justify-center text-xs font-bold text-content-subtle uppercase tracking-wider min-w-[240px]"></div>
                ) : (
                  sortedSkaters.map((row) => (
                    <div key={row.player_id} className="h-16 flex items-center text-center text-xs font-bold text-content-main border-b border-surface-border last:border-0 min-w-[240px]">
                      <div className="w-10 shrink-0">{row.games_played}</div>
                      <div className="w-10 shrink-0">{row.goals}</div>
                      <div className="w-10 shrink-0">{row.assists}</div>
                      <div className="w-11 shrink-0 text-brand font-black text-[13px]" style={hasTeamColor ? { color: activeBrandColor } : {}}>{row.points}</div>
                      <div className={clsx("w-11 shrink-0", (row.plus_minus || 0) > 0 ? "text-emerald-500" : (row.plus_minus || 0) < 0 ? "text-red-500" : "text-content-muted")}>
                        {(row.plus_minus || 0) > 0 ? `+${row.plus_minus}` : row.plus_minus || 0}
                      </div>
                      <div className="w-12 shrink-0">{row.penalty_minutes}</div>
                    </div>
                  ))
                )}
              </div>

            </div>
          </FadeIn>
        </div>

        {/* СЛАЙД 2: МОНОЛИТНАЯ ТАБЛИЦА ВРАТАРЕЙ */}
        <div className="w-full shrink-0 snap-center">
          <FadeIn key={stageType} duration={300}>
            <div className="bg-surface-level1 rounded-2xl overflow-hidden shadow-md flex w-full">
              
              {/* Левая липкая (фиксированная) часть: Вратарь */}
              <div className="w-[178px] shrink-0 z-10 flex flex-col">
                <div className="h-[38px] flex items-center px-2 text-[10px] font-normal uppercase tracking-wider text-content-muted border-b border-surface-border">
                  <div className="w-4 text-center shrink-0">#</div>
                  <div className="pl-3">Вратарь</div>
                </div>
                {sortedGoalies.length > 0 && sortedGoalies.map((row, idx) => (
                  <div key={row.player_id} className="h-16 flex items-center px-2 border-b border-surface-border last:border-0 text-left font-semibold text-content-main">
                    <div className="w-4 text-[10px] font-mono text-content-muted text-center shrink-0">{idx + 1}</div>
                    <div className="flex items-center gap-4 min-w-0 flex-1 pl-2">
                      <div className="relative shrink-0 w-7 h-7">
                        <Avatar 
                          photoUrl={row.photo_url || row.avatar_url}
                          firstName={row.first_name}
                          lastName={row.last_name}
                          className="w-9 h-9 rounded-lg bg-surface-level2 -mt-1"
                          fallbackClassName="text-brand text-[10px] font-black"
                        />
                        {row.team_logo && (
                          <img src={getImageUrl(row.team_logo)} alt="" className="absolute -bottom-2 -left-1 w-4 h-4 rounded-full bg-surface-base object-contain" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="uppercase tracking-tight text-[11px] font-bold text-content-main truncate">{row.last_name}</span>
                        <span className="text-[10px] text-content-muted font-bold truncate">{row.first_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Правая прокручиваемая часть: Хоккейные метрики вратарей с ТАЧ-ИЗОЛЯЦИЕЙ */}
              <div 
                onTouchStart={handleTouchIsolation}
                onTouchMove={handleTouchIsolation}
                className="flex-1 overflow-x-auto scrollbar-hide flex flex-col"
              >
                {/* Шапка цифр вратарей */}
                <div className="h-[38px] flex items-center bg-surface-level1 text-[11px] font-normal uppercase tracking-wider text-content-muted text-center select-none border-b border-surface-border min-w-[270px]">
                  <div onClick={() => handleGoalieSortClick('games_played')} className="w-9 shrink-0 cursor-pointer active:opacity-60">И{renderSortIndicator(goalieSort, 'games_played')}</div>
                  <div onClick={() => handleGoalieSortClick('goals_against')} className="w-10 shrink-0 cursor-pointer active:opacity-60">ПШ{renderSortIndicator(goalieSort, 'goals_against')}</div>
                  <div onClick={() => handleGoalieSortClick('saves')} className="w-10 shrink-0 cursor-pointer active:opacity-60">ОБ{renderSortIndicator(goalieSort, 'saves')}</div>
                  <div onClick={() => handleGoalieSortClick('save_percent')} className="w-14 shrink-0 cursor-pointer active:opacity-60 text-brand" style={hasTeamColor ? { color: activeBrandColor } : {}}>%ОБ{renderSortIndicator(goalieSort, 'save_percent')}</div>
                  <div onClick={() => handleGoalieSortClick('goals_against_average')} className="w-11 shrink-0 cursor-pointer active:opacity-60">КН{renderSortIndicator(goalieSort, 'goals_against_average')}</div>
                  <div onClick={() => handleGoalieSortClick('shutouts')} className="w-10 shrink-0 cursor-pointer active:opacity-60">И"0"{renderSortIndicator(goalieSort, 'shutouts')}</div>
                </div>
                
                {/* Строки цифр вратарей */}
                {sortedGoalies.length === 0 ? (
                  <div className="h-16 flex items-center justify-center text-xs font-bold text-content-subtle uppercase tracking-wider min-w-[270px]"></div>
                ) : (
                  sortedGoalies.map((row) => (
                    <div key={row.player_id} className="h-16 flex items-center text-center text-xs font-bold text-content-main border-b border-surface-border last:border-0 min-w-[270px]">
                      <div className="w-9 shrink-0">{row.games_played}</div>
                      <div className="w-10 shrink-0">{row.goals_against}</div>
                      <div className="w-10 shrink-0">{row.saves}</div>
                      <div className="w-14 shrink-0 text-brand font-black text-[12px] font-mono" style={hasTeamColor ? { color: activeBrandColor } : {}}>{row.save_percent}%</div>
                      <div className="w-11 shrink-0 text-[12px]">{row.goals_against_average}</div>
                      <div className="w-10 shrink-0 text-emerald-500">{row.shutouts}</div>
                    </div>
                  ))
                )}
              </div>

            </div>
          </FadeIn>
        </div>

      </div>

    </div>
  );
}