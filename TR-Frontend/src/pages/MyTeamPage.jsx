import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { ChipTabs } from '../ui/ChipTabs';

// Утилита для получения инициалов
const getInitials = (firstName, lastName) => {
  const f = firstName ? firstName.charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.charAt(0).toUpperCase() : '';
  return `${l}${f}` || '?';
};

// --- КОМПОНЕНТ КАРТОЧКИ-СЕТКИ ДЛЯ ВЗГЛЯДА "ВСЕ" И "СОСТАВ" ---
const PersonGridCard = ({ person, onClick, showBadges = false }) => {
  const photoUrl = person.photo_url || person.avatar_url;

  return (
    <div 
      onClick={() => onClick(person)}
      className="flex flex-col items-center gap-1.5 select-none w-full cursor-pointer active:scale-[0.98] transition-transform"
    >
      {/* Обертка relative для позиционирования бейджей поверх фото */}
      <div className="relative">
        <div className="w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-surface-level2 border border-surface-level2 shadow-sm origin-center">
          {photoUrl ? (
            <img src={getImageUrl(photoUrl)} alt="Аватар" className="w-full h-full object-cover pointer-events-none" />
          ) : (
            <div className="w-full h-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold pointer-events-none">
              {getInitials(person.first_name, person.last_name)}
            </div>
          )}
        </div>

        {/* Бейдж: Ассистент / Капитан (сверху справа, фон brand, меньше размером) */}
        {showBadges && (person.is_captain || person.is_assistant) && (
          <div className="absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full bg-brand shadow-sm flex items-center justify-center text-[9px] font-black text-content-dark z-20">
            {person.is_captain ? 'К' : 'А'}
          </div>
        )}

        {/* Бейдж: Игровой номер (снизу справа, матовое стекло) */}
        {showBadges && person.jersey_number != null && (
          <div className="absolute -bottom-1 -right-3 w-[32px] h-[32px] bg-brand-glow rounded-full backdrop-blur-[4px] border border-white/50 shadow-sm flex items-center justify-center text-[13px] font-black text-content-dark z-10">
            {person.jersey_number}
          </div>
        )}
      </div>

      <div className="w-full text-center px-0.5">
        <span className="text-[13px] font-bold text-content-main leading-tight break-words block pointer-events-none">
          {person.last_name}
        </span>
        <span className="text-[11px] text-content-muted leading-tight break-words block pointer-events-none mt-0.5">
          {person.first_name}
        </span>
      </div>
    </div>
  );
};

// --- КОМПОНЕНТ КАРТОЧКИ-ТАБЛИЦЫ ДЛЯ ВЗГЛЯДА "ШТАБ" ---
const StaffTableCard = ({ person, onClick }) => {
  const photoUrl = person.photo_url || person.avatar_url;
  
  const roleDict = {
    'team_manager': 'Руководитель',
    'team_admin': 'Администратор',
    'coach': 'Тренер',
    'head_coach': 'Главный тренер'
  };

  const renderRoles = (rolesString) => {
    if (!rolesString) return null;
    const rolesArray = rolesString.split(',').map(r => r.trim());
    return rolesArray.map((r, i) => (
      <span key={i} className="text-[10px] font-black text-brand uppercase tracking-widest rounded-md text-right w-fit">
        {roleDict[r] || r}
      </span>
    ));
  };

  return (
    <div 
      onClick={() => onClick(person)}
      className="flex items-center gap-3 bg-surface-level1 border border-surface-level2 rounded-2xl p-3 shadow-sm h-full cursor-pointer active:scale-[0.98] transition-transform w-full"
    >
      <div className="w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-surface-level2 border border-surface-level2 shadow-sm">
        {photoUrl ? (
          <img src={getImageUrl(photoUrl)} alt="Аватар" className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <div className="w-full h-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold pointer-events-none">
            {getInitials(person.first_name, person.last_name)}
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 justify-center">
        <span className="text-[13px] font-bold text-content-main leading-tight">
          {person.last_name}
        </span>
        <span className="text-[11px] text-content-muted leading-tight mt-0.5">
          {person.first_name}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 items-end shrink-0 justify-center">
        {renderRoles(person.roles)}
      </div>
    </div>
  );
};

const TEAM_TABS = [
  { id: 'all', label: 'Все' },
  { id: 'roster', label: 'Состав' },
  { id: 'staff', label: 'Штаб' }
];

export const MyTeamPage = () => {
  const { openRightPanel } = useOutletContext();
  const [teams, setTeams] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0); 
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  
  const [teamData, setTeamData] = useState({ roster: [], staff: [] });
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  
  const navigate = useNavigate();
  const touchStartX = useRef(null);
  const carouselRef = useRef(null);
  const stickyHeaderRef = useRef(null);
  const rafRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/my`, { headers: getAuthHeaders() });
        if (res.status === 401) return navigate('/login');
        const data = await res.json();
        
        const loadedTeams = data.teams || [];
        setTeams(loadedTeams);
        
        if (loadedTeams.length > 0) {
          const savedId = localStorage.getItem('teampwa_myteam_selected');
          const foundIndex = loadedTeams.findIndex(t => t.id == savedId);
          setActiveIndex(foundIndex !== -1 ? foundIndex : 0);
        }
      } catch (err) { console.error(err); }
    };
    fetchTeams();
  }, [navigate]);

  useEffect(() => {
    if (teams.length > 0) {
      const currentId = teams[activeIndex]?.id;
      setSelectedTeamId(currentId);
      localStorage.setItem('teampwa_myteam_selected', currentId);
    }
  }, [activeIndex, teams]);

  useEffect(() => {
    if (!selectedTeamId) return;
    const fetchTeamData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/details`, { headers: getAuthHeaders() });
        if (res.ok) setTeamData(await res.json());
      } catch (err) { console.error(err); } finally { setIsLoading(false); }
    };
    fetchTeamData();
  }, [selectedTeamId]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const currentScroll = scrollContainerRef.current.scrollTop;
      const CAROUSEL_TOTAL_HEIGHT = 168;
      
      if (currentScroll >= 120) {
        scrollContainerRef.current.scrollTop = CAROUSEL_TOTAL_HEIGHT;
      } else {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [activeTab]);

  const getOffset = (index) => {
    return index - activeIndex; 
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (!touchStartX.current || teams.length === 0) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    
    if (Math.abs(diff) > 40) { 
      if (diff > 0) {
        setActiveIndex((prev) => Math.min(prev + 1, teams.length - 1));
      } else {
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
    }
    touchStartX.current = null;
  };

  const handleScroll = (e) => {
    const currentScroll = e.target.scrollTop;
    
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const isStuck = currentScroll > 120;
      const isFullyCollapsed = currentScroll > 150; 

      if (isFullyCollapsed) {
        if (carouselRef.current && carouselRef.current.dataset.collapsed !== 'true') {
          carouselRef.current.style.opacity = '0';
          carouselRef.current.style.transform = 'translateY(60px) translateZ(0)';
          carouselRef.current.dataset.collapsed = 'true';
        }
      } else {
        if (carouselRef.current) {
          carouselRef.current.dataset.collapsed = 'false';
          carouselRef.current.style.opacity = Math.max(0, 1 - currentScroll / 120);
          carouselRef.current.style.transform = `translateY(${currentScroll * 0.4}px) translateZ(0)`;
        }
      }

      if (stickyHeaderRef.current) {
        if (String(isStuck) !== stickyHeaderRef.current.dataset.stuck) {
          stickyHeaderRef.current.dataset.stuck = isStuck;
          if (isStuck) {
            stickyHeaderRef.current.classList.add('backdrop-blur-md', 'shadow-sm');
          } else {
            stickyHeaderRef.current.classList.remove('backdrop-blur-md', 'shadow-sm');
          }
        }
      }
    });

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (!scrollContainerRef.current) return;
      
      const finalScroll = scrollContainerRef.current.scrollTop;
      
      if (finalScroll > 0 && finalScroll < 150) {
        if (finalScroll < 75) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          scrollContainerRef.current.scrollTo({ top: 168, behavior: 'smooth' });
        }
      }
    }, 150);
  };

  const handlePersonClick = (person) => openRightPanel('userDetails', person, 'Профиль');

  const getPlayersByRole = (match) => teamData.roster?.filter(p => p.position === match) || [];

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

  const translateX = activeTab === 'all' 
    ? '0%' 
    : activeTab === 'roster' 
      ? '-33.333333%' 
      : '-66.666667%';

  return (
    <div 
      ref={scrollContainerRef}
      className="h-full overflow-y-auto scrollbar-hide bg-surface-border animate-fade-in relative z-10"
      onScroll={handleScroll}
    >
      
      {/* 1. БЛОК COVER FLOW КАРУСЕЛИ */}
      <div 
        ref={carouselRef}
        data-collapsed="false"
        className="relative bg-surface-base w-full h-[122px] mb-2 flex items-start justify-center overflow-hidden shrink-0 touch-pan-y shadow-md will-change-transform"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {teams.map((team, index) => {
          
          const offset = getOffset(index);
          
          let x = 0; 
          let scale = 1; 
          let opacity = 1; 
          let zIndex = 30;
          
          if (offset === 0) {
            x = 0; scale = 1; opacity = 1; zIndex = 30;
          } else if (offset === 1) {
            x = 80; scale = 0.75; opacity = 0.5; zIndex = 20;
          } else if (offset === -1) {
            x = -80; scale = 0.75; opacity = 0.5; zIndex = 20;
          } else if (offset === 2) {
            x = 145; scale = 0.75; opacity = 0.5; zIndex = 10;
          } else if (offset === -2) {
            x = -145; scale = 0.75; opacity = 0.5; zIndex = 10;
          } else {
            x = offset > 0 ? 180 : -180; scale = 0.3; opacity = 0; zIndex = 0;
          }

          return (
            <div
              key={team.id}
              onClick={() => setActiveIndex(index)}
              className="absolute flex flex-col items-center justify-start transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer"
              style={{
                transform: `translateX(${x}px) scale(${scale})`,
                opacity,
                zIndex,
                pointerEvents: Math.abs(offset) > 2 ? 'none' : 'auto' 
              }}
            >
              <div className={clsx(
                "w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden transition-all duration-500",
                offset === 0 ? "drop-shadow-lg" : "drop-shadow-lg"
              )}>
                <img src={getImageUrl(team.logo_url)} alt={team.name} className="w-full h-full object-contain p-2" />
              </div>
              
              <div className={clsx(
                "absolute top-full mt-2 w-[320px] text-center transition-all duration-500",
                offset === 0 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
              )}>
                <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight line-clamp-2">
                  {team.name}
                </h2>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. ПЕРЕКЛЮЧАТЕЛЬ ЧИПСОВ */}
      <div 
        ref={stickyHeaderRef}
        data-stuck="false"
        className="sticky top-0 z-40 px-5 shrink-0 transition-all duration-300 ease-in-out border-b border-surface-level2"
      >
        <ChipTabs 
          tabs={TEAM_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="!px-0"
        />
      </div>

      {/* 3. КОНТЕНТ */}
      <div className="w-full overflow-hidden pt-4 min-h-screen pb-[30vh]">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-brand font-black animate-pulse uppercase tracking-widest text-sm">Загрузка...</div>
        ) : (
          <div 
            className="flex w-[300%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start"
            style={{ transform: `translateX(${translateX})` }}
          >
            
            {/* ПАНЕЛЬ 1: ВСЕ (БЕЗ БЕЙДЖЕЙ) */}
            <div className="w-1/3 shrink-0 px-5 transition-opacity duration-500" style={{ opacity: activeTab === 'all' ? 1 : 0.3 }}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-y-5 gap-x-2 justify-items-center">
                {allMembers.map(m => (
                  <PersonGridCard key={m.member_id} person={m} onClick={handlePersonClick} showBadges={false} />
                ))}
              </div>
            </div>

            {/* ПАНЕЛЬ 2: СОСТАВ (С БЕЙДЖАМИ) */}
            <div className="w-1/3 shrink-0 px-1 transition-opacity duration-500" style={{ opacity: activeTab === 'roster' ? 1 : 0.3 }}>
              <div className="flex flex-col gap-10">
                {[
                  { m: 'goalie', t: 'Вратари' },
                  { m: 'defense', t: 'Защитники' },
                  { m: 'forward', t: 'Нападающие' }
                ].map(group => {
                  const players = getPlayersByRole(group.m);
                  if (!players.length) return null;
                  return (
                    <div key={group.m} className="flex flex-col">
                      <h3 className="text-[11px] font-black text-content-muted uppercase tracking-[0.2em] mb-4 pl-1">{group.t}</h3>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-y-5 gap-x-2 justify-items-center">
                        {players.map(p => (
                          <PersonGridCard key={p.member_id} person={p} onClick={handlePersonClick} showBadges={true} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ПАНЕЛЬ 3: ШТАБ */}
            <div className="w-1/3 shrink-0 px-5 transition-opacity duration-500" style={{ opacity: activeTab === 'staff' ? 1 : 0.3 }}>
              <div className="grid grid-cols-1 auto-rows-fr gap-3 w-full">
                {teamData.staff?.map(s => (
                  <StaffTableCard key={s.member_id} person={s} onClick={handlePersonClick} />
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};