import React, { useState, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { getAuthHeaders } from '../../../utils/helpers';
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
import { decodeGoalieLog, encodeGoalieLog, removeGoalieChange, periodKeyForTime, absoluteSeconds } from './goalieLogModel';

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
const PlayerBlock = ({ event, side, subLines = [] }) => {
  const isHome = side === 'home';
  const hasPlayer = !!(event.scorer_last_name || event.scorer_first_name);

  return (
    <div className={`flex flex-col min-w-0 w-full gap-0.5 ${isHome ? 'items-start' : 'items-end'}`}>

      {/* Строка 1: аватар во внешнем углу + номер рядом к центру */}
      {/* home: [аватар] [номер →]   away: [← номер] [аватар] */}
      <div className={`flex items-center gap-1.5 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
        <Avatar
          photoUrl={event.scorer_photo}
          firstName={event.scorer_first_name}
          lastName={event.scorer_last_name}
          className="w-9 h-9 rounded-xl bg-surface-level2 shrink-0"
          fallbackClassName="text-brand text-[10px] font-black"
        />
        {hasPlayer && (
          <span className="text-[10px] font-bold text-content-muted leading-none shrink-0">
            #{event.scorer_jersey ?? '?'}
          </span>
        )}
      </div>

      {/* Строка 2: Фамилия И. либо «Не указан» */}
      {hasPlayer ? (
        <span className={`text-[14px] font-bold text-content-main leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
          {event.scorer_last_name} {event.scorer_first_name?.[0] ?? ''}.
        </span>
      ) : (
        <span className={`text-[14px] font-bold italic text-content-subtle leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
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

const GoalPlayer = ({ event, side }) => {
  const subLines = [];
  if (event.assist1_id)
    subLines.push(`#${event.assist1_jersey ?? '?'} ${event.assist1_last_name} ${event.assist1_first_name?.[0] ?? ''}.`);
  if (event.assist2_id)
    subLines.push(`#${event.assist2_jersey ?? '?'} ${event.assist2_last_name} ${event.assist2_first_name?.[0] ?? ''}.`);
  return <PlayerBlock event={event} side={side} subLines={subLines} />;
};

const PenaltyPlayer = ({ event, side }) => {
  const subLines = event.penalty_violation ? [event.penalty_violation] : [];
  return <PlayerBlock event={event} side={side} subLines={subLines} />;
};

// Вратарь: смена/старт — переиспользуем PlayerBlock (scorer_* заполнены данными
// вратаря). Снятие (пустые ворота) — отдельный блок без игрока.
const GoaliePlayer = ({ event, side }) => {
  const isHome = side === 'home';

  if (event.goalie_empty) {
    return (
      <div className={`flex flex-col min-w-0 w-full gap-0.5 ${isHome ? 'items-start' : 'items-end'}`}>
        <div className={`flex items-center gap-1.5 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
          <span className="w-9 h-9 rounded-xl bg-surface-level2 flex items-center justify-center text-content-muted shrink-0">
            <Icon name="swap" className="w-4 h-4" />
          </span>
        </div>
        <span className={`text-[14px] font-bold text-content-main leading-tight w-full ${isHome ? 'text-left' : 'text-right'}`}>
          Пустые ворота
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
  return <PlayerBlock event={event} side={side} subLines={subLines} />;
};

// ═══════════════════════════════════════════════════════════════════════
// ЦЕНТРАЛЬНАЯ КОЛОНКА — время + бейдж + доп. метка
// ═══════════════════════════════════════════════════════════════════════
const EventCenter = ({ event }) => {
  const strengthLabel = GOAL_STRENGTH_LABELS[event.goal_strength] ?? null;

  const badge = (() => {
    switch (event.event_type) {
      case 'goal':
        return <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-500 text-white leading-none">ГОЛ</span>;
      case 'penalty':
        return <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-red-500 text-white leading-none">ШТРАФ</span>;
      case 'shootout_goal':
        return <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-500 text-white leading-none">ШБ</span>;
      case 'shootout_miss':
      case 'failed_ps':
        return <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-surface-level2 text-content-muted leading-none">МИМО</span>;
      case 'goalie':
        return (
          <span className="text-[10px] font-semibold uppercase px-2.5 py-1 rounded-lg bg-surface-level2 text-content-main leading-tight text-center">
            {event.goalie_empty ? <>ПВ<br /></> : <>Замена<br />вратаря</>}
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 w-[80px] self-start">
      <span className="text-[14px] font-bold text-content-main tabular-nums leading-tight">
        {formatTime(event.display_seconds ?? event.time_seconds)}
      </span>
      {badge}
      {/* Доп. метка: БОЛ / МЕН / ПВ / минуты штрафа */}
      {event.event_type === 'goal' && strengthLabel && (
        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider leading-none">
          {strengthLabel}
        </span>
      )}
      {event.event_type === 'penalty' && event.penalty_minutes != null && (
        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider leading-none">
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
const EventCard = ({ event, homeTeamId, canEdit, editRole, myTeamId, onEdit, onDelete }) => {
  const isHome = event.team_id === homeTeamId;
  const side = isHome ? 'home' : 'away';

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
        return <GoalPlayer event={event} side={side} />;
      case 'penalty':
        return <PenaltyPlayer event={event} side={side} />;
      case 'goalie':
        return <GoaliePlayer event={event} side={side} />;
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
const PeriodBlock = ({ label, events, homeTeamId, canEdit, editRole, myTeamId, onEdit, onDelete }) => (
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
  // - После добавления/удаления события через MatchEventSheet триггеры БД переводят
  //   матч в finished_no_result. Слушатель tr-match-protocol-updated синхронит
  //   localStatus, чтобы кнопка "Опубликовать" реактивировалась без reload.
  // - После успешного publish становится 'finished'.
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

  const isPublished = localStatus === 'finished';

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
      if (cached) {
        sessionStorage.setItem(sessKey, JSON.stringify({ ...JSON.parse(cached), ...patch }));
      }
    } catch {}
    window.dispatchEvent(new CustomEvent('tr-events-updated'));
  }, [event?.event_id]);

  // Live-refresh: после "Добавить" / "Сохранить" в MatchEventSheet перезагружаем периоды
  // и одновременно откатываем локальный статус — триггеры БД делают ровно это.
  useEffect(() => {
    const onUpdated = () => {
      fetchProtocol();
      setLocalStatus('finished_no_result');
      patchEventCache({ status: 'finished_no_result' });
    };
    window.addEventListener('tr-match-protocol-updated', onUpdated);
    return () => window.removeEventListener('tr-match-protocol-updated', onUpdated);
  }, [fetchProtocol, patchEventCache]);

  // ── Режим просмотра / редактирования (как в MatchLines) ──────────────────
  const [isEditMode, setIsEditMode] = useState(false);
  // Шторка добавления/редактирования события: { mode, scoringTeamId, existingEvent? } | null
  const [eventSheet, setEventSheet] = useState(null);
  // событие, для которого открыто подтверждение удаления
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  const [isDeletingGoalie, setIsDeletingGoalie] = useState(false);

  const handlePublish = async () => {
    if (isPublishing || isPublished) return;
    setIsPublishing(true);
    try {
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
      if (data.success) {
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
      } else {
        alert(data.error || 'Не удалось опубликовать');
      }
    } catch (err) {
      console.error('Ошибка публикации матча:', err);
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
        <div className={clsx("grid gap-2", editRole === 'initiator' ? "grid-cols-2" : "grid-cols-1")}>
          <button
            type="button"
            onClick={() => setIsEditMode(false)}
            className="flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold bg-surface-base border border-brand text-brand  transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
          >
            <Icon name="save" className="w-4 h-4 shrink-0" />
            <span className="truncate">Готово</span>
          </button>
          {editRole === 'initiator' && (
            <button
              type="button"
              onClick={handleOpenRegulation}
              className="flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold bg-surface-base border border-brand text-brand  transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
            >
              <Icon name="settings" className="w-4 h-4 shrink-0" />
              <span className="truncate">Настройки</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublished || isPublishing}
            style={hasTeamColor ? (
              isPublished
                ? { backgroundColor: activeBrandColor, borderColor: activeBrandColor }
                : { borderColor: activeBrandColor, color: activeBrandColor }
            ) : undefined}
            className={clsx(
              "flex min-w-0 justify-center items-center gap-1 px-2 py-2 rounded-full text-[14px] font-semibold bg-surface-base border transition-all outline-none select-none",
              hasTeamColor
                ? (isPublished ? "text-white cursor-default" : "cursor-pointer active:scale-95 hover:bg-surface-border")
                : (isPublished
                    ? "border-content-success bg-success text-content-dark cursor-default"
                    : "border-success text-success cursor-pointer active:scale-95 hover:bg-surface-border")
            )}
          >
            {isPublishing ? (
              <div
                className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0"
                style={hasTeamColor ? { borderColor: activeBrandColor, borderTopColor: 'transparent' } : { borderColor: 'var(--color-success)', borderTopColor: 'transparent' }}
              />
            ) : (
              <Icon name="save" className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{isPublished ? 'Опубликовано' : 'Опубликовать'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsEditMode(true)}
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
        existingChange: { time_seconds: ev.time_seconds, goalie_id: ev.goalie_id },
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

  // После добавления / редактирования / удаления — обновляем протокол + статус.
  const handleEventSaved = () => {
    setLocalStatus('finished_no_result');
    patchEventCache({ status: 'finished_no_result' });
    fetchProtocol();
  };

  // Удаление через ConfirmSheet
  const handleDeleteRequest = (ev) => {
    if (ev.event_type === 'goalie') {
      setGoalieDeleteTarget({ side: ev.goalie_side, time_seconds: ev.time_seconds });
      return;
    }
    setDeleteConfirmEvent(ev);
  };

  const handleConfirmDeleteGoalie = async () => {
    if (!goalieDeleteTarget || isDeletingGoalie) return;
    setIsDeletingGoalie(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const model = decodeGoalieLog(goalieLog);
      const next = removeGoalieChange(model, goalieDeleteTarget.side, goalieDeleteTarget.time_seconds);
      const entries = encodeGoalieLog(next);
      const res = await fetch(
        `${apiUrl}/api/matches/${event.event_id}/results/goalie-log`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ teamId: event.my_team_id, entries }) }
      );
      const json = await res.json();
      if (json.success) {
        setGoalieDeleteTarget(null);
        fetchGoalieLog();
        handleEventSaved();
      } else {
        alert(json.error || 'Не удалось удалить');
      }
    } catch (err) { console.error(err); }
    finally { setIsDeletingGoalie(false); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmEvent || isDeleting) return;
    setIsDeleting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/api/matches/${event.event_id}/results/events/${deleteConfirmEvent.id}?teamId=${event.my_team_id}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (json.success) {
        setDeleteConfirmEvent(null);
        handleEventSaved();
      } else {
        alert(json.error || 'Не удалось удалить');
      }
    } catch (err) { console.error(err); }
    finally { setIsDeleting(false); }
  };

  // ── Карточки смен/снятий вратаря для ленты (из журнала смен) ─────────────
  // Журнал хранится «состояниями» обеих команд; раскладываем на независимые
  // таймлайны и делаем карточку на каждый момент смены.
  const goalieFeedItems = useMemo(() => {
    if (!goalieLog?.length) return [];
    const model = decodeGoalieLog(goalieLog);
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
        const prevId = i > 0 ? points[i - 1].goalie_id : null;
        const g = pt.goalie_id != null ? (arr || []).find(p => p.player_id === pt.goalie_id) : null;
        const prevLabel = prevId != null ? labelOf(prevId) : (i > 0 ? 'пустые ворота' : null);
        items.push({
          id: `goalie-${sideKey}-${pt.time_seconds}`,
          event_type: 'goalie',
          team_id: teamId,
          time_seconds: pt.time_seconds,
          display_seconds: pt.time_seconds, // журнал смен уже хранит время от начала матча
          period: periodKeyForTime(pt.time_seconds, regulation),
          goalie_side: sideKey,
          goalie_id: pt.goalie_id ?? null,
          goalie_empty: pt.goalie_id == null,
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
  }, [goalieLog, rosters, regulation]);

  // Мёрж голов/штрафов (с бэка) и карточек смен вратаря в единую ленту.
  const mergedPeriods = useMemo(() => {
    const map = new Map();
    // Голам/штрафам считаем абсолютное время от начала матча (в карточках показываем его).
    periods.forEach(p => map.set(p.period, {
      period: p.period,
      label: p.label,
      events: p.events.map(ev => ({ ...ev, display_seconds: absoluteSeconds(ev.period ?? p.period, ev.time_seconds, regulation) })),
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
  }, [periods, goalieFeedItems, regulation]);

  // Стартовые вратари каждой команды (первая точка таймлайна смен).
  // Возвращаем объект всегда — если вратарь не задан, сторона = null («не указан»).
  const startingGoalies = useMemo(() => {
    const model = decodeGoalieLog(goalieLog || []);
    const labelFor = (sideArr, point) => {
      if (!point) return null;
      if (point.goalie_id == null) return { text: 'Пустые ворота', time_seconds: point.time_seconds, goalie_id: null };
      const g = (sideArr || []).find(p => p.player_id === point.goalie_id);
      return {
        text: g ? `#${g.jersey_number ?? '?'} ${g.last_name || ''}`.trim() : `#${point.goalie_id}`,
        time_seconds: point.time_seconds,
        goalie_id: point.goalie_id,
      };
    };
    return {
      home: labelFor(rosters.home, model.home[0]),
      away: labelFor(rosters.away, model.away[0]),
    };
  }, [goalieLog, rosters]);

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
  const awayTeamIdForBlock = homeIsMy ? event?.opponent_team_id : event?.my_team_id;
  const awayDisabled = !awayTeamIdForBlock;

  // Кнопка действия (половина ширины для команды, либо во всю ширину для «Броски»).
  const ActionButton = ({ type, label, icon, disabled, onClick }) => {
    const tone = {
      goal: 'text-success',
      penalty: 'text-danger',
      goalie: 'text-content-muted',
      shots: 'text-brand',
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
            <ActionButton type="goal" label="Гол" icon="shootout_goal" disabled={awayDisabled} onClick={() => handleOpenAddEvent('goal', awayTeamIdForBlock)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActionButton type="penalty" label="Штраф" icon="whistle" onClick={() => handleOpenAddEvent('penalty', homeTeamIdForBlock)} />
            <ActionButton type="penalty" label="Штраф" icon="whistle" disabled={awayDisabled} onClick={() => handleOpenAddEvent('penalty', awayTeamIdForBlock)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActionButton type="goalie" label="Замена вр." icon="swap" onClick={() => setGoalieSheet({ side: 'home', existingChange: null })} />
            <ActionButton type="goalie" label="Замена вр." icon="swap" disabled={awayDisabled} onClick={() => setGoalieSheet({ side: 'away', existingChange: null })} />
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
          "block text-center text-[14px] font-bold truncate",
          info ? "text-content-main" : "text-content-subtle italic"
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
          onClick={() => setGoalieSheet({ side, existingChange: info ? { time_seconds: info.time_seconds, goalie_id: info.goalie_id } : null })}
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
        onSaved={handleEventSaved}
      />

      <ShotsSheet
        isOpen={showShots}
        parentMatch={event}
        regulation={regulation}
        rosters={rosters}
        goalieLog={goalieLog}
        editRole={editRole}
        myTeamId={myTeamId}
        onClose={() => setShowShots(false)}
        onSaved={handleEventSaved}
      />

      <GoalieChangeSheet
        isOpen={!!goalieSheet}
        side={goalieSheet?.side || 'home'}
        existingChange={goalieSheet?.existingChange}
        parentMatch={event}
        rosters={rosters}
        goalieLog={goalieLog}
        onClose={() => setGoalieSheet(null)}
        onSaved={() => { fetchGoalieLog(); handleEventSaved(); }}
      />

      <ConfirmSheet
        isOpen={!!deleteConfirmEvent}
        onClose={() => setDeleteConfirmEvent(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        title="Удалить событие?"
        description="Запись о событии будет удалена из протокола матча безвозвратно."
        confirmLabel="Удалить"
        variant="danger"
      />

      <ConfirmSheet
        isOpen={!!goalieDeleteTarget}
        onClose={() => setGoalieDeleteTarget(null)}
        onConfirm={handleConfirmDeleteGoalie}
        isLoading={isDeletingGoalie}
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

