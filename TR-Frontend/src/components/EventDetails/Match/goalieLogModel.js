// Модель журнала смен вратарей.
//
// В БД журнал хранится «состояниями»: строка = { time_seconds, home_goalie_id,
// away_goalie_id } — кто стоит у обеих команд начиная с этого времени.
// Для ленты и для add/edit/delete удобнее работать с двумя НЕЗАВИСИМЫМИ
// таймлайнами (home / away), где точка = момент смены вратаря на стороне.
//
// decode: состояния → точки смен по сторонам.
// encode: точки смен по сторонам → состояния (для PUT в БД).

// log: [{ time_seconds, home_goalie_id, away_goalie_id }]
// → { home: [{ time_seconds, goalie_id }], away: [...] }  (только моменты смен)
export function decodeGoalieLog(log) {
  const rows = (log || [])
    .map(r => ({
      t: Number(r.time_seconds) || 0,
      h: r.home_goalie_id ?? null,
      a: r.away_goalie_id ?? null,
    }))
    .sort((x, y) => x.t - y.t);

  const home = [];
  const away = [];
  let prevH; // undefined = ещё не встречали
  let prevA;
  for (const r of rows) {
    if (prevH === undefined || r.h !== prevH) { home.push({ time_seconds: r.t, goalie_id: r.h }); prevH = r.h; }
    if (prevA === undefined || r.a !== prevA) { away.push({ time_seconds: r.t, goalie_id: r.a }); prevA = r.a; }
  }
  return { home, away };
}

// Значение таймлайна на момент t: вратарь последней точки с time <= t.
function sampleAt(timeline, t) {
  let val = null;
  for (const p of timeline) {
    if (p.time_seconds <= t) val = p.goalie_id;
    else break;
  }
  return val;
}

// { home, away } → [{ time_seconds, home_goalie_id, away_goalie_id }]
export function encodeGoalieLog(model) {
  const home = [...(model.home || [])].sort((a, b) => a.time_seconds - b.time_seconds);
  const away = [...(model.away || [])].sort((a, b) => a.time_seconds - b.time_seconds);
  const times = Array.from(new Set([...home, ...away].map(p => p.time_seconds))).sort((a, b) => a - b);
  return times.map(t => ({
    time_seconds: t,
    home_goalie_id: sampleAt(home, t),
    away_goalie_id: sampleAt(away, t),
  }));
}

// Добавить/изменить смену на стороне. replaceTime — если редактируем существующую
// точку (сначала убираем её), иначе просто добавляем новую.
export function setGoalieChange(model, side, { time_seconds, goalie_id, replaceTime }) {
  const base = model[side] || [];
  let next = replaceTime != null ? base.filter(p => p.time_seconds !== replaceTime) : base.slice();
  next = next.filter(p => p.time_seconds !== time_seconds); // без дублей по времени
  next.push({ time_seconds: Number(time_seconds) || 0, goalie_id: goalie_id ?? null });
  next.sort((a, b) => a.time_seconds - b.time_seconds);
  return { ...model, [side]: next };
}

// Удалить смену на стороне в указанный момент.
export function removeGoalieChange(model, side, time_seconds) {
  return { ...model, [side]: (model[side] || []).filter(p => p.time_seconds !== Number(time_seconds)) };
}

// Абсолютное время события (от начала матча) из периода и времени внутри периода.
export function absoluteSeconds(period, timeSec, reg) {
  const plSec = (reg?.period_length || 20) * 60;
  const otSec = (reg?.ot_length || 0) * 60;
  const pc = reg?.periods_count || 3;
  const t = Number(timeSec) || 0;
  if (period === 'OT') return pc * plSec + t;
  if (period === 'SO') return pc * plSec + otSec + t;
  const idx = parseInt(period, 10) || 1;
  return (idx - 1) * plSec + t;
}

// Ключ периода для абсолютного времени матча (от начала).
export function periodKeyForTime(totalSec, reg) {
  const plSec = (reg?.period_length || 20) * 60;
  const otSec = (reg?.ot_length || 0) * 60;
  const pc = reg?.periods_count || 3;
  const regSec = pc * plSec;
  const t = Number(totalSec) || 0;
  if (t <= regSec) {
    if (t === 0) return '1';
    return String(Math.max(1, Math.min(pc, Math.ceil(t / plSec) || 1)));
  }
  if (otSec > 0) return 'OT';
  return String(pc);
}
