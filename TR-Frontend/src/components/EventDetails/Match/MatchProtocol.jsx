import React, { useState, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { getAuthHeaders, uiFixed } from '../../../utils/helpers';
import { FadeIn } from '../../../ui/FadeIn';
import { PageLoader } from '../../../ui/Loader';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ConfirmSheet } from '../../../ui/ConfirmSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { StepperLP } from '../../../ui/Input-LP';
import { CheckboxLP } from '../../../ui/Checkbox-LP';
import { useAccess } from '../../../hooks/useAccess';
import { MatchEventSheet } from './MatchEventSheet';
import { ShotsSheet } from './ShotsSheet';
import { GoalieChangeSheet } from './GoalieChangeSheet';
import { decodeGoalieLog, encodeGoalieLog, removeGoalieChange, periodKeyForTime } from './goalieLogModel';

const PERIOD_ORDER = ['1', '2', '3', 'OT', 'SO'];
const PERIOD_LABELS = { '1': '1-й период', '2': '2-й период', '3': '3-й период', OT: 'Овертайм', SO: 'Серия бросков' };

// ─── Утилиты ──────────────────────────────────────────────────────────

const formatTime = (seconds) => {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const GOAL_STRENGTH_LABELS = {
  pp1: 'БОЛ', pp2: 'БОЛ',
  sh1: 'МЕН', sh2: 'МЕН',
  en:  'ПВ',
  ps:  'ШБ',
};

// ═══════════════════════════════════════════════════════════════════════
// УНИВЕРСАЛЬНЫЙ БЛОК ИГРОКА
// home → выравнивание влево, аватар слева, номер справа от него
// away → выравнивание вправо, аватар справа, номер слева от него
// ═══════════════════════════════════════════════════════════════════════
const PlayerBlock = ({ event, side, subLines = [], onClick }) => {
  const isHome = side === 'home';
  const hasPlayer = !!(event.scorer_last_name || event.scorer_first_name);
  const clickable = hasPlayer && !!onClick;

  return (
    <div className={`flex flex-col min-w-0 w-full gap-0.5 ${isHome ? 'items-start' : 'items-end'}`}>

      {/* Строка 1: аватар во внешнем углу + номер рядом к центру */}
      {/* home: [аватар] [номер →]   away: [← номер] [аватар] */}
      <div
        className={clsx(
          "flex items-center gap-1.5",
          isHome ? 'flex-row' : 'flex-row-reverse',
          clickable && "cursor-pointer active:opacity-70 transition-opacity"
        )}
        onClick={clickable ? onClick : undefined}
      >
        <div className="rounded-xl bg-surface-level2 shrink-0 overflow-hidden" style={{ width: uiFixed(36), height: uiFixed(36) }}>
          <Avatar
            photoUrl={event.scorer_photo}
            firstName={event.scorer_first_name}
            lastName={event.scorer_last_name}
            className="w-full h-full rounded-xl"
          />
        </div>
        {hasPlayer && (
          <span className="font-bold text-content-muted leading-none shrink-0" style={{ fontSize: uiFixed(10) }}>
            #{event.scorer_jersey ?? '?'}
          </span>
        )}
      </div>

      {/* Строка 2: Фамилия И. либо «Не указан» */}
      {hasPlayer ? (
        <span
          className={clsx(
            "font-bold text-content-main leading-tight w-full truncate block",
            isHome ? 'text-left' : 'text-right',
            clickable && "cursor-pointer active:opacity-70 transition-opacity"
          )}
          style={{ fontSize: uiFixed(14) }}
          onClick={clickable ? onClick : undefined}
        >
          {event.scorer_last_name} {event.scorer_first_name?.[0] ?? ''}.
        </span>
      ) : (
        <span className={`text-[12px] italic text-content-subtle leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
          Не указан
        </span>
      )}

      {/* Строки 3+: ассистенты или нарушение */}
      {subLines.map((line, i) => (
        <span key={i} className={`text-[10px] text-content-muted leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
          {line}
        </span>
      ))}
    </div>
  );
};

const GoalPlayer = ({ event, side, onPlayerClick }) => {
  const subLines = [];
  if (event.assist1_id)
    subLines.push(`#${event.assist1_jersey ?? '?'} ${event.assist1_last_name} ${event.assist1_first_name?.[0] ?? ''}.`);
  if (event.assist2_id)
    subLines.push(`#${event.assist2_jersey ?? '?'} ${event.assist2_last_name} ${event.assist2_first_name?.[0] ?? ''}.`);
  return <PlayerBlock event={event} side={side} subLines={subLines} onClick={onPlayerClick} />;
};

const PenaltyPlayer = ({ event, side, onPlayerClick }) => {
  const subLines = event.penalty_violation ? [event.penalty_violation] : [];
  return <PlayerBlock event={event} side={side} subLines={subLines} onClick={onPlayerClick} />;
};

// Вратарь: смена/старт — переиспользуем PlayerBlock (scorer_* заполнены данными
// вратаря). Снятие (пустые ворота) — отдельный блок без игрока.
const GoaliePlayer = ({ event, side, onPlayerClick }) => {
  const isHome = side === 'home';

  if (event.goalie_empty || event.goalie_unspecified) {
    return (
      <div className={`flex flex-col min-w-0 w-full gap-0.5 ${isHome ? 'items-start' : 'items-end'}`}>
        <div className={`flex items-center gap-1.5 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
          <span className="w-9 h-9 rounded-xl bg-surface-level2 flex items-center justify-center text-content-muted shrink-0">
            <Icon name="swap" className="w-4 h-4" />
          </span>
        </div>
        <span className={`text-[14px] font-bold text-content-main leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
          {event.goalie_unspecified ? 'Не указан' : 'Пустые ворота'}
        </span>
        {event.prev_goalie_label && (
          <span className={`text-[10px] text-content-muted leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
            снят {event.prev_goalie_label}
          </span>
        )}
      </div>
    );
  }

  const subLines = (event.goalie_kind === 'change' && event.prev_goalie_label)
    ? [`сменил ${event.prev_goalie_label}`]
    : [];
  return <PlayerBlock event={event} side={side} subLines={subLines} onClick={onPlayerClick} />;
};

// ═══════════════════════════════════════════════════════════════════════
// ЦЕНТРАЛЬНАЯ КОЛОНКА — время + бейдж + доп. метка
// ═══════════════════════════════════════════════════════════════════════
const EventCenter = ({ event }) => {
  const strengthLabel = GOAL_STRENGTH_LABELS[event.goal_strength] ?? null;

  const badgeStyle = { fontSize: uiFixed(10), paddingLeft: uiFixed(8), paddingRight: uiFixed(8), paddingTop: uiFixed(4), paddingBottom: uiFixed(4) };
  const goalieBadgeStyle = { fontSize: uiFixed(10), paddingLeft: uiFixed(10), paddingRight: uiFixed(10), paddingTop: uiFixed(4), paddingBottom: uiFixed(4) };

  const badge = (() => {
    switch (event.event_type) {
      case 'goal':
        return <span className="font-bold uppercase rounded-full bg-emerald-500 text-white leading-none" style={badgeStyle}>ГОЛ</span>;
      case 'penalty':
        return <span className="font-bold uppercase rounded-full bg-red-500 text-white leading-none" style={badgeStyle}>ШТРАФ</span>;
      case 'shootout_goal':
        return <span className="font-bold uppercase rounded-full bg-emerald-500 text-white leading-none" style={badgeStyle}>ШБ</span>;
      case 'shootout_miss':
      case 'failed_ps':
        return <span className="font-bold uppercase rounded-full bg-surface-level2 text-content-muted leading-none" style={badgeStyle}>МИМО</span>;
      case 'goalie':
        return (
          <span className="font-semibold uppercase rounded-lg bg-surface-level2 text-content-main leading-tight text-center" style={goalieBadgeStyle}>
            {event.goalie_empty ? <>ПВ<br /></> : <>Замена<br />вратаря</>}
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 self-start" style={{ width: uiFixed(80) }}>
      <span className="font-bold text-content-main tabular-nums leading-tight" style={{ fontSize: uiFixed(14) }}>
        {formatTime(event.display_seconds ?? event.time_seconds)}
      </span>
      {badge}
      {/* Доп. метка: БОЛ / МЕН / ПВ / минуты штрафа */}
      {event.event_type === 'goal' && strengthLabel && (
        <span className="font-bold text-content-muted uppercase tracking-wider leading-none" style={{ fontSize: uiFixed(10) }}>
          {strengthLabel}
        </span>
      )}
      {event.event_type === 'penalty' && event.penalty_minutes != null && (
        <span className="font-bold text-content-muted uppercase tracking-wider leading-none" style={{ fontSize: uiFixed(10) }}>
          {event.penalty_minutes} МИН
        </span>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ОДНО СОБЫТИЕ — трёхколоночная карточка [home | center | away]
// Высота боковых колонок выравнивается по наибольшей через ResizeObserver
// ═══════════════════════════════════════════════════════════════════════
const EventCard = ({ event, homeTeamId, canEdit, editRole, myTeamId, onEdit, onDelete, openRightPanel, activeBrandColor, hasTeamColor }) => {
  const isHome = event.team_id === homeTeamId;
  const side = isHome ? 'home' : 'away';

  const playerId = event.event_type === 'goalie' ? event.goalie_id : event.scorer_id;
  const onPlayerClick = (playerId != null && openRightPanel)
    ? () => openRightPanel('playerProfile', { playerId, activeBrandColor, hasTeamColor }, 'Профиль игрока')
    : null;

  // Что доступно текущей роли по этому событию.
  // Инициатор: правит и удаляет всё. Соперник: правит голы (своё авторство/«±»),
  // свои штрафы и свои смены вратаря (их же может удалять).
  const isMyGoalieCard = event.event_type === 'goalie' && Number(event.team_id) === Number(myTeamId);
  const canDelete = canEdit && (editRole === 'initiator' || (editRole === 'opponent' && isMyGoalieCard));
  const canEditThis = canEdit && (
    editRole === 'initiator' ||
    (editRole === 'opponent' && (
      event.event_type === 'goal' ||
      (event.event_type === 'penalty' && Number(event.team_id) === Number(myTeamId)) ||
      isMyGoalieCard
    ))
  );
  const showActions = canEditThis || canDelete;

  const homeRef = React.useRef(null);
  const awayRef = React.useRef(null);
  const [minHeight, setMinHeight] = React.useState(0);

  React.useEffect(() => {
    const refs = [homeRef.current, awayRef.current].filter(Boolean);
    if (!refs.length) return;

    const sync = () => {
      // Сбрасываем minHeight чтобы получить натуральные высоты
      refs.forEach(el => { el.style.minHeight = '0px'; });
      const max = Math.max(...refs.map(el => el.scrollHeight));
      setMinHeight(max);
    };

    const observer = new ResizeObserver(sync);
    refs.forEach(el => observer.observe(el));
    sync();
    return () => observer.disconnect();
  }, []);

  const renderPlayer = () => {
    switch (event.event_type) {
      case 'goal':
      case 'shootout_goal':
      case 'shootout_miss':
      case 'failed_ps':
        return <GoalPlayer event={event} side={side} onPlayerClick={onPlayerClick} />;
      case 'penalty':
        return <PenaltyPlayer event={event} side={side} onPlayerClick={onPlayerClick} />;
      case 'goalie':
        return <GoaliePlayer event={event} side={side} onPlayerClick={onPlayerClick} />;
      default:
        return null;
    }
  };

  const colStyle = minHeight ? { minHeight } : {};

  // Action-кнопки в edit-mode — рендерятся в ПУСТОЙ от игрока колонке.
  // Только Редактировать + Удалить (+/- теперь редактируется в шторке как шаг 2).
  // Стек вертикальный: сверху Редактировать, снизу Удалить.
  const ActionButtons = ({ alignRight }) => (
    <div className={clsx("w-full flex flex-col", alignRight ? "items-start" : "items-end")}>
      {canEditThis && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit && onEdit(event); }}
          title="Редактировать"
          className="w-9 h-9 rounded-full text-content-muted flex items-center justify-center transition-all active:scale-90 outline-none opacity-50"
        >
          <Icon name="edit" className="w-4 h-4" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete && onDelete(event); }}
          title="Удалить"
          className="w-9 h-9 rounded-full text-danger flex items-center justify-center transition-all active:scale-90 outline-none opacity-50"
        >
          <Icon name="delete" className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="relative bg-surface-level1 rounded-2xl px-4 py-4 flex items-start gap-2 border border-transparent">
      {/* Левая часть — хозяева, либо action-кнопки если событие гостей */}
      <div ref={homeRef} className="flex-1 min-w-0 flex items-start" style={colStyle}>
        {isHome
          ? renderPlayer()
          : (showActions ? <ActionButtons alignRight={true} /> : null)}
      </div>

      {/* Центр — время + бейдж */}
      <EventCenter event={event} />

      {/* Правая часть — гости, либо action-кнопки если событие хозяев */}
      <div ref={awayRef} className="flex-1 min-w-0 flex items-start" style={colStyle}>
        {!isHome
          ? renderPlayer()
          : (showActions ? <ActionButtons alignRight={false} /> : null)}
      </div>
    </div>
  );
};

// ─── Блок периода ─────────────────────────────────────────────────────
const PeriodBlock = ({ label, events, homeTeamId, canEdit, editRole, myTeamId, onEdit, onDelete, openRightPanel, activeBrandColor, hasTeamColor }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-3 px-1">
      <div className="flex-1 h-px bg-surface-border" />
      <span className="text-[14px] font-black text-content-muted uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-surface-border" />
    </div>
    {events.map(ev => (
      <EventCard
        key={ev.id}
        event={ev}
        homeTeamId={homeTeamId}
        canEdit={canEdit}
        editRole={editRole}
        myTeamId={myTeamId}
        onEdit={onEdit}
        onDelete={onDelete}
        openRightPanel={openRightPanel}
        activeBrandColor={activeBrandColor}
        hasTeamColor={hasTeamColor}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
// ОСНОВНОЙ КОМПОНЕНТ
// ═══════════════════════════════════════════════════════════════════════
export const MatchProtocol = ({ event, user, selectedTeam, openRightPanel }) => {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  // Локальный статус матча.
  // - Стартует из event.status (приходит из календарного кэша).
  // - После успешного сохранения результатов (doPublish) становится 'finished'.
  const [localStatus, setLocalStatus] = useState(event?.status);
  useEffect(() => { setLocalStatus(event?.status); }, [event?.event_id, event?.status]);

  // MatchProtocol рендерится в overlay-дереве EventPage — вне <Outlet>.
  // Поэтому user / selectedTeam / openRightPanel пробрасываются явными пропсами
  // (через EventPage → EventDetailsMatch). useOutletContext здесь не работает.
  const { checkAccess } = useAccess(user, selectedTeam);

  // Время матча считаем по абсолютному UTC: event_date приходит как timestamptz,
  // new Date() возвращает текущий UTC — таймзона арены к сравнению отношения не имеет.
  const eventDateMs = event?.event_date ? new Date(event.event_date).getTime() : null;
  const gameDatePassed = eventDateMs ? eventDateMs < Date.now() : false;
  const isInitiator =
    Number(event?.initiator_team_id) === Number(event?.my_team_id);
  const isNonOfficial = event?.game_type && event.game_type !== 'official';

  // Команда-соперник (не я) и факт, что она реальная (есть team_id, а не «внешний» соперник).
  const opponentTeamId = Number(event?.home_team_id) === Number(event?.my_team_id)
    ? (event?.away_team_id ?? event?.opponent_team_id)
    : event?.home_team_id;
  const opponentIsReal = !!opponentTeamId;

  // Матч считается «прошедшим» либо по статусу, либо по факту прохода game_date
  // (lazy-update в БД мог ещё не сработать в этой сессии — не блокируем UI).
  const isMatchOver =
    localStatus === 'finished' ||
    localStatus === 'finished_no_result' ||
    (gameDatePassed && isNonOfficial && localStatus === 'scheduled');

  const isPlayable = isMatchOver || localStatus === 'live';

  // Командное цветовое кодирование (тумблер в SettingsPage). По умолчанию ВКЛ.
  const isColorsEnabled = typeof window !== 'undefined' && localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : null;

  const fetchProtocol = useCallback(async () => {
    if (!event?.event_id) return;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const res = await fetch(
        `${apiUrl}/api/matches/${event.event_id}/protocol?teamId=${event.my_team_id}`,
        { headers }
      );
      const data = await res.json();
      if (data.success) setPeriods(data.periods || []);
    } catch (err) {
      console.error('Ошибка загрузки хода матча:', err);
    } finally {
      setLoading(false);
    }
  }, [event?.event_id, event?.my_team_id]);

  useEffect(() => {
    if (!isPlayable || !event?.event_id) {
      setLoading(false);
      return;
    }
    fetchProtocol();
  }, [event?.event_id, isPlayable, fetchProtocol]);

  // Патчим кэш события в sessionStorage и пингуем подписчиков (EventDetailsMatch,
  // SchedulePage). Без этого "Противостояние" и счёт в карточке остаются stale,
  // пока пользователь не закроет и не откроет деталь матча.
  const patchEventCache = useCallback((patch) => {
    if (!event?.event_id) return;
    try {
      const sessKey = `tr_event_match_${event.event_id}`;
      const cached = sessionStorage.getItem(sessKey);
      // Раньше писали только если запись УЖЕ существовала — но её никто заранее
      // не создавал, поэтому патч всегда тихо терялся, а "О матче"/счёт не
      // обновлялись без полного закрытия и повторного открытия карточки.
      // Базой берём то, что в кэше, а если там пусто — сам проп event (у него
      // есть все поля, которые ждёт EventDetailsMatch при полной замене localEvent).
      const base = cached ? JSON.parse(cached) : event;
      sessionStorage.setItem(sessKey, JSON.stringify({ ...base, ...patch }));
    } catch {}
    window.dispatchEvent(new CustomEvent('tr-events-updated'));
  }, [event]);


  // ── Режим просмотра / редактирования (как в MatchLines) ──────────────────
  const [isEditMode, setIsEditMode] = useState(false);
  // Шторка добавления/редактирования события: { mode, scoringTeamId, existingEvent? } | null
  const [eventSheet, setEventSheet] = useState(null);
  // событие, для которого открыто подтверждение удаления
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState(null);

  // ── Черновик сессии правки (события / журнал вратарей / броски) ──────────
  // Пока идёт правка, все изменения живут только здесь, в памяти — ни один
  // под-компонент (MatchEventSheet / GoalieChangeSheet / ShotsSheet) больше
  // не пишет в бэкенд сам. «Сохранить» одним пакетом коммитит всё разом и
  // пересчитывает счёт; «Отмена» просто отбрасывает черновик без единого
  // запроса — на сервере ничего не менялось, откатывать нечего.
  const [draftEvents, setDraftEvents] = useState(null); // null = сессии правки нет
  const [deletedEventIds, setDeletedEventIds] = useState(() => new Set());
  const [draftGoalieLog, setDraftGoalieLog] = useState(null);
  const [draftShots, setDraftShots] = useState(null);

  // ── Регламент матча (количество периодов / длина / ОТ) ──────────────────
  const [regulation, setRegulation] = useState({ period_length: 20, ot_length: 0, periods_count: 3, opponent_can_edit: true });
  const [showRegulation, setShowRegulation] = useState(false);
  const [regDraft, setRegDraft] = useState({ period_length: 20, ot_length: 5, periods_count: 3, has_ot: false, opponent_can_edit: true });
  const [isSavingReg, setIsSavingReg] = useState(false);

  // Роль редактора результатов:
  // 'initiator' — полный доступ; 'opponent' — только свои данные (если в настройках
  // матча включён opponent_can_edit и соперник реальный). Регламент грузится
  // оптимистично (дефолт флага true), поэтому соперник видит права сразу.
  const editRole = (() => {
    if (!isNonOfficial || !isMatchOver) return null;
    if (!checkAccess('MATCH_FILL_RESULTS', event?.my_team_id)) return null;
    if (isInitiator) return 'initiator';
    if (opponentIsReal && regulation.opponent_can_edit) return 'opponent';
    return null;
  })();
  const canFillResults = editRole != null;
  const isOpponentEditor = editRole === 'opponent';
  const myTeamId = event?.my_team_id;
  // Сторона моей команды (для скоупа смены вратаря у соперника).
  const mySide = Number(event?.home_team_id) === Number(myTeamId) ? 'home' : 'away';

  // ── Кэшированный ростер (для inline-композера) ───────────────────────────
  const [rosters, setRosters] = useState({ home: [], away: [], home_team_id: null, away_team_id: null });

  // Клиентское обогащение «сырого» события (id игроков) именами/номерами/фото
  // из уже загруженного ростера — повторяет JOIN'ы backend'а getMatchProtocol,
  // чтобы черновые (ещё не сохранённые) события рендерились в ленте так же,
  // как события, пришедшие с сервера.
  const enrichEvent = useCallback((ev) => {
    const allPlayers = [...(rosters.home || []), ...(rosters.away || [])];
    const findPlayer = (id) => (id == null ? null : allPlayers.find(p => p.player_id === id));
    const scorer = findPlayer(ev.scorer_id);
    const a1 = findPlayer(ev.assist1_id);
    const a2 = findPlayer(ev.assist2_id);
    return {
      ...ev,
      scorer_first_name: scorer?.first_name ?? null,
      scorer_last_name: scorer?.last_name ?? null,
      scorer_jersey: scorer?.jersey_number ?? null,
      scorer_photo: scorer?.photo_url ?? null,
      assist1_first_name: a1?.first_name ?? null,
      assist1_last_name: a1?.last_name ?? null,
      assist1_jersey: a1?.jersey_number ?? null,
      assist2_first_name: a2?.first_name ?? null,
      assist2_last_name: a2?.last_name ?? null,
      assist2_jersey: a2?.jersey_number ?? null,
      penalty_violation: ev.penalty_violation ?? null,
    };
  }, [rosters]);

  // ── Журнал смен вратарей (нужен для строки «В воротах» и привязки бросков) ─
  const [goalieLog, setGoalieLog] = useState([]);
  const fetchGoalieLog = useCallback(async () => {
    if (!canFillResults || !event?.event_id || !event?.my_team_id) return;
    const apiUrl = import.meta.env.VITE_API_URL || '';
    try {
      const r = await fetch(
        `${apiUrl}/api/matches/${event.event_id}/results/goalie-log?teamId=${event.my_team_id}`,
        { headers: getAuthHeaders() }
      );
      const j = await r.json();
      if (j?.success) setGoalieLog(j.log || []);
    } catch { /* пусто */ }
  }, [canFillResults, event?.event_id, event?.my_team_id]);

  useEffect(() => { fetchGoalieLog(); }, [fetchGoalieLog]);

  // Снимок бросков на момент входа в правку — броски нигде больше не кэшируются
  // на уровне MatchProtocol (раньше их грузила сама ShotsSheet при каждом
  // открытии), нужен один раз как стартовое состояние черновика.
  const fetchShotsSnapshot = useCallback(async () => {
    if (!event?.event_id || !event?.my_team_id) return {};
    const apiUrl = import.meta.env.VITE_API_URL || '';
    try {
      const r = await fetch(
        `${apiUrl}/api/matches/${event.event_id}/results/goalie-shots?teamId=${event.my_team_id}`,
        { headers: getAuthHeaders() }
      );
      const j = await r.json();
      if (!j?.success) return {};
      const map = {};
      (j.shots || []).forEach(s => {
        const key = `${s.team_id}_${s.goalie_id == null ? 'null' : s.goalie_id}_${s.period}`;
        map[key] = Number(s.shots_count) || 0;
      });
      return map;
    } catch { return {}; }
  }, [event?.event_id, event?.my_team_id]);

  // Загружаем регламент + ростеры одним запросом /rosters.
  useEffect(() => {
    if (!canFillResults || !event?.event_id || !event?.my_team_id) return;
    const apiUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${apiUrl}/api/matches/${event.event_id}/results/rosters?teamId=${event.my_team_id}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(j => {
        if (!j?.success) return;
        if (j.regulation) setRegulation(j.regulation);
        setRosters({
          home: j.home || [],
          away: j.away || [],
          home_team_id: j.home_team_id,
          away_team_id: j.away_team_id,
        });
      })
      .catch(() => {});
  }, [event?.event_id, event?.my_team_id, canFillResults]);

  const handleOpenRegulation = () => {
    setRegDraft({
      period_length: regulation.period_length || 20,
      ot_length:     regulation.ot_length     || 5,
      periods_count: regulation.periods_count || 3,
      has_ot:        (regulation.ot_length || 0) > 0,
      opponent_can_edit: regulation.opponent_can_edit ?? true,
    });
    setShowRegulation(true);
  };

  const handleSaveRegulation = async () => {
    if (isSavingReg) return;
    setIsSavingReg(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const body = {
        teamId: event.my_team_id,
        period_length: regDraft.period_length,
        ot_length:     regDraft.has_ot ? regDraft.ot_length : 0,
        periods_count: regDraft.periods_count,
        opponent_can_edit: regDraft.opponent_can_edit,
      };
      const res = await fetch(
        `${apiUrl}/api/matches/${event.event_id}/results/regulation`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(body) }
      );
      const json = await res.json();
      if (json.success) {
        setRegulation(json.regulation);
        setShowRegulation(false);
        // Триггеры от UPDATE game_events сбросили матч → синхрон.
        setLocalStatus('finished_no_result');
        patchEventCache({ status: 'finished_no_result' });
        fetchProtocol();
      } else {
        alert(json.error || 'Не удалось сохранить регламент');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingReg(false);
    }
  };

  const [showShots, setShowShots] = useState(false);
  const handleOpenShots = () => setShowShots(true);
  // Шторка смены вратаря: { side: 'home'|'away', existingChange: {time_seconds, goalie_id}|null } | null
  const [goalieSheet, setGoalieSheet] = useState(null);
  // Цель удаления смены вратаря из ленты: { side, time_seconds } | null
  const [goalieDeleteTarget, setGoalieDeleteTarget] = useState(null);

  // Пересчёт счёта/статуса матча из game_events (та же ручка, что раньше называлась
  // «Опубликовать») — вызывается только изнутри handleSaveResults, уже после того,
  // как черновик событий/журнала/бросков закоммичен в БД.
  const doPublish = async () => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const res = await fetch(
      `${apiUrl}/api/matches/${event.event_id}/results/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ teamId: event.my_team_id })
      }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Не удалось опубликовать');
    // Локально переключаем статус — кнопка станет "Опубликовано".
    setLocalStatus('finished');
    // Чистим кэш календаря, чтобы SchedulePage перетянул свежие данные.
    try {
      const prefix = `tr_cached_events_team_${event.my_team_id}_month_`;
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
    // Патчим sessionStorage события — EventDetailsMatch перерисует
    // Противостояние/счёт без необходимости закрывать/открывать карточку.
    patchEventCache({
      status: 'finished',
      home_score: data.home_score,
      away_score: data.away_score,
    });
  };

  // ── Вход в режим правки: снимок текущего состояния становится черновиком ──
  // Всё, что произойдёт дальше (добавление/правка/удаление гола, штрафа, смены
  // вратаря, бросков), меняет только этот снимок — в бэкенд ничего не летит,
  // пока не нажата «Сохранить».
  const handleEnterEdit = () => {
    setDraftEvents(periods.flatMap(p => p.events.map(ev => ({ ...ev }))));
    setDeletedEventIds(new Set());
    setDraftGoalieLog(goalieLog.map(r => ({ ...r })));
    setIsEditMode(true);
    // Броски не блокируют переключение экрана — грузятся в фоне, пока
    // пользователь их не открыл (шторка «Броски» доступна только внутри
    // уже активной сессии правки).
    fetchShotsSnapshot().then(setDraftShots);
  };

  // ── Отмена: черновик просто отбрасывается. На сервере ничего не менялось
  // за время сессии правки — значит и откатывать нечего, ни одного запроса.
  const handleCancelEdit = () => {
    setDraftEvents(null);
    setDeletedEventIds(new Set());
    setDraftGoalieLog(null);
    setDraftShots(null);
    setIsEditMode(false);
  };

  // ── Сохранить: коммитим черновик одним пакетом (события → журнал вратарей →
  // броски), затем пересчитываем счёт (doPublish) и подтягиваем свежую правду
  // с сервера. Если матч уже был опубликован раньше — это повторный пересчёт.
  const handleSaveResults = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };

      for (const ev of (draftEvents || [])) {
        if (!ev._isNew && !ev._dirty) continue;
        const payload = {
          teamId: event.my_team_id,
          period: ev.period,
          time_seconds: ev.time_seconds,
          event_type: ev.event_type,
          team_id: ev.team_id,
          scorer_id: ev.scorer_id ?? null,
          assist1_id: ev.assist1_id ?? null,
          assist2_id: ev.assist2_id ?? null,
          goal_strength: ev.goal_strength ?? null,
          from_shot: ev.from_shot ?? null,
          plus_minus_home: ev.plus_minus_home ?? [],
          plus_minus_away: ev.plus_minus_away ?? [],
          penalty_player_id: ev.penalty_player_id ?? null,
          penalty_class: ev.penalty_class ?? null,
          penalty_minutes: ev.penalty_minutes ?? null,
        };
        if (ev._isNew) {
          await fetch(`${apiUrl}/api/matches/${event.event_id}/results/events`, {
            method: 'POST', headers, body: JSON.stringify(payload),
          });
        } else {
          await fetch(`${apiUrl}/api/matches/${event.event_id}/results/events/${ev.id}`, {
            method: 'PUT', headers, body: JSON.stringify(payload),
          });
        }
      }
      for (const id of deletedEventIds) {
        await fetch(`${apiUrl}/api/matches/${event.event_id}/results/events/${id}?teamId=${event.my_team_id}`, {
          method: 'DELETE', headers: getAuthHeaders(),
        });
      }

      if (draftGoalieLog) {
        await fetch(`${apiUrl}/api/matches/${event.event_id}/results/goalie-log`, {
          method: 'PUT', headers, body: JSON.stringify({ teamId: event.my_team_id, entries: draftGoalieLog }),
        });
      }

      if (draftShots) {
        const shotsEntries = [];
        Object.entries(draftShots).forEach(([key, val]) => {
          if (val === '' || val == null) return;
          const [teamId, gid, period] = key.split('_');
          shotsEntries.push({
            goalie_id: gid === 'null' ? null : Number(gid),
            team_id: Number(teamId),
            period,
            shots_count: Number(val) || 0,
          });
        });
        await fetch(`${apiUrl}/api/matches/${event.event_id}/results/goalie-shots`, {
          method: 'PUT', headers, body: JSON.stringify({ teamId: event.my_team_id, entries: shotsEntries }),
        });
      }

      await doPublish();
      await fetchProtocol();
      await fetchGoalieLog();

      setDraftEvents(null);
      setDeletedEventIds(new Set());
      setDraftGoalieLog(null);
      setDraftShots(null);
      setIsEditMode(false);
    } catch (err) {
      console.error('Ошибка сохранения результатов:', err);
      alert(err?.message || 'Не удалось сохранить результаты матча');
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Шапка вкладки: режим просмотра vs режим редактирования (паттерн MatchLines) ──
  const FillResultsPanel = () => (
    <div
      className="flex flex-col gap-1.5 pb-3 mb-1 w-full"
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
    >
      {isEditMode ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCancelEdit}
            disabled={isPublishing}
            className="flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-danger transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none disabled:opacity-50"
          >
            <Icon name="close" className="w-4 h-4 shrink-0" strokeWidth={3} />
            <span className="truncate">Отмена</span>
          </button>
          <button
            type="button"
            onClick={handleSaveResults}
            disabled={isPublishing}
            className="flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-success transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none shadow-sm disabled:opacity-50"
          >
            {isPublishing ? (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-success border-t-transparent animate-spin shrink-0" />
            ) : (
              <Icon name="save" className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            )}
            <span className="truncate">Сохранить</span>
          </button>
        </div>
      ) : (
        <div className={clsx("grid gap-2", editRole === 'initiator' ? "grid-cols-2" : "grid-cols-1")}>
          {editRole === 'initiator' && (
            <button
              type="button"
              onClick={handleOpenRegulation}
              className="flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold bg-surface-base border border-brand text-brand transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
            >
              <Icon name="settings" className="w-4 h-4 shrink-0" />
              <span className="truncate">Настройки</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleEnterEdit}
            className="flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold border border-brand text-brand bg-surface-base transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
          >
            <Icon name="edit" className="w-4 h-4 shrink-0" />
            <span className="truncate">Ввод результатов</span>
          </button>
        </div>
      )}
    </div>
  );

  // Карандашик у события в edit-mode → открывает шторку с pre-filled данными.
  const handleEditEvent = (ev) => {
    if (ev.event_type === 'goalie') {
      setGoalieSheet({
        side: ev.goalie_side,
        existingChange: { time_seconds: ev.time_seconds, goalie_id: ev.goalie_id, unspecified: ev.goalie_unspecified },
      });
      return;
    }
    setEventSheet({
      mode: ev.event_type === 'penalty' ? 'penalty' : 'goal',
      scoringTeamId: ev.team_id,
      existingEvent: ev,
    });
  };

  // Открыть шторку добавления нового события (из entry-block).
  const handleOpenAddEvent = (mode, teamId) => {
    setEventSheet({ mode, scoringTeamId: teamId, existingEvent: null });
  };

  // Патч от MatchEventSheet — только локальный черновик, никакой сети.
  // existingId != null → правка уже существующего (в БД или ранее добавленного
  // в этой же сессии) события; иначе — новое, с временным id.
  const handleEventDraftSave = (payload, existingId) => {
    setDraftEvents(prev => {
      const list = prev || [];
      if (existingId != null) {
        return list.map(ev => (ev.id === existingId
          ? { ...ev, ...payload, id: existingId, _isNew: ev._isNew, _dirty: ev._isNew ? undefined : true }
          : ev));
      }
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return [...list, { ...payload, id: tempId, _isNew: true }];
    });
  };

  // Удаление через ConfirmSheet
  const handleDeleteRequest = (ev) => {
    if (ev.event_type === 'goalie') {
      setGoalieDeleteTarget({ side: ev.goalie_side, time_seconds: ev.time_seconds });
      return;
    }
    setDeleteConfirmEvent(ev);
  };

  // Удаление смены вратаря — тоже только в черновике журнала.
  const handleConfirmDeleteGoalie = () => {
    if (!goalieDeleteTarget) return;
    const model = decodeGoalieLog(draftGoalieLog || []);
    const next = removeGoalieChange(model, goalieDeleteTarget.side, goalieDeleteTarget.time_seconds);
    setDraftGoalieLog(encodeGoalieLog(next));
    setGoalieDeleteTarget(null);
  };

  // Удаление гола/штрафа — убираем из черновика; если это уже существовавшая
  // в БД запись (числовой id, не наш временный tmp-...) — помечаем на DELETE
  // при коммите, иначе просто выбрасываем без следа.
  const handleConfirmDelete = () => {
    if (!deleteConfirmEvent) return;
    const id = deleteConfirmEvent.id;
    setDraftEvents(prev => (prev || []).filter(ev => ev.id !== id));
    if (typeof id === 'number') {
      setDeletedEventIds(prev => new Set(prev).add(id));
    }
    setDeleteConfirmEvent(null);
  };

  // ── Карточки смен/снятий вратаря для ленты (из журнала смен) ─────────────
  // Журнал хранится «состояниями» обеих команд; раскладываем на независимые
  // таймлайны и делаем карточку на каждый момент смены.
  // Пока идёт сессия правки — источник данных это черновик в памяти; иначе —
  // то, что реально лежит на сервере (periods / goalieLog).
  const activeGoalieLog = (isEditMode && draftGoalieLog) ? draftGoalieLog : goalieLog;
  const goalieFeedItems = useMemo(() => {
    if (!activeGoalieLog?.length) return [];
    const model = decodeGoalieLog(activeGoalieLog);
    const items = [];
    const build = (sideKey, points) => {
      const teamId = sideKey === 'home' ? rosters.home_team_id : rosters.away_team_id;
      const arr = sideKey === 'home' ? rosters.home : rosters.away;
      const labelOf = (id) => {
        const g = (arr || []).find(p => p.player_id === id);
        return g ? `#${g.jersey_number ?? '?'} ${g.last_name || ''}`.trim() : null;
      };
      points.forEach((pt, i) => {
        if (i === 0) return; // стартовый вратарь карточкой не показываем — только смены/снятия
        const prevPoint = i > 0 ? points[i - 1] : null;
        const g = pt.goalie_id != null ? (arr || []).find(p => p.player_id === pt.goalie_id) : null;
        const prevLabel = prevPoint?.unspecified
          ? 'не указан'
          : (prevPoint?.goalie_id != null ? labelOf(prevPoint.goalie_id) : (i > 0 ? 'пустые ворота' : null));
        items.push({
          id: `goalie-${sideKey}-${pt.time_seconds}`,
          event_type: 'goalie',
          team_id: teamId,
          time_seconds: pt.time_seconds,
          display_seconds: pt.time_seconds, // журнал смен уже хранит время от начала матча
          period: periodKeyForTime(pt.time_seconds, regulation),
          goalie_side: sideKey,
          goalie_id: pt.goalie_id ?? null,
          goalie_empty: pt.goalie_id == null && !pt.unspecified,
          goalie_unspecified: !!pt.unspecified,
          goalie_kind: i === 0 ? 'start' : 'change',
          prev_goalie_label: prevLabel,
          scorer_first_name: g?.first_name,
          scorer_last_name: g?.last_name,
          scorer_jersey: g?.jersey_number,
          scorer_photo: g?.photo_url,
        });
      });
    };
    build('home', model.home);
    build('away', model.away);
    return items;
  }, [activeGoalieLog, rosters, regulation]);

  // Голы/штрафы: пока идёт правка — черновик (обогащаем именами клиентски же,
  // как это делает JOIN на бэкенде), иначе — то, что реально пришло с сервера.
  const activePeriodEvents = useMemo(() => {
    if (isEditMode && draftEvents) {
      const byPeriod = new Map();
      draftEvents.forEach(raw => {
        const ev = enrichEvent(raw);
        if (!byPeriod.has(ev.period)) byPeriod.set(ev.period, []);
        byPeriod.get(ev.period).push(ev);
      });
      return Array.from(byPeriod.entries()).map(([period, events]) => ({
        period, label: PERIOD_LABELS[period] || period, events,
      }));
    }
    return periods;
  }, [isEditMode, draftEvents, periods, enrichEvent]);

  // Мёрж голов/штрафов и карточек смен вратаря в единую ленту.
  const mergedPeriods = useMemo(() => {
    const map = new Map();
    // Голам/штрафам считаем абсолютное время от начала матча (в карточках показываем его).
    activePeriodEvents.forEach(p => map.set(p.period, {
      period: p.period,
      label: p.label,
      events: p.events.map(ev => ({ ...ev, display_seconds: ev.time_seconds })),
    }));
    goalieFeedItems.forEach(it => {
      if (!map.has(it.period)) map.set(it.period, { period: it.period, label: PERIOD_LABELS[it.period] || it.period, events: [] });
      map.get(it.period).events.push(it);
    });
    return PERIOD_ORDER
      .filter(p => map.has(p))
      .map(p => {
        const blk = map.get(p);
        return { ...blk, events: blk.events.slice().sort((a, b) => (a.display_seconds ?? a.time_seconds ?? 0) - (b.display_seconds ?? b.time_seconds ?? 0)) };
      });
  }, [activePeriodEvents, goalieFeedItems]);

  // Стартовые вратари каждой команды (первая точка таймлайна смен).
  // Возвращаем объект всегда — если вратарь не задан, сторона = null («не указан»).
  const startingGoalies = useMemo(() => {
    const model = decodeGoalieLog(activeGoalieLog || []);
    const labelFor = (sideArr, point) => {
      if (!point) return null;
      if (point.unspecified) return { text: 'Не указан', time_seconds: point.time_seconds, goalie_id: null, unspecified: true };
      if (point.goalie_id == null) return { text: 'Пустые ворота', time_seconds: point.time_seconds, goalie_id: null, unspecified: false };
      const g = (sideArr || []).find(p => p.player_id === point.goalie_id);
      return {
        text: g ? `#${g.jersey_number ?? '?'} ${g.last_name || ''}`.trim() : `#${point.goalie_id}`,
        time_seconds: point.time_seconds,
        goalie_id: point.goalie_id,
        unspecified: false,
      };
    };
    return {
      home: labelFor(rosters.home, model.home[0]),
      away: labelFor(rosters.away, model.away[0]),
    };
  }, [activeGoalieLog, rosters]);

  if (!isPlayable) {
    return (
      <FadeIn>
        <div className="flex justify-center items-center h-32 text-[10px] font-black text-content-muted uppercase tracking-widest">
          Протокол еще не доступен
        </div>
      </FadeIn>
    );
  }

  // Имена команд для entry-block
  const homeIsMy = event?.home_team_id === event?.my_team_id;
  const homeName = homeIsMy ? (event?.my_team_name || 'Хозяева') : (event?.opponent_name || 'Хозяева');
  const awayName = homeIsMy ? (event?.opponent_name || 'Гости')  : (event?.my_team_name || 'Гости');
  const homeTeamIdForBlock = event?.home_team_id;
  // Для внешнего соперника (справочник) реального team_id нет — передаём явный
  // null (game_events.team_id допускает NULL по FK на teams). MatchEventSheet
  // уже умеет сохранять событие без выбора игрока (ростер соперника недоступен —
  // просто покажет «Заявка соперника недоступна»).
  const awayTeamIdForBlock = homeIsMy ? (event?.opponent_team_id ?? null) : event?.my_team_id;

  // Кнопка действия (половина ширины для команды, либо во всю ширину для «Броски»).
  const ActionButton = ({ type, label, icon, disabled, onClick }) => {
    const tone = {
      goal: 'text-success',
      penalty: 'text-danger',
      goalie: 'text-content-muted',
      shots: 'text-content-muted',
    }[type] || 'border-surface-border text-content-muted';
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={clsx(
          "h-11 w-full flex items-center justify-center gap-2 rounded-xl bg-surface-base text-[14px] font-bold uppercase tracking-wide transition-all outline-none select-none",
          disabled
            ? "border-surface-border text-content-subtle opacity-40 cursor-not-allowed"
            : `${tone} active:scale-[0.97] cursor-pointer hover:bg-surface-border`
        )}
      >
        <Icon name={icon} className="w-6 h-6 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  // Блок добавления событий: ряды по 50% (хозяева | гости) + «Броски» во всю ширину.
  const EntryBlock = () => (
    <div className="flex flex-col gap-2.5">
      {/* Добавление событий — только инициатор. Соперник может лишь править своё. */}
      {editRole === 'initiator' && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle text-center truncate">{homeName}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle text-center truncate">{awayName}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActionButton type="goal" label="Гол" icon="shootout_goal" onClick={() => handleOpenAddEvent('goal', homeTeamIdForBlock)} />
            <ActionButton type="goal" label="Гол" icon="shootout_goal" onClick={() => handleOpenAddEvent('goal', awayTeamIdForBlock)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActionButton type="penalty" label="Штраф" icon="whistle" onClick={() => handleOpenAddEvent('penalty', homeTeamIdForBlock)} />
            <ActionButton type="penalty" label="Штраф" icon="whistle" onClick={() => handleOpenAddEvent('penalty', awayTeamIdForBlock)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActionButton type="goalie" label="Замена вр." icon="swap" onClick={() => setGoalieSheet({ side: 'home', existingChange: null })} />
            <ActionButton type="goalie" label="Замена вр." icon="swap" onClick={() => setGoalieSheet({ side: 'away', existingChange: null })} />
          </div>
        </>
      )}
      {/* Соперник — только смена своего вратаря (своя сторона). */}
      {editRole === 'opponent' && (
        <ActionButton type="goalie" label="Смена вратаря" icon="swap" onClick={() => setGoalieSheet({ side: mySide, existingChange: null })} />
      )}
      <ActionButton type="shots" label="Броски" icon="puck" onClick={handleOpenShots} />
    </div>
  );

  // Стартовые вратари — лаконичная строка: заголовок по центру, без названий
  // команд (слева — хозяева, справа — гости). В правке имя тапается для замены.
  const StartingGoaliesLine = () => {
    const Item = ({ info, side }) => {
      const content = (
        <span className={clsx(
          "block text-center text-[14px] truncate",
          !info ? "font-bold italic text-content-subtle"
            : info.unspecified ? "font-normal text-content-subtle"
            : "font-bold text-content-main"
        )}>
          {info ? info.text : 'Вратарь не указан'}
        </span>
      );
      // Инициатор тапает любую сторону; соперник — только свою.
      const canTap = isEditMode && (editRole === 'initiator' || (editRole === 'opponent' && side === mySide));
      if (!canTap) return <div className="min-w-0">{content}</div>;
      return (
        <button
          type="button"
          onClick={() => setGoalieSheet({ side, existingChange: info ? { time_seconds: info.time_seconds, goalie_id: info.goalie_id, unspecified: info.unspecified } : null })}
          className="min-w-0 w-full active:scale-[0.98] transition-transform outline-none cursor-pointer"
        >
          {content}
        </button>
      );
    };
    return (
      <div className="px-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-content-subtle text-center mb-1.5">
          Стартовые вратари
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Item info={startingGoalies?.home} side="home" />
          <Item info={startingGoalies?.away} side="away" />
        </div>
      </div>
    );
  };

  return (
    <FadeIn>
      {canFillResults && <FillResultsPanel />}

      {/* Стартовые вратари — над лентой, только в режиме ввода результатов */}
      {canFillResults && isEditMode && <StartingGoaliesLine />}

      {loading ? (
        <PageLoader />
      ) : !mergedPeriods.length ? (
        <div className="flex justify-center items-center h-32 text-[10px] font-black text-content-muted uppercase tracking-widest  rounded-2xl ">
          Нет событий матча
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {mergedPeriods.map(({ period, label, events }) => (
            <PeriodBlock
              key={period}
              label={label}
              events={events}
              homeTeamId={event?.home_team_id}
              canEdit={isEditMode}
              editRole={editRole}
              myTeamId={myTeamId}
              onEdit={handleEditEvent}
              onDelete={handleDeleteRequest}
              openRightPanel={openRightPanel}
              activeBrandColor={activeBrandColor}
              hasTeamColor={hasTeamColor}
            />
          ))}
        </div>
      )}

      {/* Блок добавления (Гол / Штраф / Смена) + Броски — под лентой, в edit-mode */}
      {canFillResults && isEditMode && (
        <div className="mt-6 mb-2">
          <EntryBlock />
        </div>
      )}

      <MatchEventSheet
        isOpen={!!eventSheet}
        mode={eventSheet?.mode}
        scoringTeamId={eventSheet?.scoringTeamId}
        existingEvent={eventSheet?.existingEvent}
        parentMatch={event}
        regulation={regulation}
        rosters={rosters}
        editRole={editRole}
        myTeamId={myTeamId}
        onClose={() => setEventSheet(null)}
        onSave={handleEventDraftSave}
      />

      <ShotsSheet
        isOpen={showShots}
        parentMatch={event}
        regulation={regulation}
        rosters={rosters}
        goalieLog={activeGoalieLog}
        shots={draftShots}
        editRole={editRole}
        myTeamId={myTeamId}
        onClose={() => setShowShots(false)}
        onSave={(nextShots) => setDraftShots(nextShots)}
      />

      <GoalieChangeSheet
        isOpen={!!goalieSheet}
        side={goalieSheet?.side || 'home'}
        existingChange={goalieSheet?.existingChange}
        parentMatch={event}
        rosters={rosters}
        goalieLog={activeGoalieLog}
        onClose={() => setGoalieSheet(null)}
        onSave={(entries) => setDraftGoalieLog(entries)}
      />

      <ConfirmSheet
        isOpen={!!deleteConfirmEvent}
        onClose={() => setDeleteConfirmEvent(null)}
        onConfirm={handleConfirmDelete}
        title="Удалить событие?"
        description="Запись о событии будет удалена из протокола матча."
        confirmLabel="Удалить"
        variant="danger"
      />

      <ConfirmSheet
        isOpen={!!goalieDeleteTarget}
        onClose={() => setGoalieDeleteTarget(null)}
        onConfirm={handleConfirmDeleteGoalie}
        title="Удалить смену вратаря?"
        description="Запись о смене вратаря будет удалена из протокола матча."
        confirmLabel="Удалить"
        variant="danger"
      />

      <BottomSheet isOpen={showRegulation} onClose={() => setShowRegulation(false)}>
        <div
          className="flex flex-col gap-5 text-left pb-2"
          style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
        >
          <h3 className="text-[18px] font-black uppercase tracking-wider text-content-main">
            Настройки матча
          </h3>

          {/* Периодов + длина периода — 1:1 (оба занимают равные доли) */}
          <div className="grid grid-cols-2 gap-5">
            <StepperLP
              label="Периодов"
              value={regDraft.periods_count}
              min={1} max={3}
              onChange={(v) => setRegDraft(d => ({ ...d, periods_count: v }))}
              activeColor={activeBrandColor}
            />
            <StepperLP
              label="Длина периода"
              suffix="мин"
              value={regDraft.period_length}
              min={1} max={60}
              onChange={(v) => setRegDraft(d => ({ ...d, period_length: v }))}
              activeColor={activeBrandColor}
            />
          </div>

          {/* Чекбокс "Есть овертайм" + степпер длины — в одной строке */}
          <div className="grid grid-cols-2 gap-5 items-center">
            <CheckboxLP
              checked={regDraft.has_ot}
              onChange={(v) => setRegDraft(d => ({ ...d, has_ot: v }))}
              label="Есть овертайм"
              activeColor={activeBrandColor}
            />
            {regDraft.has_ot ? (
              <StepperLP
                label="Длина овертайма"
                suffix="мин"
                value={regDraft.ot_length}
                min={1} max={60}
                onChange={(v) => setRegDraft(d => ({ ...d, ot_length: v }))}
                activeColor={activeBrandColor}
              />
            ) : (
              <div />
            )}
          </div>

          {opponentIsReal && (
            <div className="flex flex-col gap-4 border-t border-surface-border pt-4 ">
              <CheckboxLP
                checked={regDraft.opponent_can_edit}
                onChange={(v) => setRegDraft(d => ({ ...d, opponent_can_edit: v }))}
                label="Соперник может редактировать статистику"
                activeColor={activeBrandColor}
              />
              <p className="text-[14px] text-content-subtle leading-relaxed pl-8 mb-12">
                Команда-соперник сможет редактировать только свои данные: авторов и ассистентов своих голов, «±» своих игроков, своих нарушителей и броски по своему вратарю. Добавлять и удалять события не может.
              </p>
            </div>
          )}


          <ButtonLP
            type="button"
            variant="primary"
            isLoading={isSavingReg}
            disabled={isSavingReg}
            onClick={handleSaveRegulation}
            activeColor={activeBrandColor}
          >
            Сохранить
          </ButtonLP>
        </div>
      </BottomSheet>
    </FadeIn>
  );
};

