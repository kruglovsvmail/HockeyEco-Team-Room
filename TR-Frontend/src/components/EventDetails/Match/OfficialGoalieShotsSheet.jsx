import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { PageLoader } from '../../../ui/Loader';

const clampShots = (v) => Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));

// Компактная копия ShotCell из ShotsSheet.jsx (не трогаем тот файл — он общий с
// товарищескими матчами и завязан на editRole/draft-механику, которая тут не нужна).
function ShotCell({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  const has = value != null;
  return (
    <input
      inputMode="numeric"
      value={has ? String(value) : ''}
      placeholder="–"
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/\D/g, '');
        onChange(cleaned === '' ? null : clampShots(cleaned));
      }}
      className={clsx(
        "w-full h-10 text-center text-[18px] font-bold tabular-nums rounded-xl border bg-transparent outline-none transition-colors",
        focused ? "border-brand text-content-main" : "border-surface-border",
        has ? "text-content-main" : "text-content-subtle placeholder:text-content-subtle/40"
      )}
    />
  );
}

// Шторка самостоятельного ввода бросков по СВОЕМУ вратарю для официального матча
// лиги (когда лига сама эту статистику не ведёт). В отличие от ShotsSheet.jsx —
// только своя команда, без карусели/сторон, сохраняет сразу на сервер (без
// черновика/isEditMode), по образцу OfficialGoalPlusMinusSheet.jsx.
//
// Открывается сразу по клику (isOpen), не дожидаясь снимка текущих бросков с
// сервера — пока initialShots ещё грузится родителем, isLoading=true и внутри
// показывается лоадер вместо карточек (иначе шторка ощущалась бы «зависшей»).
export function OfficialGoalieShotsSheet({ isOpen, isLoading, myTeamId, homeTeamId, roster, goalieLog = [], regulation, initialShots, activeColor, onClose, onSave }) {
  const [shots, setShots] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const shotsKey = (goalieId, period) => `${myTeamId}_${goalieId == null ? 'null' : goalieId}_${period}`;

  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    Object.entries(initialShots || {}).forEach(([key, val]) => {
      if (key.startsWith(`${myTeamId}_`)) initial[key] = val;
    });
    setShots(initial);
  }, [isOpen, initialShots, myTeamId]);

  const PERIODS = useMemo(() => {
    const count = Math.max(1, Math.min(5, regulation?.periods_count || 3));
    const list = Array.from({ length: count }, (_, i) => String(i + 1));
    if ((regulation?.ot_length || 0) > 0) list.push('OT');
    return list;
  }, [regulation?.periods_count, regulation?.ot_length]);

  const isHome = Number(homeTeamId) === Number(myTeamId);

  // Вратари своей команды, реально стоявшие в этом матче (из журнала смен).
  const myGoaliesInPlay = useMemo(() => {
    const goalieOptions = (roster || []).filter(p => p.position_in_line === 'G');
    const ids = new Set();
    let hasUnspecified = false;
    (goalieLog || []).forEach(row => {
      const gid = isHome ? row.home_goalie_id : row.away_goalie_id;
      const unspecified = isHome ? row.home_goalie_unspecified : row.away_goalie_unspecified;
      if (gid != null) ids.add(gid);
      if (unspecified) hasUnspecified = true;
    });
    return { list: goalieOptions.filter(g => ids.has(g.player_id)), hasUnspecified };
  }, [roster, goalieLog, isHome]);

  const getShots = (goalieId, period) => shots[shotsKey(goalieId, period)];
  const setShotsVal = (goalieId, period, v) => {
    const key = shotsKey(goalieId, period);
    setShots(prev => {
      const next = { ...prev };
      if (v == null) delete next[key];
      else next[key] = clampShots(v);
      return next;
    });
  };

  const cards = useMemo(() => {
    const list = myGoaliesInPlay.list.map(g => ({
      goalieId: g.player_id,
      title: `${[g.last_name, g.first_name].filter(Boolean).join(' ') || `id${g.player_id}`} #${g.jersey_number ?? '?'}`,
    }));
    if (myGoaliesInPlay.list.length === 0 || myGoaliesInPlay.hasUnspecified) {
      list.push({ goalieId: null, title: 'Вратарь не указан' });
    }
    return list;
  }, [myGoaliesInPlay]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const entries = Object.entries(shots)
        .filter(([, v]) => v != null)
        .map(([key, v]) => {
          const [, goalieIdStr, period] = key.split('_');
          return { goalie_id: goalieIdStr === 'null' ? null : Number(goalieIdStr), team_id: myTeamId, period, shots_count: v };
        });
      await onSave(entries);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div
        className="flex flex-col gap-4 text-left pb-2"
        style={activeColor ? { '--color-brand': activeColor } : undefined}
      >
        <div>
          <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main">Броски по вратарю</h3>
          <p className="text-[12px] text-content-subtle mt-1">Броски соперника в створ по периодам — по нашим воротам</p>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="flex flex-col gap-3">
            {cards.length > 0 ? cards.map(c => (
              <div key={c.goalieId ?? 'unspecified'} className="bg-surface-base border border-surface-border rounded-3xl px-4 pb-2 pt-4">
                <div className="text-[18px] font-bold text-content-main truncate mb-1">{c.title}</div>
                <div className="flex items-end gap-3">
                  {PERIODS.map(p => (
                    <div key={p} className="flex-1 min-w-0">
                      <div className="text-[10px] text-center text-content-muted">{p}</div>
                      <ShotCell value={getShots(c.goalieId, p)} onChange={(v) => setShotsVal(c.goalieId, p, v)} />
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-[10px] text-content-subtle uppercase font-bold py-3 text-center bg-surface-level1 border border-dashed border-surface-border rounded-xl">
                Заполните журнал вратарей — броски пока некуда вводить
              </div>
            )}
          </div>
        )}

        <ButtonLP type="button" variant="primary" onClick={handleSave} isLoading={isSaving} disabled={isLoading} activeColor={activeColor}>
          Сохранить
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}
