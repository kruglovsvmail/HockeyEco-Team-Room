import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { getPortalRoot } from '../../utils/helpers';
import { BoardScene, ObjectChip } from './BoardScene';
import {
  OBJECT_TYPES,
  normalizeScene,
  resolvePositions,
  isPuckInReach,
  rinkToPercent,
  percentToRink,
  percentToScreen,
  outerViewBox,
  sampleAlongPathWithLead,
  simplifyPath,
  interpolatePositions,
  frameTransitionMs,
  FRAME_HOLD_MS,
  FRAME_SPEEDS,
  PUCK_LEAD_M,
  nextId,
} from './boardModel';

// Редактор сцены. Работает как контролируемый компонент: сцену держит форма упражнения,
// сюда приходит value и уходит onChange — иначе несохранённые правки жили бы в двух
// местах сразу.
//
// Движение задаётся траекторией, а не перетаскиванием из точки в точку: тренер выбирает
// на фишке действие и рисует путь, по которому она поедет. Реальное движение почти всегда
// дуга — вираж вокруг конуса, выход из-за ворот, шайба вдоль борта, — и прямыми отрезками
// его не описать. Конец пути сразу становится местом фишки на следующем кадре.
//
// Шайбе траектории не рисуют и меню ей не нужно: она едет за тем, кто её ведёт.
// Действия с шайбой доступны любой фишке, в чей ареол она попала (см. isPuckInReach).

// Передача и бросок — одно и то же движение шайбы по нарисованной линии, разной была
// только толщина черты. Отдельная кнопка под бросок заставляла тренера выбирать между
// синонимами, поэтому они объединены.
const ACTIONS = [
  { kind: 'skate', label: 'Движение',          needsPuck: false },
  { kind: 'carry', label: 'Движение с шайбой', needsPuck: true  },
  { kind: 'pass',  label: 'Передача / бросок', needsPuck: true  },
];

// Насколько палец должен уехать, чтобы жест считался перетаскиванием, а не касанием
const TAP_TOLERANCE_PERCENT = 1.2;

// С какого расстояния касание засчитывается фишке, в метрах катка. Заметно больше
// самой фишки: попасть пальцем в кружок диаметром метр невозможно.
const PICK_RADIUS_M = 3.2;

// Перевод точки экрана в проценты площадки. Идём через getScreenCTM, а не через
// getBoundingClientRect: матрица учитывает и viewBox, и разворот катка на вертикаль,
// и любые CSS-трансформации выше по дереву — включая масштаб интерфейса из настроек.
const clientToPercent = (node, rinkType, clientX, clientY) => {
  const ctm = node?.getScreenCTM();
  if (!ctm) return null;
  const loc = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return rinkToPercent(rinkType, loc.x, loc.y);
};

export function BoardEditor({ scene: rawScene, rinkType = 'full', onChange }) {
  const scene = useMemo(() => normalizeScene(rawScene), [rawScene]);

  const [frameIndex, setFrameIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  // Позиция выпадалки в координатах портала. Считается один раз при открытии: меню
  // живёт вне доски, поэтому привязать его процентами к контейнеру уже нельзя.
  const [menuPos, setMenuPos] = useState(null);
  const [draft, setDraft] = useState(null);   // рисуемая прямо сейчас линия
  const [drag, setDrag] = useState(null);     // фишка, которую тащат прямо сейчас
  const [armed, setArmed] = useState(null);   // выбранное действие: { objId, kind }
  // Проигрывание прямо в планшете: проверять анимацию, выходя из редактора и заходя
  // обратно, — единственный способ, который был раньше, и он никуда не годится.
  // Позиции на время проигрывания подменяются интерполяцией, а сам редактор остаётся
  // на месте: своих органов управления у проигрывания нет, только кнопка в ленте кадров.
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const rafRef = useRef(null);
  const frameBeforePlay = useRef(0);

  const rinkRef = useRef(null);
  const boardRef = useRef(null);

  // Кадр мог исчезнуть после удаления — зажимаем указатель в границы прямо при
  // вычислении. Синхронизировать frameIndex отдельным эффектом не нужно: везде ниже
  // используется safeIndex, а setState из эффекта ради производной величины —
  // лишний круг рендера.
  const safeIndex = Math.max(0, Math.min(frameIndex, scene.frames.length - 1));
  const currentFrame = scene.frames[safeIndex];
  const positions = useMemo(() => resolvePositions(scene, safeIndex), [scene, safeIndex]);

  const patchFrame = useCallback((index, patch) => {
    onChange({
      ...scene,
      frames: scene.frames.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  }, [scene, onChange]);

  // Владение шайбой не хранится — оно вычисляется из расстановки, поэтому не может
  // разойтись с тем, что тренер видит на площадке. Дотянуться до шайбы могут сразу
  // несколько игроков, и это нормально: у борта или на вбрасывании забрать её может
  // любой из них, и выбирать за тренера система не должна.
  // Шайб на площадке может быть несколько — берём ту, до которой фишка дотягивается
  const puckInReach = useCallback((objId) => (
    scene.objects.find(o => o.type === 'puck' && isPuckInReach(positions, objId, o.id, rinkType)) || null
  ), [scene.objects, positions, rinkType]);

  const selectedObject = scene.objects.find(o => o.id === selectedId) || null;
  const selectedPuck = selectedObject ? puckInReach(selectedObject.id) : null;
  const hasPuck = !!selectedPuck;
  const isPiecePlayable = !!selectedObject && selectedObject.type !== 'puck' && selectedObject.type !== 'cone';

  const closeMenu = () => setMenuPos(null);

  /**
   * Позиция фишки в координатах портала.
   *
   * Меню выносится в портал, иначе его обрезает то доска, то прокручиваемая колонка
   * под лентой кадров — что и происходило у фишек в верхней части площадки.
   *
   * Оболочка приложения масштабируется настройкой размера интерфейса, поэтому экранные
   * пиксели из getBoundingClientRect переводим в единицы портала через его собственный
   * масштаб — иначе при изменённом размере шрифта меню уезжало бы от фишки.
   */
  const measureAnchor = (objId) => {
    const board = boardRef.current;
    const portal = getPortalRoot();
    if (!board || !portal) return null;

    const anchor = percentToScreen(rinkType, ...(positions[objId] || [50, 50]));
    const boardRect = board.getBoundingClientRect();
    const portalRect = portal.getBoundingClientRect();
    const scale = portal.offsetWidth ? portalRect.width / portal.offsetWidth : 1;

    return {
      x: (boardRect.left - portalRect.left) / scale + anchor.left * (boardRect.width / scale),
      y: (boardRect.top - portalRect.top) / scale + anchor.top * (boardRect.height / scale),
      areaWidth: portal.offsetWidth,
      areaHeight: portal.offsetHeight,
    };
  };

  // ── Проигрывание ─────────────────────────────────────────────────────────
  //
  // Своей раскладки у просмотра нет: редактор остаётся на месте, подменяются только
  // позиции фишек и подсветка кадра. Переходы разной длительности, поэтому позицию во
  // времени ищем по накопленным началам отрезков — как в проигрывателе упражнения.
  const timeline = useMemo(() => {
    const starts = [0];
    for (let i = 0; i < scene.frames.length - 1; i++) {
      starts.push(starts[i] + FRAME_HOLD_MS + frameTransitionMs(scene.frames[i]));
    }
    return starts;
  }, [scene]);

  const totalMs = scene.frames.length > 1
    ? timeline[scene.frames.length - 1] + FRAME_HOLD_MS
    : 0;

  const setTime = useCallback((ms) => {
    elapsedRef.current = ms;
    setElapsed(ms);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let lastTs = null;

    const tick = (ts) => {
      if (lastTs === null) lastTs = ts;
      const next = elapsedRef.current + (ts - lastTs);
      lastTs = ts;

      if (next >= totalMs) {
        setIsPlaying(false);
        // Возвращаемся туда, откуда запускали: просмотр не должен уводить тренера
        // на последний кадр и заставлять листать обратно
        setFrameIndex(frameBeforePlay.current);
        setTime(0);
        return;
      }

      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, totalMs, setTime]);

  const playback = useMemo(() => {
    if (!isPlaying || scene.frames.length < 2) return null;

    let index = 0;
    while (index < scene.frames.length - 1 && elapsed >= timeline[index + 1]) index++;
    if (index >= scene.frames.length - 1) return { index: scene.frames.length - 1, t: 0 };

    const rest = elapsed - timeline[index];
    const transition = frameTransitionMs(scene.frames[index]);
    return { index, t: rest <= FRAME_HOLD_MS ? 0 : Math.min(1, (rest - FRAME_HOLD_MS) / transition) };
  }, [isPlaying, elapsed, timeline, scene]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setFrameIndex(frameBeforePlay.current);
      setTime(0);
      return;
    }

    frameBeforePlay.current = safeIndex;
    setSelectedId(null);
    setArmed(null);
    closeMenu();
    setTime(0);
    setIsPlaying(true);
  };

  // ── Фишки ────────────────────────────────────────────────────────────────
  const addObject = (type) => {
    const typeConfig = OBJECT_TYPES.find(t => t.id === type);

    // Одинаковые фишки не должны ложиться друг на друга — раскладываем по спирали
    // от центра, дальше тренер растащит их куда нужно.
    const count = scene.objects.length;
    const angle = count * 1.1;
    const radius = 6 + count * 1.6;
    const position = [
      Math.max(6, Math.min(94, 50 + Math.cos(angle) * radius * 0.8)),
      Math.max(8, Math.min(92, 50 + Math.sin(angle) * radius)),
    ];

    // Номер по умолчанию — порядковый среди фишек того же типа
    const sameType = scene.objects.filter(o => o.type === type).length;
    const label = typeConfig.defaultLabel === '1' ? String(sameType + 1) : typeConfig.defaultLabel;

    const obj = { id: nextId('o'), type, label };

    // Позицию пишем в первый кадр: фишка существует на площадке с начала упражнения,
    // а на остальных кадрах наследуется, пока её там не подвинут.
    onChange({
      ...scene,
      objects: [...scene.objects, obj],
      frames: scene.frames.map((f, i) => (
        i === 0 ? { ...f, positions: { ...f.positions, [obj.id]: position } } : f
      )),
    });

    setArmed(null);
    setSelectedId(obj.id);
    closeMenu();
  };

  const updateSelectedLabel = (label) => {
    onChange({
      ...scene,
      objects: scene.objects.map(o => (o.id === selectedId ? { ...o, label: label.slice(0, 3) } : o)),
    });
  };

  const removeObject = (objId) => {
    onChange({
      ...scene,
      objects: scene.objects.filter(o => o.id !== objId),
      // Чистим за фишкой всё: и позиции, и её траектории. Иначе сцена копит мусор,
      // который потом уедет и в план тренировки, и получателю подарка. Линия, у которой
      // не осталось ведомых фишек, продолжает жить как обычная стрелка-пояснение.
      frames: scene.frames.map(f => {
        const rest = { ...f.positions };
        delete rest[objId];
        return { ...f, positions: rest, shapes: rebindShapes(f.shapes, [objId]) };
      }),
    });
    setSelectedId(null);
    setArmed(null);
    closeMenu();
  };

  // Убрать траектории выбранной фишки с текущего кадра — вместе с шайбой, если
  // линия вела и её
  const clearTrajectories = () => {
    const ids = [selectedId, ...(selectedPuck ? [selectedPuck.id] : [])];
    patchFrame(safeIndex, {
      shapes: currentFrame.shapes.filter(s => !(s.objIds || []).some(id => ids.includes(id))),
    });
    closeMenu();
  };

  // ── Траектории ───────────────────────────────────────────────────────────

  /**
   * Какие фишки поедут по линии выбранного действия.
   *
   * Движение — сам игрок. Движение с шайбой — игрок вместе с шайбой, по одному пути,
   * шайба впереди. Передача и бросок — только шайба: линия идёт от игрока, но летит
   * по ней она.
   */
  const targetsForAction = (objId, kind) => {
    const owner = scene.objects.find(o => o.id === objId);
    if (!owner) return [];
    if (kind === 'skate') return [owner];

    // Пас, бросок и ведение возможны, только если фишка дотягивается до шайбы — меню
    // их иначе и не покажет, но полагаться на состояние кнопки при записи в сцену нельзя
    const puck = puckInReach(objId);
    if (!puck) return [owner];

    if (kind === 'carry') return [owner, puck];
    return [puck];
  };

  /**
   * Пересчёт линий кадра при появлении новой траектории.
   *
   * Траектория принадлежит своей ведущей фишке. Если новая линия забрала эту фишку —
   * старая больше ничего не описывает и удаляется целиком, а не остаётся висеть
   * стрелкой. Иначе на кадре копились противоречия: игрок одновременно «едет сюда»
   * и «ведёт шайбу туда», а после перепривязки по площадке ехала одна шайба.
   *
   * Пас поверх ведения — не противоречие: игрок продолжает движение, просто уже без
   * шайбы, поэтому линия остаётся, но перестаёт рисоваться волной ведения.
   *
   * Стрелки-пояснения (пустой objIds) не трогаем — они ничего не ведут.
   */
  const rebindShapes = (shapes, takenIds) => shapes.reduce((acc, shape) => {
    const before = shape.objIds || [];
    if (before.length === 0) return [...acc, shape];

    const after = before.filter(id => !takenIds.includes(id));
    if (after.length === 0 || after[0] !== before[0]) return acc;

    return [...acc, { ...shape, objIds: after, kind: shape.kind === 'carry' && after.length === 1 ? 'skate' : shape.kind }];
  }, []);

  /**
   * Сохранение нарисованной линии.
   *
   * Привязанная линия описывает переход к следующему кадру, поэтому её конец сразу
   * становится положением фишки на нём — одним жестом задаётся всё движение, и таскать
   * фишку на следующем кадре уже не нужно. Если следующего кадра ещё нет, он создаётся.
   */
  const commitShape = (shape, action) => {
    // Свободная стрелка-пояснение: никого не двигает, живёт только на своём кадре
    const targets = action ? targetsForAction(action.objId, action.kind) : [];
    if (targets.length === 0) {
      patchFrame(safeIndex, { shapes: [...currentFrame.shapes, { ...shape, objIds: [] }] });
      return;
    }

    // Начало подтягиваем точно к ведущей фишке: палец почти никогда не попадает в центр
    const points = [positions[targets[0].id], ...shape.points.slice(1)];
    const objIds = targets.map(o => o.id);
    const attached = { ...shape, objIds, points };

    const frames = [...scene.frames];

    // Одна фишка — одна траектория на кадре: новая линия забирает её у старых,
    // а осиротевшие траектории удаляются, чтобы кадр не противоречил сам себе
    frames[safeIndex] = {
      ...frames[safeIndex],
      shapes: [...rebindShapes(frames[safeIndex].shapes, objIds), attached],
    };

    if (safeIndex === frames.length - 1) {
      frames.push({
        id: nextId('f'),
        note: '',
        positions: { ...resolvePositions(scene, safeIndex) },
        shapes: [],
      });
    }

    // Каждая фишка приезжает в свою точку конца пути: шайба при ведении — с тем же
    // отрывом вперёд, с каким шла всю дорогу, иначе на кадре она пряталась бы под игроком
    const destinations = {};
    targets.forEach(target => {
      const lead = targets.length > 1 && target.type === 'puck' ? PUCK_LEAD_M : 0;
      destinations[target.id] = sampleAlongPathWithLead(points, 1, rinkType, lead);
    });

    frames[safeIndex + 1] = {
      ...frames[safeIndex + 1],
      positions: { ...frames[safeIndex + 1].positions, ...destinations },
    };

    onChange({ ...scene, frames });
  };

  /**
   * Сохранение перетаскивания фишки. Заодно подтягиваем конец траектории на предыдущем
   * кадре, если она ведёт эту фишку первой: иначе анимация приезжала бы не туда, где
   * фишка нарисована. У шайбы при ведении точка приезда своя, со смещением, и тянуть
   * по ней путь игрока нельзя.
   */
  const commitDrag = (objId, point) => {
    onChange({
      ...scene,
      frames: scene.frames.map((frame, index) => {
        if (index === safeIndex) {
          return { ...frame, positions: { ...frame.positions, [objId]: point } };
        }

        if (index === safeIndex - 1) {
          return {
            ...frame,
            shapes: frame.shapes.map(shape => (
              shape.objIds?.[0] === objId && shape.points.length >= 2
                ? { ...shape, points: [...shape.points.slice(0, -1), point] }
                : shape
            )),
          };
        }

        return frame;
      }),
    });
  };

  // ── Указатель ────────────────────────────────────────────────────────────

  /**
   * Фишка, ближайшая к точке касания.
   *
   * Выбор считается по расстоянию до центров, а не отдаётся попаданию в саму фишку.
   * В куче у борта фишки перекрывают друг друга, и SVG отдал бы верхнюю по порядку
   * отрисовки — то есть случайную. Теперь достаточно тапнуть чуть ближе к нужной.
   */
  const pickObjectAt = (point) => {
    let best = null;
    let bestDistance = PICK_RADIUS_M;

    scene.objects.forEach(obj => {
      const pos = positions[obj.id];
      if (!pos) return;

      const [ox, oy] = percentToRink(rinkType, pos[0], pos[1]);
      const [px, py] = percentToRink(rinkType, point[0], point[1]);
      const distance = Math.hypot(px - ox, py - oy);

      if (distance <= bestDistance) {
        bestDistance = distance;
        best = obj;
      }
    });

    return best;
  };

  // Выбор фишки из ряда чипов под планшетом. Повторное нажатие открывает её меню,
  // привязанное к самой фишке на площадке, — так чипы полностью заменяют тап по льду.
  const pickFromChip = (objId) => {
    if (selectedId !== objId) {
      setSelectedId(objId);
      closeMenu();
      return;
    }
    setMenuPos(menuPos ? null : measureAnchor(objId));
  };

  const handleSurfacePointerDown = (e) => {
    const point = clientToPercent(rinkRef.current, rinkType, e.clientX, e.clientY);
    if (!point) return;

    // Когда действие выбрано, касание начинает рисовать путь, а не трогает фишки
    if (armed) {
      rinkRef.current.setPointerCapture?.(e.pointerId);
      setDraft({
        id: nextId('s'),
        kind: armed.kind,
        points: [point],
        action: armed,
      });
      return;
    }

    const hit = pickObjectAt(point);
    if (!hit) {
      setSelectedId(null);
      closeMenu();
      return;
    }

    rinkRef.current.setPointerCapture?.(e.pointerId);

    const start = positions[hit.id] || [50, 50];
    setDrag({
      objId: hit.id,
      start,
      point: start,
      wasSelected: selectedId === hit.id,
      // Свободно расставлять фишки можно только на первом кадре: дальше их положение
      // задают траектории, и перетаскивание руками расходилось бы с нарисованным путём
      movable: safeIndex === 0,
    });
    setSelectedId(hit.id);
  };

  const handlePointerMove = (e) => {
    if (!drag && !draft) return;

    if (drag) {
      if (!drag.movable) return;
      const point = clientToPercent(rinkRef.current, rinkType, e.clientX, e.clientY);
      if (point) setDrag({ ...drag, point });
      return;
    }

    // Быстрое движение пальца браузер отдаёт одним событием, склеивая промежуточные
    // точки. Без getCoalescedEvents дуга, нарисованная с разгона, приезжала обратно
    // прямым отрезком. Пустую пачку подстраховываем самим событием: некоторые браузеры
    // возвращают её, и тогда линия не набирала бы точек вовсе.
    const native = e.nativeEvent;
    const coalesced = native?.getCoalescedEvents?.() || [];
    const batch = coalesced.length > 0 ? coalesced : [native || e];

    let points = draft.points;
    batch.forEach(item => {
      const point = clientToPercent(rinkRef.current, rinkType, item.clientX, item.clientY);
      if (!point) return;
      const last = points[points.length - 1];
      // Ловим часто: лишние точки всё равно уйдут при упрощении на отпускании,
      // а вот пропущенные восстановить уже нечем
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.6) return;
      points = [...points, point];
    });

    if (points !== draft.points) setDraft({ ...draft, points });
  };

  const handlePointerUp = () => {
    if (drag) {
      const moved = drag.movable
        ? Math.hypot(drag.point[0] - drag.start[0], drag.point[1] - drag.start[1])
        : 0;

      if (moved > TAP_TOLERANCE_PERCENT) {
        commitDrag(drag.objId, drag.point);
        closeMenu();
      } else {
        // Касание без сдвига: первое выделяет фишку, повторное открывает её меню
        setMenuPos(drag.wasSelected && !menuPos ? measureAnchor(drag.objId) : null);
      }

      setDrag(null);
    }

    if (draft) {
      // Случайный тык линией не считаем
      if (draft.points.length >= 2) {
        const { action, ...shape } = draft;
        // Дрожание пальца выбрасываем до сохранения: по упрощённому пути пойдёт
        // и отрисовка, и анимация, поэтому чистим один раз здесь
        commitShape({ ...shape, points: simplifyPath(shape.points, rinkType) }, action);
      }
      setDraft(null);
      // Действие одноразовое: нарисовал путь — вернулись к обычному режиму, иначе
      // следующее касание льда молча создавало бы ещё одну траекторию
      setArmed(null);
    }
  };

  // ── Кадры ────────────────────────────────────────────────────────────────
  const addFrame = () => {
    // Новый кадр — копия текущего по позициям и чистый по линиям: тренер продолжает
    // с того, что уже стоит на льду, и двигает дальше.
    const frames = [...scene.frames];
    frames.splice(safeIndex + 1, 0, {
      id: nextId('f'),
      note: '',
      positions: { ...resolvePositions(scene, safeIndex) },
      shapes: [],
    });

    onChange({ ...scene, frames });
    setFrameIndex(safeIndex + 1);
    setArmed(null);
    closeMenu();
  };

  const removeFrame = (index) => {
    if (scene.frames.length <= 1) return;
    onChange({ ...scene, frames: scene.frames.filter((_, i) => i !== index) });
    setFrameIndex(Math.max(0, index - 1));
    setArmed(null);
    closeMenu();
  };

  // Позиция тащимой фишки подмешивается только в отрисовку: в сцену она попадёт
  // на pointerup, поэтому во время жеста ни сцена, ни форма упражнения не трогаются.
  const renderPositions = playback
    ? interpolatePositions(scene, playback.index, playback.t, rinkType)
    : (drag ? { ...positions, [drag.objId]: drag.point } : positions);

  const shapeLayers = playback
    ? (() => {
        const current = scene.frames[playback.index];
        if (playback.t === 0 || playback.index >= scene.frames.length - 1) {
          return [{ key: current.id, shapes: current.shapes, opacity: 1 }];
        }
        const next = scene.frames[playback.index + 1];
        return [
          { key: current.id, shapes: current.shapes, opacity: 1 - playback.t },
          { key: next.id,    shapes: next.shapes,    opacity: playback.t },
        ];
      })()
    : [
        { key: currentFrame.id, shapes: currentFrame.shapes, opacity: 1 },
        ...(draft ? [{ key: 'draft', shapes: [draft], opacity: 0.6 }] : []),
      ];

  // Подсветка кадра во время проигрывания идёт за анимацией
  const activeIndex = playback ? playback.index : safeIndex;

  const board = outerViewBox(rinkType);
  const isMenuVisible = !!(selectedObject && menuPos && !drag && !armed);

  const armedLabel = armed ? ACTIONS.find(a => a.kind === armed.kind)?.label : null;
  const availableActions = ACTIONS.filter(a => !a.needsPuck || hasPuck);

  // Сторону выбираем по тому, где больше места, и ограничиваем меню этим местом.
  // Порога по трети площадки не хватало: у фишки чуть ниже середины места сверху
  // формально больше, но на полный список пунктов его всё равно не хватает, и верхние
  // строки уезжали за край экрана. Теперь высота зажата, а список при нехватке места
  // прокручивается. По горизонтали прижимаем к краям, чтобы не уезжало за борт.
  const MENU_GAP = 26;
  const MENU_HALF = 96;
  const MENU_EDGE = 10;

  const spaceAbove = menuPos ? menuPos.y - MENU_GAP - MENU_EDGE : 0;
  const spaceBelow = menuPos ? menuPos.areaHeight - menuPos.y - MENU_GAP - MENU_EDGE : 0;
  const placeAbove = spaceAbove >= spaceBelow;
  const menuMaxHeight = Math.max(150, placeAbove ? spaceAbove : spaceBelow);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Доска занимает всю ширину и имеет постоянный размер, а панели под ней
          появляются и исчезают, не сжимая её. Раньше от одной кнопки «Убрать фишку»
          каток заметно прыгал. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col gap-3"
        onScroll={closeMenu}
      >

        {/* ── Кадры ──
            Прилипают к верху и не уезжают при прокрутке: переключаться между кадрами
            нужно постоянно. Фон тот же, что у шапки, — полоса читается как её
            продолжение, а каток проезжает под ней, ничего не просвечивая. */}
        <div className="sticky top-0 z-[15] shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-hide p-2 bg-surface-base shadow-lg">
          {scene.frames.map((frame, index) => (
            <div key={frame.id} className="relative shrink-0">
              <button
                onClick={() => { setFrameIndex(index); setArmed(null); closeMenu(); }}
                className={clsx(
                  'w-10 h-10 rounded-xl text-[14px] font-black transition-all outline-none',
                  index === activeIndex
                    ? 'bg-brand text-white'
                    // Невыбранные обводим: на фоне шапки заливка почти сливается с ней,
                    // и без контура кадры не читались бы как отдельные кнопки
                    : 'bg-surface-level2 text-content-muted border border-brand-opacity'
                )}
              >
                {index + 1}
              </button>
              {index === safeIndex && !isPlaying && scene.frames.length > 1 && (
                <button
                  onClick={() => removeFrame(index)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center outline-none"
                  aria-label="Удалить кадр"
                >
                  <Icon name="close" className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addFrame}
            className="shrink-0 w-10 h-10 rounded-xl bg-surface-level2 text-content-main border border-surface-border flex items-center justify-center active:scale-95 transition-transform outline-none"
            aria-label="Добавить кадр"
          >
            <Icon name="plus" className="w-4 h-4" />
          </button>

          {/* Проигрывание прямо в планшете. Появляется, когда есть что проигрывать */}
          {scene.frames.length > 1 && (
            <button
              onClick={togglePlay}
              className="shrink-0 w-10 h-10 ml-auto text-brand flex items-center justify-center active:scale-90 transition-transform outline-none"
              aria-label={isPlaying ? 'Остановить' : 'Проиграть'}
            >
              <Icon name={isPlaying ? 'stop' : 'play'} className="w-7 h-7" />
            </button>
          )}
        </div>

        {/* ── Каток ──
            Без собственного фона: каток скруглён, контейнер прямоугольный, и в углах
            просвечивает то, на чём планшет лежит. Своя заливка выдавала бы себя
            четырьмя уголками чужого цвета. */}
        <div
          ref={boardRef}
          className="relative w-full shrink-0"
          style={{ aspectRatio: `${board.w} / ${board.h}` }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <BoardScene
            svgRef={rinkRef}
            rinkType={rinkType}
            scene={scene}
            positions={renderPositions}
            shapeLayers={shapeLayers}
            selectedId={selectedId}
            lockTouch={!isPlaying && (!!selectedId || !!armed || !!drag)}
            onSurfacePointerDown={isPlaying ? undefined : handleSurfacePointerDown}
          />

        </div>

          {/* ── Фишки кадра ──
            Страховка для плотных куч: до фишки, полностью закрытой соседями, пальцем
            на площадке не добраться никак. Тап по чипу выделяет её, повторный —
            открывает то же меню, что и на планшете. */}
        {scene.objects.length > 0 && !armed && (
          <div className="shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {scene.objects.map(obj => (
              <button
                key={obj.id}
                onClick={() => pickFromChip(obj.id)}
                className={clsx(
                  'shrink-0 p-1.5 rounded-xl border transition-colors outline-none active:scale-95',
                  selectedId === obj.id
                    ? 'bg-brand-opacity border-brand'
                    : 'bg-surface-level2 border-surface-border'
                )}
                aria-label={`Фишка ${obj.label || ''}`}
              >
                <ObjectChip type={obj.type} label={obj.label} size={24} />
              </button>
            ))}
          </div>
        )}

        {/* Почему фишка не двигается — объясняем ровно в тот момент, когда тренер
            пробует её потащить не на первом кадре */}
        {selectedObject && safeIndex > 0 && !armed && (
          <p className="shrink-0 text-[12px] text-content-muted leading-snug">
            Расставить фишки свободно можно на кадре 1. Здесь их положение задают
            траектории.
          </p>
        )}

        {/* ── Подсказка режима рисования ── */}
        {armed && (
          <p className="shrink-0 text-[12px] text-brand font-semibold leading-snug">
            {armedLabel}: нарисуйте путь — хоть дугой, хоть вокруг конуса. Конец пути
            станет местом на следующем кадре.
          </p>
        )}

        {/* ── Скорость перехода ──
            Принадлежит кадру, из которого идёт движение: тренер смотрит на расстановку
            и решает, насколько быстро из неё выходят. На последнем кадре выходить
            некуда, поэтому там выбора нет. */}
        {safeIndex < scene.frames.length - 1 && (
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[12px] font-bold text-content-muted uppercase tracking-wider shrink-0">
              Скорость
            </span>
            <div className="flex items-center gap-2">
              {FRAME_SPEEDS.map(speed => (
                <button
                  key={speed.id}
                  onClick={() => patchFrame(safeIndex, { speed: speed.id })}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-[13px] font-black tracking-widest transition-colors outline-none',
                    currentFrame.speed === speed.id
                      ? 'bg-brand text-white'
                      : 'bg-surface-level2 text-content-muted border border-surface-border'
                  )}
                  aria-label={`Скорость ${speed.label}`}
                >
                  {speed.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Подпись кадра ── */}
        <input
          value={currentFrame.note}
          onChange={(e) => patchFrame(safeIndex, { note: e.target.value })}
          placeholder={`Что происходит на кадре ${safeIndex + 1}`}
          maxLength={200}
          className="shrink-0 w-full px-3 py-2.5 rounded-xl bg-surface-level2 text-content-main text-[14px] outline-none border border-surface-border placeholder:text-content-subtle"
        />

        {/* ── Фишки ── */}
        <div className="shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          {OBJECT_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => addObject(type.id)}
              className="shrink-0 px-3 py-2 rounded-xl bg-surface-level2 text-content-main text-[12px] font-bold uppercase tracking-wider active:scale-95 transition-transform outline-none"
            >
              + {type.label}
            </button>
          ))}
        </div>

      {/* ── Выпадалка фишки ──
          Действие выбирается прямо на фишке, а не в общем списке внизу: тренер думает
          «этот игрок ведёт шайбу вот сюда», а не «инструмент ведения». Пас, бросок и
          ведение появляются, только если шайба в ареоле фишки.

          Живёт в портале поверх всего: внутри доски меню обрезалось её границей, а
          внутри прокручиваемой колонки — её краем, из-за чего у фишек в верхней части
          площадки не было видно верхних пунктов. */}
      {isMenuVisible && createPortal(
        <>
          {/* Клик мимо меню закрывает его, не трогая выделение фишки.
              z-индексы отсчитываются от слоя доски в том же портале: перехватчик
              должен лежать над ней, а меню — над перехватчиком. */}
          <div className="absolute inset-0 z-[25] pointer-events-auto" onPointerDown={closeMenu} />

          <div
            className="absolute z-[30] -translate-x-1/2 pointer-events-auto flex flex-col gap-1 p-1.5 rounded-xl bg-surface-level1 border border-surface-border shadow-2xl min-w-[184px] overflow-y-auto scrollbar-hide"
            style={{
              left: Math.min(menuPos.areaWidth - MENU_HALF, Math.max(MENU_HALF, menuPos.x)),
              top: placeAbove ? undefined : menuPos.y + MENU_GAP,
              bottom: placeAbove ? menuPos.areaHeight - menuPos.y + MENU_GAP : undefined,
              maxHeight: menuMaxHeight,
            }}
          >
            {/* Превью самой фишки рядом с меткой: сразу видно, кого редактируешь,
                и не нужно сверяться с площадкой */}
            <div className="flex items-center gap-2 px-2 pt-1 pb-1.5 border-b border-surface-border">
              <ObjectChip type={selectedObject.type} label={selectedObject.label} size={26} />
              <span className="text-[11px] font-black text-content-muted uppercase tracking-widest">
                Метка
              </span>
              <input
                value={selectedObject.label}
                onChange={(e) => updateSelectedLabel(e.target.value)}
                maxLength={3}
                disabled={selectedObject.type === 'puck'}
                className="w-11 ml-auto px-1 py-1 rounded-md bg-surface-level2 text-content-main text-[13px] font-bold text-center outline-none border border-surface-border disabled:opacity-40"
              />
            </div>

            {/* Действия и траектории есть только у игроков: конус стоит на месте,
                а шайба едет за тем, кто её ведёт */}
            {isPiecePlayable && (
              <>
                {availableActions.map(action => (
                  <button
                    key={action.kind}
                    onClick={() => { setArmed({ objId: selectedObject.id, kind: action.kind }); closeMenu(); }}
                    className="px-2.5 py-2 rounded-lg text-left text-[13px] font-bold text-content-main hover:bg-surface-level2 outline-none"
                  >
                    {action.label}
                  </button>
                ))}

                <button
                  onClick={clearTrajectories}
                  className="px-2.5 py-2 rounded-lg text-left text-[13px] font-bold text-content-muted hover:bg-surface-level2 outline-none"
                >
                  Очистить траектории
                </button>
              </>
            )}

            <button
              onClick={() => removeObject(selectedObject.id)}
              className="px-2.5 py-2 rounded-lg text-left text-[13px] font-bold text-danger hover:bg-surface-level2 outline-none"
            >
              Убрать фишку
            </button>
          </div>
        </>,
        getPortalRoot()
      )}
      </div>
    </div>
  );
}
