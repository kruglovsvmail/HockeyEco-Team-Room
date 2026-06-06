import React, { useState, useEffect } from 'react';
import { getAuthHeaders, getImageUrl } from '../../utils/helpers';
import { PageLoader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import clsx from 'clsx';

export function TournamentListPanel({ teamId, activeTournamentId, onSelect, hasTeamColor, activeBrandColor }) {
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/team/${teamId}`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setTournaments(data.tournaments);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [teamId]);

  if (loading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-content-subtle px-1">
      </div>
      
      {tournaments.length === 0 ? (
        <div className="py-10 text-center text-xs font-bold text-content-subtle">
          У команды пока нет заявленных турниров
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tournaments.map((t) => {
            const isActive = activeTournamentId === t.tournament_team_id;
            return (
              <button
                key={t.tournament_team_id}
                onClick={() => onSelect(t)}
                className={clsx(
                  "flex items-center gap-4 p-4 rounded-3xl border transition-all text-left outline-none active:scale-95",
                  isActive 
                    ? "bg-brand-opacity border-brand" 
                    : "bg-surface-level1 border-surface-border hover:border-brand/30"
                )}
                /* Безопасное инлайн-наложение Hex-кодов прозрачности для активного элемента списка */
                style={isActive && hasTeamColor ? {
                  backgroundColor: `${activeBrandColor}1a`,
                  borderColor: activeBrandColor
                } : {}}
              >
                <div className="w-10 h-10 shrink-0 overflow-hidden">
                  <img src={getImageUrl(t.division_logo)} className="w-full h-full object-contain" alt="" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span 
                    className="text-[10px] font-black uppercase tracking-wide text-content-main"
                   >
                    {t.league_name}
                  </span>
                  <h4 className="text-[10px] font-semibold text-content-muted truncate leading-tight">
                    {t.division_name}
                  </h4>
                  <span className="text-[10px] font-bold text-content-muted mt-1">
                    {t.season_name}
                  </span>
                </div>
                {isActive && (
                  <Icon 
                    name="check" 
                    className="w-5 h-5 text-brand" 
                    style={hasTeamColor ? { color: activeBrandColor } : {}} 
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}