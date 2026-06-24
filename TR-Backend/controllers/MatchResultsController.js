import pool from '../config/db.js';
import { sendPushToTeamExcept, getMatchInfo } from '../services/pushService.js';

// Гард на запись: матч существует, неофициальный, инициатор — текущая команда,
// время матча уже наступило. Используется во всех write-эндпоинтах результатов.
// Возвращает роль редактора: 'initiator' (полный доступ) или 'opponent'
// (только свои данные — если матч-флаг opponent_can_edit включён). Конкретные
// ограничения для соперника навешиваются в самих обработчиках: add/delete/
// regulation/goalie-log — только инициатору; updateEvent/goalie-shots/publish —
// обоим, но со скоупом «своя команда».
const assertEditable = async (client, gameId, teamId) => {
  const { rows } = await client.query(
    `SELECT g.game_type, g.status, g.initiator_team_id, g.game_date,
            g.home_team_id, g.away_team_id,
            COALESCE(gt.opponent_can_edit, true) AS opponent_can_edit
       FROM "public"."games" g
       LEFT JOIN "public"."game_timers" gt ON gt.game_id = g.id
      WHERE g.id = $1`,
    [gameId]
  );
  if (rows.length === 0) {
    return { ok: false, code: 404, error: 'Матч не найден' };
  }
  const g = rows[0];
  if (g.game_type === 'official') {
    return { ok: false, code: 400, error: 'Для официальных матчей результаты ведутся через лигу' };
  }
  if (new Date(g.game_date) > new Date()) {
    return { ok: false, code: 400, error: 'Результаты можно вносить только после начала матча' };
  }
  const tid = Number(teamId);
  if (Number(g.initiator_team_id) === tid) {
    return { ok: true, role: 'initiator', game: g };
  }
  const isParticipant = Number(g.home_team_id) === tid || Number(g.away_team_id) === tid;
  if (isParticipant && g.opponent_can_edit) {
    return { ok: true, role: 'opponent', game: g };
  }
  return { ok: false, code: 403, error: 'Нет прав на редактирование результатов этого матча' };
};

// ── Журнал вратарей: combined-строки ↔ независимые таймлайны сторон ──────────
// Нужно, чтобы соперник мог менять только СВОЮ колонку (home/away), не затирая
// вратаря другой команды. Логика зеркалит фронтовый goalieLogModel.js.
function decodeGoalieLog(rows) {
  const sorted = (rows || [])
    .map(r => ({ t: Number(r.time_seconds) || 0, h: r.home_goalie_id ?? null, a: r.away_goalie_id ?? null }))
    .sort((x, y) => x.t - y.t);
  const home = [];
  const away = [];
  let ph; let pa;
  for (const r of sorted) {
    if (ph === undefined || r.h !== ph) { home.push({ time_seconds: r.t, goalie_id: r.h }); ph = r.h; }
    if (pa === undefined || r.a !== pa) { away.push({ time_seconds: r.t, goalie_id: r.a }); pa = r.a; }
  }
  return { home, away };
}
function sampleGoalieAt(timeline, t) {
  let v = null;
  for (const p of timeline) { if (p.time_seconds <= t) v = p.goalie_id; else break; }
  return v;
}
function encodeGoalieLog(model) {
  const home = [...(model.home || [])].sort((a, b) => a.time_seconds - b.time_seconds);
  const away = [...(model.away || [])].sort((a, b) => a.time_seconds - b.time_seconds);
  const times = Array.from(new Set([...home, ...away].map(p => p.time_seconds))).sort((a, b) => a - b);
  return times.map(t => ({
    time_seconds: t,
    home_goalie_id: sampleGoalieAt(home, t),
    away_goalie_id: sampleGoalieAt(away, t),
  }));
}

// =============================================================================
// ЗАЯВКИ НА МАТЧ — игроки обеих команд из game_rosters (is_in_lineup=true)
// Используется в EditResultMatch для выбора автора / ассистентов / +/- и
// в EditGoalieStatMatch для выбора вратарей.
// =============================================================================
export const getMatchRosters = async (req, res) => {
  try {
    const gameId = Number(req.params.eventId);

    const { rows: gameRows } = await pool.query(
      'SELECT home_team_id, away_team_id FROM "public"."games" WHERE id = $1',
      [gameId]
    );
    if (gameRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const { home_team_id, away_team_id } = gameRows[0];

    const { rows } = await pool.query(`
      SELECT gr.team_id, gr.player_id, gr.jersey_number, gr.position_in_line,
             gr.is_captain, gr.is_assistant,
             u.first_name, u.last_name
      FROM "public"."game_rosters" gr
      JOIN "public"."users" u ON u.id = gr.player_id
      WHERE gr.game_id = $1 AND gr.is_in_lineup = true
      ORDER BY gr.team_id ASC, gr.jersey_number ASC NULLS LAST, u.last_name ASC
    `, [gameId]);

    const { rows: regRows } = await pool.query(
      'SELECT period_length, ot_length, periods_count, opponent_can_edit FROM "public"."game_timers" WHERE game_id = $1',
      [gameId]
    );
    const reg = regRows[0] || {};
    const regulation = {
      period_length: Number(reg.period_length) || 20,
      ot_length:     Number(reg.ot_length)     || 0,
      periods_count: Number(reg.periods_count) || 3,
      // Разрешено ли сопернику редактировать свою статистику (дефолт — да).
      opponent_can_edit: reg.opponent_can_edit ?? true,
    };

    res.json({
      success: true,
      home_team_id,
      away_team_id,
      home: rows.filter(r => Number(r.team_id) === Number(home_team_id)),
      away: rows.filter(r => Number(r.team_id) === Number(away_team_id)),
      regulation,
    });
  } catch (err) {
    console.error('[Match Results: getRosters]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при получении заявок' });
  }
};

// =============================================================================
// ДОБАВЛЕНИЕ СОБЫТИЯ В ПРОТОКОЛ (гол / штраф / нереализованный буллит)
// Для гола опционально пишет +/- (массивы plus_minus_home / plus_minus_away)
// =============================================================================
export const addMatchEvent = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const teamId = Number(req.body?.teamId);
  if (!teamId || !gameId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId и eventId обязательны' });
  }

  const {
    period, time_seconds, event_type, team_id,
    scorer_id, assist1_id, assist2_id, goal_strength, against_goalie_id, from_shot,
    penalty_player_id, penalty_violation, penalty_minutes, penalty_class, penalty_end_time,
    plus_minus_home, plus_minus_away
  } = req.body || {};

  if (!['1','2','3','OT'].includes(String(period))) {
    return res.status(400).json({ success: false, error: 'Некорректный период (допустимо 1/2/3/OT)' });
  }
  if (!['goal','penalty','failed_ps'].includes(event_type)) {
    return res.status(400).json({ success: false, error: 'Некорректный тип события' });
  }
  if (time_seconds == null || Number(time_seconds) < 0) {
    return res.status(400).json({ success: false, error: 'Некорректное время события' });
  }
  if (!team_id) {
    return res.status(400).json({ success: false, error: 'Не указана команда события' });
  }

  // from_shot имеет смысл только для голов; для прочих типов — true (default БД).
  const fromShotValue = event_type === 'goal' ? (from_shot !== false) : true;

  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });
    if (check.role !== 'initiator') {
      return res.status(403).json({ success: false, error: 'Добавлять события может только команда-инициатор' });
    }

    await client.query('BEGIN');

    const ins = await client.query(`
      INSERT INTO "public"."game_events" (
        game_id, period, time_seconds, event_type, team_id,
        scorer_id, assist1_id, assist2_id, goal_strength,
        penalty_player_id, penalty_violation, penalty_minutes, penalty_class, penalty_end_time,
        against_goalie_id, from_shot
      ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14, $15,$16)
      RETURNING id
    `, [
      gameId, String(period), Number(time_seconds), event_type, Number(team_id),
      scorer_id || null, assist1_id || null, assist2_id || null, goal_strength || null,
      penalty_player_id || null, penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null,
      against_goalie_id || null, fromShotValue
    ]);

    const newEventId = ins.rows[0].id;

    // +/- только для голов
    if (event_type === 'goal' && (Array.isArray(plus_minus_home) || Array.isArray(plus_minus_away))) {
      const homeTeamId = check.game.home_team_id;
      const awayTeamId = check.game.away_team_id;
      const tuples = [];
      (plus_minus_home || []).forEach(pid => tuples.push([newEventId, homeTeamId, pid]));
      (plus_minus_away || []).forEach(pid => tuples.push([newEventId, awayTeamId, pid]));

      if (tuples.length > 0) {
        const valuesSql = tuples.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',');
        await client.query(
          `INSERT INTO "public"."game_plus_minus" (event_id, team_id, player_id) VALUES ${valuesSql}`,
          tuples.flat()
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, eventRowId: newEventId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Match Results: addEvent]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при добавлении события матча' });
  } finally {
    client.release();
  }
};

// =============================================================================
// РЕДАКТИРОВАНИЕ СОБЫТИЯ (полная замена: UPDATE game_events + переписываем +/-)
// =============================================================================
export const updateMatchEvent = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const rowId  = Number(req.params.rowId);
  const teamId = Number(req.body?.teamId);
  if (!teamId || !gameId || !rowId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId, eventId и rowId обязательны' });
  }

  const {
    period, time_seconds, event_type, team_id,
    scorer_id, assist1_id, assist2_id, goal_strength, against_goalie_id, from_shot,
    penalty_player_id, penalty_violation, penalty_minutes, penalty_class, penalty_end_time,
    plus_minus_home, plus_minus_away
  } = req.body || {};

  if (!['1','2','3','OT'].includes(String(period))) {
    return res.status(400).json({ success: false, error: 'Некорректный период' });
  }
  if (!['goal','penalty','failed_ps'].includes(event_type)) {
    return res.status(400).json({ success: false, error: 'Некорректный тип события' });
  }
  if (time_seconds == null || Number(time_seconds) < 0) {
    return res.status(400).json({ success: false, error: 'Некорректное время события' });
  }
  if (!team_id) {
    return res.status(400).json({ success: false, error: 'Не указана команда события' });
  }

  const fromShotValue = event_type === 'goal' ? (from_shot !== false) : true;

  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });

    // Тянем существующее событие целиком — для проверки и для скоупа соперника
    // (соперник не может менять время/период/тип/ситуацию/«с броска»).
    const existsRes = await client.query(
      'SELECT * FROM "public"."game_events" WHERE id = $1 AND game_id = $2',
      [rowId, gameId]
    );
    if (existsRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }
    const existing = existsRes.rows[0];

    const homeTeamId = check.game.home_team_id;
    const awayTeamId = check.game.away_team_id;
    const myTeamId = Number(teamId);

    let vals;          // параметры UPDATE в порядке SET ниже
    let pmReplaceTeam; // null = заменить весь +/- (инициатор); иначе только эта команда

    if (check.role === 'opponent') {
      if (existing.event_type !== 'goal' && existing.event_type !== 'penalty') {
        return res.status(403).json({ success: false, error: 'Это событие недоступно для редактирования' });
      }
      if (existing.event_type === 'penalty' && Number(existing.team_id) !== myTeamId) {
        return res.status(403).json({ success: false, error: 'Можно редактировать только штрафы своей команды' });
      }

      const oppScoredGoal = existing.event_type === 'goal' && Number(existing.team_id) === myTeamId;
      const isOwnPenalty  = existing.event_type === 'penalty';

      // Гол: автор/ассистенты — только если забили мы. Штраф: свой нарушитель.
      const newScorer  = isOwnPenalty ? (penalty_player_id || scorer_id || null)
                        : oppScoredGoal ? (scorer_id || null)
                        : existing.scorer_id;
      const newAssist1 = oppScoredGoal ? (assist1_id || null) : existing.assist1_id;
      const newAssist2 = oppScoredGoal ? (assist2_id || null) : existing.assist2_id;
      const newPenaltyPlayer = isOwnPenalty ? (penalty_player_id || scorer_id || null) : existing.penalty_player_id;

      vals = [
        existing.period, existing.time_seconds, existing.event_type, existing.team_id,
        newScorer, newAssist1, newAssist2, existing.goal_strength,
        newPenaltyPlayer, existing.penalty_violation, existing.penalty_minutes, existing.penalty_class, existing.penalty_end_time,
        existing.against_goalie_id, rowId, existing.from_shot,
      ];
      pmReplaceTeam = myTeamId; // соперник правит только своё +/-
    } else {
      vals = [
        String(period), Number(time_seconds), event_type, Number(team_id),
        scorer_id || null, assist1_id || null, assist2_id || null, goal_strength || null,
        penalty_player_id || null, penalty_violation || null, penalty_minutes || null, penalty_class || null, penalty_end_time || null,
        against_goalie_id || null, rowId, fromShotValue,
      ];
      pmReplaceTeam = null;
    }

    await client.query('BEGIN');

    await client.query(`
      UPDATE "public"."game_events" SET
        period            = $1,
        time_seconds      = $2,
        event_type        = $3,
        team_id           = $4,
        scorer_id         = $5,
        assist1_id        = $6,
        assist2_id        = $7,
        goal_strength     = $8,
        penalty_player_id = $9,
        penalty_violation = $10,
        penalty_minutes   = $11,
        penalty_class     = $12,
        penalty_end_time  = $13,
        against_goalie_id = $14,
        from_shot         = $16
       WHERE id = $15
    `, vals);

    // +/- : инициатор — полная замена; соперник — только своя сторона.
    const isGoalNow = (check.role === 'opponent' ? existing.event_type : event_type) === 'goal';

    if (pmReplaceTeam == null) {
      await client.query('DELETE FROM "public"."game_plus_minus" WHERE event_id = $1', [rowId]);
      if (isGoalNow && (Array.isArray(plus_minus_home) || Array.isArray(plus_minus_away))) {
        const tuples = [];
        (plus_minus_home || []).forEach(pid => tuples.push([rowId, homeTeamId, pid]));
        (plus_minus_away || []).forEach(pid => tuples.push([rowId, awayTeamId, pid]));
        if (tuples.length > 0) {
          const valuesSql = tuples.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',');
          await client.query(
            `INSERT INTO "public"."game_plus_minus" (event_id, team_id, player_id) VALUES ${valuesSql}`,
            tuples.flat()
          );
        }
      }
    } else {
      await client.query('DELETE FROM "public"."game_plus_minus" WHERE event_id = $1 AND team_id = $2', [rowId, pmReplaceTeam]);
      if (isGoalNow) {
        const mySide = Number(pmReplaceTeam) === Number(homeTeamId) ? (plus_minus_home || []) : (plus_minus_away || []);
        if (mySide.length > 0) {
          const valuesSql = mySide.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',');
          const tuples = mySide.flatMap(pid => [rowId, pmReplaceTeam, pid]);
          await client.query(
            `INSERT INTO "public"."game_plus_minus" (event_id, team_id, player_id) VALUES ${valuesSql}`,
            tuples
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Match Results: updateEvent]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при обновлении события матча' });
  } finally {
    client.release();
  }
};

// =============================================================================
// УДАЛЕНИЕ СОБЫТИЯ ИЗ ПРОТОКОЛА (game_plus_minus уходит каскадом)
// =============================================================================
export const deleteMatchEvent = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const rowId = Number(req.params.rowId);
  const teamId = Number(req.query?.teamId || req.body?.teamId);
  if (!teamId || !gameId || !rowId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId, eventId и rowId обязательны' });
  }
  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });
    if (check.role !== 'initiator') {
      return res.status(403).json({ success: false, error: 'Удалять события может только команда-инициатор' });
    }

    const del = await client.query(
      'DELETE FROM "public"."game_events" WHERE id = $1 AND game_id = $2',
      [rowId, gameId]
    );
    if (del.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Match Results: deleteEvent]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при удалении события матча' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ЖУРНАЛ СМЕН ВРАТАРЕЙ (time_seconds — от начала МАТЧА)
// =============================================================================
export const getGoalieLog = async (req, res) => {
  try {
    const gameId = Number(req.params.eventId);
    const { rows } = await pool.query(`
      SELECT id, time_seconds, home_goalie_id, away_goalie_id
      FROM "public"."game_goalie_log"
      WHERE game_id = $1
      ORDER BY time_seconds ASC, id ASC
    `, [gameId]);
    res.json({ success: true, log: rows });
  } catch (err) {
    console.error('[Match Results: getGoalieLog]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при получении журнала вратарей' });
  }
};

// Bulk-PUT: полностью переписывает журнал смен вратарей матча.
// body.entries: [{ time_seconds, home_goalie_id|null, away_goalie_id|null }]
export const saveGoalieLog = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const teamId = Number(req.body?.teamId);
  if (!teamId || !gameId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId и eventId обязательны' });
  }
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries) {
    return res.status(400).json({ success: false, error: 'Не передан массив entries' });
  }
  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });

    await client.query('BEGIN');

    // Соперник правит только СВОЮ колонку журнала — вратаря другой команды берём
    // из текущей БД, чтобы соперник не мог его перетереть устаревшим запросом.
    let finalEntries = entries;
    if (check.role === 'opponent') {
      const mySide = Number(check.game.home_team_id) === Number(teamId) ? 'home' : 'away';
      const otherSide = mySide === 'home' ? 'away' : 'home';
      const { rows: existingRows } = await client.query(
        'SELECT time_seconds, home_goalie_id, away_goalie_id FROM "public"."game_goalie_log" WHERE game_id = $1',
        [gameId]
      );
      const existing = decodeGoalieLog(existingRows);
      const incoming = decodeGoalieLog(entries);
      finalEntries = encodeGoalieLog({ [mySide]: incoming[mySide], [otherSide]: existing[otherSide] });
    }

    await client.query('DELETE FROM "public"."game_goalie_log" WHERE game_id = $1', [gameId]);

    if (finalEntries.length > 0) {
      const valuesSql = finalEntries.map((_, i) => `($1, $${i*3+2}, $${i*3+3}, $${i*3+4})`).join(',');
      const flat = finalEntries.flatMap(e => [
        Number(e.time_seconds) || 0,
        e.home_goalie_id || null,
        e.away_goalie_id || null
      ]);
      await client.query(
        `INSERT INTO "public"."game_goalie_log" (game_id, time_seconds, home_goalie_id, away_goalie_id) VALUES ${valuesSql}`,
        [gameId, ...flat]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Match Results: saveGoalieLog]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при сохранении журнала вратарей' });
  } finally {
    client.release();
  }
};

// =============================================================================
// БРОСКИ В СТВОР ВРАТАРЮ по вратарю и периоду
// shots_count хранит ВСЕ броски в створ на данного вратаря за период
// (включая ставшие голами с броска). Отражённые броски (saves) вычисляются
// на лету в агрегаторах статистики: saves = shots_count − (голы against
// этого вратаря с from_shot = true).
// =============================================================================
export const getGoalieShots = async (req, res) => {
  try {
    const gameId = Number(req.params.eventId);
    const { rows } = await pool.query(`
      SELECT id, goalie_id, team_id, period, shots_count
      FROM "public"."game_shots_by_goalie"
      WHERE game_id = $1
      ORDER BY period ASC, team_id ASC
    `, [gameId]);
    res.json({ success: true, shots: rows });
  } catch (err) {
    console.error('[Match Results: getGoalieShots]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при получении бросков вратарей' });
  }
};

// Bulk-PUT: полностью переписывает таблицу бросков в створ вратарю для матча.
// body.entries: [{ goalie_id|null, team_id, period, shots_count }]
// shots_count = ВСЕ броски в створ вратарю (не только отражённые).
export const saveGoalieShots = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const teamId = Number(req.body?.teamId);
  if (!teamId || !gameId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId и eventId обязательны' });
  }
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries) {
    return res.status(400).json({ success: false, error: 'Не передан массив entries' });
  }
  for (const e of entries) {
    if (!e.team_id || !['1','2','3','OT'].includes(String(e.period))) {
      return res.status(400).json({ success: false, error: 'Каждая запись должна иметь team_id и допустимый period (1/2/3/OT)' });
    }
  }
  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });

    // Соперник может вводить броски только по своему вратарю (своей команде).
    if (check.role === 'opponent') {
      const bad = entries.find(e => Number(e.team_id) !== Number(teamId));
      if (bad) {
        return res.status(403).json({ success: false, error: 'Можно вводить броски только по своему вратарю' });
      }
    }

    await client.query('BEGIN');
    if (check.role === 'opponent') {
      // Чужие броски не трогаем — переписываем только свою команду.
      await client.query('DELETE FROM "public"."game_shots_by_goalie" WHERE game_id = $1 AND team_id = $2', [gameId, Number(teamId)]);
    } else {
      await client.query('DELETE FROM "public"."game_shots_by_goalie" WHERE game_id = $1', [gameId]);
    }

    if (entries.length > 0) {
      const valuesSql = entries.map((_, i) => `($1, $${i*4+2}, $${i*4+3}, $${i*4+4}, $${i*4+5})`).join(',');
      const flat = entries.flatMap(e => [
        e.goalie_id || null,
        Number(e.team_id),
        String(e.period),
        Number(e.shots_count) || 0
      ]);
      await client.query(
        `INSERT INTO "public"."game_shots_by_goalie" (game_id, goalie_id, team_id, period, shots_count) VALUES ${valuesSql}`,
        [gameId, ...flat]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Match Results: saveGoalieShots]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при сохранении бросков вратарей' });
  } finally {
    client.release();
  }
};

// =============================================================================
// РЕГЛАМЕНТ МАТЧА — period_length, ot_length, periods_count (хранится в game_timers).
// При изменении АВТОМАТИЧЕСКИ пересчитывает period/time_seconds всех game_events
// этого матча так, чтобы абсолютное время «от начала матча» сохранилось.
// События, вылетающие за новый регламент, клипуются к концу последнего ОТ
// (или последнего периода, если ОТ отсутствует).
// =============================================================================
export const saveRegulation = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const teamId = Number(req.body?.teamId);
  if (!teamId || !gameId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId и eventId обязательны' });
  }

  const period_length = Math.floor(Number(req.body?.period_length));
  const ot_length     = Math.floor(Number(req.body?.ot_length));
  const periods_count = Math.floor(Number(req.body?.periods_count));
  // По умолчанию соперник может редактировать свою статистику.
  const opponent_can_edit = req.body?.opponent_can_edit === undefined ? true : !!req.body.opponent_can_edit;

  if (!Number.isFinite(period_length) || period_length < 1) {
    return res.status(400).json({ success: false, error: 'Длина периода должна быть ≥ 1 минуты' });
  }
  if (!Number.isFinite(ot_length) || ot_length < 0) {
    return res.status(400).json({ success: false, error: 'Длина овертайма не может быть отрицательной' });
  }
  if (!Number.isFinite(periods_count) || periods_count < 1 || periods_count > 3) {
    return res.status(400).json({ success: false, error: 'Количество периодов должно быть от 1 до 3 (ограничено схемой game_events)' });
  }

  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });
    if (check.role !== 'initiator') {
      return res.status(403).json({ success: false, error: 'Настройки матча меняет только команда-инициатор' });
    }

    await client.query('BEGIN');

    // Старый регламент (если в game_timers пусто — берём дефолты)
    const { rows: oldRows } = await client.query(
      'SELECT period_length, ot_length, periods_count FROM "public"."game_timers" WHERE game_id = $1',
      [gameId]
    );
    const old = oldRows[0] || {};
    const oldPlSec = (Number(old.period_length) || 20) * 60;
    const oldOtSec = (Number(old.ot_length)     ||  0) * 60;
    const oldPc    =  Number(old.periods_count) ||  3;
    const oldRegularSec = oldPc * oldPlSec;

    const newPlSec = period_length * 60;
    const newOtSec = ot_length * 60;
    const newRegularSec = periods_count * newPlSec;
    const newTotalSec   = newRegularSec + newOtSec;
    const hasOt = newOtSec > 0;

    // Пересчитываем все события — но не трогаем SO (если вдруг кто-то завёл).
    const { rows: events } = await client.query(
      'SELECT id, period, time_seconds FROM "public"."game_events" WHERE game_id = $1',
      [gameId]
    );

    for (const ev of events) {
      if (ev.period === 'SO') continue;

      let total;
      if (ev.period === 'OT') {
        total = oldRegularSec + Number(ev.time_seconds);
      } else {
        const idx = parseInt(ev.period, 10) || 1;
        total = (idx - 1) * oldPlSec + Number(ev.time_seconds);
      }

      let newPeriod, newTimeSec;
      if (total <= newRegularSec) {
        // Влезает в регулярные периоды
        let idx = Math.max(1, Math.min(periods_count, Math.ceil(total / newPlSec)));
        if (total === 0) idx = 1;
        newPeriod = String(idx);
        newTimeSec = total - (idx - 1) * newPlSec;
      } else if (hasOt && total <= newTotalSec) {
        newPeriod = 'OT';
        newTimeSec = total - newRegularSec;
      } else {
        // Вылетело за конец — клипуем к концу ОТ (если есть) или концу последнего периода
        if (hasOt) {
          newPeriod = 'OT';
          newTimeSec = newOtSec;
        } else {
          newPeriod = String(periods_count);
          newTimeSec = newPlSec;
        }
      }

      await client.query(
        'UPDATE "public"."game_events" SET period = $1, time_seconds = $2 WHERE id = $3',
        [newPeriod, newTimeSec, ev.id]
      );
    }

    // UPSERT game_timers
    await client.query(`
      INSERT INTO "public"."game_timers" (game_id, period_length, ot_length, periods_count, opponent_can_edit)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (game_id) DO UPDATE
         SET period_length = EXCLUDED.period_length,
             ot_length     = EXCLUDED.ot_length,
             periods_count = EXCLUDED.periods_count,
             opponent_can_edit = EXCLUDED.opponent_can_edit
    `, [gameId, period_length, ot_length, periods_count, opponent_can_edit]);

    await client.query('COMMIT');
    res.json({ success: true, regulation: { period_length, ot_length, periods_count, opponent_can_edit } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Match Results: saveRegulation]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при сохранении регламента' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ПУБЛИКАЦИЯ РЕЗУЛЬТАТОВ — переводит статус в finished
// Доступно из finished_no_result и scheduled (на случай если ленивый апдейт
// статуса ещё не сработал в этой сессии).
// =============================================================================
export const publishMatchResults = async (req, res) => {
  const gameId = Number(req.params.eventId);
  const teamId = Number(req.body?.teamId);
  if (!teamId || !gameId) {
    return res.status(400).json({ success: false, error: 'Параметры teamId и eventId обязательны' });
  }
  const client = await pool.connect();
  try {
    const check = await assertEditable(client, gameId, teamId);
    if (!check.ok) return res.status(check.code).json({ success: false, error: check.error });

    // При публикации пересчитываем счёт из game_events (event_type='goal').
    // Так избегаем рассинхрона: home_score/away_score всегда отражают сохранённые голы.
    const upd = await client.query(`
      UPDATE "public"."games" g
         SET status = 'finished',
             home_score = COALESCE((
               SELECT COUNT(*)::int FROM "public"."game_events" ge
                WHERE ge.game_id = g.id AND ge.event_type = 'goal' AND ge.team_id = g.home_team_id
             ), 0),
             away_score = COALESCE((
               SELECT COUNT(*)::int FROM "public"."game_events" ge
                WHERE ge.game_id = g.id AND ge.event_type = 'goal' AND ge.team_id = g.away_team_id
             ), 0)
       WHERE g.id = $1
         AND g.game_type <> 'official'
         AND g.status IN ('finished_no_result', 'scheduled')
       RETURNING id, status, home_score, away_score
    `, [gameId]);

    if (upd.rowCount === 0) {
      return res.status(400).json({ success: false, error: 'Невозможно опубликовать матч в текущем статусе' });
    }

    const { home_score, away_score } = upd.rows[0];

    res.json({
      success: true,
      status: upd.rows[0].status,
      home_score,
      away_score,
    });
  } catch (err) {
    console.error('[Match Results: publish]', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера при публикации результатов' });
  } finally {
    client.release();
  }
};
