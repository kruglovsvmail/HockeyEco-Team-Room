import React, { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Outlet, useNavigate, useLocation, matchPath } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

import { getToken, removeToken, getAuthHeaders } from './utils/helpers';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Icon } from './ui/Icon';
import { PageLoader } from './ui/Loader';
import { FadeIn } from './ui/FadeIn';

import { UserDetails } from './components/MyTeam/UserDetails';

import { EventPage } from './pages/EventPage';
import { computeEventEditAccess } from './components/EventDetails/computeEventEditAccess';
import { useAccess } from './hooks/useAccess';

const EditEventPanel = lazy(() =>
  import('./components/EventDetails/EditEventPanel').then(m => ({ default: m.EditEventPanel }))
);

import { ArenaSelector } from './components/Manager/ArenaSelector';
import { OpponentSelectorFriendly } from './components/Manager/OpponentSelectorFriendly';
import { ExternalTournamentSelector } from './components/Manager/ExternalTournamentSelector';
import { ExternalOpponentSelector } from './components/Manager/ExternalOpponentSelector';

import { OpponentHandbookPanel } from './components/Manager/OpponentHandbookPanel';
import { TournamentHandbookPanel } from './components/Manager/TournamentHandbookPanel';


import { EditTeamProfilePanel } from './components/MyTeam/EditTeamProfilePanel';

import { TournamentListPanel } from './components/Tournaments/TournamentListPanel';

import { TournamentGamePanel } from './components/Tournaments/TournamentGamePanel';

import { CreateApplicationPanel } from './components/Manager/Season/CreateApplicationPanel';
import { PlayerDocsModal } from './components/Manager/Season/PlayerDocsModal';
import { SeasonRostersDetailsPage } from './pages/SeasonRostersDetailsPage';

import { PlayerProfilePanel } from './components/Player/PlayerProfilePanel';
import { TeamStatsPanel } from './components/Player/TeamStatsPanel';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

export function TeamLayout() {
  return <TeamLayoutContent />;
}

function TeamLayoutContent() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [rightPanel, setRightPanel] = useState({ isOpen: false, type: null, data: null, title: '', previous: null });
  const [panel100, setPanel100] = useState({ isOpen: false, type: null, data: null, title: '' });
  // Направление анимации переключения содержимого rightPanel: 'forward' (pushRightPanel) | 'back' (backRightPanel)
  const [rightPanelNavDirection, setRightPanelNavDirection] = useState('forward');

  const [isPanelReady, setIsPanelReady] = useState(false);
  const [isPanel100Ready, setIsPanel100Ready] = useState(false);

  // Действие правой кнопки-карандаша в системной шапке (Header).
  // Текущая страница регистрирует свой обработчик с уже проверенными правами;
  // сам обработчик держим в ref, в состоянии — только флаг видимости кнопки.
  const [showHeaderEdit, setShowHeaderEdit] = useState(false);
  const headerEditHandlerRef = useRef(null);
  const registerHeaderEdit = useCallback((handler) => {
    headerEditHandlerRef.current = handler || null;
    setShowHeaderEdit(!!handler);
  }, []);

  useEffect(() => {
    const handleMatrixRefresh = (e) => {
      const freshUser = e.detail;
      if (freshUser) {
        setUser(freshUser);
        localStorage.setItem('teampwa_cached_user', JSON.stringify(freshUser));
        localStorage.setItem('teampwa_user', JSON.stringify(freshUser));

        if (freshUser.teams) {
          setTeams(freshUser.teams);
          setSelectedTeam(prev => {
            if (!prev) return freshUser.teams[0] || null;
            const updated = freshUser.teams.find(t => String(t.id) === String(prev.id));
            return updated ? { ...prev, ...updated } : prev;
          });
        }
      }
    };

    window.addEventListener('pwa_auth_matrix_refresh', handleMatrixRefresh);
    return () => window.removeEventListener('pwa_auth_matrix_refresh', handleMatrixRefresh);
  }, []);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new Event('app-global-refresh'));
      }
    };

    window.addEventListener('focus', handleGlobalRefresh);
    document.addEventListener('visibilitychange', handleGlobalRefresh);

    return () => {
      window.removeEventListener('focus', handleGlobalRefresh);
      document.removeEventListener('visibilitychange', handleGlobalRefresh);
    };
  }, []);

  useEffect(() => {
    if (rightPanel.isOpen) {
      setIsPanelReady(false);
      const timer = setTimeout(() => setIsPanelReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setIsPanelReady(false);
    }
  }, [rightPanel.isOpen]);

  useEffect(() => {
    if (panel100.isOpen) {
      setIsPanel100Ready(false);
      const timer = setTimeout(() => setIsPanel100Ready(true), 350);
      return () => clearTimeout(timer);
    } else {
      setIsPanel100Ready(false);
    }
  }, [panel100.isOpen]);

  const navigate = useNavigate();
  const location = useLocation();

  const eventMatch = useMemo(
    () => matchPath('/event/:eventType/:eventId', location.pathname),
    [location.pathname]
  );

  const applicationMatch = useMemo(
    () => matchPath('/application/:appId', location.pathname),
    [location.pathname]
  );

  const basePath = eventMatch ? '/' : applicationMatch ? '/manager/season-rosters' : location.pathname;
  useEffect(() => {
    closeRightPanel();
    setPanel100({ isOpen: false, type: null, data: null, title: '' });
  }, [basePath]);

  const eventFromState = location.state?.event || null;
  const [eventStorageVersion, setEventStorageVersion] = useState(0);
  const eventForOverlay = useMemo(() => {
    if (!eventMatch) return null;
    if (eventFromState) return eventFromState;
    const { eventType, eventId } = eventMatch.params;
    const cached = sessionStorage.getItem(`tr_event_${eventType}_${eventId}`);
    return cached ? JSON.parse(cached) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventMatch, eventFromState, eventStorageVersion]);

  useEffect(() => {
    if (eventMatch && eventFromState) {
      const { eventType, eventId } = eventMatch.params;
      sessionStorage.setItem(`tr_event_${eventType}_${eventId}`, JSON.stringify(eventFromState));
    }
  }, [eventMatch, eventFromState]);

  useEffect(() => {
    if (eventMatch && !eventForOverlay) {
      navigate('/', { replace: true });
    }
  }, [eventMatch, eventForOverlay, navigate]);

  const handleCloseEvent = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleCloseApplication = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Патч события из EditEventPanel.
  // ВАЖНО: history.state.event сохраняется браузером между рефрешами, поэтому
  // только sessionStorage недостаточно — после refresh useEffect перетрёт его
  // устаревшим eventFromState. Поэтому одновременно реплейсим history.state.
  const handleEventUpdate = useCallback((patch) => {
    if (!eventMatch) return;
    const { eventType, eventId } = eventMatch.params;
    const key = `tr_event_${eventType}_${eventId}`;
    const cached = sessionStorage.getItem(key);
    const base = cached ? JSON.parse(cached) : (location.state?.event || null);
    if (!base) return;
    const updated = { ...base, ...patch };
    sessionStorage.setItem(key, JSON.stringify(updated));
    setEventStorageVersion(v => v + 1);
    // Синхронизируем location.state с патчем — иначе после рефреша история отдаст устаревший объект
    navigate(location.pathname, { replace: true, state: { event: updated } });
  }, [eventMatch, location.pathname, location.state, navigate]);

  // Доступ к редактированию текущего события — для отображения карандашика в шапке
  const { checkAccess: checkAccessForHeader } = useAccess(user, selectedTeam);
  const headerEventAccess = useMemo(() => {
    if (!eventForOverlay) return { canSee: false };
    return computeEventEditAccess(eventForOverlay, user, selectedTeam, checkAccessForHeader);
  }, [eventForOverlay, user, selectedTeam, checkAccessForHeader]);

  const openEventEditPanel = useCallback(() => {
    if (!eventForOverlay) return;
    openRightPanel('eventEdit', {
      event: eventForOverlay,
      user,
      selectedTeam,
      onEventUpdate: handleEventUpdate,
      // После удаления — возвращаем пользователя из overlay-события в календарь
      onEventDeleted: handleCloseEvent,
    }, 'Редактирование');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventForOverlay, user, selectedTeam, handleEventUpdate, handleCloseEvent]);

  useEffect(() => {
    const fetchMe = async () => {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return navigate('/login');
      }

      const cachedUserData = localStorage.getItem('teampwa_cached_user') || localStorage.getItem('teampwa_user');
      if (cachedUserData) {
        const parsedUser = JSON.parse(cachedUserData);
        setUser(parsedUser);

        const userTeams = parsedUser.teams || [];
        setTeams(userTeams);

        const savedTeamId = localStorage.getItem('teampwa_selected_team');
        let currentTeam = userTeams.find(t => t.id == savedTeamId) || userTeams[0];
        setSelectedTeam(currentTeam);
        setIsLoading(false);
      }

      if (!navigator.onLine) {
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
          headers: getAuthHeaders(),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('Not authorized');

        const data = await res.json();
        setUser(data.user);

        localStorage.setItem('teampwa_cached_user', JSON.stringify(data.user));
        localStorage.setItem('teampwa_user', JSON.stringify(data.user));

        const userTeams = data.user.teams || [];
        setTeams(userTeams);

        const savedTeamId = localStorage.getItem('teampwa_selected_team');
        let currentTeam = userTeams.find(t => t.id == savedTeamId);

        if (!currentTeam && userTeams.length > 0) {
          currentTeam = userTeams[0];
        }

        setSelectedTeam(currentTeam);
      } catch (err) {
        clearTimeout(timeoutId);
        if (!localStorage.getItem('teampwa_cached_user') && !localStorage.getItem('teampwa_user')) {
          removeToken();
          navigate('/login');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, [navigate]);

  const handleTeamChange = (team) => {
    setSelectedTeam(team);
    localStorage.setItem('teampwa_selected_team', team.id.toString());
  };

  const openRightPanel = (type, data, title = 'Детали') => {
    const extendedData = {
      ...data,
      onSelect: (selectedItem) => {
        if (data && data.onSelect) data.onSelect(selectedItem);
        closeRightPanel();
      }
    };
    setRightPanelNavDirection('forward');
    setRightPanel({ isOpen: true, type, data: extendedData, title, previous: null });
  };

  // Открывает новую панель поверх текущей внутри того же слота, запоминая текущую
  // как «предыдущую» — backRightPanel() вернётся к ней вместо полного закрытия.
  const pushRightPanel = (type, data, title = 'Детали') => {
    const extendedData = {
      ...data,
      onSelect: (selectedItem) => {
        if (data && data.onSelect) data.onSelect(selectedItem);
        closeRightPanel();
      }
    };
    setRightPanelNavDirection('forward');
    setRightPanel(prev => ({
      isOpen: true,
      type,
      data: extendedData,
      title,
      previous: prev.isOpen ? { type: prev.type, data: prev.data, title: prev.title } : null
    }));
  };

  // Кнопка «назад» в шапке панели: возвращает к предыдущей (если она есть через pushRightPanel),
  // иначе закрывает панель целиком.
  const backRightPanel = () => {
    setRightPanelNavDirection('back');
    setRightPanel(prev => {
      if (!prev.previous) return { isOpen: false, type: null, data: null, title: '', previous: null };
      return { isOpen: true, type: prev.previous.type, data: prev.previous.data, title: prev.previous.title, previous: null };
    });
  };

  const closeRightPanel = () => setRightPanel({ isOpen: false, type: null, data: null, title: '', previous: null });

  const openPanel100 = (type, data, title = 'Детали') => {
    window.history.pushState({ panel: 'panel100' }, '');
    setPanel100({ isOpen: true, type, data, title });
  };

  const closePanel100 = () => {
    window.history.back();
  };

  useEffect(() => {
    const handlePopState = () => {
      if (panel100.isOpen) {
        setPanel100(prev => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [panel100.isOpen]);

  if (isLoading) {
    return <PageLoader />;
  }

  // Переопределение --color-brand на командный цвет на корневом уровне layout'а — без этого
  // страницы, у которых нет собственного локального переопределения (или оно недоступно, например
  // из-за отсутствия кэша команды), а также правая панель и оверлеи (playerDocs, eventEdit и т.д.,
  // рендерящиеся вне поддерева Outlet) остаются на глобальном цвете бренда вместо цвета команды.
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!selectedTeam?.color_home_1;

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden relative"
      style={hasTeamColor ? { '--color-brand': selectedTeam.color_home_1 } : {}}
    >

      {/* Сайдбар: выезжает слева внутри 1000px-контейнера */}
      <aside
        className={clsx(
          "absolute inset-y-0 left-0 z-40 h-full w-[80%] bg-surface-level1 flex-shrink-0",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ willChange: 'transform' }}
      >
        <Sidebar
          user={user}
          teams={teams}
          selectedTeam={selectedTeam}
          onTeamChange={handleTeamChange}
          onClose={() => setIsSidebarOpen(false)}
        />
      </aside>

      {/* Основной контент — уезжает влево синхронно с появлением оверлея события */}
      <div className={clsx(
        "flex flex-col flex-1 w-full h-full min-w-0 z-30 relative",
        "transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
        isSidebarOpen ? "translate-x-[80%] shadow-2xl" : "",
        rightPanel.isOpen ? "-translate-x-[80%]" : "",
        (eventMatch && eventForOverlay) || applicationMatch ? "-translate-x-full" : ""
      )}>
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          user={user}
          teams={teams}
          selectedTeam={selectedTeam}
          onTeamUpdated={(updatedTeam) => {
            setSelectedTeam(prev => ({ ...prev, ...updatedTeam }));
            setTeams(prev => prev.map(t => t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t));
          }}
          showEditButton={showHeaderEdit}
          onEditClick={() => headerEditHandlerRef.current?.()}
        />

        {isSidebarOpen && <div className="absolute inset-0 z-50 bg-transparent" onClick={() => setIsSidebarOpen(false)} />}
        {rightPanel.isOpen && <div className="absolute inset-0 z-50 bg-transparent cursor-pointer" onClick={closeRightPanel} />}

        <main
          className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide relative overscroll-none"
          style={{ paddingTop: '60px' }}
        >
          <Outlet context={{ user, teams, selectedTeam, handleTeamChange, openRightPanel, openPanel100, registerHeaderEdit, onTeamUpdated: (updatedTeam) => {
            setSelectedTeam(prev => ({ ...prev, ...updatedTeam }));
            setTeams(prev => prev.map(t => t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t));
          }}} />
        </main>
      </div>

      {/* Правая панель: выезжает справа внутри 1000px-контейнера.
          eventEdit, playerDocs, playerProfile и userDetails подняты над оверлеями EventPage/SeasonRostersDetailsPage (z-100) и panel100 (z-60). */}
      <div className={clsx(
        "absolute top-0 right-0 w-[80%] h-full bg-surface-level2 border-l border-white/10 shadow-[-15px_0_30px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden flex-shrink-0",
        "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        (rightPanel.type === 'eventEdit' || rightPanel.type === 'playerDocs' || rightPanel.type === 'playerProfile' || rightPanel.type === 'userDetails' || rightPanel.type === 'teamStats') ? "z-[110]" : "z-[40]",
        rightPanel.isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="w-full h-full flex flex-col overflow-hidden shrink-0">
          {rightPanel.isOpen && (
            <>
              <div className="flex items-center justify-between shadow-md p-4 h-[60px] shrink-0 z-[90]">
                <button onClick={backRightPanel} className="p-1.5 ml-1 bg-white/10 rounded-xl text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center">
                  <Icon name="chevron_left" className="w-6 h-6 text-content-main" />
                </button>
                <h3 className="text-[14px] font-bold text-content-main uppercase tracking-wider text-right truncate pl-4">
                  {rightPanel.title}
                </h3>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {!isPanelReady ? (
                  <PageLoader />
                ) : (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={rightPanel.type}
                      initial={{ x: rightPanelNavDirection === 'back' ? '-100%' : '100%', opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: rightPanelNavDirection === 'back' ? '100%' : '-100%', opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                      className="absolute inset-0 h-full w-full"
                    >
                    {rightPanel.type === 'userDetails' && (
                      <UserDetails data={rightPanel.data} openRightPanel={openRightPanel} pushRightPanel={pushRightPanel} />
                    )}
                    {rightPanel.type === 'arenaSelector' && (
                      <ArenaSelector data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'opponentSelectorFriendly' && (
                      <OpponentSelectorFriendly data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'externalTournamentSelector' && (
                      <ExternalTournamentSelector data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'externalOpponentSelector' && (
                      <ExternalOpponentSelector data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'opponentForm' && (
                      <OpponentHandbookPanel data={rightPanel.data} onClose={closeRightPanel} />
                    )}
                    {rightPanel.type === 'tournamentForm' && (
                      <TournamentHandbookPanel data={rightPanel.data} onClose={closeRightPanel} />
                    )}
                    {rightPanel.type === 'editTeamProfile' && (
                      <EditTeamProfilePanel {...rightPanel.data} onClose={closeRightPanel} />
                    )}
                    {rightPanel.type === 'tournamentSelector' && (
                      <TournamentListPanel {...rightPanel.data} />
                    )}
                    {rightPanel.type === 'tournamentGameDetails' && (
                      <TournamentGamePanel data={rightPanel.data} openRightPanel={openRightPanel} />
                    )}
                    {rightPanel.type === 'createApplication' && (
                      <CreateApplicationPanel data={rightPanel.data} onClose={closeRightPanel} />
                    )}
                    {rightPanel.type === 'playerDocs' && (
                      <PlayerDocsModal data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'playerProfile' && (
                      <PlayerProfilePanel data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'teamStats' && (
                      <TeamStatsPanel data={rightPanel.data} />
                    )}
                    {rightPanel.type === 'eventEdit' && (
                      <Suspense fallback={<PageLoader />}>
                        <EditEventPanel data={rightPanel.data} onClose={closeRightPanel} />
                      </Suspense>
                    )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Overlay деталей события. Сдвигается влево при открытой панели редактирования или профиля игрока. */}
      <AnimatePresence>
        {eventMatch && eventForOverlay && (
          <motion.div
            key="event-overlay"
            className="absolute inset-0 z-[100] overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: rightPanel.isOpen && (rightPanel.type === 'eventEdit' || rightPanel.type === 'playerProfile' || rightPanel.type === 'userDetails' || rightPanel.type === 'teamStats') ? '-80%' : 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="absolute top-0 bottom-0 right-full w-12 bg-gradient-to-l from-black/30 to-transparent pointer-events-none" />

            <EventPage
              eventType={eventMatch.params.eventType}
              event={eventForOverlay}
              user={user}
              selectedTeam={selectedTeam}
              onClose={handleCloseEvent}
              showEditButton={headerEventAccess.canSee}
              onEditClick={openEventEditPanel}
              openRightPanel={openRightPanel}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click-zone слева для закрытия панели редактирования/профиля игрока, когда поверх лежит EventPage, SeasonRostersDetailsPage или panel100.
          z-[105] — выше оверлея (z-100) и panel100 (z-60), но ниже самой панели (z-110). */}
      {rightPanel.isOpen && ((rightPanel.type === 'eventEdit' && eventForOverlay) || (rightPanel.type === 'playerDocs' && applicationMatch) || ((rightPanel.type === 'playerProfile' || rightPanel.type === 'userDetails' || rightPanel.type === 'teamStats') && (eventForOverlay || panel100.isOpen))) && (
        <div
          className="absolute top-0 bottom-0 left-0 w-[20%] z-[105] cursor-pointer"
          onClick={closeRightPanel}
        />
      )}

      {/* Overlay деталей заявки на сезон — тот же переход, что и у деталей события.
          Сдвигается влево при открытой панели документов (playerDocs), как EventPage при eventEdit. */}
      <AnimatePresence>
        {applicationMatch && (
          <motion.div
            key="application-overlay"
            className="absolute inset-0 z-[100] overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: rightPanel.isOpen && rightPanel.type === 'playerDocs' ? '-80%' : 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="absolute top-0 bottom-0 right-full w-12 bg-gradient-to-l from-black/30 to-transparent pointer-events-none" />

            <SeasonRostersDetailsPage
              appId={applicationMatch.params.appId}
              teamId={selectedTeam?.id}
              teamColor={selectedTeam?.color_home_1}
              onClose={handleCloseApplication}
              openRightPanel={openRightPanel}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* PANEL100. Сдвигается влево, когда поверх него открыт профиль игрока (playerProfile, z-110). */}
      <div className={clsx(
        "absolute inset-0 w-full h-full z-[60] bg-surface-level2 flex flex-col overflow-hidden",
        "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        panel100.isOpen
          ? (rightPanel.isOpen && (rightPanel.type === 'playerProfile' || rightPanel.type === 'teamStats') ? "-translate-x-[80%]" : "translate-x-0")
          : "translate-x-full"
      )}>
        <div className="flex items-center justify-between shadow-md px-4 h-[60px] shrink-0 z-[90] border-b border-surface-border">
          <button
            onClick={closePanel100}
            className="p-1.5 bg-white/10 rounded-xl text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center"
          >
            <Icon name="chevron_left" className="w-6 h-6 text-content-main" />
          </button>
          <h3 className="text-[14px] font-bold text-content-main uppercase tracking-wider text-right truncate pl-4">
            {panel100.title}
          </h3>
        </div>
        <div className="flex-1 overflow-hidden relative bg-surface-level2">
          {!isPanel100Ready ? (
            <PageLoader />
          ) : (
            <FadeIn className="h-full w-full bg-surface-level2">
              {panel100.type === 'tournamentGameDetails' && (
                <TournamentGamePanel data={panel100.data} openRightPanel={openRightPanel} />
              )}
            </FadeIn>
          )}
        </div>
      </div>

    </div>
  );
}
