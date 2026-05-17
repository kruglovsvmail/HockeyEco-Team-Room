import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Icon } from '../ui/Icon';

// --- ЕДИНЫЙ КОМПОНЕНТ КАРТОЧКИ (ГОРИЗОНТАЛЬНЫЙ) ---
const PersonCard = ({ person, onClick, subText }) => (
  <button 
    onClick={() => onClick(person)}
    className="relative group flex items-center gap-4 p-3 rounded-[24px] bg-surface-level1 border border-surface-border/60 shadow-sm overflow-hidden transition-all duration-300 active:scale-95 text-left outline-none"
  >
    {/* Фото */}
    <div className="w-14 h-14 rounded-2xl bg-surface-base border border-surface-border flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative z-10">
      {person.avatar_url ? (
        <img src={getImageUrl(person.avatar_url)} alt="Аватар" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xl font-black text-brand uppercase opacity-20">
          {person.last_name?.charAt(0)}
        </span>
      )}
    </div>

    {/* Текст (Фамилия Имя) */}
    <div className="flex flex-col min-w-0 flex-1">
      <span className="text-[15px] font-black text-content-main truncate leading-tight uppercase tracking-tighter">
        {person.last_name}
      </span>
      <span className="text-[13px] font-bold text-content-muted truncate mt-0.5">
        {person.first_name}
      </span>
      {subText && (
        <span className="text-[10px] font-black text-brand uppercase tracking-widest mt-1.5 opacity-80">
            {subText}
        </span>
      )}
    </div>

    {/* Индикатор кликабельности */}
    <Icon name="chevron_left" className="w-4 h-4 text-content-subtle rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
  </button>
);

export const MyTeamPage = () => {
  const { openRightPanel } = useOutletContext(); // Достаем функцию из контекста
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamData, setTeamData] = useState({ roster: [], staff: [] });
  const [activeTab, setActiveTab] = useState('roster');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/my`, { headers: getAuthHeaders() });
        if (res.status === 401) return navigate('/login');
        const data = await res.json();
        setTeams(data.teams || []);
        if (data.teams?.length > 0) {
          const savedId = localStorage.getItem('teampwa_myteam_selected');
          const found = data.teams.find(t => t.id == savedId);
          setSelectedTeamId(found ? found.id : data.teams[0].id);
        }
      } catch (err) { console.error(err); }
    };
    fetchTeams();
  }, [navigate]);

  useEffect(() => {
    if (!selectedTeamId) return;
    localStorage.setItem('teampwa_myteam_selected', selectedTeamId);
    const fetchTeamData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/details`, { headers: getAuthHeaders() });
        if (res.ok) setTeamData(await res.json());
      } catch (err) { console.error(err); } finally { setIsLoading(false); }
    };
    fetchTeamData();
  }, [selectedTeamId]);

  const handlePersonClick = (person) => {
    openRightPanel('userDetails', person, 'Профиль');
  };

  const getPlayersByRole = (match) => teamData.roster?.filter(p => p.position === match) || [];

  return (
    <div className="flex flex-col h-full animate-fade-in relative z-10">
      {/* ПАНЕЛЬ КОМАНД */}
      {teams.length > 1 && (
        <div className="w-full overflow-x-auto scrollbar-hide flex items-center gap-3 px-5 py-5 border-b border-surface-border bg-surface-base shrink-0 snap-x snap-mandatory shadow-sm relative z-20">
          {teams.map(team => (
            <button 
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={clsx(
                "snap-start flex items-center gap-3 shrink-0 p-1.5 pr-5 rounded-[24px] transition-all duration-300 outline-none border",
                selectedTeamId === team.id ? "bg-surface-level2 border-surface-border shadow-sm" : "opacity-60 grayscale scale-95"
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center overflow-hidden">
                <img src={getImageUrl(team.logo_url)} alt={team.name} className="w-full h-full object-contain p-1" />
              </div>
              <span className="text-[13px] font-black uppercase tracking-wider">{team.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ПЕРЕКЛЮЧАТЕЛЬ */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <SegmentedControl 
          options={[{ label: 'Состав', value: 'roster' }, { label: 'Штаб', value: 'staff' }]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* КОНТЕНТ */}
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-2 scrollbar-hide">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-brand font-black animate-pulse">ЗАГРУЗКА...</div>
        ) : (
          <div className="flex flex-col animate-fade-in">
            {activeTab === 'roster' && (
              <div className="flex flex-col gap-6">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            )}

            {activeTab === 'staff' && (
              <div className="grid grid-cols-1 gap-3">
                {teamData.staff?.map(s => (
                  <PersonCard 
                    key={s.member_id} 
                    person={s} 
                    onClick={handlePersonClick} 
                    subText={s.roles} 
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};