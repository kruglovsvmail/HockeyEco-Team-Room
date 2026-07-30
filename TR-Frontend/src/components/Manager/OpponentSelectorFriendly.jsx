import React, { useState, useEffect } from 'react';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { TextInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { BottomSheet } from '../../ui/BottomSheet';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders, getImageUrl } from '../../utils/helpers';

// Логотип соперника в списке выбора — заглушка «нет лого», если файл не загружен
function OpponentLogo({ logoUrl, name }) {
  if (logoUrl) {
    return (
      <img
        src={getImageUrl(logoUrl)}
        alt={name}
        className="w-12 h-12 object-contain shrink-0"
      />
    );
  }
  return (
    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-level3 text-content-subtle font-semibold text-[9px] text-center leading-tight shrink-0">
      нет лого
    </div>
  );
}

export function OpponentSelectorFriendly({ data }) {
  // ИСПРАВЛЕНО: Извлекаем стандартизированный teamId
  const { onSelect, currentTeamColor, teamId } = data || {};

  const [opponentTab, setOpponentTab] = useState('pwa'); 
  const [opponentSearch, setOpponentSearch] = useState('');
  const [pwaTeams, setPwaTeams] = useState([]);
  const [externalOpponents, setExternalOpponents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isNewOpponentSheetOpen, setIsNewOpponentSheetOpen] = useState(false);
  const [newOpponentName, setNewOpponentName] = useState('');
  const [newOpponentShort, setNewOpponentShort] = useState('');
  const [newOpponentCity, setNewOpponentCity] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!teamId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const q = encodeURIComponent(opponentSearch);
        let url = '';
        
        // ИСПРАВЛЕНО: teamId пробрасывается в оба эндпоинта для верификации прав доступа в auth.js
        if (opponentTab === 'pwa') {
          url = `${import.meta.env.VITE_API_URL}/api/manager/handbooks/pwa-teams?teamId=${teamId}&search=${q}`;
        } else {
          url = `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents?teamId=${teamId}&search=${q}`;
        }

        const res = await fetch(url, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            if (opponentTab === 'pwa') {
              setPwaTeams(json.teams || []);
            } else {
              setExternalOpponents(json.opponents || []);
            }
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки соперников:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchData();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [opponentSearch, opponentTab, teamId]);

  const handleCreateNewOpponentSubmit = async (e) => {
    e.preventDefault();
    if (!newOpponentName.trim() || !newOpponentCity.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          teamId: teamId, // ИСПРАВЛЕНО: Контекст команды передается в теле запроса
          name: newOpponentName.trim(),
          short_name: (newOpponentShort.trim() || newOpponentName.trim().slice(0, 3)).toUpperCase(),
          city: newOpponentCity.trim()
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.opponent) {
          setIsNewOpponentSheetOpen(false);
          setNewOpponentName('');
          setNewOpponentShort('');
          setNewOpponentCity('');
          onSelect({ ...json.opponent, isPwa: false });
        }
      }
    } catch (err) {
      console.error('Ошибка создания соперника:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-surface-level2 p-4 gap-4"
      style={currentTeamColor ? { '--color-brand': currentTeamColor } : {}}
    >
      <div className="shrink-0">
        <SegmentedControl 
          options={[
            { value: 'pwa', label: 'Вызов' }, 
            { value: 'external', label: 'Из справоч.' }
          ]} 
          value={opponentTab} 
          onChange={setOpponentTab} 
        />
      </div>

      <div className="shrink-0 text-left">
        <TextInputLP 
          placeholder="Команда соперника..." 
          value={opponentSearch} 
          onChange={setOpponentSearch} 
          activeColor={currentTeamColor}
        />
      </div>

      {opponentTab === 'pwa' ? (
        <FadeIn key="pwa-list" duration={200} className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-2 pb-8 text-left">
          {isLoading ? (
            <div className="py-12"><PageLoader /></div>
          ) : pwaTeams.length > 0 ? (
            pwaTeams.map(team => (
              <button
                key={team.id} 
                type="button"
                onClick={() => onSelect({ ...team, isPwa: true })}
                className="w-full p-4 bg-surface-level1 border border-surface-border rounded-2xl text-left flex items-center justify-between gap-3 outline-none cursor-pointer hover:border-brand/30 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <OpponentLogo logoUrl={team.logo_url} name={team.name} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[14px] font-bold text-content-main truncate">{team.name}</span>
                    <span className="text-[10px] text-content-muted mt-0.5 truncate">{team.city}</span>
                  </div>
                </div>
                <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
              </button>
            ))
          ) : (
            <div className="text-center py-12 text-[14px] font-bold text-content-muted opacity-50">Команд лиги не найдено</div>
          )}
        </FadeIn>
      ) : (
        <FadeIn key="ext-list" duration={200} className="flex-1 flex flex-col overflow-hidden text-left">
          <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-2 pb-4">
            {isLoading ? (
              <div className="py-12"><PageLoader /></div>
            ) : externalOpponents.length > 0 ? (
              externalOpponents.map(opp => (
                <button
                  key={opp.id} 
                  type="button"
                  onClick={() => onSelect({ ...opp, isPwa: false })}
                  className="w-full p-4 bg-surface-level1 border border-surface-border rounded-2xl text-left flex items-center justify-between gap-3 outline-none cursor-pointer hover:border-brand/30 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <OpponentLogo logoUrl={opp.logo_url} name={opp.name} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[14px] font-bold text-content-main truncate">{opp.name}</span>
                      <span className="text-[10px] text-content-muted mt-0.5 truncate">{opp.city}</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                </button>
              ))
            ) : (
              <div className="text-center py-12 text-[14px] font-bold text-content-muted opacity-50">Справочник пуст</div>
            )}
          </div>
          
          <div className="pt-2 shrink-0">
            <ButtonLP 
              type="button" 
              variant="outline" 
              icon="user_plus" 
              activeColor={currentTeamColor} 
              onClick={() => setIsNewOpponentSheetOpen(true)}
            >
              + Новый соперник
            </ButtonLP>
          </div>
        </FadeIn>
      )}

      <BottomSheet isOpen={isNewOpponentSheetOpen} onClose={() => setIsNewOpponentSheetOpen(false)}>
        <form onSubmit={handleCreateNewOpponentSubmit} className="flex flex-col gap-4 text-left pb-6">
          <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main mb-1">Новый соперник в справочник команды</h3>
          
          <TextInputLP placeholder="Полное название команды" value={newOpponentName} onChange={setNewOpponentName} activeColor={currentTeamColor} />
          <div className="grid grid-cols-2 gap-10">
            <TextInputLP placeholder="Город" value={newOpponentCity} onChange={setNewOpponentCity} activeColor={currentTeamColor} />
            <TextInputLP placeholder="Аббревиатура" value={newOpponentShort} onChange={setNewOpponentShort} activeColor={currentTeamColor} />
          </div>

          <div className="mt-4">
            <ButtonLP type="submit" variant="primary" isLoading={isCreating} disabled={!newOpponentName.trim() || !newOpponentCity.trim()} activeColor={currentTeamColor}>
              Добавить и выбрать
            </ButtonLP>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}