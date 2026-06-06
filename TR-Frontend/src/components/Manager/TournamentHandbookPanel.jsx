import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { FadeIn, StaggerContainer } from '../../ui/FadeIn';
import { HintPopover } from '../../ui/HintPopover';
import { getAuthHeaders } from '../../utils/helpers';

const CustomBlock = ({ title, icon, isEditing, onAction, isSaving, children }) => {
  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mb-3 relative overflow-hidden">
      {isSaving && (
        <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
            <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Сохранение...</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
            {title}
          </span>
        </div>
        {onAction && (
          <button 
            type="button"
            onClick={onAction} 
            className="transition-colors p-1 text-content-subtle hover:text-brand outline-none cursor-pointer flex items-center justify-center rounded-lg hover:bg-surface-level2"
          >
            {isEditing ? (
              <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <Icon name="edit" className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      <div className="flex flex-col text-left">{children}</div>
    </div>
  );
};

export function TournamentHandbookPanel({ data, onClose }) {
  const { editingTournament, loadData, onInitiateDelete, selectedTeam } = data;

  const [activePanelTab, setActivePanelTab] = useState('info'); // 'info' | 'teams'

  const [tourName, setTourName] = useState('');
  const [tourIsActive, setTourIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [leagueRoosterTeams, setLeagueRoosterTeams] = useState([]);
  
  const [teamSearch, setTeamSearch] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const [savingBlock, setSavingBlock] = useState(null);
  const [isEditName, CancelIsEditName] = useState(!editingTournament);
  const [isEditStatus, setIsEditStatus] = useState(!editingTournament);

  // Ссылки для управления таймером задержки (Debounce) и отменой летящих запросов (AbortController)
  const saveTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;

  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  useEffect(() => {
    if (editingTournament) {
      setTourName(editingTournament.name || '');
      setTourIsActive(editingTournament.is_active ?? true);
      CancelIsEditName(false);
      setIsEditStatus(false);
      setActivePanelTab('info');
      if (selectedTeam?.id) {
        loadLeagueRooster(editingTournament.id);
      }
    } else {
      setTourName('');
      setTourIsActive(true);
      setLeagueRoosterTeams([]);
      CancelIsEditName(true);
      setIsEditStatus(true);
      setActivePanelTab('info');
    }
  }, [editingTournament, selectedTeam]);

  useEffect(() => {
    const handleClosePanel = () => onClose();
    window.addEventListener('close-manager-right-panel', handleClosePanel);
    
    return () => {
      window.removeEventListener('close-manager-right-panel', handleClosePanel);
      // Очистка при размонтировании панели
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [onClose]);

  const loadLeagueRooster = async (tournamentId) => {
    setIsRosterLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${tournamentId}/roster-map?teamId=${selectedTeam.id}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setLeagueRoosterTeams(json.teams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRosterLoading(false);
    }
  };

  // Высокоэффективная фоновая отправка данных с автоотменой прошлых сессий
  const saveRosterInBackground = async (currentTeams) => {
    // Если предыдущий запрос еще выполняется — отменяем его на уровне сетевого стека браузера
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const targetOpponentIds = currentTeams.filter(t => t.is_in_tournament).map(t => t.id);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}/roster-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: selectedTeam.id, opponentIds: targetOpponentIds }),
        signal: controller.signal
      });

      if (res.ok) {
        loadData();
        // Гарантируем, что скрываем плашку лоадера только если это была самая последняя и актуальная сессия кликов
        if (abortControllerRef.current === controller) {
          setSavingBlock(null);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        if (abortControllerRef.current === controller) {
          setSavingBlock(null);
        }
      }
    }
  };

  const handleToggleRoosterTeamCheckbox = (team) => {
    if (team.is_locked && team.is_in_tournament) {
      return;
    }

    setLeagueRoosterTeams(prev => {
      const next = prev.map(t => t.id === team.id ? { ...t, is_in_tournament: !t.is_in_tournament } : t);
      
      // Сбрасываем предыдущий таймер ожидания (Debounce)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Мгновенно зажигаем плашку "Сохранение изменений..." для идеального UX отклика
      setSavingBlock('roster');

      // Ждем 500 миллисекунд тишины перед отправкой пакета в Postgres
      saveTimeoutRef.current = setTimeout(() => {
        saveRosterInBackground(next);
      }, 500);
      
      return next;
    });
  };

  const handleSaveField = async (blockKey) => {
    if (!tourName.trim() || !selectedTeam?.id) return;
    setSavingBlock(blockKey);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: selectedTeam.id, name: tourName.trim(), is_active: tourIsActive })
      });
      if (res.ok) {
        loadData();
        if (blockKey === 'name') CancelIsEditName(false);
        if (blockKey === 'status') setIsEditStatus(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBlock(null);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!tourName.trim() || !selectedTeam?.id) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: selectedTeam.id, name: tourName.trim(), is_active: tourIsActive })
      });
      if (res.ok) {
        loadData();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSelectedCount = leagueRoosterTeams.filter(t => t.is_in_tournament).length;

  const filteredTeams = leagueRoosterTeams.filter(team => {
    const matchesSearch = team.name.toLowerCase().includes(teamSearch.toLowerCase()) || 
                          team.city.toLowerCase().includes(teamSearch.toLowerCase());
    
    const isVisible = (team.status !== 'archive') || team.is_in_tournament;

    if (showOnlySelected) {
      return matchesSearch && team.is_in_tournament;
    }
    return matchesSearch && isVisible;
  });

  const isDeleteDisabled = editingTournament?.games_count > 0;

  return (
    <div 
      className="flex flex-col h-full bg-surface-level2 text-left justify-between overflow-hidden"
      style={{ ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}) }}
    >
      {/* ВЕРХНИЙ СЕГМЕНТНЫЙ ПЕРЕКЛЮЧАТЕЛЬ ПАНЕЛИ */}
      {editingTournament && (
        <div className="px-5 pt-4 pb-1 shrink-0 bg-surface-level2">
          <SegmentedControl 
            options={[
              { value: 'info', label: 'О турнире' },
              { value: 'teams', label: 'Команды' }
            ]} 
            value={activePanelTab} 
            onChange={setActivePanelTab} 
          />
        </div>
      )}

      {/* ОСНОВНАЯ ЗОНА КОНТЕНТА */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {!editingTournament || activePanelTab === 'info' ? (
          <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto scrollbar-hide p-5 pb-24">
            <StaggerContainer key="info_stagger">
              
              <CustomBlock 
                title="Название лиги / турнира" 
                icon="trophy"
                isEditing={isEditName}
                isSaving={savingBlock === 'name'}
                onAction={editingTournament ? () => {
                  if (isEditName) handleSaveField('name');
                  else CancelIsEditName(true);
                } : null}
              >
                {isEditName ? (
                  <TextInputLP 
                    placeholder="Например: ТХЛ (25/26)" 
                    value={tourName} 
                    onChange={setTourName} 
                    activeColor={activeBrandColor}
                  />
                ) : (
                  <div className="text-base font-black text-brand tracking-wide pt-1">
                    {tourName || '—'}
                  </div>
                )}
              </CustomBlock>

              <CustomBlock 
                title="Статус турнира" 
                icon="calendar"
                isEditing={isEditStatus}
                isSaving={savingBlock === 'status'}
                onAction={editingTournament ? () => {
                  if (isEditStatus) handleSaveField('status');
                  else setIsEditStatus(true);
                } : null}
              >
                {isEditStatus ? (
                  <div className="pt-1">
                    <CheckboxLP 
                      checked={tourIsActive} 
                      onChange={setTourIsActive} 
                      label="Текущий активный" 
                      activeColor={activeBrandColor}
                    />
                  </div>
                ) : (
                  <div className="text-sm font-black text-content-main tracking-wide pt-1 flex items-center gap-1.5">
                    <div className={clsx("w-2 h-2 rounded-full", tourIsActive ? "bg-brand animate-pulse" : "bg-content-muted")} />
                    {tourIsActive ? 'Текущий активный' : 'Турнир завершен'}
                  </div>
                )}
              </CustomBlock>

              {editingTournament && (
                <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex flex-col gap-1 mb-3">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Игровая активность</span>
                  <span className="text-xs text-content-main font-medium">
                    Всего матчей: <strong className="text-brand">{editingTournament.games_count || 0}</strong>
                  </span>
                </div>
              )}

              <div className="pt-4 shrink-0 flex flex-col gap-2">
                {!editingTournament ? (
                  <ButtonLP 
                    type="submit" 
                    variant="primary" 
                    disabled={!tourName.trim() || isSubmitting}
                    className="rounded-xl font-bold uppercase tracking-wider text-xs !py-3.5 !h-12"
                    activeColor={activeBrandColor}
                  >
                    Создать турнир
                  </ButtonLP>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isDeleteDisabled}
                      onClick={() => onInitiateDelete(editingTournament.id, editingTournament.name)}
                      className={clsx(
                        "w-full py-3.5 text-xs font-bold uppercase tracking-wider border transition-all rounded-xl text-center outline-none shadow-sm cursor-pointer",
                        isDeleteDisabled 
                          ? "bg-surface-level1 border-surface-border opacity-30 text-content-subtle cursor-not-allowed" 
                          : "bg-danger-muted border-danger opacity-80 text-danger hover:bg-danger/20 active:scale-[0.98] cursor-pointer"
                      )}
                    >
                      Удалить
                    </button>
                    {isDeleteDisabled && (
                      <p className="text-[13px] text-content-muted font-medium leading-relaxed text-center mt-1 px-1">
                        Удаление невозможно: в рамках этого турнира есть сыгранные или запланированые матчи вашей команды.
                      </p>
                    )}
                  </>
                )}
              </div>

            </StaggerContainer>
          </form>
        ) : (
          /* ВЫСОКОЭФФЕКТИВНАЯ ШТОРКА ВЫБОРА РОСТЕРОВ КОМАНД */
          <div className="flex flex-col h-full overflow-hidden">
            
            {/* ЗАБЛОКИРОВАННАЯ ОТ СКРОЛЛА ПАНЕЛЬ ПОИСКА И ЧЕКБОКСА */}
            <div className="px-5 py-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mx-5 mt-2 mb-4 shrink-0 flex flex-col gap-3">
              <input 
                type="text"
                placeholder="Быстрый поиск соперника или города..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-level2 border border-surface-border rounded-xl text-xs font-bold text-content-main outline-none placeholder:text-content-muted focus:border-brand/40 transition-colors"
              />
              
              <div className="mt-2">
                <CheckboxLP 
                  checked={showOnlySelected} 
                  onChange={setShowOnlySelected} 
                  label={`Выбранные команды (${totalSelectedCount})`}
                  activeColor={activeBrandColor}
                />
              </div>
            </div>

            {/* СПИСОК КАРТОЧЕК */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-24 gap-2 flex flex-col">
              <StaggerContainer key="pure_teams_list">
                {isRosterLoading ? (
                  <div className="py-16"><PageLoader /></div>
                ) : filteredTeams.length > 0 ? (
                  filteredTeams.map(team => {
                    const isLockedAndInTour = team.is_locked && team.is_in_tournament;

                    if (isLockedAndInTour) {
                      return (
                        <div className="w-full [&>*]:!flex [&>*]:!w-full" key={team.id}>
                          <HintPopover status="match_locked">
                            <div 
                              onClick={() => window.dispatchEvent(new CustomEvent('close-all-hint-popovers'))}
                              className={clsx(
                                "w-full py-3 px-4 border rounded-xl flex items-center justify-between transition-all bg-surface-level1 mb-2 shadow-sm select-none",
                                "border-brand/30"
                              )}
                              style={{ borderColor: `${activeBrandColor}30` }}
                            >
                              <div className="flex flex-col min-w-0 pr-2 text-left">
                                <span className="text-xs font-black text-content-main truncate">{team.name}</span>
                                <span className="text-[10px] text-content-muted font-bold uppercase mt-0.5 tracking-wider">{team.city}</span>
                              </div>
                              <CheckboxLP 
                                checked={true} 
                                onChange={() => {}} 
                                activeColor={activeBrandColor}
                                disabled={true}
                              />
                            </div>
                          </HintPopover>
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={team.id}
                        onClick={() => handleToggleRoosterTeamCheckbox(team)} 
                        className={clsx(
                          "w-full py-3 px-4 border rounded-xl flex items-center justify-between transition-all bg-surface-level1 mb-2 shadow-sm select-none active:scale-[0.995]",
                          team.is_in_tournament ? "border-brand/30" : "border-surface-border/50"
                        )}
                        style={team.is_in_tournament ? { borderColor: `${activeBrandColor}30` } : {}}
                      >
                        <div className="flex flex-col min-w-0 pr-2 text-left">
                          <span className="text-xs font-black text-content-main truncate">{team.name}</span>
                          <span className="text-[10px] text-content-muted font-bold uppercase mt-0.5 tracking-wider">{team.city}</span>
                        </div>
                        <CheckboxLP 
                          checked={team.is_in_tournament || false} 
                          onChange={() => handleToggleRoosterTeamCheckbox(team)} 
                          activeColor={activeBrandColor}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-16 text-xs font-bold text-content-muted opacity-40 italic">
                    {teamSearch ? 'Заданный хоккейный клуб не найден' : 'Справочник внешних команд пуст'}
                  </div>
                )}
              </StaggerContainer>
            </div>

            {/* ПЛАВАЮЩИЙ НЕБЛОКИРУЮЩИЙ ИНДИКАТОР ФОНОВОГО АВТОСОХРАНЕНИЯ */}
            <div className="absolute bottom-4 inset-x-0 shrink-0 z-30 flex justify-center pointer-events-none">
              <div className={clsx(
                "px-4 py-2 bg-surface-level1 border rounded-xl shadow-2xl flex items-center gap-2 transition-all duration-300 transform pointer-events-auto",
                savingBlock === 'roster' ? "opacity-100 translate-y-0 border-brand/30 scale-100" : "opacity-0 translate-y-4 border-surface-border/50 scale-95"
              )}>
                <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest text-content-main">
                  Сохранение изменений...
                </span>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}