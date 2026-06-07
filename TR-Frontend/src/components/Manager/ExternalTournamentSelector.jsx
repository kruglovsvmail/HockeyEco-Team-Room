import React, { useState, useEffect } from 'react';
import { TextInputLP } from '../../ui/Input-LP';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders } from '../../utils/helpers';

export function ExternalTournamentSelector({ data }) {
  // ИСПРАВЛЕНО: Извлекаем teamId из настроек вызова панели
  const { onSelect, currentTeamColor, teamId } = data || {};
  const [search, setSearch] = useState('');
  const [tournaments, setTournaments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!teamId) return;

    const fetchTournaments = async () => {
      setIsLoading(true);
      try {
        // ИСПРАВЛЕНО: Добавлен teamId в query parameters
        const url = `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments?teamId=${teamId}&search=${encodeURIComponent(search)}`;
        const res = await fetch(url, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setTournaments(json.tournaments || []);
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки внешних турниров:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchTournaments();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, teamId]);

  return (
    <div 
      className="flex flex-col h-full bg-surface-level2 p-4 gap-4"
      style={currentTeamColor ? { '--color-brand': currentTeamColor } : {}}
    >
      <div className="shrink-0 text-left">
        <TextInputLP 
          label="Поиск внешнего турнира" 
          placeholder="Введите название турнира..." 
          value={search} 
          onChange={setSearch} 
          activeColor={currentTeamColor}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-2 pb-8">
        {isLoading ? (
          <div className="py-12"><PageLoader /></div>
        ) : tournaments.length > 0 ? (
          tournaments.map(tournament => (
            <button
              key={tournament.id}
              type="button"
              onClick={() => onSelect(tournament)}
              className="w-full p-4 bg-surface-level1 border border-surface-border rounded-2xl text-left flex items-center justify-between outline-none cursor-pointer hover:border-brand/30 transition-all active:scale-[0.99]"
            >
              <div className="flex flex-col min-w-0 pr-2 text-left">
                <span className="text-sm font-bold text-content-main truncate">{tournament.name}</span>
                <span className="text-[10px] text-green-500 font-black uppercase tracking-wider mt-1 block">
                  ● Активный чемпионат
                </span>
              </div>
              <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
            </button>
          ))
        ) : (
          <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50">
            Активных турниров не найдено
          </div>
        )}
      </div>
    </div>
  );
}