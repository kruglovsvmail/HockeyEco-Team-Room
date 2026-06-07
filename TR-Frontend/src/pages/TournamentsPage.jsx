// TournamentsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { FadeIn } from '../ui/FadeIn';
import { Icon } from '../ui/Icon';
import { TeamPageHeaderSpacer } from '../components/TeamPageHeader';
import { TournamentPageHeader } from '../components/Tournaments/TournamentPageHeader';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { PageLoader } from '../ui/Loader';
import { TournamentCardGame } from '../components/Tournaments/TournamentCardGame';

const TOURNAMENT_TABS = [
  { value: 'matches', label: 'Матчи' },
  { value: 'tables', label: 'Таблицы' },
  { value: 'stats', label: 'Статистика' }
];

export function TournamentsPage() {
  const { selectedTeam, openRightPanel } = useOutletContext();
  const selectedTeamId = selectedTeam?.id;

  const cacheKey = `tr_cached_team_${selectedTeamId}`;
  const [activeTab, setActiveTab] = useState('matches');
  
  // Состояние матчей календаря
  const [games, setGames] = useState([]);
  const [isGamesLoading, setIsGamesLoading] = useState(false);

  // Состояния для вкладки Таблицы / Плей-офф
  const [standings, setStandings] = useState([]);
  const [playoffs, setPlayoffs] = useState([]);
  const [isTablesLoading, setIsTablesLoading] = useState(false);
  
  // Храним открытые аккордеоны таблиц команд и серий плей-офф
  const [expandedTeams, setExpandedTeams] = useState({});
  const [expandedMatchups, setExpandedMatchups] = useState({});
  const [activeRoundId, setActiveRoundId] = useState(null);

  const [activeTeamDetails, setActiveTeamDetails] = useState(() => {
    if (selectedTeamId) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.fullDetails || null;
      }
    }
    return null;
  });

  const [activeTournament, setActiveTournament] = useState(null);

  useEffect(() => {
    if (!selectedTeamId) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      setActiveTeamDetails(parsed.fullDetails || null);
    }
  }, [selectedTeamId, cacheKey]);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = activeTeamDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  useEffect(() => {
    const saved = localStorage.getItem(`tr_active_tournament_for_team_${selectedTeamId}`);
    if (saved) setActiveTournament(JSON.parse(saved));
  }, [selectedTeamId]);

  // Загрузка всех данных турнира
  useEffect(() => {
    if (!activeTournament?.division_id) {
      setGames([]);
      setStandings([]);
      setPlayoffs([]);
      return;
    }

    const fetchGames = async () => {
      setIsGamesLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/games`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setGames(data.games || []);
        }
      } catch (err) {
        console.error('Ошибка загрузки матчей турнира:', err);
      } finally {
        setIsGamesLoading(false);
      }
    };

    const fetchTablesAndPlayoffs = async () => {
      setIsTablesLoading(true);
      try {
        const [standingsRes, playoffsRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/standings`, { headers: getAuthHeaders() }),
          fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/playoffs`, { headers: getAuthHeaders() })
        ]);

        if (standingsRes.ok) {
          const sData = await standingsRes.json();
          setStandings(sData.standings || []);
        }

        if (playoffsRes.ok) {
          const pData = await playoffsRes.json();
          const pList = pData.playoffs || [];
          setPlayoffs(pList);
          if (pList.length > 0) {
            setActiveRoundId(pList[0].round_id);
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки турнирных таблиц и сеток:', err);
      } finally {
        setIsTablesLoading(false);
      }
    };

    fetchGames();
    fetchTablesAndPlayoffs();
    setExpandedTeams({});
    setExpandedMatchups({});
  }, [activeTournament]);

  const toggleTeamAccordion = (teamId) => {
    setExpandedTeams(prev => ({
      ...prev,
      [teamId]: !prev[teamId]
    }));
  };

  const toggleMatchupAccordion = (matchupId) => {
    setExpandedMatchups(prev => ({
      ...prev,
      [matchupId]: !prev[matchupId]
    }));
  };

  const handleTournamentSelect = useCallback((tournament) => {
    setActiveTournament(tournament);
    localStorage.setItem(`tr_active_tournament_for_team_${selectedTeamId}`, JSON.stringify(tournament));
  }, [selectedTeamId]);

  const handleOpenSelector = () => {
    openRightPanel('tournamentSelector', {
      teamId: selectedTeamId,
      activeTournamentId: activeTournament?.tournament_team_id,
      onSelect: handleTournamentSelect,
      hasTeamColor,
      activeBrandColor
    }, 'Выбор турнира');
  };

  const groupGamesByStageAndSeries = () => {
    const regular = {};
    const playoff = {};
    games.forEach((game) => {
      const isPlayoff = game.stage_type === 'playoff';
      const label = game.stage_label || (isPlayoff ? 'Плей-офф' : 'Регулярный чемпионат');
      const seriesNum = game.series_number || 0;
      const target = isPlayoff ? playoff : regular;
      if (!target[label]) target[label] = {};
      if (!target[label][seriesNum]) target[label][seriesNum] = [];
      target[label][seriesNum].push(game);
    });
    return { regular, playoff };
  };

  const { regular, playoff } = groupGamesByStageAndSeries();
  const hasGames = Object.keys(regular).length > 0 || Object.keys(playoff).length > 0;

  const uniquePlayoffRounds = Object.values(
    playoffs.reduce((acc, curr) => {
      if (!acc[curr.round_id]) {
        acc[curr.round_id] = { id: curr.round_id, name: curr.round_name };
      }
      return acc;
    }, {})
  );

  return (
    <FadeIn 
      className="h-full relative overflow-hidden flex flex-col"
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : {}}
    >
      <TournamentPageHeader 
        activeTournament={activeTournament}
        onClick={handleOpenSelector}
        hasTeamColor={hasTeamColor}
        activeBrandColor={activeBrandColor}
        tabs={TOURNAMENT_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="h-full overflow-y-auto scrollbar-hide bg-surface-border relative z-10 snap-y snap-proximity">
        <div className="h-44 shrink-0" />

        <div className="w-full px-4 pb-40">
          {!activeTournament ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <div className="w-20 h-20 rounded-full bg-surface-level2 flex items-center justify-center mb-4">
                <Icon name="registry" className="w-10 h-10 text-content-subtle" />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-content-muted text-center">
                Нажмите сверху, чтобы выбрать турнир
              </p>
            </div>
          ) : (
            <div className="animate-fade-in">
              
              {/* ВКЛАДКА: МАТЧИ */}
              {activeTab === 'matches' && (
                isGamesLoading ? <PageLoader /> : (
                  <div className="flex flex-col gap-8">
                    {!hasGames ? (
                      <div className="text-center py-12 text-xs font-bold text-content-subtle uppercase tracking-wider">
                        В данном дивизионе пока нет запланированных матчей
                      </div>
                    ) : (
                      <>
                        {Object.entries(regular).map(([stageName, tours]) => (
                          <div key={stageName} className="flex flex-col gap-2">
                            {Object.keys(regular).length > 1 && (
                              <div className="text-[12px] font-black uppercase tracking-[0.15em] text-content-main pt-4 pl-6">
                                {stageName}
                              </div>
                            )}
                            {Object.entries(tours).map(([tourNum, stageGames]) => (
                              <div key={tourNum} className="flex flex-col gap-2.5">
                                <div className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-content-muted opacity-70">
                                  Тур №{tourNum}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {stageGames.map((game) => <TournamentCardGame key={game.id} game={game} />)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}

                        {Object.entries(playoff).map(([stageName, seriesMatches]) => (
                          <div key={stageName} className="flex flex-col gap-2">
                            <div className="text-[12px] font-black uppercase tracking-[0.15em] text-content-main pt-4 pl-6">
                              {stageName}
                            </div>
                            {Object.entries(seriesMatches).map(([matchNum, stageGames]) => {
                              const winsNeeded = stageGames[0]?.wins_needed;
                              return (
                                <div key={matchNum} className="flex flex-col gap-2.5">
                                  {winsNeeded !== 1 && (
                                    <div className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-content-muted opacity-70">
                                      Серия №{matchNum}
                                    </div>
                                  )}
                                  <div className="flex flex-col gap-2">
                                    {stageGames.map((game) => <TournamentCardGame key={game.id} game={game} />)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )
              )}

              {/* ВКЛАДКА: ТАБЛИЦЫ И СЕТКИ */}
              {activeTab === 'tables' && (
                isTablesLoading ? <PageLoader /> : (
                  <div className="flex flex-col gap-8">
                    
                    {/* РАЗДЕЛ 1: РЕГУЛЯРНЫЙ ЧЕМПИОНАТ (АККОРДЕОН) */}
                    <div className="flex flex-col gap-3">
                      <div className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-content-main pl-2">
                        Турнирная таблица
                      </div>
                      
                      {standings.length === 0 ? (
                        <div className="text-center py-8 text-xs font-bold text-content-subtle uppercase tracking-wider bg-surface-base rounded-3xl border border-surface-border/40">
                          Турнирная таблица пока не сформирована
                        </div>
                      ) : (
                        <div className="bg-surface-base rounded-2xl overflow-hidden shadow-md">
                          <div className="grid grid-cols-[36px,1fr,50px,40px] items-center px-4 py-4 bg-surface-level1 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                            <div className="text-center">#</div>
                            <div>Команда</div>
                            <div className="text-center">Игр</div>
                            <div className="text-center">Очки</div>
                          </div>

                          {standings.map((row) => {
                            const isExpanded = !!expandedTeams[row.team_id];
                            const goalsDiff = row.goals_for - row.goals_against;
                            const formattedDiff = goalsDiff > 0 ? `+${goalsDiff}` : goalsDiff;
                            
                            return (
                              <div key={row.team_id} className="border-b border-surface-border/20 last:border-0">
                                <div 
                                  onClick={() => toggleTeamAccordion(row.team_id)}
                                  className={clsx(
                                    "grid grid-cols-[36px,1fr,50px,40px] items-center px-4 py-3 text-md font-semibold transition-colors cursor-pointer active:bg-surface-level1 select-none",
                                    isExpanded && "bg-surface-level1"
                                  )}
                                >
                                  <div className="text-center text-xs font-mono text-content-muted mr-5">{row.rank}</div>
                                  <div className="flex items-center gap-4 min-w-0 pr-2">
                                    <img src={getImageUrl(row.team_logo)} alt="" className="w-8 h-8 object-contain shrink-0" />
                                    <span className="leading-tight text-[12px] text-content-main uppercase font-bold break-words line-clamp-2">
                                      {row.team_name}
                                    </span>
                                  </div>
                                  <div className="text-center text-content-muted text-[12px]">{row.games_played}</div>
                                  <div className="text-center font-black text-brand text-[13px]">{row.points}</div>
                                </div>

                                <div className={clsx(
                                  "grid transition-all duration-300 ease-in-out border-surface-border/10",
                                  isExpanded ? "grid-rows-[1fr] opacity-100 " : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                )}>
                                  <div className="overflow-hidden">
                                    <div className=" flex flex-col ">
                                      <div className="w-full bg-surface-level1 overflow-hidden px-1">
                                        <div className="grid grid-cols-6 text-center bg-surface-level1 py-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted">
                                          <div>В</div>
                                          <div>ВО/ВБ</div>
                                          <div>Н</div>
                                          <div>П</div>
                                          <div>ПО/ПБ</div>
                                          <div>РШ</div>
                                        </div>
                                        <div className="grid grid-cols-6 text-center pt-1 pb-3 text-[12px] font-bold text-content-main">
                                          <div>{row.wins_reg}</div>
                                          <div className="text-content-muted">{row.wins_ot}</div>
                                          <div>{row.draws}</div>
                                          <div>{row.losses_reg}</div>
                                          <div className="text-content-muted">{row.losses_ot}</div>
                                          <div className={clsx(
                                            "font-bold",
                                            goalsDiff > 0 ? "text-emerald-500" : goalsDiff < 0 ? "text-red-500" : "text-content-muted"
                                          )}>
                                            {formattedDiff}
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="flex justify-between bg-surface-level1 items-center px-8 py-3 text-[11px] font-normal text-content-muted">
                                        <span>Всего заброшено / пропущено:</span>
                                        <span className="font-normal text-content-muted text-[11px]">
                                          {row.goals_for} — {row.goals_against}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* РАЗДЕЛ 2: СЕТКА ПЛЕЙ-ОФФ (МОНОЛИТНЫЕ КАРТОЧКИ И АККОРДЕОНЫ СЕРИЙ) */}
                    <div className="flex flex-col gap-3 mt-2">
                      <div className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-content-main pl-2">
                        Плей-офф
                      </div>

                      {playoffs.length === 0 ? (
                        <div className="text-center py-8 text-xs font-bold text-content-subtle uppercase tracking-wider bg-surface-base rounded-3xl border border-surface-border/40">
                          Матчи плей-офф еще не сформированы
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          
                          {/* Горизонтальный выбор раунда */}
                          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-0.5 pb-1.5 snap-x">
                            {uniquePlayoffRounds.map((round) => {
                              const isRoundActive = activeRoundId === round.id;
                              return (
                                <button
                                  key={round.id}
                                  onClick={() => setActiveRoundId(round.id)}
                                  className={clsx(
                                    "px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border whitespace-nowrap snap-center transition-all shrink-0 shadow-xs outline-none",
                                    isRoundActive 
                                      ? "bg-brand text-white border-brand font-black" 
                                      : "bg-surface-base text-content-muted border-surface-border/70 active:scale-95"
                                  )}
                                  style={isRoundActive && hasTeamColor ? { backgroundColor: activeBrandColor, borderColor: activeBrandColor } : {}}
                                >
                                  {round.name}
                                </button>
                              );
                            })}
                          </div>

                          {/* Список карточек серий */}
                          <div className="flex flex-col gap-3">
                            {playoffs
                              .filter(m => m.round_id === activeRoundId && m.matchup_id)
                              .map((matchup) => {
                                // Фильтруем и сортируем матчи серии
                                const matchupGames = games.filter(g => 
                                  g.stage_type === 'playoff' && 
                                  g.stage_label === matchup.round_name && 
                                  g.series_number === matchup.matchup_number
                                ).sort((a, b) => (a.game_number || 0) - (b.game_number || 0));

                                const isMultiMatch = matchup.wins_needed > 1;
                                const singleGame = matchupGames[0];
                                const isMatchupExpanded = !!expandedMatchups[matchup.matchup_id];
                                
                                // Проверка старта серии/матча
                                const isSeriesStarted = matchupGames.some(g => g.status === 'finished' || g.status === 'live') || 
                                                        (matchup.team1_wins > 0 || matchup.team2_wins > 0);

                                return (
                                  <div 
                                    key={matchup.matchup_id} 
                                    className={clsx(
                                      "w-full bg-surface-base rounded-2xl border p-4 flex flex-col shadow-md transition-all select-none relative overflow-hidden",
                                      isMatchupExpanded ? "border-surface-border" : "border-surface-border/40"
                                    )}
                                  >
                                    {/* НАЖИМАЕМАЯ ЧАСТЬ КАРТОЧКИ */}
                                    <div 
                                      onClick={() => toggleMatchupAccordion(matchup.matchup_id)}
                                      className="flex items-center justify-between cursor-pointer active:opacity-90 transition-opacity"
                                    >
                                      {/* Левый блок: Команды и цепочка исходов */}
                                      <div className="flex-1 min-w-0 flex flex-col gap-3 pr-4">
                                        
                                        {/* Команда 1 */}
                                        <div className="flex items-center gap-3 min-w-0">
                                          <img src={getImageUrl(matchup.team1_logo)} alt="" className="w-7 h-7 object-contain shrink-0" />
                                          <span className={clsx(
                                            "font-bold uppercase tracking-tight text-[13px] text-content-main truncate",
                                            matchup.winner_id === matchup.team1_id && "text-brand font-black"
                                          )}>
                                            {matchup.team1_name || 'Не известен'}
                                          </span>
                                        </div>

                                        {/* Команда 2 */}
                                        <div className="flex items-center gap-3 min-w-0">
                                          <img src={getImageUrl(matchup.team2_logo)} alt="" className="w-7 h-7 object-contain shrink-0" />
                                          <span className={clsx(
                                            "font-bold uppercase tracking-tight text-[13px] text-content-main truncate",
                                            matchup.winner_id === matchup.team2_id && "text-brand font-black"
                                          )}>
                                            {matchup.team2_name || 'Не известен'}
                                          </span>
                                        </div>

                                        {/* ПОДСТРОЧНИК: Компактный горизонтальный таймлайн матчей (только для длинных серий) */}
                                        {isMultiMatch && matchupGames.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-1 pt-2 border-t border-surface-border/10">
                                            {matchupGames.map((game, idx) => {
                                              const isGameFinished = game.status === 'finished';
                                              const isGameLive = game.status === 'live';

                                              if (isGameFinished) {
                                                const mod = game.end_type === 'ot' ? 'от' : game.end_type === 'so' ? 'б' : '';
                                                const t1Score = game.home_team_id === matchup.team1_id ? game.home_score : game.away_score;
                                                const t2Score = game.home_team_id === matchup.team2_id ? game.home_score : game.away_score;
                                                return (
                                                  <span key={game.id} className="px-1.5 py-0.5 font-mono text-[9px] font-bold bg-surface-level1 text-content-muted border border-surface-border/40 rounded-md">
                                                    {t1Score}:{t2Score}{mod && <span className="text-[7px] ml-0.5 opacity-70">{mod}</span>}
                                                  </span>
                                                );
                                              }

                                              if (isGameLive) {
                                                return (
                                                  <span key={game.id} className="px-1.5 py-0.5 font-mono text-[9px] font-black bg-red-500/10 text-red-500 border border-red-500/20 rounded-md animate-pulse">
                                                    LIVE
                                                  </span>
                                                );
                                              }

                                              return (
                                                <span key={game.id} className="px-1.5 py-0.5 font-mono text-[9px] font-medium bg-surface-level1/40 text-content-subtle border border-surface-border/10 rounded-md">
                                                  {game.game_date ? dayjs(game.game_date).format('DD.MM') : `М${idx+1}`}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {/* Текстовые метаданные предстоящего матча (только для одиночных игр) */}
                                        {!isMultiMatch && singleGame && singleGame.status !== 'finished' && singleGame.status !== 'live' && (
                                          <div className="text-[9px] font-bold text-content-subtle uppercase tracking-wider mt-0.5 pt-2 border-t border-surface-border/10 flex items-center gap-2">
                                            <Icon name="registry" className="w-3 h-3 opacity-60" />
                                            <span>{singleGame.game_date ? dayjs(singleGame.game_date).format('DD.MM в HH:mm') : 'Дата не назначена'}</span>
                                            {singleGame.arena_name && <span className="opacity-50 truncate">• {singleGame.arena_name}</span>}
                                          </div>
                                        )}
                                      </div>

                                      {/* Правый блок: Унифицированные вертикальные кубы главного результата */}
                                      <div className="flex flex-col gap-1.5 shrink-0 items-center justify-center bg-surface-level1 border border-surface-border/40 rounded-xl p-1 w-11">
                                        {/* Слот счета Команды 1 */}
                                        <div className="h-6 flex items-center justify-center font-mono text-[14px] font-black text-content-main">
                                          {isMultiMatch ? (
                                            isSeriesStarted ? (matchup.team1_wins || 0) : '—'
                                          ) : (
                                            singleGame && (singleGame.status === 'finished' || singleGame.status === 'live') 
                                              ? (singleGame.home_team_id === matchup.team1_id ? singleGame.home_score : singleGame.away_score) 
                                              : '—'
                                          )}
                                        </div>
                                        {/* Разделительная черта */}
                                        <div className="w-full h-[1px] bg-surface-border/30" />
                                        {/* Слот счета Команды 2 */}
                                        <div className="h-6 flex items-center justify-center font-mono text-[14px] font-black text-content-main">
                                          {isMultiMatch ? (
                                            isSeriesStarted ? (matchup.team2_wins || 0) : '—'
                                          ) : (
                                            singleGame && (singleGame.status === 'finished' || singleGame.status === 'live') 
                                              ? (singleGame.home_team_id === matchup.team2_id ? singleGame.home_score : singleGame.away_score) 
                                              : '—'
                                          )}
                                        </div>
                                      </div>

                                      {/* Иконка шеврона */}
                                      <div className="ml-3 text-content-subtle/50 shrink-0">
                                        <Icon 
                                          name="registry" 
                                          className={clsx("w-4 h-4 transition-transform duration-300", isMatchupExpanded ? "rotate-180" : "")} 
                                        />
                                      </div>
                                    </div>

                                    {/* ВЫДВИЖНОЙ АККОРДЕОН С ПОЛНЫМ КАЛЕНДАРЕМ СЕРИИ */}
                                    <div className={clsx(
                                      "grid transition-all duration-300 ease-in-out border-surface-border/10",
                                      isMatchupExpanded ? "grid-rows-[1fr] opacity-100 mt-4 pt-3 border-t" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                    )}>
                                      <div className="overflow-hidden flex flex-col gap-2">
                                        {matchupGames.map((game, idx) => {
                                          const isGameFinished = game.status === 'finished';
                                          const isGameLive = game.status === 'live';
                                          const gameMod = game.end_type === 'ot' ? 'ОТ' : game.end_type === 'so' ? 'Б' : game.end_type === 'tech' ? 'ТЕХ' : '';
                                          
                                          return (
                                            <div key={game.id} className="flex items-center justify-between bg-surface-level1/40 p-2.5 rounded-xl border border-surface-border/20 text-[11px]">
                                              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                                                <span className="font-black text-content-main uppercase tracking-tight text-[10px]">
                                                  Матч №{game.game_number || (idx + 1)}
                                                </span>
                                                <span className="text-[10px] text-content-muted truncate font-medium">
                                                  {game.game_date ? dayjs(game.game_date).format('DD.MM.YYYY • HH:mm') : 'Время не указано'} 
                                                  {game.arena_name && ` • ${game.arena_name}`}
                                                </span>
                                              </div>
                                              
                                              <div className="shrink-0 font-mono font-black text-[12px] flex items-center gap-1.5 bg-surface-base border border-surface-border/30 px-2.5 py-1 rounded-lg">
                                                {isGameFinished || isGameLive ? (
                                                  <>
                                                    <span className={clsx(isGameLive ? "text-red-500 animate-pulse" : "text-content-main")}>
                                                      {game.home_team_id === matchup.team1_id ? game.home_score : game.away_score}
                                                      {" : "}
                                                      {game.home_team_id === matchup.team2_id ? game.home_score : game.away_score}
                                                    </span>
                                                    {gameMod && (
                                                      <span className="text-[7px] font-sans font-black px-1 py-0.5 bg-brand-opacity text-brand border border-brand/10 rounded uppercase tracking-wide">
                                                        {gameMod}
                                                      </span>
                                                    )}
                                                  </>
                                                ) : (
                                                  <span className="text-content-subtle/30 font-bold tracking-widest">—:—</span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                )
              )}

              {/* ВКЛАДКА: СТАТИСТИКА */}
              {activeTab === 'stats' && (
                <div className="bg-surface-base p-8 rounded-3xl border border-surface-border shadow-sm flex flex-col items-center justify-center min-h-[160px]">
                  <div className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-content-subtle">
                    Статистика лидеров чемпионата находится в разработке
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </FadeIn>
  );
}