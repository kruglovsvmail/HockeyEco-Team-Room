import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { getToken, removeToken, getAuthHeaders } from './utils/helpers';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

export function TeamLayout() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMe = async () => {
      const token = getToken();
      if (!token) {
        return navigate('/login');
      }

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
      
      {/* Сайдбар.
        На мобилках: фиксированный слева, ширина 70%.
        На десктопе: статичный элемент flex-контейнера, ширина 16% (мин 280px).
      */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 h-full bg-surface-level1 border-r border-surface-border transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "w-[64%] md:w-[20%] md:min-w-[280px] md:static md:translate-x-0 ",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar 
          user={user} 
          teams={teams} 
          selectedTeam={selectedTeam} 
          onClose={() => setIsSidebarOpen(false)} 
          onLogout={handleLogout} 
        />
      </aside>

      {/* Основной контейнер приложения.
        При открытии сайдбара на мобильных сдвигается вправо на 70%.
      */}
      <div className={clsx(
        "flex flex-col flex-1 w-full h-full min-w-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] z-50 bg-surface-base",
        isSidebarOpen ? "translate-x-[64%] md:translate-x-0" : "translate-x-0"
      )}>
        
        <Header 
          isSidebarOpen={isSidebarOpen} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
        />

        {/* Невидимый оверлей на мобилках поверх контента, чтобы закрывать сайдбар по клику */}
        {isSidebarOpen && (
          <div 
            className="absolute inset-0 z-50 md:hidden bg-transparent" 
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <Outlet context={{ user, teams, selectedTeam }} />
        </main>
      </div>
    </div>
  );
}