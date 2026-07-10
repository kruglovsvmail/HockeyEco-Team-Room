import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { TimeMMSSInputLP } from '../../../ui/Input-LP';
import { getImageUrl } from '../../../utils/helpers';
import { decodeGoalieLog, encodeGoalieLog, setGoalieChange } from './goalieLogModel';

const pad2 = (n) => String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, '0');
const parseMM = (s) => Math.max(0, Math.min(99, parseInt(s || '0', 10) || 0));
const parseSS = (s) => Math.max(0, Math.min(59, parseInt(s || '0', 10) || 0));

export function GoalieChangeSheet({ isOpen, side, parentMatch, rosters, goalieLog, existingChange, onClose, onSave }) {
  const isColorsEnabled = typeof window !== 'undefined' && localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColor = parentMatch?.team_color;
  const hasTeamColor = isColorsEnabled && !!teamColor;
  const activeBrandColor = hasTeamColor ? teamColor : null;

  const isHome = side === 'home';
  const field = isHome ? 'home_goalie_id' : 'away_goalie_id';

  const goalies = useMemo(
    () => ((isHome ? rosters?.home : rosters?.away) || []).filter(p => p.position_in_line === 'G'),
    [isHome, rosters?.home, rosters?.away]
  );

  // Предвыбор: если у стороны уже стоит конкретный вратарь — подсвечиваем его,
  // иначе (ещё не задан / пустые ворота) — первого вратаря команды, чтобы при
  // установке стартового вратаря не пришлось целиться мимо «пустых ворот».
  const currentGoalieId = useMemo(() => {
    const last = (goalieLog || [])[goalieLog.length - 1];
    if (last && last[field] != null) return last[field];
    return goalies[0]?.player_id ?? null;
  }, [goalieLog, field, goalies]);

  const [time, setTime] = useState('00:00');
  const [selectedId, setSelectedId] = useState(null); // player_id | null (пустые ворота или не указан)
  const [isUnspecified, setIsUnspecified] = useState(false); // true = «не указан» (не путать с пустыми воротами)

  useEffect(() => {
    if (!isOpen) return;
    if (existingChange) {
      const t = Number(existingChange.time_seconds) || 0;
      setTime(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
      setSelectedId(existingChange.goalie_id ?? null);
      setIsUnspecified(!!existingChange.unspecified);
    } else {
      setTime('00:00');
      setSelectedId(currentGoalieId);
      setIsUnspecified(false);
    }
  }, [isOpen, existingChange, currentGoalieId]);

  const homeIsMy = parentMatch?.home_team_id === parentMatch?.my_team_id;
  const homeName = homeIsMy ? (parentMatch?.my_team_name || 'Хозяева') : (parentMatch?.opponent_name || 'Хозяева');
  const awayName = homeIsMy ? (parentMatch?.opponent_name || 'Гости')  : (parentMatch?.my_team_name || 'Гости');
  const homeLogo = homeIsMy ? parentMatch?.my_team_logo_url : parentMatch?.opponent_logo_url;
  const awayLogo = homeIsMy ? parentMatch?.opponent_logo_url : parentMatch?.my_team_logo_url;
  const teamName = isHome ? homeName : awayName;
  const teamLogo = isHome ? homeLogo : awayLogo;

  // Смена вратаря больше не летит в бэкенд отсюда — патчим локальный черновик
  // журнала в MatchProtocol (onSave), реальный PUT уйдёт одним пакетом по
  // главной кнопке «Сохранить» (или не уйдёт вовсе — по «Отмена»).
  const handleSave = () => {
    const [m = '00', s = '00'] = (time || '00:00').split(':');
    const timeSec = parseMM(m) * 60 + parseSS(s);
    const model = decodeGoalieLog(goalieLog);
    const next = setGoalieChange(model, side, {
      time_seconds: timeSec,
      goalie_id: selectedId,
      unspecified: isUnspecified,
      replaceTime: existingChange ? (Number(existingChange.time_seconds) || 0) : undefined,
    });
    const entries = encodeGoalieLog(next);
    if (onSave) onSave(entries);
    if (onClose) onClose();
  };

  const Tile = ({ active, onClick, children, subtitle, dashed }) => (
    <button
      type="button"
      onClick={onClick}
      style={active && activeBrandColor ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}
      className={clsx(
        "flex-1 min-w-0 h-14 rounded-xl flex flex-col items-center justify-center outline-none transition-all active:scale-95",
        dashed ? "border border-dashed" : "border",
        active
          ? "border-2 border-brand text-brand bg-surface-level1"
          : "border-surface-border text-content-subtle"
      )}
    >
      <span className="text-[18px] font-bold leading-tight">{children}</span>
      {subtitle && <span className={clsx("text-[10px] uppercase tracking-wider leading-tight", active ? "opacity-80" : "opacity-60")}>{subtitle}</span>}
    </button>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div
        className="flex flex-col gap-4 text-left pb-2"
        style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
      >
        <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main">Смена вратаря</h3>

        {/* Команда (уже выбрана) */}
        <div className="flex items-center justify-center gap-2 py-2 border border-surface-border rounded-xl">
          {teamLogo && <img key={side} src={getImageUrl(teamLogo)} alt="" className="w-5 h-5 object-contain shrink-0" />}
          <span className="text-[14px] font-bold uppercase tracking-widest text-content-main truncate">{teamName}</span>
        </div>

        {/* Время выхода */}
        <TimeMMSSInputLP label="Время выхода" value={time} onChange={setTime} size="lg" activeColor={activeBrandColor} />

        {/* Кто выходит на лёд */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-content-subtle uppercase tracking-widest font-bold pl-1">Кто выходит на лёд</span>
          <div className="flex gap-2">
            {goalies.map(g => (
              <Tile
                key={g.player_id}
                active={selectedId === g.player_id && !isUnspecified}
                onClick={() => { setSelectedId(g.player_id); setIsUnspecified(false); }}
                subtitle={selectedId === g.player_id && !isUnspecified ? 'на льду' : null}
              >
                {g.jersey_number ?? '?'}
              </Tile>
            ))}
            <Tile
              dashed
              active={selectedId === null && !isUnspecified}
              onClick={() => { setSelectedId(null); setIsUnspecified(false); }}
              subtitle={selectedId === null && !isUnspecified ? 'пустые ворота' : null}
            >
              ПВ
            </Tile>
            {/* «НЕТ» — всегда доступна, вне зависимости от того, заявлены ли вратари:
                отличаем «не знаем, кто именно сейчас в воротах» от намеренно пустых
                ворот. Актуально и когда заявки нет вовсе, и когда заявлен только
                один вратарь из двух, и даже когда заявлены оба, но кто на льду —
                неизвестно. */}
            <Tile
              dashed
              active={isUnspecified}
              onClick={() => { setSelectedId(null); setIsUnspecified(true); }}
              subtitle={isUnspecified ? 'не указан' : null}
            >
              НЕТ
            </Tile>
          </div>
        </div>

        <ButtonLP
          type="button"
          variant="primary"
          onClick={handleSave}
          activeColor={activeBrandColor}
        >
          Сохранить
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}
