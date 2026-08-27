import pool from '../config/db.js';

// =============================================================================
// ГИБКАЯ СТОИМОСТЬ СОБЫТИЯ
//
// У события два режима взноса (колонка cost_mode):
//   per_person — фиксированная сумма с каждого, лежит в cost/home_player_fee;
//   split      — общая сумма события (total_cost) делится между плательщиками.
//
// Плательщик — это отметившийся, у которого pay_role <> 'free', а для тренировок
// и матчей ещё и не вратарь при включённом goalies_free. Снявшиеся после дедлайна
// (withdrawn_at IS NOT NULL) из делителя НЕ исчезают: они продолжают платить,
// иначе позднее снятие удорожало бы событие всем остальным.
//
// Расчёт для интерфейса живёт в SQL календаря (CalendarController), здесь —
// то, что нужно на запись: платёжная роль при отметке, проверка дедлайна,
// текст стоимости для push и финальная фиксация цены после события.
// =============================================================================

// Тренировки и собрания устроены одинаково, отличаются только именами колонок.
// Матч живёт отдельно: обе команды в одной строке games, у каждой своя сторона.
const EVENT_MAP = {
  team_training: { table: 'team_training', att: 'team_training_attendance', fk: 'team_training_id', dateCol: 'training_date', goalieAware: true },
  club_training: { table: 'club_training', att: 'club_training_attendance', fk: 'club_training_id', dateCol: 'training_date', goalieAware: true },
  team_meeting:  { table: 'team_meeting',  att: 'team_meeting_attendance',  fk: 'team_meeting_id',  dateCol: 'meeting_date',  goalieAware: false },
  club_meeting:  { table: 'club_meeting',  att: 'club_meeting_attendance',  fk: 'club_meeting_id',  dateCol: 'meeting_date',  goalieAware: false },
};

export const isMatchEvent = (eventType) => eventType === 'match';

// ── Платёжная роль на момент отметки ────────────────────────────────────────
// Пишется в отметку снимком, а не вычисляется каждый раз из ростера: амплуа
// игрока может смениться после события, а расчёт взноса меняться не должен.
// Вратарём считаем только того, у кого амплуа стоит явно; всё остальное —
// включая людей без амплуа в общей базе клуба — платит как полевой.
export async function resolvePayRole(userId, eventType, { teamId, clubId, gameId } = {}) {
  try {
    if (eventType === 'team_meeting' || eventType === 'club_meeting') return 'skater';

    if (eventType === 'match' && gameId) {
      const { rows } = await pool.query(
        `SELECT 1
         FROM tournament_rosters tr
         JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
         JOIN games g ON g.division_id = tt.division_id
         WHERE g.id = $1 AND tt.team_id = $2 AND tr.player_id = $3
           AND tr.period_end IS NULL AND tr.position = 'goalie'
         LIMIT 1`,
        [gameId, teamId, userId]
      );
      if (rows.length > 0) return 'goalie';
    }

    // Клубная тренировка собирает игроков разных команд — амплуа ищем в любом
    // активном ростере, поэтому team_id в условии участвует только если он есть.
    const { rows } = await pool.query(
      `SELECT 1
       FROM team_rosters tr
       JOIN team_members tm ON tr.member_id = tm.id
       WHERE tm.user_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
         AND ($2::int IS NULL OR tm.team_id = $2)
         AND tr.position = 'goalie'
       LIMIT 1`,
      [userId, eventType === 'club_training' ? null : (teamId || null)]
    );
    return rows.length > 0 ? 'goalie' : 'skater';
  } catch {
    // Ошибка определения амплуа не должна ронять саму отметку: пишем «платит».
    return 'skater';
  }
}

// ── Разбор блока «Финансы» из тела запроса ──────────────────────────────────
// Возвращает только те колонки, которые клиент реально прислал: старый фронт
// шлёт один player_fee, и переключать ему режим события мы не должны.
// Ключи здесь — «канонические» имена колонок тренировок и собраний; для матча
// они переводятся на сторону через mapFeeColumnsToMatchSide.
export function parseFeeSettings(body = {}, { goalieAware = true } = {}) {
  const patch = {};
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  if ('player_fee' in body) {
    const v = num(body.player_fee);
    patch.cost = v === null || Number.isNaN(v) ? null : Math.round(v);
  }
  if ('cost_mode' in body && ['per_person', 'split'].includes(body.cost_mode)) {
    patch.cost_mode = body.cost_mode;
  }
  if ('total_cost' in body) {
    const v = num(body.total_cost);
    patch.total_cost = v === null || Number.isNaN(v) ? null : Math.max(Math.round(v), 0);
  }
  if (goalieAware && 'goalies_free' in body) {
    patch.goalies_free = body.goalies_free === true || body.goalies_free === 'true';
  }
  if ('cost_min_participants' in body) {
    const v = num(body.cost_min_participants);
    // CHECK в БД требует минимум 1: «показывать сразу».
    patch.cost_min_participants = v === null || !Number.isFinite(v) || v < 1 ? 1 : Math.round(v);
  }
  if ('attendance_deadline_hours' in body) {
    const v = num(body.attendance_deadline_hours);
    // NULL = дедлайна нет, снимать отметку можно до самого начала события.
    patch.attendance_deadline_hours = v === null || !Number.isFinite(v) || v < 0 ? null : Math.round(v);
  }
  return patch;
}

// Матч держит обе команды в одной строке, поэтому у каждой колонки своя сторона.
export function mapFeeColumnsToMatchSide(patch, isHome) {
  const side = isHome ? 'home' : 'away';
  const map = {
    cost: `${side}_player_fee`,
    cost_mode: `${side}_cost_mode`,
    total_cost: `${side}_total_cost`,
    goalies_free: `${side}_goalies_free`,
    cost_min_participants: `${side}_cost_min_participants`,
    attendance_deadline_hours: `${side}_attendance_deadline_hours`,
  };
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (map[key]) out[map[key]] = value;
  }
  return out;
}

// SET-часть UPDATE из объекта «колонка → значение».
export function buildFeeUpdate(patch, startIndex = 1) {
  const cols = Object.keys(patch);
  return {
    clause: cols.map((c, i) => `"${c}" = $${startIndex + i}`).join(', '),
    values: cols.map((c) => patch[c]),
    isEmpty: cols.length === 0,
  };
}

// ── Параметры взноса события ────────────────────────────────────────────────
// Для матча teamId обязателен: он выбирает сторону (хозяева/гости).
export async function getFeeContext(eventType, eventId, teamId = null) {
  if (isMatchEvent(eventType)) {
    const { rows } = await pool.query(
      `SELECT game_date AS event_date, home_team_id, cost_locked_at,
              home_cost_mode, away_cost_mode,
              home_total_cost, away_total_cost,
              home_goalies_free, away_goalies_free,
              home_cost_min_participants, away_cost_min_participants,
              home_attendance_deadline_hours, away_attendance_deadline_hours
       FROM "public"."games" WHERE id = $1`,
      [eventId]
    );
    if (!rows[0]) return null;
    const g = rows[0];
    const isHome = Number(g.home_team_id) === Number(teamId);
    return {
      eventDate: g.event_date,
      lockedAt: g.cost_locked_at,
      costMode: isHome ? g.home_cost_mode : g.away_cost_mode,
      totalCost: isHome ? g.home_total_cost : g.away_total_cost,
      goaliesFree: isHome ? g.home_goalies_free : g.away_goalies_free,
      minParticipants: isHome ? g.home_cost_min_participants : g.away_cost_min_participants,
      deadlineHours: isHome ? g.home_attendance_deadline_hours : g.away_attendance_deadline_hours,
    };
  }

  const cfg = EVENT_MAP[eventType];
  if (!cfg) return null;

  const { rows } = await pool.query(
    `SELECT ${cfg.dateCol} AS event_date, cost_locked_at, cost_mode, total_cost,
            ${cfg.goalieAware ? 'goalies_free' : 'false AS goalies_free'},
            cost_min_participants, attendance_deadline_hours
     FROM "public"."${cfg.table}" WHERE id = $1`,
    [eventId]
  );
  if (!rows[0]) return null;
  const e = rows[0];
  return {
    eventDate: e.event_date,
    lockedAt: e.cost_locked_at,
    costMode: e.cost_mode,
    totalCost: e.total_cost,
    goaliesFree: e.goalies_free,
    minParticipants: e.cost_min_participants,
    deadlineHours: e.attendance_deadline_hours,
  };
}

// ── Прошёл ли дедлайн свободного снятия отметки ─────────────────────────────
// NULL в attendance_deadline_hours = дедлайна нет, снимать можно до начала.
export function isAfterWithdrawDeadline(ctx) {
  if (!ctx || !ctx.eventDate) return false;
  if (ctx.deadlineHours === null || ctx.deadlineHours === undefined) return false;
  const deadline = new Date(ctx.eventDate).getTime() - Number(ctx.deadlineHours) * 3600_000;
  return Date.now() >= deadline;
}

// ── Число плательщиков события ──────────────────────────────────────────────
export async function countPayers(eventType, eventId, teamId = null, goaliesFree = true) {
  if (isMatchEvent(eventType)) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM team_game_attendance
       WHERE game_id = $1 AND team_id = $2 AND pay_role <> 'free'
         AND NOT ($3::boolean AND pay_role = 'goalie')`,
      [eventId, teamId, goaliesFree]
    );
    return rows[0]?.n || 0;
  }

  const cfg = EVENT_MAP[eventType];
  if (!cfg) return 0;

  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM "public"."${cfg.att}"
     WHERE ${cfg.fk} = $1 AND pay_role <> 'free'
       AND NOT ($2::boolean AND pay_role = 'goalie')`,
    [eventId, cfg.goalieAware ? goaliesFree : false]
  );
  return rows[0]?.n || 0;
}

// ── Хвост для push про отметку ──────────────────────────────────────────────
// «Иванов Иван отметился на тренировку 12.09, Арена — стоимость 300 ₽ с игрока».
// Пустую строку возвращаем всегда, когда цифру показывать нельзя: фиксированный
// взнос (он и так виден в карточке), сумма не назначена, событие бесплатное или
// плательщиков ещё меньше порога — иначе порог обходился бы через уведомления.
export async function describeSplitFee(eventType, eventId, teamId = null) {
  try {
    const ctx = await getFeeContext(eventType, eventId, teamId);
    if (!ctx || ctx.costMode !== 'split') return '';
    if (ctx.totalCost === null || ctx.totalCost === undefined) return '';
    if (Number(ctx.totalCost) === 0) return '';

    const payers = await countPayers(eventType, eventId, teamId, ctx.goaliesFree);
    if (payers < Math.max(Number(ctx.minParticipants) || 1, 1)) return '';

    const perHead = Math.ceil(Number(ctx.totalCost) / payers);
    const who = eventType === 'team_meeting' || eventType === 'club_meeting' ? 'участника' : 'игрока';
    return ` — стоимость ${perHead.toLocaleString('ru-RU')} ₽ с ${who}`;
  } catch {
    return '';
  }
}

// ── Фиксация стоимости после события ────────────────────────────────────────
// Пока событие не прошло, доля живая и пересчитывается на каждый показ карточки.
// После начала цена застывает: доли раскладываются по отметкам в final_fee, а на
// событии проставляется cost_locked_at. Дальше состав отметок на деньги не влияет.
//
// Фиксируем только split: у фиксированного взноса сумма и так не зависит от состава.
// Крутится по расписанию из server.js — на чтении календаря этого делать нельзя,
// пять таких запросов на каждое открытие расписания стоят слишком дорого.
export async function lockPastEventFees() {
  for (const cfg of Object.values(EVENT_MAP)) {
    const goalieExpr = cfg.goalieAware ? 'e.goalies_free' : 'false';
    await pool.query(`
      WITH due AS (
        SELECT e.id, e.total_cost, ${goalieExpr} AS goalies_free,
               (SELECT count(*) FROM "public"."${cfg.att}" a
                 WHERE a.${cfg.fk} = e.id AND a.pay_role <> 'free'
                   AND NOT (${goalieExpr} AND a.pay_role = 'goalie'))::int AS payers
        FROM "public"."${cfg.table}" e
        WHERE e.cost_mode = 'split'
          AND e.total_cost IS NOT NULL
          AND e.cost_locked_at IS NULL
          AND e.${cfg.dateCol} < NOW()
        LIMIT 100
      ),
      upd AS (
        UPDATE "public"."${cfg.att}" a
        SET final_fee = CASE
              WHEN a.pay_role = 'free' THEN 0
              WHEN a.pay_role = 'goalie' AND d.goalies_free THEN 0
              WHEN d.payers = 0 THEN 0
              ELSE ceil(d.total_cost::numeric / d.payers)
            END
        FROM due d
        WHERE a.${cfg.fk} = d.id
        RETURNING 1
      )
      UPDATE "public"."${cfg.table}" t SET cost_locked_at = NOW()
      FROM due d WHERE t.id = d.id
    `);
  }

  // Матч: одна строка на две команды, поэтому стороны сначала разворачиваем в
  // две записи и считаем каждую отдельно. cost_locked_at общий — событие прошло
  // для обеих команд сразу.
  await pool.query(`
    WITH due AS (
      SELECT g.id, g.home_team_id, g.away_team_id,
             g.home_cost_mode, g.away_cost_mode,
             g.home_total_cost, g.away_total_cost,
             g.home_goalies_free, g.away_goalies_free
      FROM "public"."games" g
      WHERE g.cost_locked_at IS NULL
        AND g.game_date < NOW()
        AND ((g.home_cost_mode = 'split' AND g.home_total_cost IS NOT NULL)
          OR (g.away_cost_mode = 'split' AND g.away_total_cost IS NOT NULL))
      LIMIT 100
    ),
    sides AS (
      SELECT d.id AS game_id, d.home_team_id AS team_id, d.home_cost_mode AS cost_mode,
             d.home_total_cost AS total_cost, d.home_goalies_free AS goalies_free FROM due d
      UNION ALL
      SELECT d.id, d.away_team_id, d.away_cost_mode, d.away_total_cost, d.away_goalies_free FROM due d
    ),
    counted AS (
      SELECT s.*,
             (SELECT count(*) FROM "public"."team_game_attendance" a
               WHERE a.game_id = s.game_id AND a.team_id = s.team_id
                 AND a.pay_role <> 'free'
                 AND NOT (s.goalies_free AND a.pay_role = 'goalie'))::int AS payers
      FROM sides s
      WHERE s.cost_mode = 'split' AND s.total_cost IS NOT NULL AND s.team_id IS NOT NULL
    ),
    upd AS (
      UPDATE "public"."team_game_attendance" a
      SET final_fee = CASE
            WHEN a.pay_role = 'free' THEN 0
            WHEN a.pay_role = 'goalie' AND c.goalies_free THEN 0
            WHEN c.payers = 0 THEN 0
            ELSE ceil(c.total_cost::numeric / c.payers)
          END
      FROM counted c
      WHERE a.game_id = c.game_id AND a.team_id = c.team_id
      RETURNING 1
    )
    UPDATE "public"."games" g SET cost_locked_at = NOW()
    FROM due d WHERE g.id = d.id
  `);
}
