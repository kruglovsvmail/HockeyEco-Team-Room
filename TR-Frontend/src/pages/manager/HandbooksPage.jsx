import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { TextInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { BottomSheet } from '../../ui/BottomSheet';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders } from '../../utils/helpers';
import { TeamPageHeader, TeamPageHeaderSpacer } from '../../components/TeamPageHeader';

export function HandbooksPage() {
  const { selectedTeam, user, openRightPanel } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  const hasAccess = checkAccess('MGR_HANDBOOKS');

  const [activeTab, setActiveTab] = useState('opponents'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [opponents, setOpponents] = useState([]);
  const [tournaments, setTournaments] = useState([]);

  // Состояние для кастомной шторки удаления сущностей
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    type: null, // 'opponent' | 'tournament'
    id: null,
    name: ''
  });

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;

  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  const loadData = async () => {
    if (!selectedTeam?.id) return;
    setIsLoading(true);
    try {
      const tokenHeaders = getAuthHeaders();
      const q = encodeURIComponent(searchQuery);
      
      if (activeTab === 'opponents') {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/opponents-extended?teamId=${selectedTeam.id}&search=${q}`, { headers: tokenHeaders });
        const json = await res.json();
        if (json.success) setOpponents(json.opponents || []);
      } else {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/tournaments-extended?teamId=${selectedTeam.id}&search=${q}`, { headers: tokenHeaders });
        const json = await res.json();
        if (json.success) setTournaments(json.tournaments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess) {
      const delayDebounce = setTimeout(() => {
        loadData();
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
  }, [activeTab, searchQuery, selectedTeam?.id, hasAccess]);

  if (!hasAccess) {
    return (
      <SubscriptionStub 
        isOpen={true} 
        onClose={() => navigate(-1)} 
        title="Доступ ограничен"
        description="Для доступа к командному справочнику, необходимо оформить или продлить подписку."
      />
    );
  }

  const handleCreateOpen = () => {
    if (activeTab === 'opponents') {
      openRightPanel('opponentForm', { loadData, selectedTeam }, 'Новый соперник');
    } else {
      openRightPanel('tournamentForm', { loadData, selectedTeam }, 'Новый турнир');
    }
  };

  const handleEditOpen = (entity) => {
    if (activeTab === 'opponents') {
      openRightPanel('opponentForm', { 
        editingOpponent: entity, 
        loadData,
        selectedTeam,
        onInitiateDelete: (id, name) => setDeleteConfirmation({ isOpen: true, type: 'opponent', id, name })
      }, 'Карточка соперника');
    } else {
      openRightPanel('tournamentForm', { 
        editingTournament: entity, 
        loadData,
        selectedTeam,
        onInitiateDelete: (id, name) => setDeleteConfirmation({ isOpen: true, type: 'tournament', id, name })
      }, 'Лига / Турнир');
    }
  };

  const handleExecuteDelete = async () => {
    const { type, id } = deleteConfirmation;
    if (!id) return;

    try {
      const endpoint = type === 'opponent' ? 'external-opponents' : 'external-tournaments';
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/${endpoint}/${id}?teamId=${selectedTeam.id}`, { 
        method: 'DELETE', 
        headers: getAuthHeaders() 
      });
      
      if (res.ok) {
        setDeleteConfirmation({ isOpen: false, type: null, id: null, name: '' });
        loadData();
        window.dispatchEvent(new CustomEvent('close-manager-right-panel'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <FadeIn 
      className="h-full relative overflow-hidden flex flex-col bg-surface-border transition-colors duration-300"
      style={{ 
        ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}),
        touchAction: 'pan-y' 
      }}
    >
      <TeamPageHeader 
        selectedTeam={selectedTeam}
        activeTeamDetails={cachedDetails}
        activeBrandColor={activeBrandColor}
      />

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 relative z-10">
        <TeamPageHeaderSpacer />
        
        <div className="px-4 pt-2 flex flex-col gap-4">
          <div className="p-5 bg-surface-level1 rounded-3xl flex flex-col gap-4 shadow-md">
            <div className="transition-colors duration-300">
              <SegmentedControl 
                options={[{ value: 'opponents', label: 'Соперники' }, { value: 'tournaments', label: 'Турниры/лиги' }]} 
                value={activeTab} 
                onChange={(val) => { setActiveTab(val); setSearchQuery(''); }} 
                activeColor={hasTeamColor ? activeBrandColor : null} 
              />
            </div>
            <div className="transition-colors duration-300 mb-1">
              <TextInputLP placeholder="Начните ввод..." value={searchQuery} onChange={setSearchQuery} activeColor={activeBrandColor} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {isLoading ? (
              <div className="py-16"><PageLoader /></div>
            ) : activeTab === 'opponents' ? (
              <FadeIn key="opps" className="flex flex-col gap-3">
                {opponents.length > 0 ? opponents.map(opp => (
                  <button
                    key={opp.id}
                    type="button"
                    onClick={() => handleEditOpen(opp)}
                    className="w-full p-4 bg-surface-level1 border border-surface-border rounded-3xl flex items-center justify-between shadow-md text-left transition-all hover:bg-surface-level2/40 active:scale-[0.99]"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-sm font-bold text-content-main truncate">{opp.name}</span>
                      <span className="text-[11px] text-content-muted font-medium uppercase tracking-wider mt-0.5">{opp.city} ({opp.short_name})</span>
                      <div className="flex items-center gap-1.5 mt-2.5">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-surface-level2 text-content-muted border border-surface-border0">
                          Матчей: {opp.games_count || 0} , из них завершенные: {opp.finished_games_count || 0}
                        </span>
                      </div>
                    </div>
                    <Icon name="chevron_right" className="w-5 h-5 text-content-subtle shrink-0" />
                  </button>
                )) : <div className="text-center py-12 text-xs font-bold text-content-muted bg-surface-level1 border border-surface-border rounded-3xl p-6 shadow-sm">Ни одного соперника не добавлено</div>}
              </FadeIn>
            ) : (
              <FadeIn key="tours" className="flex flex-col gap-3">
                {tournaments.length > 0 ? tournaments.map(tour => (
                  <button
                    key={tour.id}
                    type="button"
                    onClick={() => handleEditOpen(tour)}
                    className="w-full p-4 bg-surface-level1 border border-surface-border rounded-3xl flex items-center justify-between shadow-md text-left transition-all hover:bg-surface-level2/40 active:scale-[0.99]"
                  >
                    <div className="flex flex-col min-w-0 pr-4 flex-1">
                      <span className="text-sm font-bold text-content-main line-clamp-2 leading-snug">{tour.name}</span>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={clsx("text-[9px] font-black uppercase border px-2 py-0.5 rounded", tour.is_active ? "bg-success/10 border-success/20 text-success" : "bg-surface-level2 border-surface-border text-content-muted")}>
                          {tour.is_active ? '● Активен' : 'Архив'}
                        </span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-surface-level2 text-content-muted border border-surface-border0">
                          Команд лиги: {tour.opponents_count || 0}
                        </span>
                      </div>
                    </div>
                    <Icon name="chevron_right" className="w-5 h-5 text-content-subtle shrink-0" />
                  </button>
                )) : <div className="text-center py-12 text-xs font-bold text-content-muted bg-surface-level1 border border-surface-border rounded-3xl p-6 shadow-sm">Список внешних лиг пуст</div>}
              </FadeIn>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-40">
        <button 
          type="button" 
          onClick={handleCreateOpen} 
          style={{ backgroundColor: activeBrandColor }} 
          className="w-14 h-14 rounded-full shadow-2xl text-white flex items-center justify-center transition-all active:scale-90 border border-white/10"
        >
          <Icon name="plus" className="w-6 h-6 stroke-[3]" />
        </button>
      </div>

      {/* ШТОРКА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ В СТИЛЕ MATCH_ATTENDANCE (БЕЗ КНОПКИ ОТМЕНА) */}
      <BottomSheet 
        isOpen={deleteConfirmation.isOpen} 
        onClose={() => setDeleteConfirmation({ isOpen: false, type: null, id: null, name: '' })}
      >
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-16 h-16 bg-danger-muted text-danger rounded-full flex items-center justify-center mb-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          
          <h3 className="text-lg font-black text-content-main leading-tight">
            Удалить элемент?
          </h3>
          
          <div className="text-[13px] text-content-muted max-w-[280px] flex flex-col gap-4">
            <p>
              Вы уверены, что хотите безвозвратно удалить элемент <span className="font-bold text-content-main">«{deleteConfirmation.name}»</span> из единого справочника базы данных?
            </p>
          </div>
          
          <div className="w-full mt-2">
            <ButtonLP 
              variant="primary" 
              onClick={handleExecuteDelete}
              className="w-full !bg-red-500 hover:!bg-red-600 !border-red-500 !text-white rounded-xl py-3 font-bold uppercase tracking-wider text-xs"
            >
              Да, удалить
            </ButtonLP>
          </div>
        </div>
      </BottomSheet>
    </FadeIn>
  );
}