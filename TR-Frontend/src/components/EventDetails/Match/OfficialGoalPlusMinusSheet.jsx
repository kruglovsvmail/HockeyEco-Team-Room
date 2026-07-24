import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';

const PERIOD_LABELS = { '1': '1-й период', '2': '2-й период', '3': '3-й период', '4': '4-й период', '5': '5-й период', OT: 'Овертайм', SO: 'Серия послематчевых буллитов' };

const formatTime = (seconds) => {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Компактная локальная копия PlayerCell из MatchEventSheet.jsx — здесь нужна только
// заливка «на площадке / не на площадке», без бейджей автора/ассистента. Цвет заливки
// зависит от знака: наш гол → плюс (success), гол соперника → минус (danger).
function PlayerCell({ player, selected, fillColor, onTap }) {
  return (
    <button
      type="button"
      onClick={() => onTap(player.player_id)}
      title={`${player.last_name || ''} ${player.first_name || ''}`}
      className={clsx(
        "relative aspect-square w-full rounded-xl border-2 text-[18px] font-bold outline-none select-none active:scale-95 transition-all flex items-center justify-center",
        selected
          ? (fillColor === 'danger' ? "bg-danger border-danger text-white" : "bg-success border-success text-white")
          : "bg-surface-level2 border-surface-border text-content-main"
      )}
    >
      {player.jersey_number ?? '—'}
    </button>
  );
}

// Шторка самостоятельного ввода +/- для официального матча лиги (когда лига сама
// эту статистику не ведёт). В отличие от MatchEventSheet — не часть черновика/publish
// товарищеского матча, сохраняет сразу на сервер и только по своей команде.
//
// Компонент всегда смонтирован (isOpen управляет только видимостью BottomSheet) —
// ранний return при отсутствии event размонтировал бы шторку и ломал анимацию
// выезда (первое открытие происходило бы уже в открытом состоянии, без transition).
export function OfficialGoalPlusMinusSheet({ isOpen, event, myTeamId, homeTeamId, roster, activeColor, onClose, onSave }) {
  const isHomeMine = Number(homeTeamId) === Number(myTeamId);
  const [selected, setSelected] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !event) return;
    const mySide = isHomeMine ? (event.plus_minus_home || []) : (event.plus_minus_away || []);
    setSelected(mySide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, event?.id]);

  const handleTap = (playerId) => {
    setSelected(prev => (prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]));
  };

  const handleSave = async () => {
    if (!event) return;
    setIsSaving(true);
    try {
      const plusMinusHome = isHomeMine ? selected : (event.plus_minus_home || []);
      const plusMinusAway = isHomeMine ? (event.plus_minus_away || []) : selected;
      await onSave(event.id, plusMinusHome, plusMinusAway);
    } finally {
      setIsSaving(false);
    }
  };

  const isMyGoal = event ? Number(event.team_id) === Number(myTeamId) : true;
  const fillColor = isMyGoal ? 'success' : 'danger';
  // Вратаря в +/- не отмечаем — участвует только полевой состав.
  const skaters = (roster || []).filter(p => p.position_in_line !== 'G');

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div
        className="flex flex-col gap-4 text-left pb-1"
        style={activeColor ? { '--color-brand': activeColor } : undefined}
      >
        <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main">
          Свои игроки на площадке
        </h3>

        {event && (
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[13px] font-bold text-content-main">
              {PERIOD_LABELS[event.period] || event.period}, {formatTime(event.time_seconds)}
            </span>
            <span className="text-[11px] text-content-subtle uppercase tracking-widest font-bold">
              {isMyGoal ? 'Забили мы' : 'Забил соперник'} — отметьте своих игроков, которые были на площадке
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 bg-surface-base rounded-2xl p-4">
          {skaters.length > 0 ? (
            <div className="grid grid-cols-6 gap-2">
              {skaters.map(p => (
                <PlayerCell
                  key={p.player_id}
                  player={p}
                  selected={selected.includes(p.player_id)}
                  fillColor={fillColor}
                  onTap={handleTap}
                />
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-content-subtle uppercase font-bold py-3 text-center">
              Заявка пуста
            </div>
          )}
        </div>

        <ButtonLP type="button" variant="primary" onClick={handleSave} isLoading={isSaving} activeColor={activeColor}>
          Сохранить
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}
