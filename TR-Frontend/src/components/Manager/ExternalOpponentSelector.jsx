import React, { useState, useEffect } from 'react';
import { TextInputLP } from '../../ui/Input-LP';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders } from '../../utils/helpers';

export function ExternalOpponentSelector({ data }) {
  // ИСПРАВЛЕНО: Извлекаем teamId для авторизации в requireTeamPermission
  const { onSelect, currentTeamColor, tournamentId, teamId } = data || {};
  const [search, setSearch] = useState('');
  const [opponents, setOpponents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tournamentId || !teamId) return;

    const fetchOpponents = async () => {
      setIsLoading(true);
      try {
        // ИСПРАВЛЕНО: Добавлен teamId в параметры запроса, так как эндпоинт содержит кастомный :tournamentId в роуте
        const url = `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${tournamentId}/opponents?teamId=${teamId}&search=${encodeURIComponent(search)}`;
        const res = await fetch(url, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setOpponents(json.opponents || []);
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки соперников турнира:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchOpponents();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, tournamentId, teamId]);

  return (
    <div 
      className="flex flex-col h-full bg-surface-level2 p-4 gap-4"
      style={currentTeamColor ? { '--color-brand': currentTeamColor } : {}}
    >
      <div className="shrink-0 text-left">
        <TextInputLP 
          label="Поиск соперника в турнире" 
          placeholder="Введите название команды..." 
          value={search} 
          onChange={setSearch} 
          activeColor={currentTeamColor}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-2 pb-8">
        {isLoading ? (
          <div className="py-12"><PageLoader /></div>
        ) : opponents.length > 0 ? (
          opponents.map(opponent => (
            <button
              key={opponent.id}
              type="button"
              onClick={() => onSelect(opponent)}
              className="w-full p-4 bg-surface-level1 border border-surface-border rounded-2xl text-left flex items-center justify-between outline-none cursor-pointer hover:border-brand/30 transition-all active:scale-[0.99]"
            >
              <div className="flex flex-col min-w-0 pr-2 text-left">
                <span className="text-sm font-bold text-content-main truncate">{opponent.name}</span>
                <span className="text-[11px] text-content-muted mt-0.5 truncate">
                  {opponent.city} ({opponent.short_name})
                </span>
              </div>
              <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
            </button>
          ))
        ) : (
          <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50">
            Соперников не найдено
          </div>
        )}
      </div>
    </div>
  );
}