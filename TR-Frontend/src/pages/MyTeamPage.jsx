/********** ФАЙЛ: TR-Frontend\src\pages\MyTeamPage.jsx **********/

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Icon } from '../ui/Icon';

// --- ЕДИНЫЙ КОМПОНЕНТ КАРТОЧКИ УЧАСТНИКА ---
const PersonCard = ({ person, onClick, subText }) => (
  <button 
    onClick={() => onClick(person)}
    className="relative group flex items-center gap-3 overflow-hidden transition-all duration-300 text-left outline-none w-full"
  >
    <div className="w-12 h-12 md:w-20 md:h-20 rounded-xl border border-brand flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative z-10 bg-surface-level1">
      {person.avatar_url ? (
        <img src={getImageUrl(person.avatar_url)} alt="Аватар" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xl font-black text-brand uppercase opacity-40">
          {person.last_name?.charAt(0)}
        </span>
      )}
    </div>

    <div className="flex flex-col flex-1 justify-center min-w-0">
      <span className="text-[12px] font-bold text-content-main truncate leading-tight tracking-wide ">
        {person.last_name}
      </span>
      <span className="text-[10px] font-semibold text-content-muted truncate">
        {person.first_name}
      </span>
      {subText && (
        <span className="text-[7px] font-black text-brand uppercase tracking-widest mt-0.5">
            {subText}
        </span>
      )}
    </div>
    <Icon name="chevron_left" className="w-4 h-4 text-content-subtle rotate-180 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
  </button>
);

export const MyTeamPage = () => {
  const { openRightPanel } = useOutletContext();
  const [teams, setTeams] = useState([]);
  
  const [activeIndex, setActiveIndex] = useState(0); 
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  
  const [teamData, setTeamData] = useState({ roster: [], staff: [] });
  const [activeTab, setActiveTab] = useState('roster');
  const [isLoading, setIsLoading] = useState(true);
  
  const navigate = useNavigate();
  const touchStartX = useRef(null);

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

  const getOffset = (index) => {
    let diff = index - activeIndex;
    const half = Math.floor(teams.length / 2);
    
    if (diff > half) {
      diff -= teams.length;
    } else if (diff < -half) {
      diff += teams.length;
    }
    return diff;
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (!touchStartX.current) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    
    if (Math.abs(diff) > 40) { 
      if (diff > 0) {
        setActiveIndex((prev) => (prev + 1) % teams.length);
      } else {
        setActiveIndex((prev) => (prev - 1 + teams.length) % teams.length);
      }
    }
    touchStartX.current = null;
  };

  const handlePersonClick = (person) => openRightPanel('userDetails', person, 'Профиль');
  const getPlayersByRole = (match) => teamData.roster?.filter(p => p.position === match) || [];

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-surface-border animate-fade-in relative z-10">
      
      {/* 1. БЛОК COVER FLOW КАРУСЕЛИ */}
      <div 
        className="relative bg-surface-base w-full h-[130px] flex items-center justify-center overflow-hidden shrink-0 touch-pan-y shadow-md pb-6 mb-3"
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
            x = 90; scale = 0.75; opacity = 0.6; zIndex = 20;
          } else if (offset === -1) {
            x = -90; scale = 0.75; opacity = 0.6; zIndex = 20;
          } else if (offset === 2) {
            x = 135; scale = 0.5; opacity = 0.2; zIndex = 10;
          } else if (offset === -2) {
            x = -135; scale = 0.5; opacity = 0.2; zIndex = 10;
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
                offset === 0 ? "border-[0px] " : "border-"
              )}>
                <img src={getImageUrl(team.logo_url)} alt={team.name} className="w-full h-full object-contain p-2" />
              </div>
              
              <div className={clsx(
                "absolute top-full mt-1 w-[320px] text-center transition-all duration-500",
                offset === 0 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
              )}>
                <h2 className="text-[11px] font-black uppercase tracking-widest text-content-main leading-tight line-clamp-2">
                  {team.name}
                </h2>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. ПЕРЕКЛЮЧАТЕЛЬ СОСТАВ / ШТАБ */}
      <div className="px-5 pb-4 pt-2 shrink-0 relative z-20">
        <SegmentedControl 
          options={[{ label: 'Состав', value: 'roster' }, { label: 'Штаб', value: 'staff' }]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* 3. КОНТЕНТ (СЛАЙДЕР СПИСКОВ В ОДНУ СТОРОНУ С БЕГУНКОМ) */}
      <div className="w-full overflow-hidden pt-2">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-brand font-black animate-pulse uppercase tracking-widest text-sm">Загрузка...</div>
        ) : (
          /* Длинный контейнер (200% ширины). 
             Мы поменяли блоки местами в DOM: теперь Штаб стоит слева, а Состав справа.
             По умолчанию (когда активен Состав) сдвигаем контейнер на -50%.
             Когда кликаем на Штаб, бегунок едет ВПРАВО, и контейнер едет ВПРАВО (от -50% к 0). 
             Синхронность достигнута! 
          */
          <div 
            className={clsx(
              "flex w-[200%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start",
              activeTab === 'roster' ? "-translate-x-1/2" : "translate-x-0"
            )}
          >
            
            {/* ПАНЕЛЬ 2: ШТАБ (Теперь стоит первой в DOM-дереве) */}
            <div className="w-1/2 shrink-0 px-5 transition-opacity duration-500" style={{ opacity: activeTab === 'staff' ? 1 : 0.3 }}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {teamData.staff?.map(s => (
                  <PersonCard 
                    key={s.member_id} 
                    person={s} 
                    onClick={handlePersonClick} 
                    subText={s.roles} 
                  />
                ))}
              </div>
            </div>

            {/* ПАНЕЛЬ 1: СОСТАВ (Теперь стоит второй в DOM-дереве) */}
            <div className="w-1/2 shrink-0 px-5 transition-opacity duration-500" style={{ opacity: activeTab === 'roster' ? 1 : 0.3 }}>
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
                      <h3 className="text-[11px] font-black text-content-muted uppercase tracking-[0.2em] mb-3 pl-1">{group.t}</h3>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                        {players.map(p => (
                          <PersonCard 
                            key={p.member_id} 
                            person={p} 
                            onClick={handlePersonClick} 
                            subText={p.is_captain ? 'Капитан' : p.is_assistant ? 'Ассистент' : null}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};