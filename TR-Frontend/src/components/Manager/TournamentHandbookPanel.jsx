import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getAuthHeaders } from '../../utils/helpers';

export function TournamentHandbookPanel({ data, onClose }) {
  const { editingTournament, loadData, onInitiateDelete, selectedTeam } = data;

  const [tourName, setTourName] = useState('');
  const [tourIsActive, setTourIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [leagueRoosterTeams, setLeagueRoosterTeams] = useState([]);

  // Вычисление динамического командного цвета
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
      if (selectedTeam?.id) {
        loadLeagueRooster(editingTournament.id);
      }
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

  const handleToggleRoosterTeamCheckbox = (oppId) => {
    setLeagueRoosterTeams(prev => prev.map(t => t.id === oppId ? { ...t, is_in_tournament: !t.is_in_tournament } : t));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!tourName.trim() || !selectedTeam?.id) return;

    setIsSubmitting(true);
    try {
      const method = editingTournament ? 'PUT' : 'POST';
      const url = editingTournament
        ? `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}`
        : `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: selectedTeam.id, name: tourName.trim(), is_active: tourIsActive })
      });

      if (res.ok) {
        if (editingTournament) {
          const targetOpponentIds = leagueRoosterTeams.filter(t => t.is_in_tournament).map(t => t.id);
          await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-tournaments/${editingTournament.id}/roster-save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ teamId: selectedTeam.id, opponentIds: targetOpponentIds })
          });
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

  const isDeleteDisabled = editingTournament?.games_count > 0;

  return (
    <form 
      onSubmit={handleSave} 
      className="flex flex-col h-full bg-surface-level2 text-left justify-between overflow-hidden"
      style={{ ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}) }}
    >
      <div className="flex flex-col flex-1 overflow-y-auto px-4 gap-2 scrollbar-hide">
        <div className="flex flex-col gap-1.5 shrink-0">
        </div>

        <div className="flex flex-col gap-4 shrink-0">
          <TextInputLP 
            label="Наименование лиги / турнира" 
            value={tourName} 
            onChange={setTourName} 
            activeColor={activeBrandColor}
          />
          <div className="">
            <CheckboxLP 
              checked={tourIsActive} 
              onChange={setTourIsActive} 
              label="Активный статус" 
              activeColor={activeBrandColor}
            />
          </div>
        </div>

        {editingTournament && (
          <div className="flex flex-col flex-1 min-h-[250px] border-t border-surface-border pt-4 overflow-hidden">
            <div className="mb-2 shrink-0">
              <span className="text-[10px] font-black uppercase text-content-muted tracking-wider">Команды турнира</span>
            </div>

            <div className="flex-1 overflow-y-auto border border-surface-border bg-surface-border rounded-2xl p-3 gap-2 flex flex-col">
              {isRosterLoading ? (
                <div className="py-1"><PageLoader /></div>
              ) : leagueRoosterTeams.length > 0 ? (
                leagueRoosterTeams.map(team => (
                  <div 
                    key={team.id} 
                    onClick={() => handleToggleRoosterTeamCheckbox(team.id)} 
                    className={clsx(
                      "w-full py-2 px-3 border rounded-xl flex items-center justify-between cursor-pointer select-none transition-all",
                      team.is_in_tournament 
                        ? "bg-surface-level1 shadow-sm" 
                        : "bg-surface-level1 opacity-50"
                    )}
                    style={{ ...(team.is_in_tournament && hasTeamColor ? { borderColor: `${activeBrandColor}66` } : {}) }}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-xs font-bold text-content-main truncate">{team.name}</span>
                      <span className="text-[10px] text-content-muted font-medium uppercase mt-0.5 tracking-wide">{team.city}</span>
                    </div>
                    <CheckboxLP 
                      checked={team.is_in_tournament || false} 
                      onChange={() => handleToggleRoosterTeamCheckbox(team.id)} 
                      activeColor={activeBrandColor}
                    />
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-xs font-bold text-content-muted opacity-50">Справочник соперников пуст</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-5 bg-surface-level1/40 border-t border-surface-border/30 shrink-0">
        <ButtonLP 
          type="submit" 
          variant="primary" 
          disabled={!tourName.trim() || isSubmitting}
          className="rounded-xl font-bold uppercase tracking-wider text-xs py-3"
          activeColor={activeBrandColor}
        >
          {editingTournament ? 'Сохранить изменения' : 'Создать турнир'}
        </ButtonLP>

        {editingTournament && (
          <button
            type="button"
            disabled={isDeleteDisabled}
            onClick={() => onInitiateDelete(editingTournament.id, editingTournament.name)}
            className={clsx(
              "w-full py-3 text-xs font-bold uppercase tracking-wider border transition-all rounded-xl text-center",
              isDeleteDisabled 
                ? "bg-surface-level1/40 border-surface-border/30 opacity-30 text-content-subtle cursor-not-allowed" 
                : "bg-danger/10 border-danger/20 text-danger hover:bg-danger/20 active:scale-[0.98]"
            )}
          >
            Удалить лигу из базы
          </button>
        )}
      </div>
    </form>
  );
}