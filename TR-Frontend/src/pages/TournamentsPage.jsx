import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FadeIn } from '../ui/FadeIn';
import { Icon } from '../ui/Icon';
import { TeamPageHeaderSpacer } from '../components/TeamPageHeader';
import { TournamentPageHeader } from '../components/Tournaments/TournamentPageHeader';
import { SegmentedControl } from '../ui/SegmentedControl';
import { getAuthHeaders } from '../utils/helpers';
import { PageLoader } from '../ui/Loader';
import { TournamentCardGame } from '../components/Tournaments/TournamentCardGame';

const TOURNAMENT_TABS = [
  { value: 'matches', label: 'Матчи' },
  { value: 'tables', label: 'Таблицы' },
  { value: 'stats', label: 'Статистика' }
];

export function TournamentsPage() {
  const { selectedTeam, openRightPanel } = useOutletContext();
  const selectedTeamId = selectedTeam?.id;

  const cacheKey = `tr_cached_team_${selectedTeamId}`;
  const [activeTab, setActiveTab] = useState('matches');
  const [games, setGames] = useState([]);
  const [isGamesLoading, setIsGamesLoading] = useState(false);

  const [activeTeamDetails, setActiveTeamDetails] = useState(() => {
    if (selectedTeamId) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.fullDetails || null;
      }
    }
    return null;
  });

  const [activeTournament, setActiveTournament] = useState(null);

  // Синхронизация деталей команды для цвета бренда
  useEffect(() => {
    if (!selectedTeamId) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      setActiveTeamDetails(parsed.fullDetails || null);
    } else {
      setActiveTeamDetails(null);
    }
  }, [selectedTeamId, cacheKey]);

  // Настройка цвета бренда
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = activeTeamDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  // Загрузка выбранного турнира из localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`tr_active_tournament_for_team_${selectedTeamId}`);
    if (saved) {
      setActiveTournament(JSON.parse(saved));
    } else {
      setActiveTournament(null);
    }
  }, [selectedTeamId]);

  // Получение списка матчей дивизиона при смене турнира
  useEffect(() => {
    if (!activeTournament?.division_id) {
      setGames([]);
      return;
    }

    const fetchGames = async () => {
      setIsGamesLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/division/${activeTournament.division_id}/games`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setGames(data.games || []);
        }
      } catch (err) {
        console.error('Ошибка загрузки матчей турнира:', err);
      } finally {
        setIsGamesLoading(false);
      }
    };

    fetchGames();
  }, [activeTournament]);

  const handleTournamentSelect = useCallback((tournament) => {
    setActiveTournament(tournament);
    localStorage.setItem(`tr_active_tournament_for_team_${selectedTeamId}`, JSON.stringify(tournament));
  }, [selectedTeamId]);

  const handleOpenSelector = () => {
    openRightPanel('tournamentSelector', {
      teamId: selectedTeamId,
      activeTournamentId: activeTournament?.tournament_team_id,
      onSelect: handleTournamentSelect,
      hasTeamColor,
      activeBrandColor
    }, 'Выбор турнира');
  };

  // Функция группировки матчей по стадиям/турам (поле stage_label)
  const groupGamesByStage = () => {
    return games.reduce((acc, game) => {
      const label = game.stage_label || (game.stage_type === 'playoff' ? 'Плей-офф' : 'Регулярный чемпионат');
      if (!acc[label]) acc[label] = [];
      acc[label].push(game);
      return acc;
    }, {});
  };

  const groupedGames = groupGamesByStage();

  return (
    <FadeIn 
      className="h-full relative overflow-hidden flex flex-col"
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : {}}
    >
      {/* Шапка турнира */}
      <TournamentPageHeader 
        activeTournament={activeTournament}
        onClick={handleOpenSelector}
        hasTeamColor={hasTeamColor}
        activeBrandColor={activeBrandColor}
      />

      <div className="h-full overflow-y-auto scrollbar-hide bg-surface-border relative z-10 snap-y snap-proximity">
        <TeamPageHeaderSpacer />

        {/* Навигационный SegmentedControl */}
        <div className="sticky top-0 z-40 shrink-0 border-b border-surface-level2 px-4 pt-2 pb-2">
          <SegmentedControl 
            options={TOURNAMENT_TABS} 
            value={activeTab} 
            onChange={setActiveTab} 
            activeColor={hasTeamColor ? activeBrandColor : null}
          />
        </div>

        <div className="w-full p-4 pb-24">
          {!activeTournament ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <div className="w-20 h-20 rounded-full bg-surface-level2 flex items-center justify-center mb-4">
                <Icon name="registry" className="w-10 h-10 text-content-subtle" />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-content-muted">
                Нажмите, чтобы выбрать турнир
              </p>
            </div>
          ) : isGamesLoading ? (
            <PageLoader />
          ) : (
            <div className="animate-fade-in">
              
              {/* ТАБ 1: МАТЧИ */}
              {activeTab === 'matches' && (
                <div className="flex flex-col gap-6">
                  {Object.keys(groupedGames).length === 0 ? (
                    <div className="text-center py-12 text-xs font-bold text-content-subtle uppercase tracking-wider">
                      В данном дивизионе пока нет запланированных матчей
                    </div>
                  ) : (
                    Object.entries(groupedGames).map(([stageName, stageGames]) => (
                      <div key={stageName} className="flex flex-col gap-2">
                        {/* Заголовок этапа / круга / тура */}
                        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-content-muted pl-2 mb-1 border-l-2 border-brand/50">
                          {stageName}
                        </div>

                        {/* Список декомпозированных карточек */}
                        <div className="flex flex-col gap-1.5">
                          {stageGames.map((game) => (
                            <TournamentCardGame key={game.id} game={game} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ТАБ 2: ТАБЛИЦЫ */}
              {activeTab === 'tables' && (
                <div className="bg-surface-base p-8 rounded-3xl border border-surface-border shadow-sm flex flex-col items-center justify-center min-h-[160px]">
                  <div className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-content-subtle">
                    Турнирные таблицы находятся в разработке
                  </div>
                </div>
              )}

              {/* ТАБ 3: СТАТИСТИКА */}
              {activeTab === 'stats' && (
                <div className="bg-surface-base p-8 rounded-3xl border border-surface-border shadow-sm flex flex-col items-center justify-center min-h-[160px]">
                  <div className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-content-subtle">
                    Статистика лидеров чемпионата находится в разработке
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </FadeIn>
  );
}