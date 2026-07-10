import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { getImageUrl } from '../../../utils/helpers';

const clampShots = (v) => Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));

// game_shots_by_goalie.team_id — NOT NULL, но без FK на teams(id) (в отличие от
// game_events.team_id / game_goalie_log.*_goalie_id) — сентинел здесь безопасен.
// Используем его для стороны внешнего соперника без ростера (away_team_id = null).
const EXTERNAL_TEAM_ID = -1;

// Одна клетка ввода бросков за период. Прямой числовой ввод, без степпера.
function ShotCell({ value, onChange, activeColor }) {
  const [focused, setFocused] = useState(false);
  const has = value != null; // введено (включая 0); не введено → null → плейсхолдер «–»
  const borderStyle = focused && activeColor ? { borderColor: activeColor } : {};
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
      style={borderStyle}
      className={clsx(
        "w-full h-10 text-center text-[18px] font-bold tabular-nums rounded-xl border bg-transparent outline-none transition-colors",
        focused ? "border-brand text-content-main" : "border-surface-border",
        has ? "text-content-main" : "text-content-subtle placeholder:text-content-subtle/40"
      )}
    />
  );
}

// rosters / goalieLog / shots приходят из родителя (MatchProtocol) — черновик
// матча, который живёт только в памяти до нажатия главной кнопки «Сохранить».
// Сама шторка ничего не грузит и не шлёт в бэкенд — только патчит черновик
// через onSave при закрытии.
export function ShotsSheet({ isOpen, parentMatch, regulation, rosters, goalieLog = [], shots: shotsProp, editRole, myTeamId, onClose, onSave }) {
  // Командное цветовое кодирование (тумблер в SettingsPage). По умолчанию ВКЛ.
  const isColorsEnabled = typeof window !== 'undefined' && localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColor = parentMatch?.team_color;
  const hasTeamColor = isColorsEnabled && !!teamColor;
  const activeBrandColor = hasTeamColor ? teamColor : null;

  const [shots, setShots] = useState({});
  // Копируем черновик из родителя при каждом открытии шторки — правки внутри
  // не должны просачиваться наружу, пока не нажата «Сохранить» этой шторки.
  useEffect(() => {
    if (isOpen) setShots(shotsProp || {});
  }, [isOpen, shotsProp]);

  // ── Периоды из regulation ───────────────────────────────────────────
  const PERIODS = useMemo(() => {
    const count = Math.max(1, Math.min(5, regulation?.periods_count || 3));
    const list = Array.from({ length: count }, (_, i) => String(i + 1));
    if ((regulation?.ot_length || 0) > 0) list.push('OT');
    return list;
  }, [regulation?.periods_count, regulation?.ot_length]);

  // ── Списки вратарей, реально стоявших (из журнала смен) ─────────────
  const homeGoalies = useMemo(() => (rosters?.home || []).filter(p => p.position_in_line === 'G'), [rosters?.home]);
  const awayGoalies = useMemo(() => (rosters?.away || []).filter(p => p.position_in_line === 'G'), [rosters?.away]);

  const goaliesInPlay = useMemo(() => {
    const homeIds = new Set();
    const awayIds = new Set();
    let homeHasUnspecified = false;
    let awayHasUnspecified = false;
    (goalieLog || []).forEach(row => {
      if (row.home_goalie_id != null) homeIds.add(row.home_goalie_id);
      if (row.away_goalie_id != null) awayIds.add(row.away_goalie_id);
      if (row.home_goalie_unspecified) homeHasUnspecified = true;
      if (row.away_goalie_unspecified) awayHasUnspecified = true;
    });
    return {
      homeList: homeGoalies.filter(g => homeIds.has(g.player_id)),
      awayList: awayGoalies.filter(g => awayIds.has(g.player_id)),
      homeHasUnspecified,
      awayHasUnspecified,
    };
  }, [goalieLog, homeGoalies, awayGoalies]);

  // ── Броски в створ вратарю (goalie_id === null → командные, без вратаря) ─
  const shotsKey = (teamId, goalieId, period) =>
    `${teamId}_${goalieId == null ? 'null' : goalieId}_${period}`;
  // undefined → не введено («–»); число (включая 0) → введено.
  const getShots = (teamId, goalieId, period) => shots[shotsKey(teamId, goalieId, period)];
  const setShotsVal = (teamId, goalieId, period, v) => {
    const key = shotsKey(teamId, goalieId, period);
    setShots(prev => {
      const next = { ...prev };
      if (v == null) delete next[key];        // очистили поле → снова «не введено»
      else next[key] = clampShots(v);
      return next;
    });
  };
  // Подчищаем shots: оставляем только актуальные ключи. Командный ключ
  // (goalie_id null) допускаем и когда названных вратарей нет вовсе, и когда
  // часть журнала помечена «не указан» — иначе такие броски тут же стирались бы.
  useEffect(() => {
    if (!isOpen) return;
    const valid = new Set();
    const addTeam = (teamId, list, hasUnspecified) => {
      if (teamId == null) return;
      if (list.length > 0) list.forEach(g => PERIODS.forEach(p => valid.add(shotsKey(teamId, g.player_id, p))));
      if (list.length === 0 || hasUnspecified) PERIODS.forEach(p => valid.add(shotsKey(teamId, null, p)));
    };
    addTeam(rosters?.home_team_id, goaliesInPlay.homeList, goaliesInPlay.homeHasUnspecified);
    addTeam(rosters?.away_team_id ?? EXTERNAL_TEAM_ID, goaliesInPlay.awayList, goaliesInPlay.awayHasUnspecified);
    setShots(prev => {
      const keys = Object.keys(prev);
      const kept = keys.filter(k => valid.has(k));
      if (kept.length === keys.length) return prev;
      const next = {};
      kept.forEach(k => { next[k] = prev[k]; });
      return next;
    });
  }, [isOpen, goaliesInPlay, PERIODS, rosters?.home_team_id, rosters?.away_team_id]);

  // ── Имена + лого команд ─────────────────────────────────────────────
  const homeIsMy = parentMatch?.home_team_id === parentMatch?.my_team_id;
  const homeName = homeIsMy ? (parentMatch?.my_team_name || 'Хозяева') : (parentMatch?.opponent_name || 'Хозяева');
  const awayName = homeIsMy ? (parentMatch?.opponent_name || 'Гости')  : (parentMatch?.my_team_name || 'Гости');
  const homeLogo = homeIsMy ? parentMatch?.my_team_logo_url : parentMatch?.opponent_logo_url;
  const awayLogo = homeIsMy ? parentMatch?.opponent_logo_url : parentMatch?.my_team_logo_url;

  // ── Сохранение ──────────────────────────────────────────────────────
  // Просто патчим черновик в MatchProtocol — реальный PUT уйдёт одним пакетом
  // по главной кнопке «Сохранить» (или не уйдёт вовсе — по «Отмена»).
  const handleSave = () => {
    if (onSave) onSave(shots);
    if (onClose) onClose();
  };

  // ── Рендер одной карточки бросков (по вратарю или по команде) ────────
  const renderShotsCard = (teamId, goalieId, title, logoUrl) => (
    <div key={`${teamId}_${goalieId ?? 'team'}`} className="bg-surface-base border border-surface-border rounded-3xl px-4 pb-2 pt-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[18px] font-bold text-content-main truncate mb-1">{title}</div>
        {logoUrl && <img src={getImageUrl(logoUrl)} alt="" className="w-5 h-5 object-contain shrink-0" />}
      </div>
      <div className="flex items-end gap-3">
        {PERIODS.map(p => (
          <div key={p} className="flex-1 min-w-0">
            <div className="text-[10px] text-center text-content-muted">{p}</div>
            <ShotCell
              value={getShots(teamId, goalieId, p)}
              onChange={(v) => setShotsVal(teamId, goalieId, p, v)}
              activeColor={activeBrandColor}
            />
          </div>
        ))}
      </div>
    </div>
  );

  // ── Плоский список всех карточек вратарей ──────────────────────────
  const allGoalieCards = useMemo(() => {
    const cards = [];
    const addSide = (side) => {
      const isHome = side === 'home';
      const teamId = isHome ? rosters?.home_team_id : (rosters?.away_team_id ?? EXTERNAL_TEAM_ID);
      const name = isHome ? homeName : awayName;
      const logo = isHome ? homeLogo : awayLogo;
      const list = isHome ? goaliesInPlay.homeList : goaliesInPlay.awayList;
      const hasUnspecified = isHome ? goaliesInPlay.homeHasUnspecified : goaliesInPlay.awayHasUnspecified;
      const show = editRole !== 'opponent' || Number(teamId) === Number(myTeamId);
      if (!show) return;
      list.forEach(g => cards.push({ teamId, goalieId: g.player_id, title: `${[g.last_name, g.first_name].filter(Boolean).join(' ') || `id${g.player_id}`} #${g.jersey_number ?? '?'}`, logo }));
      // Карточка «без привязки к вратарю» — либо когда вообще никого не назвали,
      // либо когда часть журнала помечена «не указан» (даже если другую часть
      // отстоял конкретный вратарь) — иначе броски за эти периоды некуда вводить.
      if ((list.length === 0 || hasUnspecified) && teamId != null) {
        cards.push({ teamId, goalieId: null, title: `Вратарь ${name}`, logo });
      }
    };
    addSide('home');
    addSide('away');
    return cards;
  }, [rosters, goaliesInPlay, homeName, awayName, homeLogo, awayLogo, editRole, myTeamId]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div
        className="flex flex-col gap-4 text-left pb-2"
        style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
      >
        <div>
          <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main">Броски</h3>
          <p className="text-[10px] text-content-subtle mt-1">Указываются броски нанесенные не командой, а броски нанесенные по каждому вратарю</p>
        </div>

        <div className="flex flex-col gap-3">
          {allGoalieCards.length > 0
            ? allGoalieCards.map(c => renderShotsCard(c.teamId, c.goalieId, c.title, c.logo))
            : (
              <div className="text-[10px] text-content-subtle uppercase font-bold py-3 text-center bg-surface-level1 border border-dashed border-surface-border rounded-xl">
                Команда недоступна
              </div>
            )}
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
