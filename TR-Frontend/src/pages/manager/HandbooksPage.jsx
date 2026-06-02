import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { BottomSheet } from '../../ui/BottomSheet';
import { FadeIn } from '../../ui/FadeIn';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders, getImageUrl } from '../../utils/helpers';

export function HandbooksPage() {
  const { selectedTeam, user, openRightPanel } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  const hasAccess = checkAccess('MGR_HANDBOOKS');

  // Управление вкладками справочника
  const [activeTab, setActiveTab] = useState('opponents'); // 'opponents' | 'tournaments'
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Списки данных из БД
  const [opponents, setOpponents] = useState([]);
  const [tournaments, setTournaments] = useState([]);

  // Состояния для шторки создания/редактирования Соперников
  const [isOpponentSheetOpen, setIsOpponentSheetOpen] = useState(false);
  const [editingOpponent, setEditingOpponent] = useState(null); // null = создание
  const [oppName, setOppName] = useState('');
  const [oppShort, setOppShort] = useState('');
  const [oppCity, setOppCity] = useState('');

  // Состояния для шторки создания/редактирования Турниров
  const [isTournamentSheetOpen, setIsTournamentSheetOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null); // null = создание
  const [tourName, setTourName] = useState('');
  const [tourIsActive, setTourIsActive] = useState(true);

  // Состояния для шторки распределения команд внутри турнира (Ростер лиги)
  const [isLeagueRoosterOpen, setIsLeagueRoosterOpen] = useState(false);
  const [selectedTournamentForRooster, setSelectedTournamentForRooster] = useState(null);
  const [leagueRoosterTeams, setLeagueRoosterTeams] = useState([]); // Состояние чекбоксов команд

  // Подмена фирменного цвета бренда под контекст выбранного клуба
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;

  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  // Загрузка данных в зависимости от активной вкладки
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
      console.error('Ошибка загрузки справочников:', err);
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

  // Действия над соперниками (Save / Delete)
  const handleOpenOpponentCreate = () => {
    setEditingOpponent(null);
    setOppName('');
    setOppShort('');
    setOppCity('');
    setIsOpponentSheetOpen(true);
  };

  const handleOpenOpponentEdit = (opp) => {
    setEditingOpponent(opp);
    setOppName(opp.name);
    setOppShort(opp.short_name);
    setOppCity(opp.city);
    setIsOpponentSheetOpen(true);
  };

  const handleSaveOpponent = async (e) => {
    e.preventDefault();
    if (!oppName.trim() || !oppCity.trim()) return;

    try {
      const method = editingOpponent ? 'PUT' : 'POST';
      const url = editingOpponent 
        ? `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents/${editingOpponent.id}`
        : `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          name: oppName.trim(),
          short_name: (oppShort.trim() || oppName.trim().slice(0, 3)).toUpperCase(),
          city: oppCity.trim()
        })
      });

      if (res.ok) {
        setIsOpponentSheetOpen(false);
        loadData();
      }
    } catch (err) {
      console.error('Ошибка сохранения соперника:', err);
    }
  };

  const handleDeleteOpponent = async (oppId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого соперника из базы?')) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents/${oppId}?teamId=${selectedTeam.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error('Ошибка удаления соперника:', err);
    }
  };

  // Действия над турнирами (Save / Delete / Rooster)
  const handleOpenTournamentCreate = () => {
    setEditingTournament(null);
    setTourName('');
    setTourIsActive(true);
    setIsTournamentSheetOpen(true);
  };

  const handleOpenTournamentEdit = (tour) => {
    setEditingTournament(tour);
    setTourName(tour.name);
    setTourIsActive(tour.is_active);
    setIsTournamentSheetOpen(true);
  };

  const handleSaveTournament = async (e) => {
    e.preventDefault();
    if (!tourName.trim()) return;

    try {
      const method = editingTournament ? 'PUT' : 'POST';
      const url = editingTournament
        ? `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}`
        : `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          name: tourName.trim(),
          is_active: tourIsActive
        })
      });

      if (res.ok) {
        setIsTournamentSheetOpen(false);
        loadData();
      }
    } catch (err) {
      console.error('Ошибка сохранения турнира:', err);
    }
  };

  const handleDeleteTournament = async (tourId) => {
    if (!window.confirm('Удалить этот внешний турнир?')) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${tourId}?teamId=${selectedTeam.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error('Ошибка удаления турнира:', err);
    }
  };

  // Открытие шторки наполнения турнира командами
  const handleOpenLeagueRooster = async (tour) => {
    setSelectedTournamentForRooster(tour);
    setIsLeagueRoosterOpen(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${tour.id}/roster-map?teamId=${selectedTeam.id}`, {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        setLeagueRoosterTeams(json.teams || []);
      }
    } catch (err) {
      console.error('Ошибка загрузки карты ростера лиги:', err);
    }
  };

  const handleToggleRoosterTeamCheckbox = (oppId) => {
    setLeagueRoosterTeams(prev => prev.map(t => t.id === oppId ? { ...t, is_in_tournament: !t.is_in_tournament } : t));
  };

  const handleSaveLeagueRooster = async () => {
    if (!selectedTournamentForRooster) return;
    try {
      const targetOpponentIds = leagueRoosterTeams.filter(t => t.is_in_tournament).map(t => t.id);
      
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${selectedTournamentForRooster.id}/roster-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          opponentIds: targetOpponentIds
        })
      });

      if (res.ok) {
        setIsLeagueRoosterOpen(false);
        loadData();
      }
    } catch (err) {
      console.error('Ошибка сохранения состава лиги:', err);
    }
  };

  return (
    <div 
      className="flex flex-col w-full h-full overflow-hidden relative bg-surface-border transition-colors duration-300"
      style={{ 
        ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}),
        touchAction: 'pan-y' 
      }}
    >
      {/* ФИКСИРОВАННАЯ ШАПКА КЛУБА ИЗ CREATEEVENTPAGE */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-transparent pointer-events-none flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-surface-border from-60% to-transparent z-10" />

        <div className="px-4 pt-4 pb-1 pointer-events-auto relative z-20">
          {selectedTeam && (
            <div className="bg-surface-base pt-4 px-5 pb-4 rounded-3xl flex items-center gap-4 shadow-lg border-b border-surface-level2 text-left">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm shrink-0 ml-4">
                <img src={getImageUrl(cachedDetails?.logo_url || selectedTeam?.logo_url)} alt="" className="w-full h-full object-contain p-1" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight truncate">
                  {cachedDetails?.name || selectedTeam?.name}
                </h2>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-1" style={{ color: activeBrandColor }}>
                  Справочники команды
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ИЗОЛИРОВАННЫЙ СКРОЛЛ-КОНТЕЙНЕР (ОТСТУП ПОД ШАПКУ) */}
      <div className="w-full h-full relative overflow-hidden">
        <div className="w-full h-full overflow-y-auto scrollbar-hide pt-[124px] pb-24 flex flex-col gap-4">
          
          {/* СЕГМЕНТНЫЙ ПЕРЕКЛЮЧАТЕЛЬ И ИНПУТ ОБЪЕДИНЕНЫ В ОДИН ОТДЕЛЬНЫЙ БЛОК */}
          <div className="mx-4 p-4 bg-surface-level1 border border-surface-border/60 rounded-3xl flex flex-col gap-4 shadow-md">
            
            {/* Вкладки выбора реестра */}
            <div className="transition-colors duration-300">
              <SegmentedControl
                options={[
                  { value: 'opponents', label: 'Внешние соперники' },
                  { value: 'tournaments', label: 'Внешние турниры' }
                ]}
                value={activeTab}
                onChange={(val) => { setActiveTab(val); setSearchQuery(''); }}
              />
            </div>

            {/* Строка интеллектуального поиска */}
            <div className="transition-colors duration-300">
              <TextInputLP 
                label={activeTab === 'opponents' ? 'Поиск команд' : 'Поиск турниров'} 
                placeholder="Введите ключевые слова для фильтрации..." 
                value={searchQuery} 
                onChange={setSearchQuery} 
                activeColor={activeBrandColor}
              />
            </div>

          </div>

          {/* ВЫВОД РЕЗУЛЬТАТОВ ФИЛЬТРАЦИИ ИЗ БАЗЫ ДАННЫХ */}
          <div className="mx-4 flex flex-col gap-3">
            {isLoading ? (
              <div className="py-16"><PageLoader /></div>
            ) : activeTab === 'opponents' ? (
              
              /* ВКЛАДКА А: ВНЕШНИЕ СОПЕРНИКИ */
              <FadeIn key="opps" className="flex flex-col gap-3">
                {opponents.length > 0 ? (
                  opponents.map(opp => (
                    <div 
                      key={opp.id} 
                      className="w-full p-4 bg-surface-level1 border border-surface-border/60 rounded-3xl flex items-center justify-between shadow-md text-left transition-all"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-sm font-bold text-content-main truncate">{opp.name}</span>
                        <span className="text-[11px] text-content-muted font-medium uppercase tracking-wider mt-0.5">{opp.city} ({opp.short_name})</span>
                        
                        {/* ИСПРАВЛЕНО: Двойной хоккейный счетчик сыгранных и завершенных встреч */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-surface-level2 text-content-muted border border-surface-border/50">
                            Матчей: {opp.games_count || 0} , из них завершенные: {opp.finished_games_count || 0}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          type="button" 
                          onClick={() => handleOpenOpponentEdit(opp)}
                          className="w-9 h-9 rounded-xl bg-surface-level2 flex items-center justify-center border border-surface-border transition-all active:scale-90 outline-none cursor-pointer"
                        >
                          <Icon name="edit" className="w-4 h-4 text-content-main" />
                        </button>
                        <button 
                          type="button"
                          disabled={opp.games_count > 0}
                          onClick={() => handleDeleteOpponent(opp.id)}
                          className={clsx(
                            "w-9 h-9 rounded-xl flex items-center justify-center border transition-all outline-none cursor-pointer",
                            opp.games_count > 0 
                              ? "bg-surface-level2/40 border-surface-border/30 opacity-30 cursor-not-allowed text-content-subtle" 
                              : "bg-danger/10 border-danger/20 text-danger active:scale-90"
                          )}
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50 bg-surface-level1 border border-surface-border/60 rounded-3xl p-6 shadow-sm">
                    Ни одного соперника не добавлено
                  </div>
                )}
              </FadeIn>
            ) : (
              
              /* ВКЛАДКА Б: ВНЕШНИЕ ТУРНИРЫ */
              <FadeIn key="tours" className="flex flex-col gap-3">
                {tournaments.length > 0 ? (
                  tournaments.map(tour => (
                    <div 
                      key={tour.id} 
                      className="w-full p-4 bg-surface-level1 border border-surface-border/60 rounded-3xl flex flex-col shadow-md text-left transition-all"
                    >
                      <div className="flex items-start justify-between w-full">
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-sm font-bold text-content-main line-clamp-2 leading-snug">{tour.name}</span>
                          
                          {/* ИСПРАВЛЕНО: Двойной хоккейный счетчик игр внутри турнира */}
                          <div className="flex items-center gap-2 mt-2">
                            <span className={clsx(
                              "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border",
                              tour.is_active 
                                ? "bg-success/10 border-success/20 text-success" 
                                : "bg-surface-level2 border-surface-border text-content-muted"
                            )}>
                              {tour.is_active ? '● Активен' : 'Архив'}
                            </span>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-surface-level2 text-content-muted border border-surface-border/50">
                              Игр в базе: {tour.games_count || 0} , из них завершенные: {tour.finished_games_count || 0}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            type="button" 
                            onClick={() => handleOpenTournamentEdit(tour)}
                            className="w-9 h-9 rounded-xl bg-surface-level2 flex items-center justify-center border border-surface-border transition-all active:scale-90 outline-none cursor-pointer"
                          >
                            <Icon name="edit" className="w-4 h-4 text-content-main" />
                          </button>
                          <button 
                            type="button"
                            disabled={tour.games_count > 0}
                            onClick={() => handleDeleteTournament(tour.id)}
                            className={clsx(
                              "w-9 h-9 rounded-xl flex items-center justify-center border transition-all outline-none cursor-pointer",
                              tour.games_count > 0 
                                ? "bg-surface-level2/40 border-surface-border/30 opacity-30 cursor-not-allowed text-content-subtle" 
                                : "bg-danger/10 border-danger/20 text-danger active:scale-90"
                            )}
                          >
                            <Icon name="trash" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Кнопка настройки состава участников лиги */}
                      <div className="mt-3 pt-3 border-t border-surface-border/40">
                        <button
                          type="button"
                          onClick={() => handleOpenLeagueRooster(tour)}
                          className="w-full py-2.5 bg-surface-level2 hover:bg-surface-level3 border border-surface-border rounded-xl text-center text-xs font-bold text-content-main uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.99] outline-none cursor-pointer"
                        >
                          <Icon name="users" className="w-3.5 h-3.5" style={{ color: activeBrandColor }} />
                          Команды турнира ({tour.opponents_count || 0})
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50 bg-surface-level1 border border-surface-border/60 rounded-3xl p-6 shadow-sm">
                    Список внешних лиг пуст
                  </div>
                )}
              </FadeIn>
            )}
          </div>

        </div>
      </div>

      {/* ПЛАВАЮЩАЯ КНОПКА ДОБАВЛЕНИЯ НОВЫХ ЗАПИСЕЙ */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={activeTab === 'opponents' ? handleOpenOpponentCreate : handleOpenTournamentCreate}
          style={{ backgroundColor: activeBrandColor }}
          className="w-14 h-14 rounded-full shadow-2xl text-white flex items-center justify-center transition-all outline-none active:scale-90 cursor-pointer border border-white/10"
        >
          <Icon name="plus" className="w-6 h-6 stroke-[3]" />
        </button>
      </div>

      {/* ШТОРКА 1: УПРАВЛЕНИЕ СОПЕРНИКОМ */}
      <BottomSheet isOpen={isOpponentSheetOpen} onClose={() => setIsOpponentSheetOpen(false)}>
        <form onSubmit={handleSaveOpponent} className="flex flex-col gap-4 text-left pb-6">
          <h3 className="text-base font-black uppercase tracking-wider text-content-main">
            {editingOpponent ? 'Редактировать команду' : 'Новый внешний соперник'}
          </h3>
          
          <TextInputLP label="Название хоккейного клуба" placeholder="Например: ХК Легион" value={oppName} onChange={setOppName} activeColor={activeBrandColor} />
          <div className="grid grid-cols-2 gap-3">
            <TextInputLP label="Аббревиатура (3 буквы)" placeholder="LEG" value={oppShort} onChange={setOppShort} activeColor={activeBrandColor} />
            <TextInputLP label="Город привязки" placeholder="Екатеринбург" value={oppCity} onChange={setOppCity} activeColor={activeBrandColor} />
          </div>

          <div className="mt-4">
            <ButtonLP type="submit" variant="primary" disabled={!oppName.trim() || !oppCity.trim()} activeColor={activeBrandColor}>
              {editingOpponent ? 'Сохранить изменения' : 'Внести в справочник'}
            </ButtonLP>
          </div>
        </form>
      </BottomSheet>

      {/* ШТОРКА 2: УПРАВЛЕНИЕ ТУРНИРОМ */}
      <BottomSheet isOpen={isTournamentSheetOpen} onClose={() => setIsTournamentSheetOpen(false)}>
        <form onSubmit={handleSaveTournament} className="flex flex-col gap-4 text-left pb-6">
          <h3 className="text-base font-black uppercase tracking-wider text-content-main">
            {editingTournament ? 'Настройки чемпионата' : 'Добавить внешний турнир'}
          </h3>
          
          <TextInputLP label="Полное наименование лиги / турнира" placeholder="Например: ЛХЛ Любитель-1 (Лето 2026)" value={tourName} onChange={setTourName} activeColor={activeBrandColor} />
          <div className="py-2 pl-1">
            <CheckboxLP checked={tourIsActive} onChange={setTourIsActive} label="Активный статус (выводится в селекторе матчей)" activeColor={activeBrandColor} />
          </div>

          <div className="mt-2">
            <ButtonLP type="submit" variant="primary" disabled={!tourName.trim()} activeColor={activeBrandColor}>
              {editingTournament ? 'Обновить турнир' : 'Создать турнир'}
            </ButtonLP>
          </div>
        </form>
      </BottomSheet>

      {/* ШТОРКА 3: НАПОЛНЕНИЕ ТУРНИРА ВНЕШНИМИ КОМАНДАМИ */}
      <BottomSheet isOpen={isLeagueRoosterOpen} onClose={() => setIsLeagueRoosterOpen(false)}>
        <div className="flex flex-col h-[70vh] text-left pb-6 overflow-hidden">
          <div className="shrink-0 mb-3">
            <h3 className="text-base font-black uppercase tracking-wider text-content-main truncate">
              Состав участников лиги
            </h3>
            <p className="text-xs font-medium text-content-muted mt-0.5 line-clamp-1">
              Tournament: {selectedTournamentForRooster?.name}
            </p>
          </div>

          {/* Список команд с чекбоксами внутри шторки */}
          <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-2 my-2 pr-1 border-y border-surface-border/50 py-2">
            {leagueRoosterTeams.length > 0 ? (
              leagueRoosterTeams.map(team => (
                <div 
                  key={team.id}
                  onClick={() => handleToggleRoosterTeamCheckbox(team.id)}
                  className="w-full p-3 bg-surface-level2 border border-surface-border rounded-xl flex items-center justify-between cursor-pointer active:scale-[0.99] select-none"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-sm font-bold text-content-main truncate">{team.name}</span>
                    <span className="text-[10px] text-content-muted mt-0.5">{team.city}</span>
                  </div>
                  <CheckboxLP 
                    checked={team.is_in_tournament || false} 
                    onChange={() => handleToggleRoosterTeamCheckbox(team.id)} 
                    activeColor={activeBrandColor}
                  />
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50">
                Сначала добавьте команды во вкладку «Внешние соперники»
              </div>
            )}
          </div>

          <div className="shrink-0 mt-3">
            <ButtonLP type="button" variant="primary" onClick={handleSaveLeagueRooster} disabled={leagueRoosterTeams.length === 0} activeColor={activeBrandColor}>
              Сохранить состав участников
            </ButtonLP>
          </div>
        </div>
      </BottomSheet>

    </div>
  );
}