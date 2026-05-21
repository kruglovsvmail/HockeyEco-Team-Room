import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { ChipTabs } from '../ui/ChipTabs';

// Подключаем ленивую асинхронную загрузку компонентов вкладок
const TeamAllMembers = lazy(() => import('../components/MyTeam/TeamAllMembers').then(m => ({ default: m.TeamAllMembers })));
const TeamRosterPlayers = lazy(() => import('../components/MyTeam/TeamRosterPlayers').then(m => ({ default: m.TeamRosterPlayers })));
const TeamStaffMembers = lazy(() => import('../components/MyTeam/TeamStaffMembers').then(m => ({ default: m.TeamStaffMembers })));

const TEAM_TABS = [
  { id: 'all', label: 'Состав' },
  { id: 'roster', label: 'Ростер' },
  { id: 'staff', label: 'Представители' }
];

export const MyTeamPage = () => {
  const { openRightPanel, selectedTeam } = useOutletContext();
  
  const [teamData, setTeamData] = useState({ roster: [], staff: [] });
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  
  const selectedTeamId = selectedTeam?.id;
  const rafRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stickyHeaderRef = useRef(null);

  useEffect(() => {
    if (!selectedTeamId) return;
    const fetchTeamData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/details`, { 
          headers: getAuthHeaders() 
        });
        if (res.ok) setTeamData(await res.json());
      } catch (err) { 
        console.error(err); 
      } finally { 
        setIsLoading(false); 
      }
    };
    fetchTeamData();
  }, [selectedTeamId]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Умная компенсация скролла при переключениях вкладок для предотвращения прыжков интерфейса
  useEffect(() => {
    if (scrollContainerRef.current) {
      const currentScroll = scrollContainerRef.current.scrollTop;
      if (currentScroll > 80) {
        scrollContainerRef.current.scrollTo({ top: 96, behavior: 'auto' });
      }
    }
  }, [activeTab]);

  const handleScroll = (e) => {
    const currentScroll = e.target.scrollTop;
    
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const isStuck = currentScroll > 84;

      if (stickyHeaderRef.current) {
        if (String(isStuck) !== stickyHeaderRef.current.dataset.stuck) {
          stickyHeaderRef.current.dataset.stuck = isStuck;
          if (isStuck) {
            stickyHeaderRef.current.classList.add('backdrop-blur-md', 'shadow-sm', 'bg-blue-900/5');
            stickyHeaderRef.current.classList.remove('bg-transparent');
          } else {
            stickyHeaderRef.current.classList.remove('backdrop-blur-md', 'shadow-sm', 'bg-blue-900/5');
            stickyHeaderRef.current.classList.add('bg-transparent');
          }
        }
      }
    });
  };

  const handlePersonClick = (person) => openRightPanel('userDetails', person, 'Профиль');

  // Вычисляем объединенный уникальный состав один раз при изменении исходных массивов
  const allMembers = useMemo(() => {
    if (!teamData.roster?.length && !teamData.staff?.length) return [];
    
    const combined = [...(teamData.staff || []), ...(teamData.roster || [])];
    const unique = [];
    const map = new Map();
    
    for (const item of combined) {
      if (!map.has(item.member_id)) {
        map.set(item.member_id, true);
        unique.push(item);
      }
    }
    
    return unique.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
  }, [teamData]);

  // Математический расчет смещения слайдера контента по горизонтали
  const tabIndex = TEAM_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${tabIndex * 33.333333}%`;

  const TabFallback = () => (
    <div className="flex justify-center items-center h-32 text-brand font-black animate-pulse uppercase tracking-widest text-sm">
      Загрузка...
    </div>
  );

  return (
    <div 
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide bg-surface-border animate-fade-in relative z-10 snap-y snap-proximity"
      onScroll={handleScroll}
    >
      {/* Шапка страницы */}
      <div className="bg-surface-base px-5 pb-4 mb-2 rounded-b-[50px] flex items-center gap-4 shadow-lg shrink-0 border-b border-surface-level2 snap-start">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm shrink-0 ml-4">
          <img 
            src={getImageUrl(selectedTeam?.logo_url)} 
            alt={selectedTeam?.name} 
            className="w-full h-full object-contain p-1" 
          />
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight truncate">
            {selectedTeam?.name}
          </h2>
          <span className="text-[10px] font-black text-brand uppercase tracking-[0.2em] mt-1">
            Состав команды
          </span>
        </div>
      </div>

      {/* Прилипающая лента табов */}
      <div 
        ref={stickyHeaderRef}
        data-stuck="false"
        className="snap-start sticky top-0 z-40 shrink-0 transition-all duration-300 ease-in-out border-b border-surface-level2 bg-transparent"
      >
        <ChipTabs 
          tabs={TEAM_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="!px-0"
        />
      </div>

      {/* Контентный горизонтальный слайдер с ленивой загрузкой вкладок */}
      <div className="w-full overflow-hidden pt-4 min-h-screen pb-[30vh]">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-brand font-black animate-pulse uppercase tracking-widest text-sm">
            Загрузка...
          </div>
        ) : (
          <div 
            className="flex w-[300%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ transform: `translateX(${translateX})` }}
          >
            
            {/* ВКЛАДКА 1: ОБЩИЙ СОСТАВ */}
            <div 
              className="w-1/3 shrink-0 transition-opacity duration-500" 
              style={{ opacity: activeTab === 'all' ? 1 : 0.3 }}
            >
              <Suspense fallback={<TabFallback />}>
                {activeTab === 'all' && (
                  <TeamAllMembers 
                    members={allMembers} 
                    onPersonClick={handlePersonClick} 
                  />
                )}
              </Suspense>
            </div>

            {/* ВКЛАДКА 2: РОСТЕР ПО ПОЗИЦИЯМ */}
            <div 
              className="w-1/3 shrink-0 transition-opacity duration-500" 
              style={{ opacity: activeTab === 'roster' ? 1 : 0.3 }}
            >
              <Suspense fallback={<TabFallback />}>
                {activeTab === 'roster' && (
                  <TeamRosterPlayers 
                    roster={teamData.roster} 
                    onPersonClick={handlePersonClick} 
                  />
                )}
              </Suspense>
            </div>

            {/* ВКЛАДКА 3: АДМИНИСТРАТИВНЫЙ И ТРЕНЕРСКИЙ ШТАБ */}
            <div 
              className="w-1/3 shrink-0 transition-opacity duration-500" 
              style={{ opacity: activeTab === 'staff' ? 1 : 0.3 }}
            >
              <Suspense fallback={<TabFallback />}>
                {activeTab === 'staff' && (
                  <TeamStaffMembers 
                    staff={teamData.staff} 
                    onPersonClick={handlePersonClick} 
                  />
                )}
              </Suspense>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};