// TournamentTable.jsx
import React from 'react';
import clsx from 'clsx';
import { getImageUrl, uiFixed } from '../../utils/helpers';

export function TournamentTable({ standings, expandedTeams, onToggleTeam }) {
  if (standings.length === 0) {
    return (
      <div className="text-center py-8 text-[12px] italic font-semibold text-content-subtle uppercase tracking-wider bg-surface-base rounded-2xl border border-surface-border">
        Турнирная таблица пока не сформирована
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-center text-[14px] font-bold uppercase tracking-[0.1em] text-content-muted">
        Турнирная таблица
      </div>
    <div className="bg-surface-level1 rounded-2xl overflow-hidden shadow-md pb-4">
      <div className="grid grid-cols-[36px,1fr,50px,40px] items-center px-2 py-4 bg-surface-base text-[10px] font-semibold uppercase tracking-widest text-content-muted">
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
                "grid grid-cols-[36px,1fr,50px,40px] items-center px-3 py-3 text-[14px] font-semibold transition-colors cursor-pointer active:bg-surface-base select-none",
                isExpanded && "bg-surface-base"
              )}
            >
              <div className="text-center text-[14px] font-mono text-content-muted mr-5">{row.rank}</div>
              <div className="flex items-center gap-4 min-w-0">
                <img src={getImageUrl(row.team_logo)} alt="" className="w-6 h-6 object-contain shrink-0" />
                <span className="leading-tight text-content-main uppercase font-bold truncate" style={{ fontSize: uiFixed(14) }}>
                  {row.team_name}
                </span>
              </div>
              <div className="text-center text-content-muted text-[18px]">{row.games_played}</div>
              <div className="text-center font-black text-brand text-[18px]">{row.points}</div>
            </div>

            <div className={clsx(
              "grid transition-all duration-300 ease-in-out",
              isExpanded ? "grid-rows-[1fr] opacity-100 " : "grid-rows-[0fr] opacity-0 pointer-events-none"
            )}>
              <div className="overflow-hidden">
                <div className="flex flex-col">
                  <div className="w-full bg-surface-base overflow-hidden px-1">
                    <div className="grid grid-cols-6 text-center bg-surface-base border-t border-surface-level2 py-2 text-[12px] font-normal uppercase tracking-wider text-content-muted">
                      <div>В</div>
                      <div>ВО/ВБ</div>
                      <div>Н</div>
                      <div>П</div>
                      <div>ПО/ПБ</div>
                      <div>РШ</div>
                    </div>
                    <div className="grid grid-cols-6 text-center pt-1 pb-3 text-[12px] font-bold text-content-main">
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
                  
                  <div className="flex justify-between bg-surface-base items-center px-8 py-3 font-normal text-content-muted" style={{ fontSize: uiFixed(12) }}>
                    <span>Всего заброшено / пропущено:</span>
                    <span className="font-mono text-content-muted" style={{ fontSize: uiFixed(12) }}>
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
    </div>
  );
}