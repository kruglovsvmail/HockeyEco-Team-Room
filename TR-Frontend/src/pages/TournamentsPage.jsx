// TournamentsPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { FadeIn } from '../ui/FadeIn';
import { Icon } from '../ui/Icon';
import { TournamentPageHeader, TOURNAMENT_CARD_HEIGHT, TOURNAMENT_CARD_HEIGHT_COLLAPSED } from '../components/Tournaments/TournamentPageHeader';
import { getAuthHeaders } from '../utils/helpers';
import { PageLoader } from '../ui/Loader';
import { TournamentMatches } from '../components/Tournaments/TournamentMatches';
import { TournamentTable } from '../components/Tournaments/TournamentTable';
import { TournamentPlayoff } from '../components/Tournaments/TournamentPlayoff';
import { TournamentStat } from '../components/Tournaments/TournamentStat';
import { TournamentNominations } from '../components/Tournaments/TournamentNominations';
import { TournamentOverview } from '../components/Tournaments/TournamentOverview';
import { TournamentReserveGoalies } from '../components/Tournaments/TournamentReserveGoalies';
import { usePageVisit } from '../hooks/usePageVisit';

const TOURNAMENT_TABS = [
  { id: 'matches', label: 'Матчи' },
  { id: 'tables', label: 'Таблицы' },
  { id: 'stats', label: 'Статистика' }
];

// Вкладки по данным дивизиона: номинации — если лига их завела (в карточке топ-7, отсюда
// и название), резервные вратари — если механика включена и список не пуст
const NOMINATIONS_TAB = { id: 'nominations', label: 'ТОП-7' };
const RESERVE_TAB = { id: 'reserve', label: 'Рез. вратари' };
const OVERVIEW_TAB = { id: 'overview', label: 'О дивизионе' };

// Шапка схлопывается почти сразу, как ленту тронули: между шапкой и лентой зазор всего
// 16px, и при более позднем пороге лента (а с ней липкая полоса туров) успевала заехать
// под ещё развёрнутую шапку. Раскрывается у самого верха; зазор между порогами — чтобы
// на границе она не мигала.
const COLLAPSE_AT = 10;
const EXPAND_AT = 2;

const EMPTY_TRACKING = { plusMinus: false, shots: false };

export function TournamentsPage() {
  const { selectedTeam, teams, openRightPanel, openPanel100, registerHeaderMenu } = useOutletContext();
  const selectedTeamId = selectedTeam?.id;

  usePageVisit('tournaments');

  const [activeTab, setActiveTab] = useState('matches');
  const [games, setGames] = useState([]);
  const [isGamesLoading, setIsGamesLoading] = useState(false);

  const [standings, setStandings] = useState([]);
  const [playoffs, setPlayoffs] = useState([]);
  const [isTablesLoading, setIsTablesLoading] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState({});

  // Монолитный стэйт хранения ВСЕЙ хоккейной статистики (загружается один раз полностью).
  // tracking — что лига ведёт на стадии (+/-, броски): чего не ведёт, того не показываем
  const [statsData, setStatsData] = useState({
    all: { skaters: [], goalies: [], tracking: EMPTY_TRACKING },
    regular: { skaters: [], goalies: [], tracking: EMPTY_TRACKING },
    playoff: { skaters: [], goalies: [], tracking: EMPTY_TRACKING }
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsStageType, setStatsStageType] = useState('all'); // 'all' / 'regular' / 'playoff'

  const [nominations, setNominations] = useState([]);
  const [isNominationsLoading, setIsNominationsLoading] = useState(false);

  // «О дивизионе»: описание и итоговые цифры. Заодно приносит признак резервных
  // вратарей, от которого зависит их вкладка, поэтому грузится сразу с турниром
  const [overview, setOverview] = useState(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);

  const [reserveGoalies, setReserveGoalies] = useState([]);
  const [isReserveLoading, setIsReserveLoading] = useState(false);

  const [activeTournament, setActiveTournament] = useState(null);

  // Схлопывание шапки при прокрутке. Шапка лежит поверх ленты, а отступ под неё —
  // высота развёрнутой карточки плюс полоса вкладок (её меряем, а не угадываем), так что
  // при схлопывании лента не дёргается, а заезжает под шапку.
  const tabsRef = useRef(null);
  const scrollRef = useRef(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [tabsHeight, setTabsHeight] = useState(68);
  // Развёрнутая карточка выше, когда название лиги длинное (до трёх строк) — её высоту
  // сообщает сама шапка
  const [cardHeight, setCardHeight] = useState(TOURNAMENT_CARD_HEIGHT);

  const handleScroll = useCallback((e) => {
    const top = e.currentTarget.scrollTop;
    setIsHeaderCollapsed(prev => (prev ? top > EXPAND_AT : top > COLLAPSE_AT));
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setTabsHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Командного цвета в разделе нет: он показывает любую лигу, а не выбранную команду.
  // Акцент — личный цвет из Настроек (или заводской), командную подмену --color-brand
  // на этом маршруте снимает TeamLayout, поэтому цвет вниз не передаём.

  // Открыть панель выбора прямо в эффекте восстановления нельзя: её обработчик объявлен
  // ниже по файлу. Поэтому отмечаем намерение флагом, а открывает отдельный эффект.
  const [needsPicker, setNeedsPicker] = useState(false);

  // Ключ теперь общий, без команды в имени: раздел стал информационным и от выбранной
  // команды не зависит. Старый ключ читаем как запасной, чтобы у тех, кто уже смотрел
  // турнир до этой переделки, выбор не сбросился.
  useEffect(() => {
    const saved = localStorage.getItem('tr_active_tournament')
      || (selectedTeamId ? localStorage.getItem(`tr_active_tournament_for_team_${selectedTeamId}`) : null);

    if (saved) {
      setActiveTournament(JSON.parse(saved));
    } else {
      // Выбирать нечего — сразу открываем панель выбора, иначе человек упирается
      // в пустой экран и должен догадаться нажать на заголовок
      setNeedsPicker(true);
    }
    // Восстанавливаем один раз при входе в раздел: дальше выбор меняет только сам
    // пользователь, и перечитывать хранилище на смену команды больше незачем
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Номинации грузим сразу с турниром, а не по открытию вкладки: от них зависит,
  // показывать ли саму вкладку. Ответ прошлого турнира, пришедший после смены
  // выбора, отбрасываем — иначе вкладка показала бы чужие номинации.
  useEffect(() => {
    if (!activeTournament?.division_id) {
      setNominations([]);
      return;
    }

    let isStale = false;
    setIsNominationsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/nominations`, {
      headers: getAuthHeaders()
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!isStale) setNominations(data?.nominations || []); })
      .catch(err => { if (!isStale) { console.error(err); setNominations([]); } })
      .finally(() => { if (!isStale) setIsNominationsLoading(false); });

    return () => { isStale = true; };
  }, [activeTournament]);

  useEffect(() => {
    if (!activeTournament?.division_id) {
      setOverview(null);
      return;
    }

    let isStale = false;
    // Список вратарей прошлого турнира не должен мелькнуть до загрузки нового
    setReserveGoalies([]);
    setIsOverviewLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/overview`, {
      headers: getAuthHeaders()
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!isStale) setOverview(data?.overview || null); })
      .catch(err => { if (!isStale) { console.error(err); setOverview(null); } })
      .finally(() => { if (!isStale) setIsOverviewLoading(false); });

    return () => { isStale = true; };
  }, [activeTournament]);

  const hasReserveGoalies = !!overview?.hasReserveGoalies;

  // Список резервных вратарей — только когда вкладку открыли: в нём телефоны
  // и статистика выходов, и тянуть его на каждый выбор турнира незачем
  useEffect(() => {
    if (!activeTournament?.division_id || activeTab !== 'reserve' || !hasReserveGoalies) return;

    let isStale = false;
    setIsReserveLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/reserve-goalies`, {
      headers: getAuthHeaders()
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!isStale) setReserveGoalies(data?.goalies || []); })
      .catch(err => { if (!isStale) { console.error(err); setReserveGoalies([]); } })
      .finally(() => { if (!isStale) setIsReserveLoading(false); });

    return () => { isStale = true; };
  }, [activeTournament, activeTab, hasReserveGoalies]);

  const tabs = React.useMemo(() => [
    ...TOURNAMENT_TABS,
    ...(nominations.length > 0 ? [NOMINATIONS_TAB] : []),
    ...(hasReserveGoalies ? [RESERVE_TAB] : []),
    OVERVIEW_TAB
  ], [nominations.length, hasReserveGoalies]);

  // В новом турнире такой вкладки нет, а открыта была она — возвращаемся к матчам
  useEffect(() => {
    if (activeTab === 'nominations' && !isNominationsLoading && nominations.length === 0) {
      setActiveTab('matches');
    }
    if (activeTab === 'reserve' && !isOverviewLoading && !hasReserveGoalies) {
      setActiveTab('matches');
    }
  }, [activeTab, isNominationsLoading, nominations.length, isOverviewLoading, hasReserveGoalies]);

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

        const toStage = (data) => ({
          skaters: data.skaters || [],
          goalies: data.goalies || [],
          tracking: data.tracking || EMPTY_TRACKING
        });

        // Консолидируем всё в единое клиентское хранилище памяти
        setStatsData({
          all: toStage(allData),
          regular: toStage(regularData),
          playoff: toStage(playoffData)
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
    localStorage.setItem('tr_active_tournament', JSON.stringify(tournament));
  }, []);

  const handleOpenSelector = useCallback(() => {
    openRightPanel('tournamentSelector', {
      teams: teams || [],
      activeDivisionId: activeTournament?.division_id,
      activeTournament,
      onSelect: handleTournamentSelect
    }, 'Выбор турнира');
  }, [teams, activeTournament, handleTournamentSelect, openRightPanel]);

  useEffect(() => {
    if (!needsPicker) return;
    handleOpenSelector();
    setNeedsPicker(false);
  }, [needsPicker, handleOpenSelector]);

  // Дубль выбора турнира кнопкой справа в системной шапке. Карточка турнира сверху
  // кликабельна и остаётся такой, но выглядит она заголовком, и нажать на неё
  // догадывается не всякий — здесь выбор назван явно.
  // Обработчик держим в ref: handleOpenSelector пересобирается при каждой смене турнира,
  // и без ref кнопка перерегистрировалась бы на ровном месте.
  const openSelectorRef = useRef(null);
  openSelectorRef.current = handleOpenSelector;

  useEffect(() => {
    if (!registerHeaderMenu) return;
    registerHeaderMenu(() => openSelectorRef.current?.(), { icon: 'swap', label: 'Выбрать турнир' });
    return () => registerHeaderMenu(null);
  }, [registerHeaderMenu]);

  const handleGameClick = (game) => {
    openPanel100('tournamentGameDetails', {
      game,
      myTeamId: selectedTeamId,
    }, 'Матч');
  };

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
  const currentTracking = statsData[statsStageType]?.tracking || EMPTY_TRACKING;

  return (
    <FadeIn className="h-full relative overflow-hidden flex flex-col">
      <TournamentPageHeader
        activeTournament={activeTournament}
        onClick={handleOpenSelector}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={isHeaderCollapsed}
        tabsRef={tabsRef}
        onExpandedHeightChange={setCardHeight}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-hide relative z-10 snap-y snap-proximity"
      >
        <div className="shrink-0" style={{ height: cardHeight + tabsHeight + 16 }} />

        <div className="w-full px-3 pb-40">
          {!activeTournament ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <div className="w-20 h-20 rounded-full bg-surface-level2 flex items-center justify-center mb-4">
                <Icon name="registry" className="w-10 h-10 text-content-subtle" />
              </div>
              <p className="text-[14px] font-black uppercase tracking-widest text-content-muted text-center">
                Нажмите сверху, чтобы выбрать турнир
              </p>
            </div>
          ) : (
            <FadeIn key={activeTab} duration={300}>
              
              {/* ВКЛАДКА: МАТЧИ — по одному туру / стадии, открывается на текущем.
                  headerOffset — низ схлопнутой шапки: под ним прилипает переключатель
                  туров, и к этой точке подкручивается лента при смене тура */}
              {activeTab === 'matches' && (
                isGamesLoading ? <PageLoader /> : (
                  <TournamentMatches
                    games={games}
                    onGameClick={handleGameClick}
                    scrollContainerRef={scrollRef}
                    headerOffset={TOURNAMENT_CARD_HEIGHT_COLLAPSED + tabsHeight}
                  />
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

                    <div className="flex flex-col gap-2 mt-2">
                      <div className="text-center text-[14px] font-bold uppercase tracking-[0.1em] text-content-muted">
                        Плей-офф
                      </div>

                      {playoffs.length === 0 ? (
                        <div className="text-center py-8 text-[12px] italic font-semibold  text-content-subtle uppercase tracking-wider bg-surface-base rounded-2xl border border-surface-border">
                          Матчи плей-офф еще не сформированы
                        </div>
                      ) : (
                        <div className="flex flex-col gap-6">
                          {sortedBrackets.map((bracket, index) => (
                            <div key={bracket.id} className={clsx("flex flex-col gap-4 w-full", index > 0 && "mt-6 pt-6 border-t border-surface-border")}>
                              {!bracket.is_main && (
                                <div className="text-left text-[10px] font-black uppercase tracking-[0.12em] text-content-muted pl-1 opacity-90">
                                  {bracket.name}
                                </div>
                              )}
                              
                              <TournamentPlayoff
                                bracket={bracket}
                                games={games}
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
                    tracking={currentTracking}
                    divisionId={activeTournament?.division_id}
                    openRightPanel={openRightPanel}
                  />
                )
              )}

              {/* ВКЛАДКА: ТОП-7 (НОМИНАЦИИ) */}
              {activeTab === 'nominations' && (
                isNominationsLoading && nominations.length === 0 ? <PageLoader /> : (
                  <TournamentNominations
                    nominations={nominations}
                    openRightPanel={openRightPanel}
                  />
                )
              )}

              {/* ВКЛАДКА: РЕЗЕРВНЫЕ ВРАТАРИ */}
              {activeTab === 'reserve' && (
                isReserveLoading ? <PageLoader /> : (
                  <TournamentReserveGoalies
                    goalies={reserveGoalies}
                    openRightPanel={openRightPanel}
                  />
                )
              )}

              {/* ВКЛАДКА: О ДИВИЗИОНЕ */}
              {activeTab === 'overview' && (
                isOverviewLoading && !overview ? <PageLoader /> : (
                  overview ? (
                    <TournamentOverview overview={overview} />
                  ) : (
                    <div className="text-center py-12 text-[14px] font-bold text-content-subtle uppercase tracking-wider">
                      Не удалось загрузить сведения о дивизионе
                    </div>
                  )
                )
              )}
            </FadeIn>
          )}
        </div>
      </div>
    </FadeIn>
  );
}
