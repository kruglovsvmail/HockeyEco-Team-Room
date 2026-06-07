// TournamentTable.jsx
import React from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../../utils/helpers';

export function TournamentTable({ standings, expandedTeams, onToggleTeam }) {
  if (standings.length === 0) {
    return (
      <div className="text-center py-8 text-xs font-bold text-content-subtle uppercase tracking-wider bg-surface-base rounded-2xl border border-surface-border">
        Турнирная таблица пока не сформирована
      </div>
    );
  }

  return (
    <div className="bg-surface-base rounded-2xl overflow-hidden shadow-md pb-4">
      <div className="grid grid-cols-[36px,1fr,50px,40px] items-center px-2 py-4 bg-surface-level1 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
        <div className="text-center">#</div>
        <div>Команда</div>
        <div className="text-center">Игр</div>
        <div className="text-center">Очки</div>
      </div>

      {standings.map((row) => {
        const isExpanded = !!expandedTeams[row.team_id];
        const goalsDiff = row.goals_for - row.goals_against;
        const formattedDiff = goalsDiff > 0 ? `+${goalsDiff}` : goalsDiff;
        
        return (
          <div key={row.team_id} className="border-b border-surface-border last:border-0">
            <div 
              onClick={() => onToggleTeam(row.team_id)}
              className={clsx(
                "grid grid-cols-[36px,1fr,50px,40px] items-center px-3 py-3 text-md font-semibold transition-colors cursor-pointer active:bg-surface-level1 select-none",
                isExpanded && "bg-surface-level1"
              )}
            >
              <div className="text-center text-xs font-mono text-content-muted mr-5">{row.rank}</div>
              <div className="flex items-center gap-4 min-w-0">
                <img src={getImageUrl(row.team_logo)} alt="" className="w-6 h-6 object-contain shrink-0" />
                <span className="leading-tight text-[11px] text-content-main uppercase font-bold truncate">
                  {row.team_name}
                </span>
              </div>
              <div className="text-center text-content-muted text-[13px]">{row.games_played}</div>
              <div className="text-center font-black text-brand text-[13px]">{row.points}</div>
            </div>

            <div className={clsx(
              "grid transition-all duration-300 ease-in-out",
              isExpanded ? "grid-rows-[1fr] opacity-100 " : "grid-rows-[0fr] opacity-0 pointer-events-none"
            )}>
              <div className="overflow-hidden">
                <div className="flex flex-col">
                  <div className="w-full bg-surface-level1 overflow-hidden px-1 border-b">
                    <div className="grid grid-cols-6 text-center bg-surface-level1 border-t py-2 text-[10px] font-normal uppercase tracking-wider text-content-muted">
                      <div>В</div>
                      <div>ВО/ВБ</div>
                      <div>Н</div>
                      <div>П</div>
                      <div>ПО/ПБ</div>
                      <div>РШ</div>
                    </div>
                    <div className="grid grid-cols-6 text-center pt-1 pb-3 text-[11px] font-bold text-content-main">
                      <div>{row.wins_reg}</div>
                      <div className="text-content-main">{row.wins_ot}</div>
                      <div>{row.draws}</div>
                      <div>{row.losses_reg}</div>
                      <div className="text-content-main">{row.losses_ot}</div>
                      <div className={clsx(
                        "font-bold",
                        goalsDiff > 0 ? "text-emerald-500" : goalsDiff < 0 ? "text-red-500" : "text-content-muted"
                      )}>
                        {formattedDiff}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between bg-surface-level1 items-center px-8 py-3 text-[11px] font-normal text-content-muted">
                    <span>Всего заброшено / пропущено:</span>
                    <span className="font-mono text-content-muted text-[11px]">
                      {row.goals_for} — {row.goals_against}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}