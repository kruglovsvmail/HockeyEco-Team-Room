// TournamentsPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { FadeIn } from '../ui/FadeIn';
import { Icon } from '../ui/Icon';
import { TournamentPageHeader } from '../components/Tournaments/TournamentPageHeader';
import { getAuthHeaders } from '../utils/helpers';
import { PageLoader } from '../ui/Loader';
import { TournamentCardGame } from '../components/Tournaments/TournamentCardGame';
import { TournamentTable } from '../components/Tournaments/TournamentTable';
import { TournamentPlayoff } from '../components/Tournaments/TournamentPlayoff';
import { TournamentStat } from '../components/Tournaments/TournamentStat';

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
  const [games, setGames] = useState([]);
  const [isGamesLoading, setIsGamesLoading] = useState(false);

  const [standings, setStandings] = useState([]);
  const [playoffs, setPlayoffs] = useState([]);
  const [isTablesLoading, setIsTablesLoading] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState({});

  // Монолитный стэйт хранения ВСЕЙ хоккейной статистики (загружается один раз полностью)
  const [statsData, setStatsData] = useState({
    all: { skaters: [], goalies: [] },
    regular: { skaters: [], goalies: [] },
    playoff: { skaters: [], goalies: [] }
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsStageType, setStatsStageType] = useState('all'); // 'all' / 'regular' / 'playoff'

  const [activeTeamDetails, setActiveTeamDetails] = useState(() => {
    if (selectedTeamId) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached).fullDetails || null;
    }
    return null;
  });

  const [activeTournament, setActiveTournament] = useState(null);

  useEffect(() => {
    if (!selectedTeamId) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) setActiveTeamDetails(JSON.parse(cached).fullDetails || null);
  }, [selectedTeamId, cacheKey]);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = activeTeamDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  useEffect(() => {
    const saved = localStorage.getItem(`tr_active_tournament_for_team_${selectedTeamId}`);
    if (saved) setActiveTournament(JSON.parse(saved));
  }, [selectedTeamId]);

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
        console.error(err);
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
          setPlayoffs(pData.playoffs || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsTablesLoading(false);
      }
    };

    fetchGames();
    fetchTablesAndPlayoffs();
    setExpandedTeams({});
  }, [activeTournament]);

  // УМНЫЙ ФОНОВЫЙ ПАКЕТНЫЙ ЗАПРОС: Грузим все три этапа параллельно один раз при активации таба
  useEffect(() => {
    if (!activeTournament?.division_id || activeTab !== 'stats') return;

    const fetchAllStatsUpfront = async () => {
      setIsStatsLoading(true);
      try {
        const headers = getAuthHeaders();
        const baseUrl = `${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/stats`;

        // Параллельный запуск трех независимых потоков данных в фоне
        const [allRes, regularRes, playoffRes] = await Promise.all([
          fetch(`${baseUrl}?stageType=all`, { headers }),
          fetch(`${baseUrl}?stageType=regular`, { headers }),
          fetch(`${baseUrl}?stageType=playoff`, { headers })
        ]);

        const [allData, regularData, playoffData] = await Promise.all([
          allRes.ok ? allRes.json() : { skaters: [], goalies: [] },
          regularRes.ok ? regularRes.json() : { skaters: [], goalies: [] },
          playoffRes.ok ? playoffRes.json() : { skaters: [], goalies: [] }
        ]);

        // Консолидируем всё в единое клиентское хранилище памяти
        setStatsData({
          all: { skaters: allData.skaters || [], goalies: allData.goalies || [] },
          regular: { skaters: regularData.skaters || [], goalies: regularData.goalies || [] },
          playoff: { skaters: playoffData.skaters || [], goalies: playoffData.goalies || [] }
        });

      } catch (err) {
        console.error("Критическая ошибка пакетной предзагрузки топов статистики:", err);
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchAllStatsUpfront();
  }, [activeTournament, activeTab]); // Исключили statsStageType! Теперь триггера на клики фильтра нет.

  const toggleTeamAccordion = (teamId) => {
    setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
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

  const sortedBrackets = React.useMemo(() => {
    const bracketsMap = playoffs.reduce((acc, curr) => {
      if (!acc[curr.bracket_id]) {
        acc[curr.bracket_id] = { id: curr.bracket_id, name: curr.bracket_name, is_main: curr.is_main, matchups: [] };
      }
      if (curr.matchup_id) acc[curr.bracket_id].matchups.push(curr);
      return acc;
    }, {});
    return Object.values(bracketsMap).sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0));
  }, [playoffs]);

  // Выбираем срез данных из памяти на основе активного локального стейта мгновенно
  const currentSkaters = statsData[statsStageType]?.skaters || [];
  const currentGoalies = statsData[statsStageType]?.goalies || [];

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
            <FadeIn key={activeTab} duration={300}>
              
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
                    
                    <TournamentTable 
                      standings={standings} 
                      expandedTeams={expandedTeams} 
                      onToggleTeam={toggleTeamAccordion} 
                    />

                    <div className="flex flex-col gap-5 mt-2">
                      <div className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-content-main pl-2">
                        Плей-офф
                      </div>

                      {playoffs.length === 0 ? (
                        <div className="text-center py-8 text-xs font-bold text-content-subtle uppercase tracking-wider bg-surface-base rounded-2xl border border-surface-border">
                          Матчи плей-офф еще не сформированы
                        </div>
                      ) : (
                        <div className="flex flex-col gap-6">
                          {sortedBrackets.map((bracket, index) => (
                            <div key={bracket.id} className={clsx("flex flex-col gap-4 w-full", index > 0 && "mt-6 pt-6 border-t border-surface-border")}>
                              {!bracket.is_main && (
                                <div className="text-left text-[11px] font-black uppercase tracking-[0.12em] text-content-muted pl-1 opacity-90">
                                  {bracket.name}
                                </div>
                              )}
                              
                              <TournamentPlayoff 
                                bracket={bracket}
                                games={games}
                                hasTeamColor={hasTeamColor}
                                activeBrandColor={activeBrandColor}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )
              )}

              {/* ВКЛАДКА: СТАТИСТИКА И ТОПЫ */}
              {activeTab === 'stats' && (
                isStatsLoading ? <PageLoader /> : (
                  <TournamentStat 
                    skaters={currentSkaters}
                    goalies={currentGoalies}
                    stageType={statsStageType}
                    onStageTypeChange={setStatsStageType}
                    hasTeamColor={hasTeamColor}
                    activeBrandColor={activeBrandColor}
                  />
                )
              )}
            </FadeIn>
          )}
        </div>
      </div>
    </FadeIn>
  );
}