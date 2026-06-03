import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
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

import { EventDashboard } from './components/EventDetails/EventDashboard';
import { UserDetails } from './components/MyTeam/UserDetails';
import { EventDetailsMatch } from './components/EventDetails/Match/EventDetailsMatch';
import { EventDetailsTraining } from './components/EventDetails/EventDetailsTraining';
import { EventDetailsMeeting } from './components/EventDetails/EventDetailsMeeting';

// ПОДКЛЮЧЕНИЕ НАПРАВЛЕННЫХ НА МЕНЕДЖМЕНТ ТУРНИРОВ СЕЛЕКТОРОВ ИЗ ПРАВОЙ ПАНЕЛИ
import { ArenaSelector } from './components/Manager/ArenaSelector';
import { OpponentSelectorFriendly } from './components/Manager/OpponentSelectorFriendly';
import { ExternalTournamentSelector } from './components/Manager/ExternalTournamentSelector';
import { ExternalOpponentSelector } from './components/Manager/ExternalOpponentSelector';

// ИСПРАВЛЕНО: Подключаем новые панели управления единым справочником
import { OpponentHandbookPanel } from './components/Manager/OpponentHandbookPanel';
import { TournamentHandbookPanel } from './components/Manager/TournamentHandbookPanel';

// Импортируем боковую панель управления профилем команды
import { EditTeamProfilePanel } from './components/MyTeam/EditTeamProfilePanel';

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

  const [rightPanel, setRightPanel] = useState({ isOpen: false, type: null, data: null, title: '' });
  const [fullPagePanel, setFullPagePanel] = useState({ isOpen: false, type: null, data: null, title: '' });

  // Локальное состояние готовности контента боковых панелей (устраняет Layout Thrashing при анимации)
  const [isPanelReady, setIsPanelReady] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('teampwa_sidebar_width');
    return saved ? parseFloat(saved) : 20; 
  });

  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = localStorage.getItem('teampwa_right_panel_width');
    return saved ? parseFloat(saved) : 25; 
  });

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // СЛУШАТЕЛЬ ОБНОВЛЕНИЯ МАТРИЦЫ ПРАВ ИЗ СЕТЕВОГО ИНТЕРЦЕПТОРА
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

  // Синхронизация жизненного цикла анимации скольжения панелей десктопа
  useEffect(() => {
    if (rightPanel.isOpen || fullPagePanel.isOpen) {
      setIsPanelReady(false);
      const timer = setTimeout(() => {
        setIsPanelReady(true);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setIsPanelReady(false);
    }
  }, [rightPanel.isOpen, fullPagePanel.isOpen]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const totalWidth = window.innerWidth;
      
      if (isDraggingSidebar) {
        let newWidth = (e.clientX / totalWidth) * 100;
        newWidth = Math.max(20, Math.min(newWidth, 50, 70 - rightPanelWidth));
        setSidebarWidth(newWidth);
      } else if (isDraggingRight) {
        let newWidth = ((totalWidth - e.clientX) / totalWidth) * 100;
        newWidth = Math.max(20, Math.min(newWidth, 50, 70 - sidebarWidth));
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingSidebar) {
        setIsDraggingSidebar(false);
        localStorage.setItem('teampwa_sidebar_width', sidebarWidth.toString());
      }
      if (isDraggingRight) {
        setIsDraggingRight(false);
        localStorage.setItem('teampwa_right_panel_width', rightPanelWidth.toString());
      }
    };

    if (isDraggingSidebar || isDraggingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDraggingSidebar, isDraggingRight, rightPanelWidth, sidebarWidth]);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    closeRightPanel();
    setFullPagePanel({ isOpen: false, type: null, data: null, title: '' });
  }, [location.pathname]);

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
    setRightPanel({ isOpen: true, type, data: extendedData, title });
  };
  
  const closeRightPanel = () => setRightPanel({ isOpen: false, type: null, data: null, title: '' });

  const openFullPage = (type, data, title = 'Детали') => {
    window.history.pushState({ panel: 'event_dashboard' }, '');
    setFullPagePanel({ isOpen: true, type, data, title });
  };

  const closeFullPageUi = () => {
    window.history.back();
  };

  useEffect(() => {
    const handlePopState = (e) => {
      if (fullPagePanel.isOpen) setFullPagePanel(prev => ({ ...prev, isOpen: false }));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fullPagePanel.isOpen]);

  if (isLoading) {
    return <PageLoader />;
  }

  let desktopEventTitle = fullPagePanel.title;
  if (fullPagePanel.data && fullPagePanel.data.event_date) {
    const eventDate = dayjs.utc(fullPagePanel.data.event_date).tz(fullPagePanel.data.arena_timezone || 'UTC');
    desktopEventTitle = (
      <span className="flex items-center gap-2 text-content-main justify-end">
        <span>{eventDate.format('D MMM YYYY')}</span>
        <span className="text-brand opacity-60">•</span>
        <span>{eventDate.format('HH:mm')}</span>
      </span>
    );
  }

  return (
    <div 
      className="flex w-full h-full overflow-hidden relative"
      style={{ '--sidebar-w': `${sidebarWidth}%`, '--right-w': `${rightPanelWidth}%` }}
    >
      <aside 
        className={clsx(
          "fixed inset-y-0 left-0 z-40 h-full bg-surface-level1 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex-shrink-0",
          "w-[80%] md:w-[var(--sidebar-w)] md:static md:translate-x-0 md:shadow-xl style-change-hardware",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )} 
        style={{ willChange: 'transform' }}
      >
        <Sidebar user={user} teams={teams} selectedTeam={selectedTeam} onTeamChange={handleTeamChange} onClose={() => setIsSidebarOpen(false)} />
      </aside>

      <div 
        className={clsx(
          "hidden md:block w-1.5 cursor-col-resize z-50 flex-shrink-0 transition-colors",
          isDraggingSidebar ? "bg-brand" : "bg-surface-border hover:bg-brand/50"
        )}
        onMouseDown={() => setIsDraggingSidebar(true)}
      />

      <div className={clsx(
        "flex flex-col flex-1 w-full h-full min-w-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] z-30 relative",
        isSidebarOpen ? "translate-x-[80%] shadow-2xl md:translate-x-0 md:shadow-none" : "",
        rightPanel.isOpen ? "-translate-x-[80%] md:translate-x-0" : "",
        fullPagePanel.isOpen ? "-translate-x-[30%] opacity-50 md:translate-x-0 md:opacity-100" : ""
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
        />

        {isSidebarOpen && <div className="absolute inset-0 z-50 md:hidden bg-transparent" onClick={() => setIsSidebarOpen(false)} />}
        {rightPanel.isOpen && <div className="absolute inset-0 z-50 bg-transparent cursor-pointer md:hidden" onClick={closeRightPanel} />}

        <main 
          className="flex-1 overflow-y-auto overflow-x-hidden relative overscroll-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ paddingTop: '60px' }}
        >
          <Outlet context={{ user, teams, selectedTeam, handleTeamChange, openRightPanel, openFullPage, onTeamUpdated: (updatedTeam) => {
            setSelectedTeam(prev => ({ ...prev, ...updatedTeam }));
            setTeams(prev => prev.map(t => t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t));
          }}} />
        </main>
      </div>

      <div 
        className={clsx(
          "hidden md:block w-1.5 cursor-col-resize z-50 flex-shrink-0 transition-colors",
          isDraggingRight ? "bg-brand" : "bg-surface-border hover:bg-brand/50"
        )}
        onMouseDown={() => setIsDraggingRight(true)}
      />

      <div className={clsx(
        "fixed top-0 right-0 w-[80%] h-full z-[40] bg-surface-level2 shadow-[-15px_0_30px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex-shrink-0",
        "md:static md:w-[var(--right-w)] md:translate-x-0 md:shadow-3xl",
        (rightPanel.isOpen || fullPagePanel.isOpen) ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="w-full h-full flex flex-col overflow-hidden shrink-0">
          {rightPanel.isOpen ? (
            <>
              <div className="flex items-center justify-between shadow-md p-4 h-[60px] shrink-0 z-[90]">
                <button onClick={closeRightPanel} className="p-1.5 ml-1 bg-white/30 rounded-xl text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center">
                  <Icon name="chevron_left" className="w-6 h-6 text-content-main" />
                </button>
                <h3 className="text-sm font-bold text-content-main uppercase tracking-wider text-right truncate pl-4">
                  {rightPanel.title}
                </h3>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {!isPanelReady ? (
                  <PageLoader />
                ) : (
                  <FadeIn className="h-full w-full">
                    {rightPanel.type === 'userDetails' && (
                      <UserDetails data={rightPanel.data} />
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
                    
                    {/* ДОБАВЛЕНО: Регистрация новых панелей единого справочника */}
                    {rightPanel.type === 'opponentForm' && (
                      <OpponentHandbookPanel data={rightPanel.data} onClose={closeRightPanel} />
                    )}
                    {rightPanel.type === 'tournamentForm' && (
                      <TournamentHandbookPanel data={rightPanel.data} onClose={closeRightPanel} />
                    )}
                    
                    {/* Регистрируем тип editTeamProfile для корректного рендеринга нашей формы */}
                    {rightPanel.type === 'editTeamProfile' && (
                      <EditTeamProfilePanel {...rightPanel.data} onClose={closeRightPanel} />
                    )}
                  </FadeIn>
                )}
              </div>
            </>
          ) : fullPagePanel.isOpen ? (
            <>
              <div className="flex items-center justify-between shadow-md p-4 h-[60px] shrink-0 z-[90]">
                <button onClick={closeFullPageUi} className="p-2 -ml-2 text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center">
                  <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
                </button>
                <h3 className="text-sm font-bold text-content-main uppercase tracking-widest text-right truncate pl-4">
                  {desktopEventTitle}
                </h3>
              </div>
              <div className="flex-1 overflow-hidden relative bg-surface-level1">
                {!isPanelReady ? (
                  <PageLoader />
                ) : (
                  <FadeIn className="h-full w-full bg-surface-level1">
                    {fullPagePanel.type === 'matchDetails' && <EventDetailsMatch event={fullPagePanel.data} />}
                    {fullPagePanel.type === 'trainingDetails' && <EventDetailsTraining event={fullPagePanel.data} />}
                    {fullPagePanel.type === 'meetingDetails' && <EventDetailsMeeting event={fullPagePanel.data} />}
                  </FadeIn>
                )}
              </div>
            </>
          ) : (
            <div className="hidden md:flex flex-col h-full w-full bg-surface-level1 select-none">
              <div className="flex items-center bg-surface-base justify-between p-4 h-[60px] shrink-0 border-b border-surface-border/30">
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="md:hidden">
        <EventDashboard 
          isOpen={fullPagePanel.isOpen} 
          onClose={closeFullPageUi} 
          type={fullPagePanel.type} 
          data={fullPagePanel.data} 
          title={fullPagePanel.title}
          user={user}
          selectedTeam={selectedTeam}
          onTeamUpdated={(updatedTeam) => {
            setSelectedTeam(prev => ({ ...prev, ...updatedTeam }));
            setTeams(prev => prev.map(t => t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t));
          }}
        />
      </div>

    </div>
  );
}