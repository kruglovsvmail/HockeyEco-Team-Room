import React, { useState, useEffect } from 'react';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { TextInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Icon } from '../../ui/Icon';
import { FadeIn } from '../../ui/FadeIn';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders } from '../../utils/helpers';

export function ArenaSelector({ data }) {
  // ИСПРАВЛЕНО: Извлекаем teamId, переданный из контекста главной формы
  const { onSelect, currentTeamColor, teamId } = data || {};

  const [arenaTab, setArenaTab] = useState('directory'); 
  const [arenaSearch, setArenaSearch] = useState('');
  const [arenas, setArenas] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    if (arenaTab !== 'directory' || !teamId) return;

    const fetchArenas = async () => {
      setIsLoading(true);
      try {
        // ИСПРАВЛЕНО: Добавлен обязательный параметр teamId для прохождения RBAC-проверки бэкенда
        const url = `${import.meta.env.VITE_API_URL}/api/manager/handbooks/arenas?teamId=${teamId}&search=${encodeURIComponent(arenaSearch)}`;
        const res = await fetch(url, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setArenas(json.arenas || []);
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки арен:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchArenas();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [arenaSearch, arenaTab, teamId]);

  return (
    <div 
      className="flex flex-col h-full bg-surface-level2 p-4 gap-4"
      style={currentTeamColor ? { '--color-brand': currentTeamColor } : {}}
    >
      <div className="shrink-0">
        <SegmentedControl 
          options={[
            { value: 'directory', label: 'Арены' }, 
            { value: 'custom', label: 'Ручной ввод' }
          ]} 
          value={arenaTab} 
          onChange={setArenaTab} 
        />
      </div>

      {arenaTab === 'directory' ? (
        <FadeIn key="dir" duration={200} className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="shrink-0">
            <TextInputLP 
              placeholder="Название или город..." 
              value={arenaSearch} 
              onChange={setArenaSearch} 
              activeColor={currentTeamColor} 
            />
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-2 pb-8">
            {isLoading ? (
              <div className="py-12"><PageLoader /></div>
            ) : arenas.length > 0 ? (
              arenas.map(arena => (
                <button
                  key={arena.id} 
                  type="button"
                  onClick={() => onSelect({ ...arena, isManual: false })}
                  className="w-full p-4 bg-surface-level1 border border-surface-border rounded-2xl text-left flex items-center justify-between outline-none cursor-pointer hover:border-brand/30 transition-all active:scale-[0.99]"
                >
                  <div className="flex flex-col min-w-0 pr-2 text-left">
                    <span className="text-sm font-bold text-content-main truncate">{arena.name}</span>
                    <span className="text-[11px] text-content-muted mt-0.5 truncate">{arena.city}, {arena.address}</span>
                  </div>
                  <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                </button>
              ))
            ) : (
              <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50">
                Площадок не найдено
              </div>
            )}
          </div>
        </FadeIn>
      ) : (
        <FadeIn key="custom" duration={200} className="flex-1 overflow-y-auto scrollbar-hide text-left flex flex-col gap-4 pt-1">
          <TextInputLP 
            placeholder="Название места проведения..." 
            value={customName} 
            onChange={setCustomName} 
            activeColor={currentTeamColor} 
          />
          <TextInputLP 
            placeholder="Ссылка на геопозицию..." 
            value={customUrl} 
            onChange={setCustomUrl} 
            activeColor={currentTeamColor} 
          />
          <div className="mt-2">
            <ButtonLP
              type="button" 
              variant="primary" 
              disabled={!customName.trim()} 
              activeColor={currentTeamColor}
              onClick={() => onSelect({
                isManual: true,
                id: null,
                name: customName.trim(),
                city: 'ОФП/Зал',
                location_url: customUrl.trim() || null
              })}
            >
              Подтвердить локацию
            </ButtonLP>
          </div>
        </FadeIn>
      )}
    </div>
  );
}