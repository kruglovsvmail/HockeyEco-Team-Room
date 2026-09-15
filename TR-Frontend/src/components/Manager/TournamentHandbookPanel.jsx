import React, { useState, useEffect, useRef, useMemo } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { ImageUploaderLP } from '../../ui/ImageUploaderLP';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { FadeIn, StaggerContainer } from '../../ui/FadeIn';
import { HintPopover } from '../../ui/HintPopover';
import { getAuthHeaders, getTeamUiColor, getImageUrl } from '../../utils/helpers';

// Логотип грузится отдельным multipart-запросом (поле logo), teamId — в адресе:
// multer разбирает тело уже после проверки прав, и из body его там не достать.
const logoEndpoint = (tournamentId, teamId) =>
  `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${tournamentId}/logo?teamId=${teamId}`;

const uploadTournamentLogo = async (tournamentId, teamId, file) => {
  const body = new FormData();
  body.append('logo', file);
  const res = await fetch(logoEndpoint(tournamentId, teamId), { method: 'POST', headers: getAuthHeaders(), body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'Не удалось загрузить логотип');
  return json.logo_url;
};

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
            {/* Крестик — отмена правки, черновик откатывается; сохранение — кнопкой
                внизу блока, как в остальных панелях с карандашиком. */}
            <Icon name={isEditing ? 'close' : 'edit'} className={clsx('w-4 h-4', isEditing && 'text-brand')} />
          </button>
        )}
      </div>
      <div className="flex flex-col text-left">{children}</div>
    </div>
  );
};

// Плитка логотипа соперника в списке состава турнира; без логотипа — иконка команды.
const RosterLogo = ({ logoUrl }) => (
  <div className="w-9 h-9 rounded-xl bg-surface-level2 flex items-center justify-center shrink-0 overflow-hidden">
    {logoUrl
      ? <img src={getImageUrl(logoUrl)} alt="" className="w-full h-full object-contain p-1" />
      : <Icon name="team" className="w-4 h-4 text-content-subtle" />}
  </div>
);

// Кнопка сохранения блока — та же, что в остальных панелях с карандашиком.
const SaveButton = ({ onClick, disabled, activeColor }) => (
  <ButtonLP
    variant="primary"
    onClick={onClick}
    disabled={disabled}
    activeColor={activeColor}
    className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
  >
    <span>Сохранить</span>
  </ButtonLP>
);

export function TournamentHandbookPanel({ data, onClose }) {
  const { editingTournament, loadData, onInitiateDelete, selectedTeam } = data;

  const [activePanelTab, setActivePanelTab] = useState('info'); // 'info' | 'teams'

  const [tourName, setTourName] = useState('');
  const [tourIsActive, setTourIsActive] = useState(true);
  // Сохранённые значения: к ним откатывается черновик по крестику, и из них берётся
  // второе поле, когда сохраняется один блок.
  const [saved, setSaved] = useState({ name: '', isActive: true });
  // Текущий логотип (ссылка в S3) и файл, выбранный до создания турнира: у нового
  // турнира ещё нет id, куда грузить, — файл ждёт, пока POST его не вернёт.
  const [tourLogoUrl, setTourLogoUrl] = useState(null);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [logoError, setLogoError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [leagueRoosterTeams, setLeagueRoosterTeams] = useState([]);
  
  const [teamSearch, setTeamSearch] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const [savingBlock, setSavingBlock] = useState(null);
  const [isEditName, setIsEditName] = useState(!editingTournament);
  const [isEditStatus, setIsEditStatus] = useState(!editingTournament);

  // Ссылки для управления таймером задержки (Debounce) и отменой летящих запросов (AbortController)
  const saveTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  // Кэш команды парсится один раз на ключ, а не на каждый рендер: в нём лежат состав,
  // ростер и штаб целиком, и синхронный JSON.parse такого объёма посреди анимации
  // перехода — это заметный фриз на телефоне.
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedDetails = useMemo(() => {
    if (!teamCacheKey) return null;
    try {
      const raw = localStorage.getItem(teamCacheKey);
      return raw ? JSON.parse(raw)?.fullDetails ?? null : null;
    } catch { return null; }
  }, [teamCacheKey]);

  const teamColorSource = getTeamUiColor(cachedDetails) || getTeamUiColor(selectedTeam);
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  useEffect(() => {
    if (editingTournament) {
      setTourName(editingTournament.name || '');
      setTourIsActive(editingTournament.is_active ?? true);
      setSaved({ name: editingTournament.name || '', isActive: editingTournament.is_active ?? true });
      setTourLogoUrl(editingTournament.logo_url || null);
      setIsEditName(false);
      setIsEditStatus(false);
      setActivePanelTab('info');
      if (selectedTeam?.id) {
        loadLeagueRooster(editingTournament.id);
      }
    } else {
      setTourName('');
      setTourIsActive(true);
      setSaved({ name: '', isActive: true });
      setTourLogoUrl(null);
      setLeagueRoosterTeams([]);
      setIsEditName(true);
      setIsEditStatus(true);
      setActivePanelTab('info');
    }
    setPendingLogoFile(null);
    setLogoError('');
  }, [editingTournament, selectedTeam]);

  // Логотип у существующего турнира сохраняется сразу, без карандашика: выбрал
  // файл — улетел. У нового — только запоминаем, зальём после создания.
  const handleLogoPick = async (file) => {
    setLogoError('');
    if (!editingTournament) {
      setPendingLogoFile(file);
      return;
    }
    setSavingBlock('logo');
    try {
      const url = await uploadTournamentLogo(editingTournament.id, selectedTeam.id, file);
      setTourLogoUrl(url);
      loadData();
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setSavingBlock(null);
    }
  };


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

  // Сохранение одного блока: его черновик плюс сохранённое значение второго поля —
  // незакрытая правка соседнего блока в базу не утекает.
  const handleSaveField = async (blockKey) => {
    if (!selectedTeam?.id) return;
    const next = blockKey === 'name'
      ? { ...saved, name: tourName }
      : { ...saved, isActive: tourIsActive };
    if (!String(next.name).trim()) return;
    setSavingBlock(blockKey);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: selectedTeam.id, name: String(next.name).trim(), is_active: next.isActive })
      });
      if (res.ok) {
        setSaved(next);
        if (blockKey === 'name') setIsEditName(false);
        if (blockKey === 'status') setIsEditStatus(false);
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBlock(null);
    }
  };

  // Крестик в шапке блока: черновик откатывается к сохранённому значению.
  const handleCancelField = (blockKey) => {
    if (blockKey === 'name') { setTourName(saved.name); setIsEditName(false); }
    if (blockKey === 'status') { setTourIsActive(saved.isActive); setIsEditStatus(false); }
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
        // Турнир уже создан — логотип докидываем к нему отдельным запросом.
        // Не получилось залить — турнир всё равно есть, логотип добавят позже.
        if (pendingLogoFile) {
          const json = await res.json().catch(() => ({}));
          const newId = json?.tournament?.id;
          if (newId) {
            try { await uploadTournamentLogo(newId, selectedTeam.id, pendingLogoFile); } catch (err) { console.error(err); }
          }
        }
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
                  if (isEditName) handleCancelField('name');
                  else setIsEditName(true);
                } : null}
              >
                {isEditName ? (
                  <>
                    <TextInputLP
                      placeholder="Например: ТХЛ (25/26)"
                      value={tourName}
                      onChange={setTourName}
                      activeColor={activeBrandColor}
                    />
                    {editingTournament && (
                      <SaveButton onClick={() => handleSaveField('name')} disabled={!tourName.trim() || savingBlock === 'name'} activeColor={activeBrandColor} />
                    )}
                  </>
                ) : (
                  <div className="text-[18px] font-black text-brand tracking-wide pt-1">
                    {tourName || '—'}
                  </div>
                )}
              </CustomBlock>

              {/* Логотип — без карандашика, сохраняется при выборе файла; удаления нет,
                  только замена. Показывается в календаре у матчей турнира и в фильтре
                  статистики игрока. */}
              <CustomBlock
                title="Логотип"
                icon="trophy"
                isSaving={savingBlock === 'logo'}
              >
                <div className="flex items-center gap-4 pt-1">
                  <ImageUploaderLP
                    currentImageUrl={tourLogoUrl}
                    onChange={handleLogoPick}
                    showDelete={false}
                    sizeClass="w-[72px] h-[72px]"
                  />
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[14px] font-bold text-content-main">
                      {tourLogoUrl || pendingLogoFile ? 'Логотип выбран' : 'Логотипа нет'}
                    </span>
                    <span className="text-[11px] text-content-subtle leading-relaxed">
                      PNG или WebP. Нажмите на квадрат, чтобы выбрать файл.
                    </span>
                    {logoError && <span className="text-[11px] font-bold text-danger">{logoError}</span>}
                  </div>
                </div>
              </CustomBlock>

              <CustomBlock
                title="Статус турнира"
                icon="calendar"
                isEditing={isEditStatus}
                isSaving={savingBlock === 'status'}
                onAction={editingTournament ? () => {
                  if (isEditStatus) handleCancelField('status');
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
                    {editingTournament && (
                      <SaveButton onClick={() => handleSaveField('status')} disabled={savingBlock === 'status'} activeColor={activeBrandColor} />
                    )}
                  </div>
                ) : (
                  <div className="text-[14px] font-black text-content-main tracking-wide pt-1 flex items-center gap-1.5">
                    <div className={clsx("w-2 h-2 rounded-full", tourIsActive ? "bg-brand animate-pulse" : "bg-content-muted")} />
                    {tourIsActive ? 'Текущий активный' : 'Турнир завершен'}
                  </div>
                )}
              </CustomBlock>

              {editingTournament && (
                <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex flex-col gap-1 mb-3">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Игровая активность</span>
                  <span className="text-[14px] text-content-main font-medium">
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
                    className="rounded-xl font-bold uppercase tracking-wider text-[14px] !py-3.5 !h-12"
                    activeColor={activeBrandColor}
                  >
                    Создать турнир
                  </ButtonLP>
                ) : (
                  <>
                    <ButtonLP
                      variant="outline"
                      disabled={isDeleteDisabled}
                      onClick={() => onInitiateDelete(editingTournament.id, editingTournament.name)}
                      className="w-full py-3 text-danger normal-case font-bold text-[14px] rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      Удалить турнир
                    </ButtonLP>
                    {isDeleteDisabled && (
                      <p className="text-[14px] text-content-muted font-medium leading-relaxed text-center mt-1 px-1">
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
              {/* Тот же поисковый инпут, что и в остальных справочниках (HandbooksPage,
                  заявки на сезон) — свой голый <input> здесь выбивался из стиля. */}
              <TextInputLP
                placeholder="Название команды или город..."
                value={teamSearch}
                onChange={setTeamSearch}
                activeColor={activeBrandColor}
              />

              <div className="mt-1">
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
                              <div className="flex items-center gap-3 min-w-0 pr-2 text-left">
                                <RosterLogo logoUrl={team.logo_url} />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[14px] font-black text-content-main truncate">{team.name}</span>
                                  <span className="text-[10px] text-content-muted font-bold uppercase mt-0.5 tracking-wider">{team.city}</span>
                                </div>
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
                          team.is_in_tournament ? "border-brand/30" : "border-surface-border0"
                        )}
                        style={team.is_in_tournament ? { borderColor: `${activeBrandColor}30` } : {}}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2 text-left">
                          <RosterLogo logoUrl={team.logo_url} />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[14px] font-black text-content-main truncate">{team.name}</span>
                            <span className="text-[10px] text-content-muted font-bold uppercase mt-0.5 tracking-wider">{team.city}</span>
                          </div>
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
                  <div className="text-center py-16 text-[14px] font-bold text-content-muted opacity-40 italic">
                    {teamSearch ? 'Заданный хоккейный клуб не найден' : 'Справочник внешних команд пуст'}
                  </div>
                )}
              </StaggerContainer>
            </div>

            {/* ПЛАВАЮЩИЙ НЕБЛОКИРУЮЩИЙ ИНДИКАТОР ФОНОВОГО АВТОСОХРАНЕНИЯ */}
            <div className="absolute bottom-4 inset-x-0 shrink-0 z-30 flex justify-center pointer-events-none">
              <div className={clsx(
                "px-4 py-2 bg-surface-level1 border rounded-xl shadow-2xl flex items-center gap-2 transition-all duration-300 transform pointer-events-auto",
                savingBlock === 'roster' ? "opacity-100 translate-y-0 border-brand/30 scale-100" : "opacity-0 translate-y-4 border-surface-border0 scale-95"
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