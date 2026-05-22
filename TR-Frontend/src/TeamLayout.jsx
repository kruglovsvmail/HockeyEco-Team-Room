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

import { EventDashboard } from './components/EventDetails/EventDashboard';
import { UserDetails } from './components/MyTeam/UserDetails';
import { EventDetailsMatch } from './components/EventDetails/Match/EventDetailsMatch';
import { EventDetailsTraining } from './components/EventDetails/EventDetailsTraining';
import { EventDetailsMeeting } from './components/EventDetails/EventDetailsMeeting';

import { BottomActionProvider, useBottomBar } from './ui/BottomActionContext';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

export function TeamLayout() {
  return (
    <BottomActionProvider>
      <TeamLayoutContent />
    </BottomActionProvider>
  );
}

function TeamLayoutContent() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Состояние глобального статуса сети (true - онлайн, false - офлайн)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const [rightPanel, setRightPanel] = useState({ isOpen: false, type: null, data: null, title: '' });
  const [fullPagePanel, setFullPagePanel] = useState({ isOpen: false, type: null, data: null, title: '' });

  const { updateLayoutVisibility } = useBottomBar();

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

  // СЛУШАТЕЛЬ ИЗМЕНЕНИЯ СТАТУСА СЕТИ И FOCUS REVALIDATION
  useEffect(() => {
    const handleGlobalRefresh = () => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new Event('app-global-refresh'));
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Подписки на системные события фокуса
    window.addEventListener('focus', handleGlobalRefresh);
    document.addEventListener('visibilitychange', handleGlobalRefresh);

    // Подписки на системные изменения статуса интернета на смартфоне
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('focus', handleGlobalRefresh);
      document.removeEventListener('visibilitychange', handleGlobalRefresh);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    updateLayoutVisibility(true);
    return () => updateLayoutVisibility(false);
  }, [updateLayoutVisibility]);

  useEffect(() => {
    const fetchMe = async () => {
      const token = getToken();
      if (!token) return navigate('/login');

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
          headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error('Not authorized');
        
        const data = await res.json();
        setUser(data.user);
        
        localStorage.setItem('teampwa_cached_user', JSON.stringify(data.user));
        
        const userTeams = data.user.teams || [];
        setTeams(userTeams);
        
        const savedTeamId = localStorage.getItem('teampwa_selected_team');
        let currentTeam = userTeams.find(t => t.id == savedTeamId);
        
        if (!currentTeam && userTeams.length > 0) {
          currentTeam = userTeams[0];
        }
        
        setSelectedTeam(currentTeam);
      } catch (err) {
        if (!navigator.onLine || err.message.includes('Failed to fetch') || err.name === 'TypeError') {
          const cachedUserData = localStorage.getItem('teampwa_cached_user');
          if (cachedUserData) {
            const parsedUser = JSON.parse(cachedUserData);
            setUser(parsedUser);
            
            const userTeams = parsedUser.teams || [];
            setTeams(userTeams);
            
            const savedTeamId = localStorage.getItem('teampwa_selected_team');
            let currentTeam = userTeams.find(t => t.id == savedTeamId) || userTeams[0];
            setSelectedTeam(currentTeam);
            
            setIsLoading(false);
            return; 
          }
        }

        removeToken();
        navigate('/login');
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

  const openRightPanel = (type, data, title = 'Детали') => setRightPanel({ isOpen: true, type, data, title });
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
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-brand font-medium animate-pulse tracking-widest uppercase text-sm">
          Загрузка...
        </div>
      </div>
    );
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
      className="flex w-full h-full overflow-hidden relative bg-surface-base"
      style={{ '--sidebar-w': `${sidebarWidth}%`, '--right-w': `${rightPanelWidth}%` }}
    >
      
      {/* 1. ЛЕВОЕ МЕНЮ (Сайдбар) */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 h-full bg-surface-level1 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex-shrink-0",
        "w-[80%] md:w-[var(--sidebar-w)] md:static md:translate-x-0 md:shadow-xl",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar user={user} teams={teams} selectedTeam={selectedTeam} onTeamChange={handleTeamChange} onClose={() => setIsSidebarOpen(false)} />
      </aside>

      {/* РЕСАЙЗЕР ЛЕВОЙ ПАНЕЛИ */}
      <div 
        className={clsx(
          "hidden md:block w-1.5 cursor-col-resize z-50 flex-shrink-0 transition-colors",
          isDraggingSidebar ? "bg-brand" : "bg-surface-border hover:bg-brand/50"
        )}
        onMouseDown={() => setIsDraggingSidebar(true)}
      />

      {/* 2. ЦЕНТРАЛЬНЫЙ КОНТЕЙНЕР КОНТЕНТА */}
      <div className={clsx(
        "flex flex-col flex-1 w-full h-full min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] z-30 bg-surface-base relative",
        isSidebarOpen ? "translate-x-[80%] shadow-2xl md:translate-x-0 md:shadow-none" : "",
        rightPanel.isOpen ? "-translate-x-[80%] md:translate-x-0" : "",
        fullPagePanel.isOpen ? "-translate-x-[30%] opacity-50 md:translate-x-0 md:opacity-100" : ""
      )}>
        <Header 
          isSidebarOpen={isSidebarOpen} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
          user={user}
          selectedTeam={selectedTeam}
          onTeamUpdated={(updatedTeam) => {
            setSelectedTeam(prev => ({ ...prev, ...updatedTeam }));
            setTeams(prev => prev.map(t => t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t));
          }}
        />

        {isSidebarOpen && <div className="absolute inset-0 z-50 md:hidden bg-transparent" onClick={() => setIsSidebarOpen(false)} />}
        {rightPanel.isOpen && <div className="absolute inset-0 z-50 bg-transparent cursor-pointer md:hidden" onClick={closeRightPanel} />}

        {/* ГЛОБАЛЬНЫЙ БАННЕР ОТСУТСТВИЯ СЕТИ (Отображается поверх контента текущей страницы) */}
        {!isOnline && (
          <div className="absolute top-[60px] inset-x-0 z-[100] bg-danger/10 border-b border-danger/20 backdrop-blur-md px-4 py-2 flex items-center justify-center gap-2 animate-fade-in">
            <Icon name="cloud_off" className="w-4 h-4 text-danger animate-pulse" />
            <span className="text-[10px] font-black text-danger uppercase tracking-widest text-center">
              Нет сети. Режим только просмотра
            </span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative pt-[60px] overscroll-none">
          <Outlet context={{ user, teams, selectedTeam, handleTeamChange, openRightPanel, openFullPage }} />
        </main>

        <div id="bottom-bar-portal-container" className="absolute bottom-0 left-0 w-full pointer-events-none z-[95]" />
      </div>

      {/* РЕСАЙЗЕР ПРАВОЙ ПАНЕЛИ */}
      <div 
        className={clsx(
          "hidden md:block w-1.5 cursor-col-resize z-50 flex-shrink-0 transition-colors",
          isDraggingRight ? "bg-brand" : "bg-surface-border hover:bg-brand/50"
        )}
        onMouseDown={() => setIsDraggingRight(true)}
      />

      {/* 3. ПРАВАЯ ПАНЕЛЬ ДЕТАЛЕЙ */}
      <div className={clsx(
        "fixed top-0 right-0 w-[80%] h-full z-[40] bg-surface-level1 shadow-[-15px_0_30px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex-shrink-0",
        "md:static md:w-[var(--right-w)] md:translate-x-0 md:shadow-3xl",
        (rightPanel.isOpen || fullPagePanel.isOpen) ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="w-full h-full flex flex-col overflow-hidden shrink-0">
          {rightPanel.isOpen ? (
            <>
              <div className="flex items-center bg-surface-base justify-between shadow-md p-4 h-[60px] shrink-0 z-[90]">
                <button onClick={closeRightPanel} className="p-2 -ml-2 text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center">
                  <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
                </button>
                <h3 className="text-sm font-bold text-content-main uppercase tracking-wider text-right truncate pl-4">
                  {rightPanel.title}
                </h3>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {rightPanel.type === 'userDetails' && (
                  <UserDetails data={rightPanel.data} />
                )}
              </div>
            </>
          ) : fullPagePanel.isOpen ? (
            <>
              <div className="flex items-center bg-surface-base justify-between shadow-md p-4 h-[60px] shrink-0 z-[90]">
                <button onClick={closeFullPageUi} className="p-2 -ml-2 text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center">
                  <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
                </button>
                <h3 className="text-sm font-bold text-content-main uppercase tracking-widest text-right truncate pl-4">
                  {desktopEventTitle}
                </h3>
              </div>
              <div className="flex-1 overflow-hidden relative bg-surface-level1">
                {fullPagePanel.type === 'matchDetails' && <EventDetailsMatch event={fullPagePanel.data} />}
                {fullPagePanel.type === 'trainingDetails' && <EventDetailsTraining event={fullPagePanel.data} />}
                {fullPagePanel.type === 'meetingDetails' && <EventDetailsMeeting event={fullPagePanel.data} />}
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
        <EventDashboard isOpen={fullPagePanel.isOpen} onClose={closeFullPageUi} type={fullPagePanel.type} data={fullPagePanel.data} title={fullPagePanel.title} />
      </div>

    </div>
  );
}