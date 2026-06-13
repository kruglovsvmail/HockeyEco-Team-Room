import React from 'react';
import clsx from 'clsx';

// ─── Один ряд командной статистики ──────────────────────────────────────────
function StatRow({ label, homeValue, awayValue }) {
  const hNum = parseFloat(homeValue) || 0;
  const aNum = parseFloat(awayValue) || 0;
  const homeWins = hNum > aNum;
  const awayWins = aNum > hNum;

  return (
    <div className="flex items-center py-3 border-b border-surface-border/60 last:border-b-0">
      <span className={clsx(
        'w-16 text-right text-[13px] tabular-nums font-black',
        homeWins ? 'text-brand' : 'text-content-main'
      )}>
        {homeValue}
      </span>
      <span className="flex-1 text-center text-[10px] font-bold uppercase tracking-widest text-content-muted px-2">
        {label}
      </span>
      <span className={clsx(
        'w-16 text-left text-[13px] tabular-nums font-black',
        awayWins ? 'text-brand' : 'text-content-main'
      )}>
        {awayValue}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Переиспользуемый блок командной статистики матча
//
// Props:
//   teamStats  — { home: { shots, shooting_pct, pp_goals, sh_goals, pim, saves, save_pct },
//                  away: { ... } }
// ═══════════════════════════════════════════════════════════════════════════════
export function GameTeamStats({ teamStats }) {
  if (!teamStats) {
    return (
      <div className="py-12 text-center text-[10px] font-bold text-content-subtle uppercase tracking-wider">
        Статистика матча недоступна
      </div>
    );
  }

  return (
    <div className="bg-surface-base rounded-2xl border border-surface-border overflow-hidden">
      <div className="px-4">
        <StatRow label="Броски в створ"   homeValue={teamStats.home.shots}                 awayValue={teamStats.away.shots} />
        <StatRow label="% реализации"     homeValue={`${teamStats.home.shooting_pct}%`}    awayValue={`${teamStats.away.shooting_pct}%`} />
        <StatRow label="Шайбы в бол."     homeValue={teamStats.home.pp_goals}               awayValue={teamStats.away.pp_goals} />
        <StatRow label="Шайбы в мен."     homeValue={teamStats.home.sh_goals}               awayValue={teamStats.away.sh_goals} />
        <StatRow label="Штрафное время"   homeValue={`${teamStats.home.pim}'`}              awayValue={`${teamStats.away.pim}'`} />
        <StatRow label="Кол-во отр. бр."  homeValue={teamStats.home.saves}                  awayValue={teamStats.away.saves} />
        <StatRow label="% отр. бр."       homeValue={`${teamStats.home.save_pct}%`}         awayValue={`${teamStats.away.save_pct}%`} />
      </div>
    </div>
  );
}