import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { TimeMMSSInputLP, SelectInputLP } from '../../../ui/Input-LP';
import { Icon } from '../../../ui/Icon';
import { getImageUrl } from '../../../utils/helpers';

const GOAL_STRENGTHS = [
  { value: 'equal', label: 'Равные составы' },
  { value: 'pp1',   label: 'Большинство' },
  { value: 'sh1',   label: 'Меньшинство' },
  { value: 'ps',    label: 'Буллит' },
  { value: 'en',    label: 'Пустые ворота' },
];

const PENALTIES = [
  { label: '2:00', penalty_class: 'minor',           penalty_minutes: 2  },
  { label: '4:00', penalty_class: 'double_minor',    penalty_minutes: 4  },
  { label: '5+20', penalty_class: 'major',           penalty_minutes: 25 },
  { label: 'Бул',  penalty_class: 'penalty_shot',    penalty_minutes: 0  },
];

const SELECTION_CHIPS = [
  { value: 'scorer', label: 'Автор' },
  { value: 'assist', label: 'Ассист' },
  { value: 'pm',     label: '+/-' },
];

const pad2 = (n) => String(Math.max(0, Math.min(99, Math.floor(Number(n) || 0)))).padStart(2, '0');
const parseMM = (s) => Math.max(0, Math.min(99, parseInt(s || '0', 10) || 0));
const parseSS = (s) => Math.max(0, Math.min(59, parseInt(s || '0', 10) || 0));

function totalToPeriod(totalSec, reg) {
  const plSec = (reg?.period_length || 20) * 60;
  const otSec = (reg?.ot_length     || 0)  * 60;
  const pc    =  reg?.periods_count || 3;
  const regSec = pc * plSec;
  if (totalSec <= regSec) {
    let idx = Math.max(1, Math.min(pc, Math.ceil(totalSec / plSec) || 1));
    if (totalSec === 0) idx = 1;
    return { period: String(idx), time_seconds: totalSec };
  }
  if (otSec > 0 && totalSec <= regSec + otSec) return { period: 'OT', time_seconds: totalSec };
  if (otSec > 0) return { period: 'OT', time_seconds: regSec + otSec };
  return { period: String(pc), time_seconds: regSec };
}

// ─────────────────────────── Кнопка-номер игрока ───────────────────────────
// roleBadge: 'author' | { assist: 1|2 } | null
// fill: null | 'success' | 'danger' — полная заливка (+/- или штраф)
function PlayerCell({ player, roleBadge, fill, onTap }) {
  // По умолчанию: серый фон
  let surface = "bg-surface-level2 border-surface-border text-content-main";
  // Полная зелёная / красная заливка (+/-)
  if (fill === 'success')      surface = "bg-success border-success text-white";
  else if (fill === 'danger')  surface = "bg-danger border-danger text-white";
  // Только success-обводка (автор / ассист без +/-)
  else if (roleBadge)          surface = "bg-surface-level2 border-success text-content-main";

  const badgeText = roleBadge === 'author'
    ? 'Ш'
    : (roleBadge && roleBadge.assist ? `А${roleBadge.assist}` : null);

  return (
    <button
      type="button"
      onClick={() => onTap(player.player_id)}
      title={`${player.last_name || ''} ${player.first_name || ''}`}
      className={clsx(
        "relative aspect-square w-full rounded-xl border-2 text-[18px] font-bold outline-none select-none active:scale-95 transition-all flex items-center justify-center",
        surface
      )}
    >
      {player.jersey_number ?? '—'}
      {badgeText && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-success text-white text-[10px] font-black flex items-center justify-center shadow border-2 border-surface-level1">
          {badgeText}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────── Главный компонент шторки ───────────────────
export function MatchEventSheet({
  isOpen,
  mode,
  scoringTeamId,
  existingEvent,
  parentMatch,
  regulation,
  rosters,
  editRole,
  myTeamId,
  onClose,
  onSave,
}) {
  const isEdit = !!existingEvent;
  const actualMode = existingEvent ? (existingEvent.event_type === 'penalty' ? 'penalty' : 'goal') : (mode || 'goal');
  const actualTeamId = existingEvent?.team_id ?? scoringTeamId ?? null;
  const isGoal = actualMode === 'goal';

  // Соперник правит только свою сторону. Для гола actualTeamId = забившая команда:
  // забили мы → правим автора/ассистентов/«+»; пропустили мы → только «−» своих.
  // Для штрафа actualTeamId = оштрафованная команда → правим, только если она наша.
  const isOpponent = editRole === 'opponent';
  const canEditScoring   = !isOpponent || Number(myTeamId) === Number(actualTeamId);
  const canEditConceding = !isOpponent || Number(myTeamId) !== Number(actualTeamId);

  // Командное цветовое кодирование (тумблер в SettingsPage). По умолчанию ВКЛ.
  const isColorsEnabled = typeof window !== 'undefined' && localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColor = parentMatch?.team_color;
  const hasTeamColor = isColorsEnabled && !!teamColor;
  const activeBrandColor = hasTeamColor ? teamColor : null;

  const [minutes, setMinutes] = useState('00');
  const [seconds, setSeconds] = useState('00');
  const [goalStrength, setGoalStrength] = useState('equal');
  const [fromShot, setFromShot] = useState(true);
  const [scorerId, setScorerId] = useState(null);
  const [assistIds, setAssistIds] = useState([]);
  const [penaltyIdx, setPenaltyIdx] = useState(0);
  const [penaltyPlayerId, setPenaltyPlayerId] = useState(null);
  const [activeChip, setActiveChip] = useState('scorer'); // 'scorer' | 'assist' | 'pm'
  const [pmHome, setPmHome] = useState([]);
  const [pmAway, setPmAway] = useState([]);

  // ── Конечная карусель (для goal-mode) ─────────────────────────────────
  // 2 слайда: [scoring, conceding]. Стартуем на scoring (progress 0).
  // scrollProgress — непрерывная величина 0..1, шапка едет вместе с контентом.
  // scrollIdx — дискретный (для стрелок: гаснут на границах).
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollIdx = Math.round(scrollProgress);
  const carouselRef = useRef(null);

  // Установка начальной позиции при открытии шторки.
  // Соперник, который пропустил гол, сразу попадает на свою (вторую) панель «−».
  useEffect(() => {
    if (!isOpen || !isGoal) return;
    const startIdx = (isOpponent && !canEditScoring) ? 1 : 0;
    setScrollProgress(startIdx);
    const id = requestAnimationFrame(() => {
      if (!carouselRef.current) return;
      carouselRef.current.scrollTo({ left: carouselRef.current.clientWidth * startIdx, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, isGoal, isOpponent, canEditScoring]);

  // Программный scroll по нажатию стрелки.
  // Обновлять scrollProgress не нужно — onScroll отстреливает на каждом кадре
  // плавного scrollTo и тянет шапку синхронно с контентом.
  const navigate = (dir) => {
    if (!carouselRef.current) return;
    const w = carouselRef.current.clientWidth;
    if (w === 0) return;
    const target = scrollIdx + dir;
    if (target < 0 || target > 1) return;
    carouselRef.current.scrollTo({ left: w * target, behavior: 'smooth' });
  };

  // Свайп пальцем / плавный scrollTo → непрерывное обновление прогресса
  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    if (clientWidth === 0) return;
    const p = Math.max(0, Math.min(1, scrollLeft / clientWidth));
    setScrollProgress(p);
  };

  // Префилл / сброс при открытии шторки
  useEffect(() => {
    if (!isOpen) return;
    setActiveChip('scorer');
    if (isEdit && existingEvent) {
      const total = Number(existingEvent.time_seconds) || 0;
      setMinutes(pad2(Math.floor(total / 60)));
      setSeconds(pad2(total % 60));
      if (existingEvent.event_type === 'penalty') {
        const idx = PENALTIES.findIndex(p => p.penalty_class === existingEvent.penalty_class);
        setPenaltyIdx(idx >= 0 ? idx : 0);
        setPenaltyPlayerId(existingEvent.scorer_id || existingEvent.penalty_player_id || null);
        setScorerId(null); setAssistIds([]); setGoalStrength('equal');
        setFromShot(true);
        setPmHome([]); setPmAway([]);
      } else {
        setGoalStrength(existingEvent.goal_strength || 'equal');
        setFromShot(existingEvent.from_shot ?? true);
        setScorerId(existingEvent.scorer_id || null);
        setAssistIds([existingEvent.assist1_id, existingEvent.assist2_id].filter(Boolean));
        setPmHome(existingEvent.plus_minus_home || []);
        setPmAway(existingEvent.plus_minus_away || []);
        setPenaltyPlayerId(null);
      }
    } else {
      setMinutes('00'); setSeconds('00');
      setGoalStrength('equal'); setFromShot(true);
      setScorerId(null); setAssistIds([]);
      setPenaltyIdx(0); setPenaltyPlayerId(null);
      setPmHome([]); setPmAway([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, existingEvent?.id]);

  const isHomeScoring = actualTeamId === rosters?.home_team_id;
  const scoringRoster   = isHomeScoring ? (rosters?.home || []) : (rosters?.away || []);
  const concedingRoster = isHomeScoring ? (rosters?.away || []) : (rosters?.home || []);
  const scoringPlayers = scoringRoster;
  const concedingPlayers = concedingRoster.filter(p => p.position_in_line !== 'G');

  // Псевдонимы pmHome/pmAway → pmScoring/pmConceding с учётом стороны
  const pmScoring   = isHomeScoring ? pmHome : pmAway;
  const pmConceding = isHomeScoring ? pmAway : pmHome;
  const setPmScoring   = isHomeScoring ? setPmHome : setPmAway;
  const setPmConceding = isHomeScoring ? setPmAway : setPmHome;

  const homeIsMy = parentMatch?.home_team_id === parentMatch?.my_team_id;
  const homeName = homeIsMy ? (parentMatch?.my_team_name || 'Хозяева') : (parentMatch?.opponent_name || 'Хозяева');
  const awayName = homeIsMy ? (parentMatch?.opponent_name || 'Гости')  : (parentMatch?.my_team_name || 'Гости');
  const homeLogo = homeIsMy ? parentMatch?.my_team_logo_url : parentMatch?.opponent_logo_url;
  const awayLogo = homeIsMy ? parentMatch?.opponent_logo_url : parentMatch?.my_team_logo_url;
  const scoringName   = isHomeScoring ? homeName : awayName;
  const concedingName = isHomeScoring ? awayName : homeName;
  const scoringLogo   = isHomeScoring ? homeLogo : awayLogo;
  const concedingLogo = isHomeScoring ? awayLogo : homeLogo;

  // Заголовок шторки
  const title = isGoal
    ? (isEdit ? 'Редактирование гола' : 'Добавление гола')
    : (isEdit ? 'Редактирование штрафа' : 'Добавление штрафа');

  // ── Тапы по игрокам ────────────────────────────────────────────────────
  const handleScoringPlayerTap = (playerId) => {
    if (!canEditScoring) return;
    if (!isGoal) {
      setPenaltyPlayerId(prev => (prev === playerId ? null : playerId));
      return;
    }
    if (activeChip === 'scorer') {
      setScorerId(prev => (prev === playerId ? null : playerId));
      setAssistIds(prev => prev.filter(id => id !== playerId));
    } else if (activeChip === 'assist') {
      if (scorerId === playerId) return;
      setAssistIds(prev => {
        if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
        if (prev.length >= 2) return prev;
        return [...prev, playerId];
      });
    } else if (activeChip === 'pm') {
      setPmScoring(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
    }
  };
  // Соперник в gole-mode: тап = toggle +/- (без чипсов).
  const handleConcedingPlayerTap = (playerId) => {
    if (!canEditConceding) return;
    setPmConceding(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
  };

  // ── Бейдж и заливка для конкретного игрока ─────────────────────────────
  const scoringPlayerProps = (playerId) => {
    if (!isGoal) {
      return { roleBadge: null, fill: penaltyPlayerId === playerId ? 'danger' : null };
    }
    let roleBadge = null;
    if (scorerId === playerId) roleBadge = 'author';
    else {
      const aIdx = assistIds.indexOf(playerId);
      if (aIdx !== -1) roleBadge = { assist: aIdx + 1 };
    }
    const fill = pmScoring.includes(playerId) ? 'success' : null;
    return { roleBadge, fill };
  };
  const concedingPlayerProps = (playerId) => ({
    roleBadge: null,
    fill: pmConceding.includes(playerId) ? 'danger' : null,
  });

  // ── Время + конвертация ────────────────────────────────────────────────
  const timeValue = `${pad2(parseMM(minutes))}:${pad2(parseSS(seconds))}`;
  const handleTimeChange = (val) => {
    const [m = '00', s = '00'] = (val || '00:00').split(':');
    setMinutes(pad2(parseMM(m)));
    setSeconds(pad2(parseSS(s)));
  };

  // ── Сохранение ─────────────────────────────────────────────────────────
  // Событие больше не летит в бэкенд отсюда — вместо этого локально патчим
  // черновик в MatchProtocol (onSave), а реальный запрос уйдёт одним пакетом
  // по нажатию главной кнопки «Сохранить» (или не уйдёт вовсе — по «Отмена»).
  const handleSave = () => {
    // actualTeamId может быть null — это легитимно для стороны внешнего соперника
    // (нет реальной команды в системе), team_id в БД для таких событий тоже null.
    const totalSec = parseMM(minutes) * 60 + parseSS(seconds);
    const { period, time_seconds } = totalToPeriod(totalSec, regulation);

    let payload;
    if (isGoal) {
      payload = {
        period, time_seconds, event_type: 'goal',
        team_id: actualTeamId,
        scorer_id: scorerId || null,
        assist1_id: assistIds[0] || null,
        assist2_id: assistIds[1] || null,
        goal_strength: goalStrength,
        from_shot: fromShot,
        plus_minus_home: pmHome,
        plus_minus_away: pmAway,
      };
    } else {
      const pen = PENALTIES[penaltyIdx];
      payload = {
        period, time_seconds, event_type: 'penalty',
        team_id: actualTeamId,
        scorer_id: penaltyPlayerId || null,
        penalty_player_id: penaltyPlayerId || null,
        penalty_class: pen.penalty_class,
        penalty_minutes: pen.penalty_minutes,
      };
    }

    if (onSave) onSave(payload, existingEvent?.id ?? null);
    if (onClose) onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div
        className="flex flex-col gap-4 text-left pb-1"
        style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
      >
        {/* Заголовок */}
        <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main">
          {title}
        </h3>

        {/* Время + Ситуация / Тип штрафа + Флаг «с броска» — в одну строку */}
        <div className={clsx("grid gap-3 items-end", isGoal ? "grid-cols-[2fr_3fr_auto]" : "grid-cols-[2fr_3fr]", isOpponent && "opacity-50 pointer-events-none")}>
          <TimeMMSSInputLP label="Время" value={timeValue} onChange={handleTimeChange} size="md" activeColor={activeBrandColor} disabled={isOpponent} />
          {isGoal ? (
            <SelectInputLP label="Ситуация" options={GOAL_STRENGTHS} value={goalStrength} onChange={setGoalStrength} size="md" activeColor={activeBrandColor} disabled={isOpponent} />
          ) : (
            <SelectInputLP label="Тип штрафа" options={PENALTIES.map((p, i) => ({ value: i, label: p.label }))} value={penaltyIdx} onChange={setPenaltyIdx} size="md" activeColor={activeBrandColor} disabled={isOpponent} />
          )}
          {isGoal && (
            <div className={clsx("flex flex-col shrink-0", isOpponent && "opacity-50 pointer-events-none")}>
              <span className="text-[10px] text-content-subtle uppercase tracking-widest font-bold mb-px">Бросок</span>
              <button
                type="button"
                disabled={isOpponent}
                onClick={() => setFromShot(v => !v)}
                className={clsx(
                  "flex items-center justify-center transition-all active:scale-90 outline-none w-8 h-8 mx-auto",
                  fromShot ? "text-success" : "text-danger"
                )}
                title={fromShot ? 'Гол с броска' : 'Гол без броска'}
              >
                <Icon name={fromShot ? "shootout_goal" : "shootout_miss"} className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* Блок команд: для гола — карусель (забившая ↔ пропустившая), для штрафа — обычный блок */}
        {isGoal ? (
          <div className="flex flex-col gap-2 bg-surface-base rounded-2xl pb-4">
            {/* Шапка-капсула: chevron слева | лого + название | chevron справа.
                Стрелки гаснут на границах (конечная карусель). */}
            <div className="flex items-center justify-between rounded-2xl h-[40px] px-1.5 my-2">
              {(() => {
                const canPrev = scrollIdx > 0;
                const canNext = scrollIdx < 1;
                return (
                  <>
                    <button
                      onClick={() => navigate(-1)}
                      disabled={!canPrev}
                      className={clsx(
                        "p-1 transition-all outline-none z-10",
                        canPrev
                          ? "text-content-main hover:text-brand active:scale-90"
                          : "text-content-subtle opacity-40 cursor-not-allowed"
                      )}
                    >
                      <Icon name="chevron_left" className="w-5 h-5" />
                    </button>

                    <div className="flex items-center overflow-hidden flex-1 justify-center">
                      <div className="relative overflow-hidden w-full h-6 flex items-center justify-center">
                        {/* 2 плитки — шапка едет синхронно с контентом карусели */}
                        <div
                          className="w-[200%] flex items-stretch h-full absolute left-0 top-0 will-change-transform"
                          style={{ transform: `translateX(-${scrollProgress * 50}%)` }}
                        >
                          {[
                            { name: scoringName,   logo: scoringLogo,   k: 's' },
                            { name: concedingName, logo: concedingLogo, k: 'c' },
                          ].map(t => (
                            <div key={t.k} className="w-1/2 shrink-0 flex items-center justify-center gap-3 px-2 min-w-0">
                              {t.logo && <img src={getImageUrl(t.logo)} alt="" className="w-5 h-5 object-contain shrink-0" />}
                              <span className="text-[14px] font-bold uppercase tracking-widest text-content-main truncate">
                                {t.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(1)}
                      disabled={!canNext}
                      className={clsx(
                        "p-1 rotate-180 transition-all outline-none z-10",
                        canNext
                          ? "text-content-main hover:text-brand active:scale-90"
                          : "text-content-subtle opacity-40 cursor-not-allowed"
                      )}
                    >
                      <Icon name="chevron_left" className="w-5 h-5" />
                    </button>
                  </>
                );
              })()}
            </div>

            {/* Свайп-карусель: 4 слайда (2 клона по краям для бесконечного эффекта) */}
            {(() => {
              const scoringPanel = (
                <div className={clsx("flex flex-col gap-3", !canEditScoring && "opacity-40 pointer-events-none")}>
                  <div className="grid grid-cols-3 gap-2">
                    {SELECTION_CHIPS.map(c => {
                      const active = activeChip === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setActiveChip(c.value)}
                          className={clsx(
                            "py-1 rounded-full text-[14px] uppercase tracking-widest transition-all outline-none active:scale-95 mb-3",
                            active ? "border border-brand text-brand font-black bg-surface-level1" : "bg-surface-level1 text-content-main"
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {scoringPlayers.length > 0 ? (
                    <div className="grid grid-cols-6 gap-2">
                      {scoringPlayers.map(p => {
                        const { roleBadge, fill } = scoringPlayerProps(p.player_id);
                        return (
                          <PlayerCell
                            key={p.player_id}
                            player={p}
                            roleBadge={roleBadge}
                            fill={fill}
                            onTap={handleScoringPlayerTap}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[10px] text-content-subtle uppercase font-bold py-3 text-center">
                      Заявка пуста
                    </div>
                  )}
                </div>
              );

              const concedingPanel = (
                <div className={clsx("flex flex-col gap-3", !canEditConceding && "opacity-40 pointer-events-none")}>
                  {concedingPlayers.length > 0 ? (
                    <div className="grid grid-cols-6 gap-2">
                      {concedingPlayers.map(p => {
                        const { roleBadge, fill } = concedingPlayerProps(p.player_id);
                        return (
                          <PlayerCell
                            key={p.player_id}
                            player={p}
                            roleBadge={roleBadge}
                            fill={fill}
                            onTap={handleConcedingPlayerTap}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[10px] text-content-subtle uppercase font-bold py-3 text-center">
                      Заявка соперника недоступна
                    </div>
                  )}
                </div>
              );

              return (
                <div
                  ref={carouselRef}
                  onScroll={handleCarouselScroll}
                  className="w-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                >
                  <div className="w-full shrink-0 snap-center px-4">{scoringPanel}</div>
                  <div className="w-full shrink-0 snap-center px-4">{concedingPanel}</div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Штраф — одна команда, без карусели */
          <div className="flex flex-col gap-2 bg-surface-base rounded-2xl pb-4 px-4">
            <div className="flex items-center justify-center rounded-2xl h-[40px]  px-1.5 my-2">
              <div className="flex items-center justify-center gap-3 px-2 min-w-0">
                {scoringLogo && <img src={getImageUrl(scoringLogo)} alt="" className="w-5 h-5 object-contain shrink-0" />}
                <span className="text-[14px] font-bold uppercase tracking-widest text-content-main truncate">
                  {scoringName}
                </span>
              </div>
            </div>
            {scoringPlayers.length > 0 ? (
              <div className={clsx("grid grid-cols-6 gap-2", !canEditScoring && "opacity-40 pointer-events-none")}>
                {scoringPlayers.map(p => {
                  const { roleBadge, fill } = scoringPlayerProps(p.player_id);
                  return (
                    <PlayerCell
                      key={p.player_id}
                      player={p}
                      roleBadge={roleBadge}
                      fill={fill}
                      onTap={handleScoringPlayerTap}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-[10px] text-content-subtle uppercase font-bold py-3 text-center">
                Заявка пуста
              </div>
            )}
          </div>
        )}

        {/* Кнопка сохранить */}
        <ButtonLP type="button" variant="primary" onClick={handleSave} activeColor={activeBrandColor}>
          {isEdit ? 'Сохранить' : 'Добавить'}
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}
