import pool from '../config/db.js';
import { checkPermissionInternal } from '../utils/checkPermission.js';
import { DEADLINES, PERMISSIONS } from '../utils/permissions.js';
import { sendPushToTeamExcept, getMatchInfo } from '../services/pushService.js';

// Матч считается начавшимся, когда в протоколе появились события: с этого момента
// состав трогать нельзя — на строки заявки уже ссылается статистика.
const isMatchStarted = async (client, eventId) => {
  const { rowCount } = await client.query(`
    SELECT 1 FROM game_events WHERE game_id = $1
    UNION
    SELECT 1 FROM game_goalie_log WHERE game_id = $1
    UNION
    SELECT 1 FROM game_plus_minus gpm JOIN game_events ge ON gpm.event_id = ge.id WHERE ge.game_id = $1
    LIMIT 1
  `, [eventId]);
  return rowCount > 0;
};

// Подавала ли команда заявку. Резервные вратари не в счёт: их дописывает лига,
// и сами по себе они не означают, что команда что-то отправляла.
const hasSubmittedRoster = async (client, eventId, teamId) => {
  const { rowCount } = await client.query(
    `SELECT 1 FROM game_rosters WHERE game_id = $1 AND team_id = $2 AND is_reserve_goalie IS NOT TRUE LIMIT 1`,
    [eventId, teamId]
  );
  return rowCount > 0;
};

// ─────────────────────────── АВТОЗАЯВКА ПО ЯВКЕ ───────────────────────────
// Команда может отправить заявку на матч, не рисуя расстановку: тогда состав берётся
// из отметившихся, а амплуа — из заявки на сезон (в товарищеских матчах из состава
// команды). Формация при этом остаётся пустой: расстановку команда пропустила
// сознательно, и рисовать звенья за неё не надо.
const AUTO_FORWARD_SLOTS = ['LW', 'C', 'RW'];
const AUTO_DEFENSE_SLOTS = ['LD', 'RD'];

// Потолок официальной заявки лиги. Лишние отсекаются по алфавиту — в том порядке,
// в каком их отдал запрос явки. У товарищеских матчей потолка нет.
const OFFICIAL_SKATERS_LIMIT = 20;
const OFFICIAL_GOALIES_LIMIT = 2;

// Отметившиеся на матч. withdrawn_at — снявшиеся уже после дедлайна: они остаются
// плательщиками взноса, но на матч не идут, поэтому в заявку не попадают.
const loadAttendanceForRoster = async (client, { eventId, teamId, gameType, divisionId }) => {
  if (gameType === 'official' && divisionId) {
    // Дисквалифицированных лига в протокол не пускает — не пускаем и мы. Отметиться
    // они не могут, но наказание могло прилететь уже после отметки.
    const { rows } = await client.query(`
      SELECT u.id AS player_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
        FROM team_game_attendance tga
        JOIN users u ON u.id = tga.user_id
        JOIN tournament_teams tt ON tt.team_id = tga.team_id AND tt.division_id = $3
        JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id AND tr.player_id = u.id
             AND tr.period_end IS NULL AND tr.application_status = 'approved'
        JOIN divisions d ON d.id = tt.division_id
        JOIN seasons s ON s.id = d.season_id
       WHERE tga.game_id = $1 AND tga.team_id = $2 AND tga.withdrawn_at IS NULL
         AND json_array_length(user_active_disqualifications(u.id, s.league_id)) = 0
       ORDER BY u.last_name ASC, u.first_name ASC
    `, [eventId, teamId, divisionId]);
    return rows;
  }

  const { rows } = await client.query(`
    SELECT u.id AS player_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
      FROM team_game_attendance tga
      JOIN users u ON u.id = tga.user_id
      JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tga.team_id AND tm.left_at IS NULL
      JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
     WHERE tga.game_id = $1 AND tga.team_id = $2 AND tga.withdrawn_at IS NULL
     ORDER BY u.last_name ASC, u.first_name ASC
  `, [eventId, teamId]);
  return rows;
};

// Раскладка отметившихся по звеньям: защитники по двое (ЛЗ/ПЗ), нападающие по трое
// (ЛН/ЦН/ПН), вратари отдельными звеньями. Нумерация вратарских звеньев начинается с
// пятого — как в самой формации, — но всегда идёт после последнего звена полевых:
// в товарищеском матче их может набраться и больше четырёх звеньев.
const buildAutoRosterRows = (players, isOfficial) => {
  let goalies = players.filter(p => p.position === 'goalie');
  let skaters = players.filter(p => p.position !== 'goalie');

  if (isOfficial) {
    goalies = goalies.slice(0, OFFICIAL_GOALIES_LIMIT);
    skaters = skaters.slice(0, OFFICIAL_SKATERS_LIMIT);
  }

  const defense = skaters.filter(p => p.position === 'defense');
  const forwards = skaters.filter(p => p.position !== 'defense');

  const rows = [];
  forwards.forEach((p, i) => rows.push({
    ...p,
    line_number: Math.floor(i / AUTO_FORWARD_SLOTS.length) + 1,
    position_in_line: AUTO_FORWARD_SLOTS[i % AUTO_FORWARD_SLOTS.length],
  }));
  defense.forEach((p, i) => rows.push({
    ...p,
    line_number: Math.floor(i / AUTO_DEFENSE_SLOTS.length) + 1,
    position_in_line: AUTO_DEFENSE_SLOTS[i % AUTO_DEFENSE_SLOTS.length],
  }));

  const firstGoalieLine = Math.max(5, rows.reduce((max, r) => Math.max(max, r.line_number), 0) + 1);
  goalies.forEach((p, i) => rows.push({ ...p, line_number: firstGoalieLine + i, position_in_line: 'G' }));

  return rows;
};

// Состав, который даёт расстановка: номер, капитан и ассистент берутся из самой формации
// (их правит руководитель), а COALESCE подстраховывает строки, где они ещё не проставлены —
// тогда значения тянутся из заявки на сезон, а в товарищеских матчах из состава команды.
const formationRosterSelect = (isOfficial) => (
  isOfficial
    ? `
      SELECT tfg.player_id, tfg.line_number, tfg.position_in_line,
             COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
             COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
             COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant
        FROM team_formation_game tfg
        JOIN users u ON u.id = tfg.player_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        LEFT JOIN tournament_teams tt ON tt.team_id = $2 AND tt.division_id = $3
        LEFT JOIN tournament_rosters tr ON tr.player_id = u.id AND tr.tournament_team_id = tt.id
             AND tr.period_end IS NULL AND tr.application_status = 'approved'
       WHERE tfg.game_id = $1 AND tfg.team_id = $2
    `
    : `
      SELECT tfg.player_id, tfg.line_number, tfg.position_in_line,
             COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
             COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
             COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant
        FROM team_formation_game tfg
        JOIN users u ON u.id = tfg.player_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
       WHERE tfg.game_id = $1 AND tfg.team_id = $2
    `
);

/**
 * Состав, который должна содержать заявка прямо сейчас: расстановка, а если её нет — явка.
 * Возвращает { source, rows }, где source — 'formation' | 'attendance'.
 *
 * Одна и та же функция кормит и сборку заявки, и сравнение с уже отправленной: иначе
 * «отправлено» и «пересобрано» разъехались бы при первой же правке одного из путей.
 */
const expectedRosterRows = async (client, { eventId, teamId, gameType, divisionId }) => {
  const isOfficial = gameType === 'official';

  const formation = await client.query(
    formationRosterSelect(isOfficial),
    isOfficial ? [eventId, teamId, divisionId] : [eventId, teamId]
  );
  if (formation.rowCount > 0) return { source: 'formation', rows: formation.rows };

  const players = await loadAttendanceForRoster(client, { eventId, teamId, gameType, divisionId });
  return { source: 'attendance', rows: buildAutoRosterRows(players, isOfficial) };
};

// Отпечаток строки заявки: сравниваем не только состав, но и звенья, номера и нашивки.
const rosterFingerprint = (r) => [
  String(r.player_id),
  String(r.line_number ?? ''),
  String(r.position_in_line ?? ''),
  String(r.jersey_number ?? ''),
  String(!!r.is_captain),
  String(!!r.is_assistant),
].join('|');

/**
 * Сверяет отправленную заявку с тем, что дал бы её источник сейчас.
 * Возвращает { submitted, inSync }.
 *
 * Резервные вратари из сравнения исключены: их дописывает лига в своём протоколе, у команды
 * их в расстановке нет и быть не может — иначе заявка выглядела бы разошедшейся всегда.
 *
 * Всё остальное расхождение — настоящее: либо тренер поменял расстановку, либо секретарь
 * лиги поправил протокол. В обоих случаях команда должна это видеть.
 */
const compareRosterWithSource = async (client, { eventId, teamId }) => {
  const gameQuery = await client.query(`SELECT game_type, division_id FROM games WHERE id = $1`, [eventId]);
  if (gameQuery.rowCount === 0) return { submitted: false, inSync: false };

  const { game_type, division_id } = gameQuery.rows[0];

  const existing = await client.query(
    `SELECT player_id, line_number, position_in_line, jersey_number, is_captain, is_assistant
       FROM game_rosters
      WHERE game_id = $1 AND team_id = $2 AND is_reserve_goalie IS NOT TRUE`,
    [eventId, teamId]
  );
  if (existing.rowCount === 0) return { submitted: false, inSync: false };

  const { rows: expected } = await expectedRosterRows(client, {
    eventId, teamId, gameType: game_type, divisionId: division_id,
  });
  if (expected.length !== existing.rowCount) return { submitted: true, inSync: false };

  const current = new Set(existing.rows.map(rosterFingerprint));
  return { submitted: true, inSync: expected.every(r => current.has(rosterFingerprint(r))) };
};

/**
 * Пересобирает официальную заявку команды на матч (game_rosters).
 * Источник — расстановка, если она есть, иначе явка (автозаявка).
 * Возвращает 'formation' | 'attendance' | null, если собирать не из чего.
 *
 * Работает внутри уже открытой транзакции вызывающего: её дёргают и отправка заявки,
 * и автопереотправка после правки состава, номеров, капитанства или явки.
 *
 * Резервных вратарей не трогаем: это строки лиги, команда их не заявляла и снести их
 * своей пересборкой не должна.
 */
const rebuildGameRoster = async (client, { eventId, teamId, gameType, divisionId }) => {
  await client.query(
    `DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2 AND is_reserve_goalie IS NOT TRUE`,
    [eventId, teamId]
  );

  const { source, rows } = await expectedRosterRows(client, { eventId, teamId, gameType, divisionId });
  if (rows.length === 0) return null;

  const values = [];
  const params = [];
  let i = 1;
  rows.forEach(r => {
    values.push(`($${i++}, $${i++}, $${i++}, true, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(
      eventId, teamId, r.player_id, r.line_number, r.position_in_line,
      r.jersey_number ?? null, r.is_captain || false, r.is_assistant || false
    );
  });

  await client.query(`
    INSERT INTO game_rosters (game_id, team_id, player_id, is_in_lineup, line_number, position_in_line, jersey_number, is_captain, is_assistant)
    VALUES ${values.join(', ')}
  `, params);

  return source;
};

/**
 * Идёт ли отправленная заявка следом за явкой.
 *
 * Проверять надо СТРОГО ДО изменения явки: после него состав заявки заведомо разойдётся
 * с новым списком отметившихся, и отличить «заявку по явке» от заявки, которую кто-то
 * правил руками, будет уже нельзя.
 *
 * true — заявка отправлена, расстановки нет, сроки не вышли, и её содержимое в точности
 * совпадает с автозаявкой по текущей явке. Значит она собрана из явки и с тех пор её
 * никто не менял: ни тренер, ни секретарь лиги в протоколе.
 */
export const isRosterFollowingAttendance = async (client, { eventId, teamId }) => {
  const formation = await client.query(
    `SELECT 1 FROM team_formation_game WHERE game_id = $1 AND team_id = $2 LIMIT 1`,
    [eventId, teamId]
  );
  if (formation.rowCount > 0) return false;

  const gameQuery = await client.query(`SELECT game_date FROM games WHERE id = $1`, [eventId]);
  if (gameQuery.rowCount === 0) return false;
  if ((new Date(gameQuery.rows[0].game_date) - new Date()) / 1000 / 60 < DEADLINES.ROSTER_SUBMIT_MINUTES) return false;
  if (await isMatchStarted(client, eventId)) return false;

  const { submitted, inSync } = await compareRosterWithSource(client, { eventId, teamId });
  return submitted && inSync;
};

/**
 * Пересобрать заявку под новый список отметившихся. Вызывать ПОСЛЕ изменения явки и
 * только если до него isRosterFollowingAttendance вернула true.
 *
 * Если отметки не осталось ни у кого, заявка просто исчезает — это верно: подавать
 * стало некого.
 */
export const resyncRosterWithAttendance = async (client, { eventId, teamId }) => {
  const gameQuery = await client.query(
    `SELECT game_type, division_id FROM games WHERE id = $1`,
    [eventId]
  );
  if (gameQuery.rowCount === 0) return null;

  const { game_type, division_id } = gameQuery.rows[0];

  await client.query('BEGIN');
  try {
    const source = await rebuildGameRoster(client, {
      eventId, teamId, gameType: game_type, divisionId: division_id,
    });
    await client.query('COMMIT');
    return source;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
};

export const getMatchLines = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    // Извлечение game_type вместо устаревшего stage_type
    const gameCheck = await pool.query(
      `SELECT game_type, division_id FROM games WHERE id = $1`,
      [eventId]
    );

    if (gameCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const { game_type, division_id } = gameCheck.rows[0];
    let query = '';
    let params = [eventId, teamId];

    // Если матч товарищеский (pwa/ext) или кастомный внешний (tournament_ext)
    if (game_type !== 'official') {
      query = `
        SELECT 
          tfg.player_id, 
          tfg.line_number, 
          tfg.position_in_line,
          COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
          COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
          COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant,
          u.first_name, 
          u.last_name, 
          COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
        FROM team_formation_game tfg
        JOIN users u ON u.id = tfg.player_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
        WHERE tfg.game_id = $1 AND tfg.team_id = $2
      `;
    } else {
      // Исключительно для официальных внутренних матчей лиги платформы
      query = `
        SELECT 
          tfg.player_id, 
          tfg.line_number, 
          tfg.position_in_line,
          COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
          COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
          COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant,
          u.first_name, 
          u.last_name, 
          COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
        FROM team_formation_game tfg
        JOIN users u ON u.id = tfg.player_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        LEFT JOIN tournament_teams tt ON tt.team_id = $2 AND tt.division_id = $3
        LEFT JOIN tournament_rosters tr ON tr.player_id = u.id AND tr.tournament_team_id = tt.id AND tr.period_end IS NULL AND tr.application_status = 'approved'
        WHERE tfg.game_id = $1 AND tfg.team_id = $2
      `;
      params.push(division_id);
    }

    const result = await pool.query(query, params);
    
    // «Отправлено» — это не «строки в game_rosters есть», а «отправленная заявка всё ещё
    // совпадает с составом». Разошлась (тренер перерисовал расстановку или секретарь лиги
    // поправил протокол) — кнопка снова становится «Отправить», чтобы расхождение было видно.
    const { submitted, inSync } = await compareRosterWithSource(pool, { eventId, teamId });

    res.json({ 
      success: true, 
      isPublished: submitted && inSync,
      lines: result.rows 
    });

  } catch (err) {
    console.error('Ошибка получения пятерок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const saveMatchLines = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { teamId, lines } = req.body;

    if (!teamId || !Array.isArray(lines)) {
      return res.status(400).json({ success: false, error: 'Некорректные данные' });
    }

    const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MATCH_LINES_MANAGE', client);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для сохранения расстановки звеньев' });
    }

    const gameQuery = await client.query(`SELECT game_date, game_type, division_id FROM games WHERE id = $1`, [eventId]);
    if (gameQuery.rowCount === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });

    const { game_date, game_type, division_id } = gameQuery.rows[0];
    const diffMinutes = (new Date(game_date) - new Date()) / 1000 / 60;

    if (diffMinutes < DEADLINES.MIDDLE_EDIT_MINUTES) {
      return res.status(403).json({ success: false, error: `Время изменения расстановки вышло (менее ${DEADLINES.MIDDLE_EDIT_MINUTES} минут до старта)` });
    }

    if (await isMatchStarted(client, eventId)) {
      return res.status(403).json({ success: false, error: 'Матч уже начался, изменение расстановки невозможно' });
    }

    await client.query('BEGIN');

    // Заявка была отправлена — значит после пересохранения расстановки её надо собрать
    // заново, молча: команда её уже подала, и терять её из-за правки состава незачем.
    const wasSubmitted = await hasSubmittedRoster(client, eventId, teamId);

    // Номер, капитан и ассистент — правки руководителя, они живут в строках формации и
    // привязаны к человеку, а не к слоту. Снимаем их ДО удаления: тренер перерисовывает
    // звенья, и без снимка все правки откатились бы к значениям из заявки на сезон.
    const previousParams = await client.query(
      `SELECT player_id, jersey_number, is_captain, is_assistant FROM team_formation_game WHERE game_id = $1 AND team_id = $2`,
      [eventId, teamId]
    );
    const previousByPlayer = new Map(previousParams.rows.map(r => [String(r.player_id), r]));

    await client.query(`DELETE FROM team_formation_game WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);
    await client.query(
      `DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2 AND is_reserve_goalie IS NOT TRUE`,
      [eventId, teamId]
    );

    // ── Проверка конфликта: те же игроки уже в заявке другой команды этого матча ──
    if (lines.length > 0) {
      const playerIds = lines.map(p => p.player_id).filter(Boolean);
      if (playerIds.length > 0) {
        const conflict = await client.query(`
          SELECT tfg.player_id,
                 COALESCE(NULLIF(TRIM(u.last_name || ' ' || COALESCE(LEFT(u.first_name,1)||'.', '')), ''), 'игрок #'||tfg.player_id) AS who,
                 t.name AS team_name
            FROM team_formation_game tfg
            JOIN users u ON u.id = tfg.player_id
            JOIN teams t ON t.id = tfg.team_id
           WHERE tfg.game_id = $1
             AND tfg.team_id <> $2
             AND tfg.player_id = ANY($3::int[])
        `, [eventId, teamId, playerIds]);

        if (conflict.rowCount > 0) {
          await client.query('ROLLBACK');
          const list = conflict.rows
            .map(r => `${r.who} — уже в заявке «${r.team_name}»`)
            .join('; ');
          return res.status(409).json({
            success: false,
            error: `Невозможно сохранить расстановку: ${list}. Удалите этих игроков из заявки.`,
            conflictPlayerIds: conflict.rows.map(r => r.player_id),
          });
        }
      }
    }

    if (lines.length > 0) {
      for (const player of lines) {
        let defaultJersey = player.jersey_number;
        let defaultCaptain = player.is_captain;
        let defaultAssistant = player.is_assistant;

        // Игрок остаётся в составе — возвращаем ему прежние параметры, в каком бы звене
        // и на какой позиции он теперь ни оказался. Из заявки на сезон дефолты достаются
        // только тем, кого в прошлой расстановке не было вовсе.
        const previous = previousByPlayer.get(String(player.player_id));
        if ((defaultJersey === undefined || defaultJersey === null) && previous) {
          defaultJersey = previous.jersey_number;
          defaultCaptain = previous.is_captain;
          defaultAssistant = previous.is_assistant;
        }

        if (defaultJersey === undefined || defaultJersey === null) {
          // Если матч не является официальным внутренним — берем дефолты из локального состава
          if (game_type !== 'official') {
            const defRes = await client.query(`
              SELECT tr.jersey_number, tr.is_captain, tr.is_assistant FROM team_members tm
              JOIN team_rosters tr ON tr.member_id = tm.id
              WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
            `, [player.player_id, teamId]);
            if (defRes.rowCount > 0) {
              defaultJersey = defRes.rows[0].jersey_number;
              defaultCaptain = defRes.rows[0].is_captain;
              defaultAssistant = defRes.rows[0].is_assistant;
            }
          } else {
            // Исключительно для официальной лиги вытягиваем параметры из турнирной заявки
            const defRes = await client.query(`
              SELECT tr.jersey_number, tr.is_captain, tr.is_assistant FROM tournament_teams tt
              JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id
              WHERE tt.team_id = $1 AND tt.division_id = $2 AND tr.player_id = $3 AND tr.period_end IS NULL AND tr.application_status = 'approved'
            `, [teamId, division_id, player.player_id]);
            if (defRes.rowCount > 0) {
              defaultJersey = defRes.rows[0].jersey_number;
              defaultCaptain = defRes.rows[0].is_captain;
              defaultAssistant = defRes.rows[0].is_assistant;
            }
          }
        }

        // Конфликт с другой командой уже отсеян выше — здесь безопасно делать чистый INSERT.
        const insertQuery = `
          INSERT INTO team_formation_game (game_id, team_id, player_id, line_number, position_in_line, jersey_number, is_captain, is_assistant)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await client.query(insertQuery, [
          eventId,
          teamId,
          player.player_id,
          player.line_number,
          player.position_in_line,
          defaultJersey === '' ? null : defaultJersey,
          defaultCaptain || false,
          defaultAssistant || false
        ]);
      }
    }

    // Автопереотправка: заявка была подана до правки — собираем её заново из свежей
    // расстановки. Отдельного подтверждения не спрашиваем, дедлайны у правки состава и
    // у подачи заявки одни и те же (DEADLINES), так что сюда мы не попадём после срока.
    const resubmitSource = wasSubmitted
      ? await rebuildGameRoster(client, { eventId, teamId, gameType: game_type, divisionId: division_id })
      : null;

    await client.query('COMMIT');

    getMatchInfo(eventId, teamId).then(info => {
      sendPushToTeamExcept(teamId, req.user.id, 'lines', {
        title: 'Состав на матч обновлён',
        body: info.text,
        url: `/event/match/${eventId}`,
        tag: `lines-${eventId}`,
      });
    }).catch(() => {});

    res.json({ success: true, rosterResubmitted: !!resubmitSource });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка сохранения пятерок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

export const updateLinePlayer = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { teamId, playerId, jerseyNumber, isCaptain, isAssistant } = req.body;

    if (!teamId || !playerId) {
      return res.status(400).json({ success: false, error: 'Некорректные данные' });
    }

    const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MATCH_LINES_EDIT_PLAYER_PARAMS', client);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется активная подписка руководителя' });
    }

    if (await isMatchStarted(client, eventId)) {
      return res.status(403).json({ success: false, error: 'Матч уже начался, изменение параметров игроков заблокировано' });
    }

    const gameQuery = await client.query(`SELECT game_date, game_type, division_id FROM games WHERE id = $1`, [eventId]);
    if (gameQuery.rowCount === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });

    const { game_date, game_type, division_id } = gameQuery.rows[0];
    const diffMinutes = (new Date(game_date) - new Date()) / 1000 / 60;
    
    if (diffMinutes < DEADLINES.ROSTER_SUBMIT_MINUTES) {
      return res.status(403).json({ success: false, error: `Время изменения вышло (менее ${DEADLINES.ROSTER_SUBMIT_MINUTES} минут до старта)` });
    }

    await client.query('BEGIN');

    // Заявка была отправлена — после правки номера или капитанства пересоберём её сама
    const wasSubmitted = await hasSubmittedRoster(client, eventId, teamId);

    const currentLines = await client.query(
      `SELECT player_id, jersey_number, is_captain, is_assistant FROM team_formation_game WHERE game_id = $1 AND team_id = $2`,
      [eventId, teamId]
    );

    if (jerseyNumber !== undefined && jerseyNumber !== null && jerseyNumber !== '') {
      const duplicate = currentLines.rows.find(p => String(p.player_id) !== String(playerId) && p.jersey_number === parseInt(jerseyNumber));
      if (duplicate) {
        const uQuery = await client.query(`SELECT last_name FROM users WHERE id = $1`, [duplicate.player_id]);
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Номер уже занят игроком ${uQuery.rows[0]?.last_name || ''}` });
      }
    }

    if (isCaptain) {
      await client.query(
        `UPDATE team_formation_game SET is_captain = false WHERE game_id = $1 AND team_id = $2`,
        [eventId, teamId]
      );
    }

    if (isAssistant) {
      const assistants = currentLines.rows.filter(p => String(p.player_id) !== String(playerId) && p.is_assistant);
      if (assistants.length >= 2) {
        // ROLLBACK обязателен: выше по ветке isCaptain мы могли уже снять капитанство
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Уже назначено 2 ассистента. Снимите статус с другого игрока' });
      }
    }

    await client.query(`
      UPDATE team_formation_game 
      SET jersey_number = $4, is_captain = $5, is_assistant = $6
      WHERE game_id = $1 AND team_id = $2 AND player_id = $3
    `, [eventId, teamId, playerId, jerseyNumber === '' ? null : jerseyNumber, isCaptain || false, isAssistant || false]);

    // Раньше заявка тут просто сносилась и её приходилось отправлять руками. Теперь
    // пересобираем её с новыми параметрами игрока — с точки зрения лиги заявка как была
    // подана, так и осталась. Если её не отправляли, то и пересобирать нечего.
    const resubmitSource = wasSubmitted
      ? await rebuildGameRoster(client, { eventId, teamId, gameType: game_type, divisionId: division_id })
      : null;

    await client.query('COMMIT');
    res.json({ success: true, rosterResubmitted: !!resubmitSource });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка обновления параметров игрока:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

export const submitMatchRoster = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MATCH_ROSTER_SUBMIT', client);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для отправки заявки или требуется продление подписки' });
    }

    const gameQuery = await client.query(`SELECT game_date, game_type, division_id FROM games WHERE id = $1`, [eventId]);
    if (gameQuery.rowCount === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });

    const { game_date, game_type, division_id } = gameQuery.rows[0];
    const diffMinutes = (new Date(game_date) - new Date()) / 1000 / 60;

    if (diffMinutes < DEADLINES.ROSTER_SUBMIT_MINUTES) {
      return res.status(403).json({ success: false, error: `Время подачи заявки вышло (менее ${DEADLINES.ROSTER_SUBMIT_MINUTES} минут до старта)` });
    }

    if (await isMatchStarted(client, eventId)) {
      return res.status(403).json({ success: false, error: 'Матч уже начался, изменение заявки невозможно' });
    }

    await client.query('BEGIN');

    // Расстановки может не быть вовсе: команда вправе подать заявку, минуя формацию —
    // тогда состав собирается из отметившихся на матч (см. rebuildGameRoster).
    const source = await rebuildGameRoster(client, { eventId, teamId, gameType: game_type, divisionId: division_id });

    if (!source) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Заявку не из кого собрать: расстановка пуста и на матч никто не отметился',
      });
    }

    await client.query('COMMIT');

    res.json({ success: true, source, message: 'Официальная заявка отправлена' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка отправки заявки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};