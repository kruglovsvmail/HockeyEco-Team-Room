import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { getToken, removeToken, getAuthHeaders } from './utils/helpers';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Icon } from './ui/Icon';

import { EventDashboard } from './components/EventDetails/EventDashboard';
import { UserDetails } from './components/UserDetails';

export function TeamLayout() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [rightPanel, setRightPanel] = useState({ isOpen: false, type: null, data: null, title: '' });
  const [fullPagePanel, setFullPagePanel] = useState({ isOpen: false, type: null, data: null, title: '' });

  const navigate = useNavigate();

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
        setTeams(data.user.teams || []);
        
        const savedTeamId = localStorage.getItem('teampwa_selected_team');
        let currentTeam = data.user.teams.find(t => t.id == savedTeamId);
        
        if (!currentTeam && data.user.teams.length > 0) {
          currentTeam = data.user.teams[0];
        }
        
        setSelectedTeam(currentTeam);
      } catch (err) {
        removeToken();
        navigate('/login');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, [navigate]);

  const handleLogout = () => {
    removeToken();
    navigate('/login');
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

  return (
    <div className="flex w-full h-full overflow-hidden relative bg-surface-base">
      
      {/* ЛЕВОЕ МЕНЮ */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 h-full bg-surface-level1 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "w-[80%] md:w-[20%] md:min-w-[280px] md:static md:translate-x-0 ",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar user={user} teams={teams} selectedTeam={selectedTeam} onClose={() => setIsSidebarOpen(false)} onLogout={handleLogout} />
      </aside>

      {/* ГЛАВНЫЙ КОНТЕЙНЕР (Сдвигается влево, освобождая место правой панели) */}
      <div className={clsx(
        "flex flex-col flex-1 w-full h-full min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] z-30 bg-surface-base relative",
        // Сдвиг вправо при открытии левого меню
        isSidebarOpen ? "translate-x-[80%] shadow-2xl md:translate-x-0 md:shadow-none" : "",
        
        // СДВИГ ВЛЕВО при открытии ПРАВОЙ ПАНЕЛИ (на 80% на мобилках, на 380px на ПК)
        rightPanel.isOpen ? "-translate-x-[80%] md:-translate-x-[380px]" : "",
        
        // Параллакс для полноэкранного дашборда матча
        fullPagePanel.isOpen ? "-translate-x-[30%] opacity-50 md:-translate-x-0 md:opacity-100" : "",
        
        !isSidebarOpen && !rightPanel.isOpen && !fullPagePanel.isOpen ? "translate-x-0 opacity-100" : ""
      )}>
        <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

        {isSidebarOpen && <div className="absolute inset-0 z-50 md:hidden bg-transparent" onClick={() => setIsSidebarOpen(false)} />}
        
        {/* Оверлей по главному экрану для закрытия шторки кликом мимо */}
        {rightPanel.isOpen && <div className="absolute inset-0 z-50 bg-transparent cursor-pointer" onClick={closeRightPanel} />}

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative pt-[60px] overscroll-none">
          <Outlet context={{ user, teams, selectedTeam, openRightPanel, openFullPage }} />
        </main>
      </div>

      {/* ПРАВАЯ БОКОВАЯ ПАНЕЛЬ (Теперь она независимый сосед главного контейнера) */}
      <div className={clsx(
        "fixed top-0 right-0 w-[80%] md:w-[380px] h-full z-[40] bg-surface-level1 shadow-[-15px_0_30px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        rightPanel.isOpen ? "translate-x-0" : "translate-x-full"
      )}>
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
      </div>

      {/* ПОЛНОЭКРАННАЯ ПАНЕЛЬ */}
      <EventDashboard isOpen={fullPagePanel.isOpen} onClose={closeFullPageUi} type={fullPagePanel.type} data={fullPagePanel.data} title={fullPagePanel.title} />

    </div>
  );
}