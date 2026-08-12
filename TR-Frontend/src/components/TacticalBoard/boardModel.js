// Модель сцены тактической доски.
//
// Сохраняем не картинку, а сценарий: тогда упражнение можно переоткрыть и доправить, а
// анимация получается сама собой — плавным переходом между кадрами. Формат board_json:
//
//   {
//     objects: [ { id, type, label } ],
//     frames:  [ { id, note, positions: { objId: [x, y] },
//                  shapes: [ { id, kind, points, objIds } ] } ]
//   }
//
// Линия с непустым objIds — это траектория: перечисленные в ней фишки едут по
// нарисованному пути, а конец пути задаёт их положение на следующем кадре. Пустой
// objIds означает обычную стрелку-пояснение, которая никого не двигает.
//
// Координаты — проценты 0..100 от площадки, а не пиксели. Одна и та же сцена одинаково
// ложится и в редактор на всю ширину экрана, и в миниатюру пункта плана.

// Каток рисуется всегда целиком в системе координат 60 × 30 метров, а «половина» —
// тот же рисунок, обрезанный через viewBox. Одна геометрия на все виды вместо
// нескольких отдельных катков.
export const RINK_LENGTH = 60;

export const RINK_VIEWBOX = {
  full:   { x: 0,  y: 0, w: 60, h: 30 },
  // Каток вертикальный, поэтому половины называются по экрану, а не по бортам:
  // «верх» — дальняя от зрителя половина, «низ» — ближняя.
  top:    { x: 30, y: 0, w: 30, h: 30 },
  bottom: { x: 0,  y: 0, w: 30, h: 30 },
  // Из выбора убраны, но чтение оставлено: упражнения, созданные раньше, должны
  // открываться как прежде, а не падать на полный каток
  half:   { x: 30, y: 0, w: 30, h: 30 },
  zone:   { x: 37, y: 0, w: 23, h: 30 },
};

export const RINK_TYPES = [
  { id: 'full',   label: 'Полный' },
  { id: 'top',    label: 'Верх' },
  { id: 'bottom', label: 'Низ' },
];

// Каток всегда показывается вертикально: телефон держат стоя, и в портретной
// ориентации площадка занимает всю ширину экрана, а не узкую полоску в четверть высоты.
//
// Рисунок при этом остаётся горизонтальным — его разворачивает transform, поэтому вся
// геометрия и все координаты сцены живут в одной системе 60 × 30.
export const RINK_ROTATION = `translate(0,${RINK_LENGTH}) rotate(-90)`;

export const outerViewBox = (rinkType) => {
  const vb = RINK_VIEWBOX[rinkType] || RINK_VIEWBOX.full;
  return { x: vb.y, y: RINK_LENGTH - (vb.x + vb.w), w: vb.h, h: vb.w };
};

/**
 * Точка площадки в долях контейнера доски (0..1 по каждой оси).
 *
 * Нужна для всплывающих элементов поверх доски: они живут в HTML, а не в SVG, и им
 * нужны обычные left/top. Расчёт верен только пока контейнер имеет ту же пропорцию,
 * что и viewBox — тогда preserveAspectRatio ничего не подрезает по краям.
 */
export const percentToScreen = (rinkType, x, y) => {
  const [rx, ry] = percentToRink(rinkType, x, y);
  const vb = outerViewBox(rinkType);

  return { left: (ry - vb.x) / vb.w, top: (RINK_LENGTH - rx - vb.y) / vb.h };
};

// Радиус ареола фишки: в нём шайба считается доступной. Ничего не назначается вручную —
// система смотрит на расстановку, поэтому владение не может разойтись с тем, что тренер
// видит на площадке.
export const PUCK_REACH_M = 3.5;

/**
 * Дотягивается ли фишка до шайбы на этом кадре.
 *
 * Ареолов может пересечься сколько угодно, и это нормально: у борта или на вбрасывании
 * шайбу могут забрать двое, и выбирать за тренера, кто именно, система не должна —
 * действия с шайбой доступны каждому, кто до неё дотягивается.
 */
export const isPuckInReach = (positions, objId, puckId, rinkType) => {
  const own = positions[objId];
  const puck = positions[puckId];
  if (!own || !puck) return false;

  const [ox, oy] = percentToRink(rinkType, own[0], own[1]);
  const [px, py] = percentToRink(rinkType, puck[0], puck[1]);
  return Math.hypot(px - ox, py - oy) <= PUCK_REACH_M;
};

// Типы фишек. Игроки намеренно абстрактные, без привязки к составу: упражнение живёт
// в личной библиотеке тренера и уезжает к другим тренерам и в другие команды — ссылка
// на конкретного игрока сломалась бы у первого же получателя.
//
// Отдельного вратаря нет: это такой же игрок, и отличает его номер, а не тип фишки.
export const OBJECT_TYPES = [
  { id: 'own',  label: 'Свой',     defaultLabel: '1' },
  { id: 'opp',  label: 'Соперник', defaultLabel: '1' },
  { id: 'puck', label: 'Шайба',    defaultLabel: '' },
  { id: 'cone', label: 'Конус',    defaultLabel: '1' },
];

// Длительность перехода между кадрами и паузы на кадре при проигрывании
export const FRAME_TRANSITION_MS = 1400;
export const FRAME_HOLD_MS = 700;

// Скорость перехода задаётся у кадра, из которого идёт движение: тренер смотрит на
// расстановку и решает, насколько быстро из неё выходят. Вместо цифр — три ступени,
// секунды тут всё равно никто не считает. Отсутствие поля означает среднюю скорость,
// поэтому упражнения, созданные раньше, проигрываются как прежде.
export const FRAME_SPEEDS = [
  { id: 'slow',   label: '>',   factor: 1.8  },
  { id: 'normal', label: '>>',  factor: 1    },
  { id: 'fast',   label: '>>>', factor: 0.55 },
];

export const frameTransitionMs = (frame) => {
  const speed = FRAME_SPEEDS.find(s => s.id === frame?.speed);
  return FRAME_TRANSITION_MS * (speed ? speed.factor : 1);
};

let idCounter = 0;
export const nextId = (prefix) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export const createEmptyScene = () => ({
  objects: [],
  frames: [{ id: nextId('f'), note: '', positions: {}, shapes: [] }],
});

// Сцена из базы может быть какой угодно давности — приводим к рабочему виду, чтобы
// ни редактор, ни проигрыватель не проверяли каждое поле у себя.
export const normalizeScene = (raw) => {
  const scene = raw && typeof raw === 'object' ? raw : {};
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  const frames = Array.isArray(scene.frames) && scene.frames.length > 0
    ? scene.frames
    : createEmptyScene().frames;

  return {
    objects: objects.map(o => ({
      id: o.id || nextId('o'),
      type: OBJECT_TYPES.some(t => t.id === o.type) ? o.type : 'own',
      label: typeof o.label === 'string' ? o.label : '',
    })),
    frames: frames.map(f => ({
      id: f.id || nextId('f'),
      note: typeof f.note === 'string' ? f.note : '',
      speed: FRAME_SPEEDS.some(s => s.id === f.speed) ? f.speed : 'normal',
      positions: f.positions && typeof f.positions === 'object' ? f.positions : {},
      // Линия может вести сразу несколько фишек — при ведении шайбы это игрок и шайба.
      // Ранние сцены хранили одиночный objId, приводим их к общему виду на чтении:
      // при первом же сохранении упражнение переедет на новый формат.
      shapes: (Array.isArray(f.shapes) ? f.shapes : []).map(({ objId, ...shape }) => ({
        ...shape,
        objIds: Array.isArray(shape.objIds) ? shape.objIds : (objId ? [objId] : []),
      })),
    })),
  };
};

/**
 * Позиции всех фишек на кадре.
 *
 * Если фишки на кадре нет (тренер добавил её позже или не двигал), берём её положение
 * с ближайшего предыдущего кадра — иначе она пропадала бы с площадки на середине
 * упражнения. Не нашлось нигде — ставим в центр.
 */
export const resolvePositions = (scene, frameIndex) => {
  const result = {};

  scene.objects.forEach(obj => {
    for (let i = Math.min(frameIndex, scene.frames.length - 1); i >= 0; i--) {
      const pos = scene.frames[i]?.positions?.[obj.id];
      if (pos) {
        result[obj.id] = pos;
        return;
      }
    }
    result[obj.id] = [50, 50];
  });

  return result;
};

/**
 * Точка на ломаной по доле пройденного пути (t = 0..1).
 *
 * Длину меряем в метрах катка, а не в процентах: по горизонтали площадка вдвое длиннее,
 * и на процентах фишка ехала бы вдоль борта вдвое быстрее, чем поперёк.
 */
export const sampleAlongPath = (points, t, rinkType) => {
  if (!points || points.length === 0) return [50, 50];
  if (points.length === 1) return points[0];

  const metric = points.map(([x, y]) => percentToRink(rinkType, x, y));

  const lengths = [];
  let total = 0;
  for (let i = 0; i < metric.length - 1; i++) {
    const len = Math.hypot(metric[i + 1][0] - metric[i][0], metric[i + 1][1] - metric[i][1]);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return points[0];

  let target = Math.max(0, Math.min(1, t)) * total;

  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] === 0 ? 0 : Math.min(1, target / lengths[i]);
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
    }
    target -= lengths[i];
  }

  return points[points.length - 1];
};

// Насколько шайба идёт впереди игрока при ведении, в метрах. Без этого отрыва она
// весь проход пряталась бы ровно под фишкой игрока и выглядела бы потерянной.
export const PUCK_LEAD_M = 1.2;

/**
 * Точка на траектории со смещением вперёд по ходу движения.
 * Направление берём по соседним точкам пути, поэтому на дуге шайба честно
 * поворачивает вместе с игроком, а не висит сбоку.
 */
export const sampleAlongPathWithLead = (points, t, rinkType, leadMeters) => {
  const base = sampleAlongPath(points, t, rinkType);
  if (!leadMeters) return base;

  const step = 0.02;
  const ahead = sampleAlongPath(points, Math.min(1, t + step), rinkType);
  const behind = sampleAlongPath(points, Math.max(0, t - step), rinkType);

  const [ax, ay] = percentToRink(rinkType, ahead[0], ahead[1]);
  const [bx, by] = percentToRink(rinkType, behind[0], behind[1]);
  const length = Math.hypot(ax - bx, ay - by);
  if (length === 0) return base;

  const [px, py] = percentToRink(rinkType, base[0], base[1]);
  return rinkToPercent(
    rinkType,
    px + ((ax - bx) / length) * leadMeters,
    py + ((ay - by) / length) * leadMeters
  );
};

/**
 * Траектории кадра в виде { objId: { points, lead } }.
 *
 * Отрыв назначается не флагом в данных, а по составу линии: если она ведёт больше
 * одной фишки (ведение шайбы — игрок плюс шайба), то шайба идёт впереди. Линия,
 * которая ведёт только шайбу (пас, бросок), летит ровно по нарисованному.
 */
export const collectTrajectories = (scene, frameIndex) => {
  const typeById = new Map(scene.objects.map(o => [o.id, o.type]));
  const result = {};

  (scene.frames[frameIndex]?.shapes || []).forEach(shape => {
    const ids = shape.objIds || [];
    if (ids.length === 0 || !Array.isArray(shape.points) || shape.points.length < 2) return;

    ids.forEach(id => {
      result[id] = {
        points: shape.points,
        lead: ids.length > 1 && typeById.get(id) === 'puck' ? PUCK_LEAD_M : 0,
      };
    });
  });

  return result;
};

/**
 * Положения всех фишек в момент t перехода от кадра frameIndex к следующему.
 *
 * У фишки с траекторией движение идёт по нарисованной линии — дуга вокруг конуса,
 * вираж, шайба вдоль борта. У остальных остаётся прямая между кадрами: для простого
 * смещения рисовать линию незачем.
 */
export const interpolatePositions = (scene, frameIndex, t, rinkType) => {
  const from = resolvePositions(scene, frameIndex);
  if (t <= 0 || frameIndex >= scene.frames.length - 1) return from;

  const to = resolvePositions(scene, frameIndex + 1);
  const trajectories = collectTrajectories(scene, frameIndex);

  const result = {};
  scene.objects.forEach(obj => {
    const trajectory = trajectories[obj.id];
    if (trajectory) {
      result[obj.id] = sampleAlongPathWithLead(trajectory.points, t, rinkType, trajectory.lead);
      return;
    }

    const a = from[obj.id] || [50, 50];
    const b = to[obj.id] || a;
    result[obj.id] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });

  return result;
};

// Процент площадки → координаты внутри viewBox катка
export const percentToRink = (rinkType, x, y) => {
  const vb = RINK_VIEWBOX[rinkType] || RINK_VIEWBOX.full;
  return [vb.x + (x / 100) * vb.w, vb.y + (y / 100) * vb.h];
};

// Обратный перевод: точка внутри viewBox → проценты площадки, с зажимом в границы,
// чтобы фишку нельзя было утащить за пределы катка
export const rinkToPercent = (rinkType, sx, sy) => {
  const vb = RINK_VIEWBOX[rinkType] || RINK_VIEWBOX.full;
  const x = ((sx - vb.x) / vb.w) * 100;
  const y = ((sy - vb.y) / vb.h) * 100;
  return [
    Math.max(0, Math.min(100, x)),
    Math.max(0, Math.min(100, y)),
  ];
};

// Насколько путь можно упростить и когда считать его прямым, в метрах катка.
// Палец дрожит, и каждая случайная точка превращалась в излом — схема выглядела
// нарисованной от руки в худшем смысле слова.
const SIMPLIFY_TOLERANCE_M = 0.85;
const STRAIGHT_TOLERANCE_M = 1.3;

// Сколько раз усреднить точки с соседями перед упрощением
const SMOOTH_PASSES = 3;

// Расстояние от точки до отрезка, в метрах катка
const distanceToSegment = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);

  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
};

/**
 * Усреднение точек с соседями.
 *
 * Обязательный шаг перед упрощением: Дуглас — Пекер по своей природе сохраняет самые
 * выступающие точки, а при дрожании пальца это ровно пики дрожания. Одним порогом
 * дугу поэтому не выровнять — сначала надо сбить сами пики. Концы не трогаем: начало
 * привязано к фишке, конец задаёт её место на следующем кадре.
 */
const smoothPoints = (points, passes) => {
  let result = points;

  for (let pass = 0; pass < passes; pass++) {
    const next = [result[0]];
    for (let i = 1; i < result.length - 1; i++) {
      next.push([
        result[i - 1][0] * 0.25 + result[i][0] * 0.5 + result[i + 1][0] * 0.25,
        result[i - 1][1] * 0.25 + result[i][1] * 0.5 + result[i + 1][1] * 0.25,
      ]);
    }
    next.push(result[result.length - 1]);
    result = next;
  }

  return result;
};

/**
 * Приведение нарисованного пути в человеческий вид.
 *
 * Сначала усредняем точки, чтобы убрать дрожание, затем выбрасываем те, что почти
 * лежат на линии между соседями (Рамер — Дуглас — Пекер): форма дуги остаётся, лишние
 * изломы уходят. Путь, отклонившийся от своей хорды меньше чем на STRAIGHT_TOLERANCE_M,
 * распрямляем — провести идеально ровную линию пальцем иначе невозможно.
 */
export const simplifyPath = (points, rinkType) => {
  if (!points || points.length < 3) return points;

  const smoothed = smoothPoints(points, SMOOTH_PASSES);
  const metric = smoothed.map(([x, y]) => percentToRink(rinkType, x, y));

  // Почти прямая — делаем прямой
  const chordDeviation = metric.reduce(
    (max, p) => Math.max(max, distanceToSegment(p, metric[0], metric[metric.length - 1])),
    0
  );
  if (chordDeviation <= STRAIGHT_TOLERANCE_M) return [smoothed[0], smoothed[smoothed.length - 1]];

  const keep = new Array(smoothed.length).fill(false);
  keep[0] = true;
  keep[smoothed.length - 1] = true;

  const stack = [[0, smoothed.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    if (to - from < 2) continue;

    let farthest = -1;
    let maxDistance = SIMPLIFY_TOLERANCE_M;

    for (let i = from + 1; i < to; i++) {
      const distance = distanceToSegment(metric[i], metric[from], metric[to]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }

    if (farthest === -1) continue;
    keep[farthest] = true;
    stack.push([from, farthest], [farthest, to]);
  }

  // Возвращаем именно сглаженные точки: исходные вернули бы дрожание обратно, а
  // усреднение тогда влияло бы лишь на то, какие из них выжили
  return smoothed.filter((_, i) => keep[i]);
};

/**
 * Ломаная в гладкий путь SVG через кривые Катмулла — Рома.
 *
 * Прямые отрезки между точками давали видимые углы на каждом сэмпле; кривая проходит
 * через те же точки, но без изломов, и дуга наконец выглядит дугой.
 */
const toSmoothPath = (pts) => {
  if (pts.length === 2) {
    return `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)} L${pts[1][0].toFixed(2)},${pts[1][1].toFixed(2)}`;
  }

  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || pts[i + 1];

    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];

    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }

  return d;
};

/**
 * Ломаная в путь SVG. Для ведения шайбы линия рисуется волной — это стандартная
 * тренерская нотация, а не украшение: по ней упражнение читается без подписи.
 */
export const pointsToPath = (points, kind, rinkType) => {
  if (!points || points.length < 2) return '';

  const pts = points.map(([x, y]) => percentToRink(rinkType, x, y));

  if (kind !== 'carry') return toSmoothPath(pts);

  // Волна: идём вдоль ломаной с постоянным шагом и смещаем точку по нормали.
  //
  // Остаток шага переносим на следующий отрезок вычитанием его длины. Раньше он
  // пересчитывался через остаток от деления, и на отрезках короче шага уходил в минус:
  // накопитель разрастался, точки переставали ставиться совсем, и нарисованная от руки
  // дуга схлопывалась в прямую от начала пути к его концу.
  const AMPLITUDE = 0.4;
  const STEP = 0.9;

  const out = [];
  let carry = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    const nx = -dy / len;
    const ny = dx / len;

    while (carry < len) {
      const t = carry / len;
      const phase = out.length % 2 === 0 ? 1 : -1;
      out.push([
        x1 + dx * t + nx * AMPLITUDE * phase,
        y1 + dy * t + ny * AMPLITUDE * phase,
      ]);
      carry += STEP;
    }

    carry -= len;
  }

  out.push(pts[pts.length - 1]);
  return out.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
};
