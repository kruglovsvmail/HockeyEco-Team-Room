import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { ChipTabs } from '../ui/ChipTabs';
import { Avatar } from '../ui/Avatar';
import { ContainerContent } from '../ui/ContainerContent';
import { Table } from '../ui/Table';

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

  const roleDict = {
    'team_manager': 'Руководитель',
    'team_admin': 'Администратор',
    'coach': 'Тренер',
    'head_coach': 'Гл. тренер'
  };

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

  const staffColumns = useMemo(() => [
    {
      key: 'photo',
      title: 'Фото',
      width: '64px',
      align: 'center',
      render: (person) => (
        <Avatar 
          photoUrl={person.photo_url || person.avatar_url}
          firstName={person.first_name}
          lastName={person.last_name}
          className="w-11 h-11 rounded-xl bg-surface-level2 border border-surface-level2 shadow-sm mx-auto pointer-events-none"
        />
      )
    },
    {
      key: 'name',
      title: 'Имя',
      width: 'auto',
      render: (person) => (
        <div className="flex flex-col pointer-events-none">
          <span className="font-bold text-content-main leading-tight">{person.last_name}</span>
          <span className="text-[12px] text-content-muted mt-0.5">{person.first_name}</span>
        </div>
      )
    },
    {
      key: 'roles',
      title: 'Роль',
      width: '140px',
      align: 'right',
      render: (person) => {
        if (!person.roles) return null;
        const rolesArray = person.roles.split(',').map(r => r.trim());
        return (
          <div className="flex flex-col gap-1 items-end justify-center pointer-events-none">
            {rolesArray.map((r, i) => (
              <span key={i} className="text-[10px] font-black text-brand uppercase tracking-widest text-right">
                {roleDict[r] || r}
              </span>
            ))}
          </div>
        );
      }
    }
  ], []);

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
            {/* ВКЛАДКА: ВСЕ (Убраны лишние отступы у колонки слайдера) */}
            <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'all' ? 1 : 0.3 }}>
              <ContainerContent title="Общий состав" count={allMembers.length}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center">
                  {allMembers.map(m => (
                    <PersonGridCard key={m.member_id} person={m} onClick={handlePersonClick} showBadges={false} />
                  ))}
                </div>
              </ContainerContent>
            </div>

            {/* ВКЛАДКА: СОСТАВ */}
            <div className="w-1/3 shrink-0 transition-opacity duration-500 flex flex-col gap-6" style={{ opacity: activeTab === 'roster' ? 1 : 0.3 }}>
              {[
                { m: 'goalie', t: 'Вратари' },
                { m: 'defense', t: 'Защитники' },
                { m: 'forward', t: 'Нападающие' }
              ].map(group => {
                const players = getPlayersByRole(group.m);
                if (!players.length) return null;
                return (
                  <ContainerContent key={group.m} title={group.t} count={players.length}>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center">
                      {players.map(p => (
                        <PersonGridCard key={p.member_id} person={p} onClick={handlePersonClick} showBadges={true} />
                      ))}
                    </div>
                  </ContainerContent>
                );
              })}
            </div>

            {/* ВКЛАДКА: ШТАБ */}
            <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'staff' ? 1 : 0.3 }}>
              <ContainerContent title="Руководство и тренеры" count={teamData.staff?.length}>
                <Table 
                  columns={staffColumns} 
                  data={teamData.staff || []} 
                  rowKey="member_id" 
                  onRowClick={handlePersonClick}
                />
              </ContainerContent>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};