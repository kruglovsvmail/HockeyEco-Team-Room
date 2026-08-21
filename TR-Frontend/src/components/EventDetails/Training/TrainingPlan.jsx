import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Icon } from '../../../ui/Icon';
import { Toast } from '../../../ui/Toast';
import { FadeIn } from '../../../ui/FadeIn';
import { PageLoader } from '../../../ui/Loader';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { getAuthHeaders } from '../../../utils/helpers';
import { BoardPlayer } from '../../TacticalBoard/BoardPlayer';
import { RINK_TYPES } from '../../TacticalBoard/boardModel';
import { AdhocDrillSheet } from './AdhocDrillSheet';

// Вкладка «План» карточки тренировки.
//
// План — это упорядоченный список упражнений из личной библиотеки тренера. Игроки видят
// его для того, чтобы приходить подготовленными и не тратить время на объяснения уже на
// льду, поэтому детали (описание и анимация) раскрываются прямо здесь.
//
// Два состояния, которые определяют поведение экрана:
//   • черновик — план собран, но не опубликован: виден только тренерскому составу;
//   • прошедшая тренировка — остаётся список названий, детали закрываются. Упражнение
//     с тех пор могли переделать, и показывать новую версию под старой датой нельзя.
//
// Рядом с библиотечными в плане живут разовые упражнения — придуманные под эту одну
// тренировку. Они правятся прямо отсюда (пока тренировка не прошла) и отсюда же
// забираются в библиотеку, если оказались удачными.

const API = import.meta.env.VITE_API_URL || '';

// Длительность выезда формы разового упражнения. Обязана совпадать с duration-300
// у слоя — по этому таймеру он выносится из дерева.
const SHEET_ANIM_MS = 300;

const rinkLabel = (rinkType) => RINK_TYPES.find(t => t.id === rinkType)?.label || 'Площадка';

// Русское склонение для счётчика кадров: «1 кадр», «2 кадра», «5 кадров»
const framesLabel = (count) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} кадров`;
  if (mod10 === 1) return `${count} кадр`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} кадра`;
  return `${count} кадров`;
};

export function TrainingPlan({ event }) {
  const eventClubId = event?.my_club_id || null;
  const isClubEvent = !!eventClubId;
  const scopeQuery = isClubEvent ? `clubId=${eventClubId}` : `teamId=${event?.my_team_id}`;

  const scopeBody = useMemo(() => ({
    teamId: isClubEvent ? null : event?.my_team_id,
    clubId: eventClubId,
    eventType: event?.event_type,
  }), [isClubEvent, event?.my_team_id, eventClubId, event?.event_type]);

  // Цвет команды — как в остальных вкладках карточки события
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  const [items, setItems] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isPast, setIsPast] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState(null);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Форма разового упражнения: adhoc — что правим, isAdhocShown — где сейчас слой.
  // Два состояния, а не одно: слой должен успеть уехать за экран прежде, чем его
  // вынесут из дерева, иначе он просто мигнёт и исчезнет.
  const [adhoc, setAdhoc] = useState(null);
  const [isAdhocShown, setIsAdhocShown] = useState(false);
  const [copyingId, setCopyingId] = useState(null);

  const itemRefs = useRef(new Map());
  const pressTimer = useRef(null);
  const pressStartPos = useRef(null);

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  const loadPlan = useCallback(async () => {
    if (!event?.event_id) return;
    try {
      const res = await fetch(
        `${API}/api/trainings/${event.event_id}/plan?eventType=${event.event_type}&${scopeQuery}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (!json.success) return;

      setItems(json.items || []);
      setIsPublished(json.plan_published);
      setIsPast(json.is_past);
      setCanManage(json.can_manage);
    } catch {
      notify('Не удалось загрузить план', 'danger');
    } finally {
      setLoading(false);
    }
  }, [event?.event_id, event?.event_type, scopeQuery, notify]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  // Сохранение состава и порядка. Отправляем сразу после каждого изменения: план правят
  // редко, зато не остаётся ни «несохранённых изменений», ни отдельной кнопки.
  const persist = async (nextItems) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/trainings/${event.event_id}/plan`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...scopeBody,
          items: nextItems.map(i => ({ id: i.id, drill_id: i.drill_id })),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось сохранить план', 'danger');
        return;
      }
      await loadPlan();
    } catch {
      notify('Не удалось сохранить план', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (index) => {
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    persist(next);
  };

  const togglePublished = async () => {
    const next = !isPublished;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/trainings/${event.event_id}/plan/published`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scopeBody, published: next }),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось изменить публикацию', 'danger');
        return;
      }

      setIsPublished(next);
      notify(next ? 'План опубликован — команда его видит' : 'План скрыт от команды');
    } catch {
      notify('Не удалось изменить публикацию', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── Долгое нажатие → режим правки ────────────────────────────────────────
  //
  // Порядок и удаление живут в отдельном режиме: в обычном состоянии карточка —
  // это аккордеон, и случайный сдвиг пальца по ней не должен ни переставлять план,
  // ни подсовывать кнопку удаления под палец.
  const handlePressStart = (e) => {
    if (isEditMode || !canManage) return;
    pressStartPos.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      setIsEditMode(true);
      setExpandedId(null);
      if (window.navigator?.vibrate) window.navigator.vibrate(50);
    }, 500);
  };

  // Отменяем долгое нажатие только при реальном смещении пальца (>10px), чтобы
  // микро-дрожание сенсора не сбрасывало таймер
  const handlePressMove = (e) => {
    if (!pressStartPos.current) return;
    if (Math.abs(e.clientX - pressStartPos.current.x) > 10 ||
        Math.abs(e.clientY - pressStartPos.current.y) > 10) {
      cancelPress();
    }
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressStartPos.current = null;
  };

  useEffect(() => () => cancelPress(), []);

  // ── Перетаскивание за номер упражнения ───────────────────────────────────
  //
  // Порядок в списке считаем по фактическим границам карточек, а не по индексам из
  // состояния: пока палец в движении, состояние обновляется рывками, а DOM всегда
  // отражает то, что человек видит прямо сейчас.
  const visualOrder = () => (
    [...itemRefs.current.entries()]
      .filter(([, el]) => el)
      .map(([id, el]) => ({ id, rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top)
  );

  const handleDragStart = (e, id) => {
    if (!isEditMode) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDraggingId(id);
  };

  const handleDragMove = (e) => {
    if (!draggingId) return;

    const order = visualOrder();
    const from = order.findIndex(o => o.id === draggingId);
    const to = order.findIndex(o => e.clientY >= o.rect.top && e.clientY <= o.rect.bottom);
    if (from === -1 || to === -1 || from === to) return;

    setItems(prev => {
      const next = [...prev];
      const fromIndex = next.findIndex(i => i.id === draggingId);
      if (fromIndex === -1) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDragEnd = () => {
    if (!draggingId) return;
    setDraggingId(null);
    persist(items);
  };

  // ── Библиотека упражнений ────────────────────────────────────────────────
  const loadLibrary = useCallback(async (search) => {
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) params.set('search', search.trim());

      const res = await fetch(`${API}/api/drills?${params}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setLibrary(json.drills || []);
    } catch {
      notify('Не удалось загрузить библиотеку', 'danger');
    } finally {
      setLibraryLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!isLibraryOpen) return;
    const timer = setTimeout(() => loadLibrary(librarySearch), librarySearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [isLibraryOpen, librarySearch, loadLibrary]);

  const addDrill = (drill) => {
    // Новый пункт уходит без id — сервер сам вставит его и возьмёт название
    // из библиотеки, а не из того, что прислал клиент
    const next = [...items, { id: null, drill_id: drill.id, name: drill.name }];
    setItems(next);
    setIsLibraryOpen(false);
    persist(next);
  };

  // ── Разовое упражнение ───────────────────────────────────────────────────
  //
  // Форма выезжает справа — как переходы между экранами приложения. Два кадра
  // ожидания: за один браузер не успевает применить стартовую позицию, и слой
  // появлялся бы рывком, уже на месте.
  const openAdhoc = (mode, item = null) => {
    setIsLibraryOpen(false);
    setAdhoc({ mode, item });
    requestAnimationFrame(() => requestAnimationFrame(() => setIsAdhocShown(true)));
  };

  const closeAdhoc = useCallback(() => {
    setIsAdhocShown(false);
    setTimeout(() => setAdhoc(null), SHEET_ANIM_MS);
  }, []);

  // Возвращает, получилось ли сохранить: форма закрывается только на успехе, иначе
  // набранное пропало бы вместе с сообщением об ошибке.
  const submitAdhoc = async (payload) => {
    const isEdit = adhoc?.mode === 'edit';
    const url = isEdit
      ? `${API}/api/trainings/${event.event_id}/plan/${adhoc.item.id}/adhoc`
      : `${API}/api/trainings/${event.event_id}/plan/adhoc`;

    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scopeBody, ...payload }),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось сохранить упражнение', 'danger');
        return false;
      }

      await loadPlan();
      notify(isEdit ? 'Упражнение изменено' : 'Упражнение добавлено в план');
      return true;
    } catch {
      notify('Не удалось сохранить упражнение', 'danger');
      return false;
    }
  };

  // Копия уходит в библиотеку того, кто нажал, и с планом больше не связана: пункт
  // остаётся тем, что команда отрабатывала, а копия дальше живёт своей жизнью.
  const copyToLibrary = async (item) => {
    setCopyingId(item.id);
    try {
      const res = await fetch(`${API}/api/trainings/${event.event_id}/plan/${item.id}/library`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(scopeBody),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось сохранить в библиотеку', 'danger');
        return;
      }
      notify('Упражнение сохранено в вашей библиотеке');
    } catch {
      notify('Не удалось сохранить в библиотеку', 'danger');
    } finally {
      setCopyingId(null);
    }
  };

  if (loading) return <PageLoader />;

  // Игрок до публикации вообще ничего не видит: сервер в этом случае отдаёт пустой план
  if (!canManage && !isPublished) {
    return (
      <FadeIn>
        <div className="flex flex-col items-center text-center gap-3 py-16 px-8">
          <Icon name="training_tactics" className="w-12 h-12 text-content-subtle opacity-40" />
          <p className="text-[14px] text-content-muted leading-snug max-w-[280px]">
            План тренировки пока не опубликован
          </p>
        </div>
      </FadeIn>
    );
  }

  return (
    <FadeIn className="flex flex-col gap-2 pb-32 min-h-[30vh]">

      <style>{`
        @keyframes plan-jiggle {
          0%   { transform: rotate(-0.6deg); }
          50%  { transform: rotate(0.6deg); }
          100% { transform: rotate(-0.6deg); }
        }
        .animate-plan-jiggle { animation: plan-jiggle 0.32s ease-in-out infinite; }
        .plan-jiggle-delay-0 { animation-delay: 0s; }
        .plan-jiggle-delay-1 { animation-delay: 0.1s; }
        .plan-jiggle-delay-2 { animation-delay: 0.2s; }
      `}</style>

      {/* КНОПКИ УПРАВЛЕНИЯ — тот же ряд, что у формации */}
      {canManage && (
        <div className="flex justify-center items-center gap-2.5 pb-2 mb-2 w-full bg-transparent flex-wrap">
          {isEditMode ? (
            <button
              onClick={() => setIsEditMode(false)}
              className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-success transition-all active:scale-95 outline-none cursor-pointer select-none shadow-sm"
            >
              <Icon name="save" className="w-5 h-5 shrink-0" strokeWidth={2.5} /> Готово
            </button>
          ) : (
            <>
              {/* Опубликованный план залит цветом команды — как «Отправлено» в формации
                  матча: состояние читается по кнопке, а не по подписи рядом.
                  Снятие с публикации — повторное нажатие. */}
              <button
                onClick={togglePublished}
                disabled={saving}
                style={{
                  color: isPublished ? '#fff' : activeBrandColor,
                  borderColor: activeBrandColor,
                  backgroundColor: isPublished ? activeBrandColor : undefined,
                }}
                className={clsx(
                  'flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border transition-all outline-none select-none active:scale-95 cursor-pointer disabled:opacity-60 disabled:active:scale-100',
                  !isPublished && 'bg-surface-base hover:opacity-80'
                )}
              >
                {saving ? (
                  <div className={clsx(
                    'w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0',
                    isPublished ? 'border-white' : 'border-current'
                  )} />
                ) : (
                  // Глаз показывает состояние заодно с заливкой: перечёркнутый — команда
                  // плана не видит, открытый — видит
                  <Icon name={isPublished ? 'view' : 'view_off'} className="w-4 h-4 shrink-0" />
                )}
                {isPublished ? 'Опубликовано' : 'Опубликовать'}
              </button>

              <button
                onClick={() => setIsLibraryOpen(true)}
                disabled={saving}
                style={{ color: activeBrandColor, borderColor: activeBrandColor }}
                className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border bg-surface-base transition-all active:scale-95 hover:opacity-80 outline-none cursor-pointer select-none disabled:opacity-60 disabled:active:scale-100"
              >
                <Icon name="plus" className="w-4 h-4 shrink-0" />
                Добавить
              </button>
            </>
          )}
        </div>
      )}

      {isEditMode && (
        <p className="text-[12px] text-content-muted leading-snug px-1 pb-1">
          Перетащите за номер, чтобы изменить порядок
        </p>
      )}

      {items.length === 0 ? (
        <FadeIn>
          <div className="flex flex-col items-center text-center gap-3 py-14 px-8">
            <Icon name="training_tactics" className="w-12 h-12 text-content-subtle opacity-40" />
            <p className="text-[14px] text-content-muted leading-snug max-w-[280px]">
              {canManage
                ? 'План пуст. Добавьте упражнения из своей библиотеки — команда увидит их после публикации.'
                : 'В плане пока нет упражнений'}
            </p>
          </div>
        </FadeIn>
      ) : (
        <div
          className="flex flex-col gap-2"
          // Внутри карточек цветом бренда покрашены кнопка проигрывания, лента кадров
          // и тумблеры планшета. Подменяем бренд командным цветом на весь список, а не
          // прокидываем цвет пропсами через проигрыватель: так его подхватит и всё,
          // что появится в карточке позже. Прозрачную версию задаём отдельно —
          // --color-brand-opacity вычисляется в :root и за подменой не следует.
          style={hasTeamColor ? {
            '--color-brand': event.team_color,
            '--color-brand-opacity': `color-mix(in srgb, ${event.team_color} 12%, transparent)`,
          } : undefined}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          {items.map((item, index) => {
            const isExpanded = expandedId === item.id;
            const isDragging = draggingId === item.id;
            const frames = item.board_json?.frames?.length || 0;

            const details = !item.details_available
              ? 'Детали недоступны'
              : frames > 0
                ? `${rinkLabel(item.rink_type)} · ${framesLabel(frames)}`
                : 'Без планшета';

            // Разовое отмечаем в той же строке, а не отдельным значком: строка и так
            // отвечает на вопрос «что это за упражнение», а лишний элемент в карточке
            // спорил бы за внимание с названием.
            const meta = item.is_adhoc ? `Разовое · ${details}` : details;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(item.id, el);
                  else itemRefs.current.delete(item.id);
                }}
                onPointerDown={handlePressStart}
                onPointerMove={handlePressMove}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                className={clsx(
                  'rounded-2xl bg-surface-level1 border border-surface-border overflow-hidden transition-shadow select-none',
                  isDragging && 'shadow-xl relative z-10 opacity-90',
                  isEditMode && !isDragging && `animate-plan-jiggle plan-jiggle-delay-${index % 3}`
                )}
              >
                <div className="flex items-start gap-3 p-3.5">
                  {/* Номер — он же ручка перетаскивания в режиме правки. touch-action
                      none, иначе вертикальный жест уйдёт в прокрутку страницы */}
                  <div
                    onPointerDown={isEditMode ? (e) => handleDragStart(e, item.id) : undefined}
                    style={{ touchAction: isEditMode ? 'none' : undefined }}
                    className={clsx(
                      'shrink-0 w-8 h-8 rounded-lg text-[14px] font-black flex items-center justify-center transition-colors',
                      isEditMode ? 'bg-brand text-white cursor-grab' : 'bg-surface-level2 text-content-main'
                    )}
                  >
                    {index + 1}
                  </div>

                  <button
                    onClick={() => !isEditMode && setExpandedId(isExpanded ? null : item.id)}
                    className="flex-1 min-w-0 flex items-start gap-2 text-left outline-none"
                  >
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-[15px] font-bold text-content-main leading-tight">
                        {item.name}
                      </span>

                      <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
                        {meta}
                      </span>

                      {/* В свёрнутом виде показываем начало описания: по одному
                          названию не всегда понятно, что за упражнение */}
                      {!isExpanded && item.description && (
                        <span className="text-[12px] text-content-subtle leading-snug line-clamp-2">
                          {item.description}
                        </span>
                      )}
                    </div>

                    {!isEditMode && (
                      <Icon
                        name="chevron"
                        className={clsx(
                          'w-4 h-4 shrink-0 mt-0.5 text-content-muted transition-transform duration-300',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    )}
                  </button>

                  {isEditMode && (
                    <button
                      onClick={() => removeItem(index)}
                      disabled={saving}
                      className="shrink-0 w-8 h-8 rounded-lg bg-danger-muted text-danger flex items-center justify-center outline-none disabled:opacity-30"
                      aria-label="Убрать из плана"
                    >
                      <Icon name="close" className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Раскрытие: описание и анимация. Плавная высота через grid-строку —
                    тот же приём, что и в аккордеонах сайдбара */}
                <div className={clsx(
                  'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}>
                  <div className="overflow-hidden">
                    <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                      {/* Упражнение удалено из библиотеки или изменено после проведения
                          тренировки. Аккордеон оставляем: пункт плана остаётся частью
                          истории, просто рассказать о нём нечего. */}
                      {!item.details_available && (
                        <p className="text-[13px] text-content-muted leading-snug">
                          Подробности упражнения недоступны
                        </p>
                      )}

                      {item.description && (
                        <p className="text-[14px] text-content-main leading-snug whitespace-pre-line">
                          {item.description}
                        </p>
                      )}

                      {/* Планшет монтируется только в раскрытом пункте: анимация крутит
                          rAF, и держать её у восьми свёрнутых упражнений незачем.
                          Отступ сверху отделяет схему от текста — вплотную они читались
                          как один блок. */}
                      {isExpanded && item.board_json && (
                        <div className="pt-5">
                          <BoardPlayer scene={item.board_json} rinkType={item.rink_type} />
                        </div>
                      )}

                      {/* Разовое упражнение правится и забирается в библиотеку только
                          отсюда: в Тренерской его нет. Правка закрывается после
                          тренировки — план проведённой показывает отработанное. А вот
                          забрать удачное можно и потом: обычно это как раз и понимаешь
                          уже после льда. */}
                      {item.is_adhoc && canManage && (
                        <div className="flex items-center gap-2 pt-1">
                          {!isPast && item.edit_content && (
                            <button
                              onClick={() => openAdhoc('edit', item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-level2 text-content-main text-[12px] font-semibold outline-none active:scale-95 transition-transform"
                            >
                              <Icon name="edit" className="w-3.5 h-3.5 shrink-0" />
                              Изменить
                            </button>
                          )}

                          <button
                            onClick={() => copyToLibrary(item)}
                            disabled={copyingId === item.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-level2 text-content-main text-[12px] font-semibold outline-none active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                          >
                            <Icon name="handbook" className="w-3.5 h-3.5 shrink-0" />
                            В библиотеку
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Шторка выбора упражнения из библиотеки ── */}
      <BottomSheet isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[18px] font-black text-content-main mb-1">Добавить упражнение</h3>

          {/* Разовое стоит над библиотекой и поиском: придуманное под эту тренировку
              искать негде, а начинать с него — обычное дело.
              После тренировки вход убираем — придумывать задним числом нечего, и
              сервер такой пункт всё равно не примет. */}
          {!isPast && (
            <button
              onClick={() => openAdhoc('create')}
              className="flex items-center gap-3 p-3 rounded-xl bg-surface-level2 border border-dashed border-surface-border text-left outline-none transition-transform active:scale-[0.99]"
            >
              <div
                className="shrink-0 w-9 h-9 rounded-lg bg-surface-level1 flex items-center justify-center"
                style={{ color: activeBrandColor }}
              >
                <Icon name="plus" className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-content-main leading-tight">
                  Разовое упражнение
                </span>
                <span className="text-[11px] text-content-muted leading-snug mt-0.5">
                  Придумать здесь — в библиотеку не попадёт
                </span>
              </div>
            </button>
          )}

          <div className="relative">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" />
            <input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Поиск по библиотеке"
              className="w-full pl-10 pr-3 py-3 rounded-xl bg-surface-level2 text-content-main text-[14px] outline-none border border-surface-border placeholder:text-content-subtle"
            />
          </div>

          {libraryLoading ? (
            <PageLoader />
          ) : library.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto scrollbar-hide">
              {library.map(drill => (
                <div key={drill.id} className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl">
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-[14px] font-bold text-content-main leading-tight">
                      {drill.name}
                    </span>
                    <span className="text-[10px] text-content-muted leading-none mt-1">
                      {drill.board_enabled === false
                        ? 'Без планшета'
                        : `${rinkLabel(drill.rink_type)} • ${framesLabel(drill.frames_count || 0)}`}
                    </span>
                  </div>

                  <ButtonLP
                    onClick={() => addDrill(drill)}
                    variant="primary"
                    className="!w-auto !py-1.5 !px-3 !text-[10px] ml-2 shrink-0 normal-case"
                    activeColor={hasTeamColor ? event.team_color : null}
                  >
                    Добавить
                  </ButtonLP>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center items-center h-24 text-[10px] font-black text-content-muted uppercase tracking-widest text-center py-4 px-6">
              {librarySearch
                ? 'По этому запросу ничего не нашлось'
                : 'Библиотека пуста. Упражнения создаются в Тренерской'}
            </div>
          )}
        </div>
      </BottomSheet>

      {adhoc && (
        <AdhocDrillSheet
          isShown={isAdhocShown}
          title={adhoc.mode === 'edit' ? 'Разовое упражнение' : 'Новое упражнение'}
          initial={adhoc.mode === 'edit' ? adhoc.item?.edit_content : null}
          submitLabel={adhoc.mode === 'edit' ? 'Сохранить' : 'Добавить в план'}
          onSubmit={submitAdhoc}
          onClose={closeAdhoc}
          onNotify={notify}
        />
      )}

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />
    </FadeIn>
  );
}
