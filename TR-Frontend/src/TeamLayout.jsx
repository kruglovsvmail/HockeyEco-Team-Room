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
import { UserDetails } from './components/UserDetails';
import { EventDetailsMatch } from './components/EventDetails/Match/EventDetailsMatch';
import { EventDetailsTraining } from './components/EventDetails/EventDetailsTraining';
import { EventDetailsMeeting } from './components/EventDetails/EventDetailsMeeting';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

export function TeamLayout() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [rightPanel, setRightPanel] = useState({ isOpen: false, type: null, data: null, title: '' });
  const [fullPagePanel, setFullPagePanel] = useState({ isOpen: false, type: null, data: null, title: '' });

  // --- ЛОГИКА ИЗМЕНЕНИЯ РАЗМЕРОВ ПАНЕЛЕЙ (RESIZING) ---
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('teampwa_sidebar_width');
    return saved ? parseFloat(saved) : 20; // 20% по умолчанию
  });

  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = localStorage.getItem('teampwa_right_panel_width');
    return saved ? parseFloat(saved) : 25; // 25% по умолчанию
  });

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Общая ширина экрана
      const totalWidth = window.innerWidth;
      
      if (isDraggingSidebar) {
        // Вычисляем процент от левого края
        let newWidth = (e.clientX / totalWidth) * 100;
        // Защита от дурака: мин 20%, макс 50%, но с учетом того, что центр должен быть минимум 30%
        newWidth = Math.max(20, Math.min(newWidth, 50, 70 - rightPanelWidth));
        setSidebarWidth(newWidth);
      } else if (isDraggingRight) {
        // Вычисляем процент от правого края
        let newWidth = ((totalWidth - e.clientX) / totalWidth) * 100;
        // Те же лимиты
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
      // Блокируем выделение текста во время перетаскивания
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDraggingSidebar, isDraggingRight, rightPanelWidth, sidebarWidth]);
  // ----------------------------------------------------

  const navigate = useNavigate();
  const location = useLocation();

  // Автоматическое освобождение правой панели при выходе из раздела (смене URL)
  useEffect(() => {
    closeRightPanel();
    setFullPagePanel({ isOpen: false, type: null, data: null, title: '' });
  }, [location.pathname]);

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

  // Динамический заголовок даты/времени события для правой панели
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
      // Прокидываем проценты в CSS-переменные для адаптивности
      style={{ '--sidebar-w': `${sidebarWidth}%`, '--right-w': `${rightPanelWidth}%` }}
    >
      
      {/* 1. ЛЕВОЕ МЕНЮ (Сайдбар) */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 h-full bg-surface-level1 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex-shrink-0",
        // На мобилках 80%, на ПК используем CSS переменную + убрали бордер (его заменяет ресайзер)
        "w-[80%] md:w-[var(--sidebar-w)] md:static md:translate-x-0 md:shadow-xl",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar user={user} teams={teams} selectedTeam={selectedTeam} onClose={() => setIsSidebarOpen(false)} onLogout={handleLogout} />
      </aside>

      {/* --- РЕСАЙЗЕР ЛЕВОЙ ПАНЕЛИ (Виден только на ПК) --- */}
      <div 
        className={clsx(
          "hidden md:block w-1.5 cursor-col-resize z-50 flex-shrink-0 transition-colors",
          isDraggingSidebar ? "bg-brand" : "bg-surface-border hover:bg-brand/50"
        )}
        onMouseDown={() => setIsDraggingSidebar(true)}
      />

      {/* 2. ГЛАВНЫЙ ЦЕНТРАЛЬНЫЙ КОНТЕЙНЕР */}
      <div className={clsx(
        "flex flex-col flex-1 w-full h-full min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] z-30 bg-surface-base relative",
        isSidebarOpen ? "translate-x-[80%] shadow-2xl md:translate-x-0 md:shadow-none" : "",
        rightPanel.isOpen ? "-translate-x-[80%] md:translate-x-0" : "",
        fullPagePanel.isOpen ? "-translate-x-[30%] opacity-50 md:translate-x-0 md:opacity-100" : "",
        !isSidebarOpen && !rightPanel.isOpen && !fullPagePanel.isOpen ? "translate-x-0 opacity-100" : ""
      )}>
        <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

        {isSidebarOpen && <div className="absolute inset-0 z-50 md:hidden bg-transparent" onClick={() => setIsSidebarOpen(false)} />}
        {rightPanel.isOpen && <div className="absolute inset-0 z-50 bg-transparent cursor-pointer md:hidden" onClick={closeRightPanel} />}

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative pt-[60px] overscroll-none">
          <Outlet context={{ user, teams, selectedTeam, openRightPanel, openFullPage }} />
        </main>
      </div>

      {/* --- РЕСАЙЗЕР ПРАВОЙ ПАНЕЛИ (Виден только на ПК) --- */}
      <div 
        className={clsx(
          "hidden md:block w-1.5 cursor-col-resize z-50 flex-shrink-0 transition-colors",
          isDraggingRight ? "bg-brand" : "bg-surface-border hover:bg-brand/50"
        )}
        onMouseDown={() => setIsDraggingRight(true)}
      />

      {/* 3. ФИКСИРОВАННАЯ ПРАВАЯ ПАНЕЛЬ ДЕТАЛЕЙ */}
      <div className={clsx(
        "fixed top-0 right-0 w-[80%] h-full z-[40] bg-surface-level1 shadow-[-15px_0_30px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex-shrink-0",
        // На мобилках выезжает, на ПК статична и использует CSS переменную ширины
        "md:static md:w-[var(--right-w)] md:translate-x-0 md:shadow-3xl",
        (rightPanel.isOpen || fullPagePanel.isOpen) ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Контейнер всегда растянут на 100% родителя, чтобы избежать сплющивания */}
        <div className="w-full h-full flex flex-col overflow-hidden shrink-0">
          
          {/* СОСТОЯНИЕ 1: Открыт профиль пользователя */}
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
          ) : 
          
          // СОСТОЯНИЕ 2: Открыты вкладки события
          fullPagePanel.isOpen ? (
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
          ) : 
          
          // СОСТОЯНИЕ 3: Свободная панель (Заглушка)
          (
            <div className="hidden md:flex flex-col h-full w-full bg-surface-level1 select-none">
              <div className="flex items-center bg-surface-base justify-between p-4 h-[60px] shrink-0 border-b border-surface-border/30">
                 {/* Место под заголовок */}
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                 {/* Место под контент пустого состояния */}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* НАТИВНЫЙ ПОЛНОЭКРАННЫЙ ДАШБОРД ДЛЯ МОБИЛОК (На ПК полностью скрыт) */}
      <div className="md:hidden">
        <EventDashboard isOpen={fullPagePanel.isOpen} onClose={closeFullPageUi} type={fullPagePanel.type} data={fullPagePanel.data} title={fullPagePanel.title} />
      </div>

    </div>
  );
}