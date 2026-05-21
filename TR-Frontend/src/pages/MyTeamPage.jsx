import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { ChipTabs } from '../ui/ChipTabs';
import { Avatar } from '../ui/Avatar';

// --- КОМПОНЕНТ КАРТОЧКИ-СЕТКИ ДЛЯ ВЗГЛЯДА "ВСЕ" И "СОСТАВ" ---
const PersonGridCard = ({ person, onClick, showBadges = false }) => {
  return (
    <div 
      onClick={() => onClick(person)}
      className="flex flex-col items-center gap-1.5 select-none w-full cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="relative">
        <Avatar 
          photoUrl={person.photo_url || person.avatar_url}
          firstName={person.first_name}
          lastName={person.last_name}
          className="w-16 h-16 rounded-2xl bg-surface-level2 border border-surface-level2 shadow-sm origin-center"
        />

        {showBadges && (person.is_captain || person.is_assistant) && (
          <div className="absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full bg-brand shadow-sm flex items-center justify-center text-[9px] font-black text-content-dark z-20">
            {person.is_captain ? 'К' : 'А'}
          </div>
        )}

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
      <Avatar 
        photoUrl={person.photo_url || person.avatar_url}
        firstName={person.first_name}
        lastName={person.last_name}
        className="w-16 h-16 rounded-2xl bg-surface-level2 border border-surface-level2 shadow-sm"
      />
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
  // Читаем выбранную в сайдбаре команду реактивно из контекста верхнего уровня
  const { openRightPanel, selectedTeam } = useOutletContext();
  
  const [teamData, setTeamData] = useState({ roster: [], staff: [] });
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  
  const selectedTeamId = selectedTeam?.id;
  const rafRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stickyHeaderRef = useRef(null);

  // Загружаем ростер и штаб только при изменении id выбранной команды
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
      className="h-full overflow-y-auto scrollbar-hide bg-surface-border animate-fade-in relative z-10 snap-y snap-proximity"
      onScroll={handleScroll}
    >
      {/* ФИКСИРОВАННАЯ ШАПКА ВМЕСТО СТАРОЙ ТЯЖЕЛОЙ КАРУСЕЛИ */}
      <div className="bg-surface-base px-5 py-4 mb-2 flex items-center gap-4 shadow-sm shrink-0 border-b border-surface-level2 snap-start">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm bg-surface-level1 border border-surface-border shrink-0">
          <img 
            src={getImageUrl(selectedTeam?.logo_url)} 
            alt={selectedTeam?.name} 
            className="w-full h-full object-contain p-1" 
          />
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="text-[15px] font-black uppercase tracking-widest text-content-main leading-tight truncate">
            {selectedTeam?.name}
          </h2>
          <span className="text-[10px] font-black text-brand uppercase tracking-[0.2em] mt-1">
            Текущий состав
          </span>
        </div>
      </div>

      <div 
        ref={stickyHeaderRef}
        data-stuck="false"
        className="snap-start sticky top-0 z-40 px-5 shrink-0 transition-all duration-300 ease-in-out border-b border-surface-level2 bg-transparent"
      >
        <ChipTabs 
          tabs={TEAM_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="!px-0"
        />
      </div>

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
            <div className="w-1/3 shrink-0 px-5 transition-opacity duration-500" style={{ opacity: activeTab === 'all' ? 1 : 0.3 }}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-y-5 gap-x-2 justify-items-center">
                {allMembers.map(m => (
                  <PersonGridCard key={m.member_id} person={m} onClick={handlePersonClick} showBadges={false} />
                ))}
              </div>
            </div>

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