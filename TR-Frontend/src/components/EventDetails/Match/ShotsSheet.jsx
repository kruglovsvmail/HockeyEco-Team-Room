import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { getAuthHeaders, getImageUrl } from '../../../utils/helpers';
import { PageLoader } from '../../../ui/Loader';

const clampShots = (v) => Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));

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

// rosters / goalieLog приходят из родителя (MatchProtocol) — не грузим повторно,
// чтобы шторка открывалась мгновенно. Сами догружаем только броски.
export function ShotsSheet({ isOpen, parentMatch, regulation, rosters, goalieLog = [], editRole, myTeamId, onClose, onSaved }) {
  const eventId = parentMatch?.event_id;
  const userTeamId = parentMatch?.my_team_id;

  // Командное цветовое кодирование (тумблер в SettingsPage). По умолчанию ВКЛ.
  const isColorsEnabled = typeof window !== 'undefined' && localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColor = parentMatch?.team_color;
  const hasTeamColor = isColorsEnabled && !!teamColor;
  const activeBrandColor = hasTeamColor ? teamColor : null;

  const [shots, setShots] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Загрузка только бросков ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !eventId || !userTeamId) return;
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const headers = getAuthHeaders();
    const load = async () => {
      setLoading(true);
      try {
        const sRes = await fetch(`${apiUrl}/api/matches/${eventId}/results/goalie-shots?teamId=${userTeamId}`, { headers });
        const sJson = await sRes.json();
        if (sJson.success) {
          const map = {};
          (sJson.shots || []).forEach(s => {
            const key = `${s.team_id}_${s.goalie_id == null ? 'null' : s.goalie_id}_${s.period}`;
            map[key] = Number(s.shots_count) || 0;
          });
          setShots(map);
        }
      } catch (err) {
        console.error('Ошибка загрузки бросков:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, eventId, userTeamId]);

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
    (goalieLog || []).forEach(row => {
      if (row.home_goalie_id != null) homeIds.add(row.home_goalie_id);
      if (row.away_goalie_id != null) awayIds.add(row.away_goalie_id);
    });
    return {
      homeList: homeGoalies.filter(g => homeIds.has(g.player_id)),
      awayList: awayGoalies.filter(g => awayIds.has(g.player_id)),
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
  // Подчищаем shots: оставляем только актуальные ключи. Если у команды нет
  // названных вратарей — допускаем командный ключ (goalie_id null).
  useEffect(() => {
    if (loading) return;
    const valid = new Set();
    const addTeam = (teamId, list) => {
      if (teamId == null) return;
      if (list.length > 0) list.forEach(g => PERIODS.forEach(p => valid.add(shotsKey(teamId, g.player_id, p))));
      else PERIODS.forEach(p => valid.add(shotsKey(teamId, null, p)));
    };
    addTeam(rosters?.home_team_id, goaliesInPlay.homeList);
    addTeam(rosters?.away_team_id, goaliesInPlay.awayList);
    setShots(prev => {
      const keys = Object.keys(prev);
      const kept = keys.filter(k => valid.has(k));
      if (kept.length === keys.length) return prev;
      const next = {};
      kept.forEach(k => { next[k] = prev[k]; });
      return next;
    });
  }, [loading, goaliesInPlay, PERIODS, rosters?.home_team_id, rosters?.away_team_id]);

  // ── Имена + лого команд ─────────────────────────────────────────────
  const homeIsMy = parentMatch?.home_team_id === parentMatch?.my_team_id;
  const homeName = homeIsMy ? (parentMatch?.my_team_name || 'Хозяева') : (parentMatch?.opponent_name || 'Хозяева');
  const awayName = homeIsMy ? (parentMatch?.opponent_name || 'Гости')  : (parentMatch?.my_team_name || 'Гости');
  const homeLogo = homeIsMy ? parentMatch?.my_team_logo_url : parentMatch?.opponent_logo_url;
  const awayLogo = homeIsMy ? parentMatch?.opponent_logo_url : parentMatch?.my_team_logo_url;

  // ── Сохранение ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

      const shotsEntries = [];
      Object.entries(shots).forEach(([key, val]) => {
        if (val === '' || val == null) return;
        const [teamId, gid, period] = key.split('_');
        shotsEntries.push({
          goalie_id: gid === 'null' ? null : Number(gid),
          team_id: Number(teamId),
          period,
          shots_count: Number(val) || 0,
        });
      });
      const shotsBody = { teamId: userTeamId, entries: shotsEntries };

      const res = await fetch(`${apiUrl}/api/matches/${eventId}/results/goalie-shots`, {
        method: 'PUT', headers, body: JSON.stringify(shotsBody),
      });
      const json = await res.json();
      if (json.success) {
        if (onSaved) onSaved();
        if (onClose) onClose();
      } else {
        alert(json.error || 'Не удалось сохранить');
      }
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
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
      const teamId = isHome ? rosters?.home_team_id : rosters?.away_team_id;
      const name = isHome ? homeName : awayName;
      const logo = isHome ? homeLogo : awayLogo;
      const list = isHome ? goaliesInPlay.homeList : goaliesInPlay.awayList;
      const show = editRole !== 'opponent' || Number(teamId) === Number(myTeamId);
      if (!show) return;
      if (list.length > 0) {
        list.forEach(g => cards.push({ teamId, goalieId: g.player_id, title: `${[g.last_name, g.first_name].filter(Boolean).join(' ') || `id${g.player_id}`} #${g.jersey_number ?? '?'}`, logo }));
      } else if (teamId != null) {
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

        {loading ? (
          <PageLoader className="min-h-[150px]" />
        ) : (
          <>
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
              isLoading={isSaving}
              disabled={isSaving}
              onClick={handleSave}
              activeColor={activeBrandColor}
            >
              Сохранить
            </ButtonLP>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
