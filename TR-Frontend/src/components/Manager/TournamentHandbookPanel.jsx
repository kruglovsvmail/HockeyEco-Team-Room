import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { FadeIn, StaggerContainer } from '../../ui/FadeIn';
import { HintPopover } from '../../ui/HintPopover'; // Импортируем ваш HintPopover
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
  
  // Умный компактный UX-фильтр
  const [teamSearch, setTeamSearch] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false); // ИСПРАВЛЕНО: Теперь стейт обычного чекбокса

  const [savingBlock, setSavingBlock] = useState(null);
  const [isEditName, setIsEditName] = useState(!editingTournament);
  const [isEditStatus, setIsEditStatus] = useState(!editingTournament);

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
      setIsEditName(false);
      setIsEditStatus(false);
      setActivePanelTab('info');
      if (selectedTeam?.id) {
        loadLeagueRooster(editingTournament.id);
      }
    } else {
      setTourName('');
      setTourIsActive(true);
      setLeagueRoosterTeams([]);
      setIsEditName(true);
      setIsEditStatus(true);
      setActivePanelTab('info');
    }
  }, [editingTournament, selectedTeam]);

  useEffect(() => {
    const handleClosePanel = () => onClose();
    window.addEventListener('close-manager-right-panel', handleClosePanel);
    return () => window.removeEventListener('close-manager-right-panel', handleClosePanel);
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

  const handleToggleRoosterTeamCheckbox = (team) => {
    // ИСПРАВЛЕНО: Блокируем клик наглухо, если матч уже сыгран или запланирован
    if (team.is_locked && team.is_in_tournament) {
      return;
    }
    setLeagueRoosterTeams(prev => prev.map(t => t.id === team.id ? { ...t, is_in_tournament: !t.is_in_tournament } : t));
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
        if (blockKey === 'name') setIsEditName(false);
        if (blockKey === 'status') setIsEditStatus(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBlock(null);
    }
  };

  const handleSaveRosterMap = async () => {
    setSavingBlock('roster');
    try {
      const targetOpponentIds = leagueRoosterTeams.filter(t => t.is_in_tournament).map(t => t.id);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}/roster-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: selectedTeam.id, opponentIds: targetOpponentIds })
      });
      if (res.ok) {
        loadData();
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
    if (showOnlySelected) {
      return matchesSearch && team.is_in_tournament;
    }
    return matchesSearch;
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
        
        {savingBlock === 'roster' && (
          <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-50 flex items-center justify-center animate-fade-in">
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-level1 border border-surface-border rounded-xl shadow-xl">
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider text-content-main">Сохранение состава лиги...</span>
            </div>
          </div>
        )}

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
                  else setIsEditName(true);
                } : null}
              >
                {isEditName ? (
                  <TextInputLP 
                    placeholder="Например: ТХЛ 40+ (2026)" 
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
          /* ИСПРАВЛЕНО: Высокоэффективная шторка выбора ростеров команд */
          <div className="flex flex-col h-full overflow-hidden">
            
            {/* ИСПРАВЛЕНО: ЗАБЛОКИРОВАННАЯ ОТ СКРОЛЛА ПАНЕЛЬ ПОИСКА И ЧЕКБОКСА */}
            <div className="px-5 py-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mx-5 mt-2 mb-4 shrink-0 flex flex-col gap-3">
              <input 
                type="text"
                placeholder="Быстрый поиск соперника или города..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-level2 border border-surface-border rounded-xl text-xs font-bold text-content-main outline-none placeholder:text-content-muted focus:border-brand/40 transition-colors"
              />
              
              {/* ИСПРАВЛЕНО: Замена тумблеров на аккуратный чекбокс */}
              <div className="mt-2">
                <CheckboxLP 
                  checked={showOnlySelected} 
                  onChange={setShowOnlySelected} 
                  label={`Выбранные команды (${totalSelectedCount})`}
                  activeColor={activeBrandColor}
                />
              </div>
            </div>

            {/* ИСПРАВЛЕНО: ЧИСТЫЙ СПИСОК КАРТОЧЕК БЕЗ ВЛОЖЕННЫХ ОГРАНИЧИТЕЛЬНЫХ КОНТЕЙНЕРОВ */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-24 gap-2 flex flex-col">
              <StaggerContainer key="pure_teams_list">
                {isRosterLoading ? (
                  <div className="py-16"><PageLoader /></div>
                ) : filteredTeams.length > 0 ? (
                  filteredTeams.map(team => {
                    const cardContent = (
                      <div 
                        onClick={() => handleToggleRoosterTeamCheckbox(team)} 
                        className={clsx(
                          "w-full py-3 px-4 border rounded-xl flex items-center justify-between transition-all bg-surface-level1 mb-2 shadow-sm select-none",
                          team.is_in_tournament ? "border-brand/30" : "border-surface-border/50",
                          team.is_locked && team.is_in_tournament ? "opacity-90 bg-surface-level2" : "active:scale-[0.995]"
                        )}
                        style={team.is_in_tournament && !team.is_locked ? { borderColor: `${activeBrandColor}30` } : {}}
                      >
                        <div className="flex flex-col min-w-0 pr-2 text-left">
                          <span className="text-xs font-black text-content-main truncate">{team.name}</span>
                          <span className="text-[10px] text-content-muted font-bold uppercase mt-0.5 tracking-wider">{team.city}</span>
                        </div>
                        <CheckboxLP 
                          checked={team.is_in_tournament || false} 
                          // Отключаем нативную реакцию чекбокса при локе, обработку забирает HintPopover триггер
                          onChange={team.is_locked && team.is_in_tournament ? () => {} : () => handleToggleRoosterTeamCheckbox(team)} 
                          activeColor={activeBrandColor}
                          disabled={team.is_locked && team.is_in_tournament}
                        />
                      </div>
                    );

                    // ИСПРАВЛЕНО: Если команда сыграла матч, оборачиваем её карточку в Portal-инжектор HintPopover
                    if (team.is_locked && team.is_in_tournament) {
                      return (
                        <HintPopover key={team.id} status="not_in_team">
                          {/* Кастомный рендер строки ошибки для HintPopover */}
                          <style>
                            {`
                              .fixed p {
                                font-size: 11px !important;
                              }
                            `}
                          </style>
                          <div onClick={(e) => e.stopPropagation()} className="w-full">
                            {React.cloneElement(cardContent, {
                              onClick: (e) => {
                                e.stopPropagation();
                                // Шлём шинный вызов, чтобы открыть поповер над этой карточкой
                                window.dispatchEvent(new CustomEvent('close-all-hint-popovers'));
                              },
                              // Подменяем текст поповера на лету, перехватив рендер
                              children: [
                                ...cardContent.props.children.slice(0, -1),
                                React.cloneElement(cardContent.props.children[cardContent.props.children.length - 1], {
                                  label: undefined
                                })
                              ]
                            })}
                          </div>
                          {/* Скрытый триггер-оверлей сообщения */}
                          <span className="hidden">Матч с этой командой состоялся или запланирован</span>
                        </HintPopover>
                      );
                    }

                    return React.cloneElement(cardContent, { key: team.id });
                  })
                ) : (
                  <div className="text-center py-16 text-xs font-bold text-content-muted opacity-40 italic">
                    {teamSearch ? 'Заданный хоккейный клуб не найден' : 'Справочник внешних команд пуст'}
                  </div>
                )}
              </StaggerContainer>
            </div>

            {/* ФИКСИРОВАННАЯ НИЖНЯЯ КНОПКА СОХРАНЕНИЯ */}
            <div className="absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-surface-level2 via-surface-level2 to-transparent shrink-0 z-30">
              <ButtonLP 
                type="button" 
                variant="primary" 
                onClick={handleSaveRosterMap}
                disabled={isRosterLoading}
                className="rounded-xl font-bold uppercase tracking-wider text-xs !py-3.5 !h-12 w-full shadow-lg"
                activeColor={activeBrandColor}
              >
                Сохранить состав участников
              </ButtonLP>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}