import pool from '../config/db.js';
import { getTeamIdFromRequest } from '../utils/checkPermission.js';
import { promoteExpiredMatchesToNoResult } from '../utils/matchStatus.js';
import { sendPushToTeamExcept, cancelScheduledNotifications, getMatchInfo, formatFeeChange } from '../services/pushService.js';

// =============================================================================
// ПОДГРУЗКА СУДЕЙ МАТЧА
// =============================================================================
export const getMatchStaff = async (req, res) => {
  try {
    const { eventId } = req.params;

    const query = `
      SELECT 
        gs.role::varchar,
        u.id::int AS user_id,
        u.first_name::varchar,
        u.last_name::varchar,
        u.avatar_url::varchar
      FROM "public"."game_staff" gs
      JOIN "public"."users" u ON gs.user_id = u.id
      WHERE gs.game_id = $1 
        AND gs.role IN ('main-1', 'main-2', 'linesman-1', 'linesman-2')
      ORDER BY gs.role ASC;
    `;

    const { rows } = await pool.query(query, [eventId]);
    res.json({ success: true, staff: rows });
  } catch (err) {
    console.error('Ошибка получения судейской бригады матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ИСТОРИЯ ОЧНЫХ ПРОТИВОСТОЯНИЙ H2H
// =============================================================================
export const getMatchH2H = async (req, res) => {
  try {
    const { eventId } = req.params;

    const gameRes = await pool.query(
      'SELECT home_team_id, away_team_id, away_external_id FROM "public"."games" WHERE id = $1',
      [eventId]
    );

    if (gameRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const { home_team_id, away_team_id, away_external_id } = gameRes.rows[0];

    const myTeamCheck = await pool.query(
      `SELECT team_id FROM "public"."team_members" 
       WHERE user_id = $1 AND team_id IN ($2, $3) AND left_at IS NULL LIMIT 1`,
      [req.user.id, home_team_id, away_team_id]
    );
    const myTeamId = myTeamCheck.rows[0]?.team_id || home_team_id;

    let gamesQuery = '';
    let queryParams = [];

    if (away_external_id) {
      gamesQuery = `
        SELECT 
          g.id::int,
          g.game_date::timestamptz,
          g.home_team_id::int,
          g.away_team_id::int,
          g.home_score::int,
          g.away_score::int,
          g.end_type::varchar,
          g.status::varchar,
          COALESCE(l.name, ext_tour.name, 'Товарищеский матч')::varchar AS tournament_name
        FROM "public"."games" g
        LEFT JOIN "public"."divisions" d ON g.division_id = d.id
        LEFT JOIN "public"."seasons" s ON d.season_id = s.id
        LEFT JOIN "public"."leagues" l ON s.league_id = l.id
        LEFT JOIN "public"."team_external_tournaments" ext_tour ON g.external_tournament_id = ext_tour.id
        WHERE g.status IN ('finished', 'live')
          AND g.home_team_id = $1 AND g.away_external_id = $2
        ORDER BY g.game_date DESC;
      `;
      queryParams = [home_team_id, away_external_id];
    } else {
      gamesQuery = `
        SELECT 
          g.id::int,
          g.game_date::timestamptz,
          g.home_team_id::int,
          g.away_team_id::int,
          g.home_score::int,
          g.away_score::int,
          g.end_type::varchar,
          g.status::varchar,
          COALESCE(l.name, ext_tour.name, 'Товарищеский матч')::varchar AS tournament_name
        FROM "public"."games" g
        LEFT JOIN "public"."divisions" d ON g.division_id = d.id
        LEFT JOIN "public"."seasons" s ON d.season_id = s.id
        LEFT JOIN "public"."leagues" l ON s.league_id = l.id
        LEFT JOIN "public"."team_external_tournaments" ext_tour ON g.external_tournament_id = ext_tour.id
        WHERE g.status IN ('finished', 'live')
          AND (
            (g.home_team_id = $1 AND g.away_team_id = $2)
            OR (g.home_team_id = $2 AND g.away_team_id = $1)
          )
        ORDER BY g.game_date DESC;
      `;
      queryParams = [home_team_id, away_team_id];
    }

    const { rows } = await pool.query(gamesQuery, queryParams);

    let total = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;

    rows.forEach(game => {
      if (game.status !== 'finished') return;
      total++;
      
      const isHome = String(game.home_team_id) === String(myTeamId);
      const myScore = isHome ? game.home_score : game.away_score;
      const oppScore = isHome ? game.away_score : game.home_score;
      
      if (myScore > oppScore) wins++;
      else if (myScore < oppScore) losses++;
      else draws++;
    });

    res.json({
      success: true,
      h2h: {
        summary: { total, wins, draws, losses },
        games: rows
      }
    });
  } catch (err) {
    console.error('Ошибка получения истории встреч H2H:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// БЛОК ОБНОВЛЕНИЯ МЕДИА-ССЫЛОК (Блок 1)
// =============================================================================
export const updateMatchMedia = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { video_yt_url, video_vk_url } = req.body;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }

    const gameRes = await pool.query(
      'SELECT game_type, status, initiator_team_id FROM "public"."games" WHERE id = $1',
      [eventId]
    );

    if (gameRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const game = gameRes.rows[0];

    if (game.game_type === 'official') {
      return res.status(400).json({ success: false, error: 'Официальные матчи лиги не поддерживают ручное редактирование медиа-ссылок' });
    }

    if (game.game_type === 'friendly_pwa' && Number(game.initiator_team_id) !== teamId) {
      return res.status(400).json({ success: false, error: 'Медиа-ссылки товарищеского матча может менять только команда-инициатор' });
    }

    await pool.query(
      `UPDATE "public"."games"
       SET video_yt_url = $1, video_vk_url = $2
       WHERE id = $3`,
      [video_yt_url || null, video_vk_url || null, eventId]
    );

    res.json({ success: true, message: 'Ссылки на трансляции успешно обновлены' });
  } catch (err) {
    console.error('Ошибка обновления медиа-ссылок матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// БЛОК ОБНОВЛЕНИЯ РАСПИСАНИЯ: ДАТА, ВРЕМЯ, ЛОКАЦИЯ С УЧЕТОМ КАСТОМНЫХ ПОЛЕЙ
// =============================================================================
export const updateMatchSchedule = async (req, res) => {
  try {
    const { eventId } = req.params;
    // Принимаем новые поля ручного ввода локации и её геопозиции
    const { date, time, arena_id, location, location_url, custom_timezone } = req.body; 
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }

    const gameRes = await pool.query(
      'SELECT game_type, status, initiator_team_id, arena_id, custom_timezone, location, location_url FROM "public"."games" WHERE id = $1',
      [eventId]
    );

    if (gameRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const game = gameRes.rows[0];

    if (game.game_type === 'official') {
      return res.status(400).json({ success: false, error: 'Запрещено менять дату, время или локацию официального матча' });
    }

    // Разделяем контекст: ручной ввод (isManual) или выбор из справочника арен
    const finalArenaId = arena_id !== undefined ? arena_id : game.arena_id;
    const isManual = !finalArenaId;

    const finalLocation = isManual ? (location !== undefined ? location : game.location) : null;
    const finalLocationUrl = isManual ? (location_url !== undefined ? location_url : game.location_url) : null;
    const finalCustomTz = isManual ? (custom_timezone || game.custom_timezone || 'Europe/Moscow') : null;

    let arenaTz = 'Europe/Moscow'; 

    if (!isManual) {
      const arenaRes = await pool.query('SELECT timezone FROM "public"."arenas" WHERE id = $1', [finalArenaId]);
      if (arenaRes.rowCount > 0) {
        arenaTz = arenaRes.rows[0].timezone;
      }
    } else {
      arenaTz = finalCustomTz;
    }

    if (game.game_type === 'friendly_pwa') {
      if (Number(game.initiator_team_id) !== teamId) {
        return res.status(400).json({ success: false, error: 'Изменение расписания доступно только команде-инициатору' });
      }
      if (game.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Нельзя изменить расписание матча после подтверждения соперником' });
      }
      if (!time) {
        return res.status(400).json({ success: false, error: 'Необходимо указать новое время матча' });
      }

      // Обновляем все поля локации
      await pool.query(
        `UPDATE "public"."games" 
         SET game_date = (((game_date AT TIME ZONE $1)::date + $2::time)::timestamp AT TIME ZONE $1),
             arena_id = $3,
             location = $4,
             location_url = $5,
             custom_timezone = $6,
             updated_at = NOW() 
         WHERE id = $7`,
        [arenaTz, `${time}:00`, finalArenaId, finalLocation, finalLocationUrl, finalCustomTz, eventId]
      );
    } else if (game.game_type === 'friendly_ext' || game.game_type === 'tournament_ext') {
      if (!date || !time) {
        return res.status(400).json({ success: false, error: 'Для внешних матчей обязательны и дата, и время' });
      }
      const fullTimestamp = `${date} ${time}:00`;

      // Обновляем все поля локации
      await pool.query(
        `UPDATE "public"."games" 
         SET game_date = $1::timestamp AT TIME ZONE $2,
             arena_id = $3,
             location = $4,
             location_url = $5,
             custom_timezone = $6,
             updated_at = NOW() 
         WHERE id = $7`,
        [fullTimestamp, arenaTz, finalArenaId, finalLocation, finalLocationUrl, finalCustomTz, eventId]
      );
    } else {
      return res.status(400).json({ success: false, error: 'Неподдерживаемый тип матча для изменения расписания' });
    }

    getMatchInfo(eventId, teamId).then(info => {
      sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
        title: 'Матч изменён',
        body: `Новое расписание: ${info.text}`,
        url: `/event/match/${eventId}`, tag: `event-update-${eventId}`,
      });
    }).catch(() => {});

    res.json({ success: true, message: 'Параметры расписания успешно сохранены' });
  } catch (err) {
    console.error('Ошибка обновления расписания матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// БЛОК ОБНОВЛЕНИЯ ДЖЕРСИ И СТОИМОСТИ УЧАСТИЯ (Блок 3) — С УЧЕТОМ ПРАВ СЛУЧАЯ FRIENDLY_PWA
// =============================================================================
export const updateMatchFinances = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { player_fee, home_jersey_type, away_jersey_type } = req.body;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }

    const gameRes = await pool.query(
      'SELECT game_type, status, initiator_team_id, home_team_id, away_team_id FROM "public"."games" WHERE id = $1',
      [eventId]
    );

    if (gameRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const game = gameRes.rows[0];
    const isHome = Number(game.home_team_id) === teamId;
    const isAway = Number(game.away_team_id) === teamId;

    if (!isHome && !isAway) {
      return res.status(403).json({ success: false, error: 'Ваша команда не является участником этого матча' });
    }

    const feeColumn = isHome ? 'home_player_fee' : 'away_player_fee';

    // Старая стоимость для сравнения в push
    const oldFeeRes = await pool.query(`SELECT ${feeColumn} AS old_fee FROM "public"."games" WHERE id = $1`, [eventId]);
    const oldMatchFee = oldFeeRes.rows[0]?.old_fee;
    const newMatchFee = (player_fee === undefined || player_fee === null || player_fee === '') ? null : Number(player_fee);

    const sendMatchFeeNotification = () => {
      if (oldMatchFee === newMatchFee) return;
      getMatchInfo(eventId, teamId).then(info => {
        sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
          title: 'Изменение стоимости',
          body: formatFeeChange(oldMatchFee, newMatchFee, `матча ${info.text}`),
          url: `/event/match/${eventId}`,
          tag: `fee-${eventId}`,
        });
      }).catch(() => {});
    };

    if (game.game_type === 'official') {
      await pool.query(
        `UPDATE "public"."games" SET ${feeColumn} = $1, updated_at = NOW() WHERE id = $2`,
        [player_fee !== undefined ? player_fee : null, eventId]
      );
      sendMatchFeeNotification();
      return res.json({ success: true, message: 'Стоимость участия для игроков вашей команды успешно обновлена' });
    }

    if (game.game_type === 'friendly_pwa') {
      const isInitiator = Number(game.initiator_team_id) === teamId;

      // Если редактирует команда-соперник (которую вызвали), разрешаем ей менять ТОЛЬКО свой взнос
      if (!isInitiator) {
        await pool.query(
          `UPDATE "public"."games" SET ${feeColumn} = $1, updated_at = NOW() WHERE id = $2`,
          [player_fee !== undefined ? player_fee : null, eventId]
        );
        sendMatchFeeNotification();
        return res.json({ success: true, message: 'Стоимость участия для вашей команды успешно обновлена' });
      }

      // Если редактирует команда-инициатор, она сохраняет право менять комплекты формы
      if (game.status === 'pending') {
        await pool.query(
          `UPDATE "public"."games" 
           SET ${feeColumn} = $1, 
               home_jersey_type = $2, 
               away_jersey_type = $3, 
               updated_at = NOW() 
           WHERE id = $4`,
          [player_fee !== undefined ? player_fee : null, home_jersey_type || null, away_jersey_type || null, eventId]
        );
      } else {
        await pool.query(
          `UPDATE "public"."games" SET ${feeColumn} = $1, updated_at = NOW() WHERE id = $2`,
          [player_fee !== undefined ? player_fee : null, eventId]
        );
      }
      sendMatchFeeNotification();
      return res.json({ success: true, message: 'Финансово-экипировочные параметры успешно сохранены' });
    }

    if (game.game_type === 'friendly_ext' || game.game_type === 'tournament_ext') {
      await pool.query(
        `UPDATE "public"."games" 
         SET ${feeColumn} = $1, 
             home_jersey_type = $2, 
             away_jersey_type = $3, 
             updated_at = NOW() 
         WHERE id = $4`,
        [player_fee !== undefined ? player_fee : null, home_jersey_type || null, away_jersey_type || null, eventId]
      );
      sendMatchFeeNotification();
      return res.json({ success: true, message: 'Параметры внешнего матча успешно изменены' });
    }

    res.status(400).json({ success: false, error: 'Неизвестный тип игры' });
  } catch (err) {
    console.error('Ошибка обновления финансов и формы матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОЛНОЕ УДАЛЕНИЕ МАТЧА ИЗ КАЛЕНДАРЯ
// =============================================================================
export const deleteMatch = async (req, res) => {
  try {
    const { eventId } = req.params;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
    }

    // Сразу же на входе жестко приводим eventId к числу, исключая любые text/integer конфликты СУБД
    const numericId = Number(eventId);

    if (isNaN(numericId)) {
      return res.status(400).json({ success: false, error: 'Некорректный формат идентификатора матча' });
    }

    const gameRes = await pool.query(
      'SELECT game_type, status, initiator_team_id FROM "public"."games" WHERE id = $1',
      [numericId]
    );

    if (gameRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const game = gameRes.rows[0];

    if (game.game_type === 'official') {
      return res.status(400).json({ success: false, error: 'Запрещено удалять официальные календарные матчи лиги' });
    }

    if (game.game_type === 'friendly_pwa') {
      if (Number(game.initiator_team_id) !== teamId) {
        return res.status(400).json({ success: false, error: 'Только команда-инициатор может удалить этот вызов' });
      }
      if (game.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Нельзя удалить уже подтвержденный соперником товарищеский матч' });
      }
    }

    const eventInfo = await getMatchInfo(numericId, teamId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM "public"."games" WHERE id = $1', [numericId]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    cancelScheduledNotifications(numericId).catch(() => {});
    sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
      title: 'Матч отменён',
      body: eventInfo.text || 'Матч удалён из расписания',
      url: '/', tag: `event-cancel-${numericId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'Матч успешно удален из расписания календаря' });
  } catch (err) {
    console.error('Ошибка удаления матча из базы данных:', err);
    res.status(500).json({ 
      success: false, 
      error: `Ошибка бэкенда СУБД: ${err.message || 'Неизвестная ошибка'}` 
    });
  }
};

// =============================================================================
// СТАТИСТИКА МАТЧА (Броски, реализация, большинство/меньшинство, штрафы)
// =============================================================================
export const getMatchStats = async (req, res) => {
  try {
    const { eventId } = req.params;

    // Ленивая смена статуса (scheduled → finished_no_result после game_date).
    await promoteExpiredMatchesToNoResult(eventId);

    // ── 1. Командная статистика (голы, штрафы, броски) ──────────────────
    const teamQuery = `
      WITH game_info AS (
        SELECT home_team_id, away_team_id, status
        FROM "public"."games" 
        WHERE id = $1
      ),
      goal_stats AS (
        SELECT
          team_id,
          COUNT(*)::int AS total_goals,
          COUNT(*) FILTER (WHERE goal_strength IN ('pp1', 'pp2'))::int AS pp_goals,
          COUNT(*) FILTER (WHERE goal_strength IN ('sh1', 'sh2'))::int AS sh_goals,
          -- Голы С БРОСКА (нужны для физического минимума командного SOG)
          COUNT(*) FILTER (
            WHERE COALESCE(from_shot, true) = true
              AND COALESCE(goal_strength, '') <> 'ps'
          )::int AS goals_from_shot
        FROM "public"."game_events"
        WHERE game_id = $1 AND event_type = 'goal'
        GROUP BY team_id
      ),
      penalty_stats AS (
        SELECT team_id, COALESCE(SUM(penalty_minutes), 0)::int AS pim
        FROM "public"."game_events"
        WHERE game_id = $1 AND event_type = 'penalty'
        GROUP BY team_id
      ),
      shots_faced_stats AS (
        -- Все броски в створ по вратарям команды (team_id = команда вратаря).
        SELECT team_id, COALESCE(SUM(shots_count), 0)::int AS shots_faced
        FROM "public"."game_shots_by_goalie"
        WHERE game_id = $1
        GROUP BY team_id
      ),
      goal_to_goalie AS (
        -- Для каждого гола определяем, кто стоял в воротах команды-соперника
        -- через game_goalie_log (берём последнюю запись лога ДО момента гола).
        -- Используем именно журнал, а не game_events.against_goalie_id, т.к. в
        -- секретарской панели TR это поле не заполняется.
        SELECT DISTINCT ON (ge.id)
          ge.id AS event_id,
          ge.team_id AS scoring_team_id,
          CASE WHEN ge.team_id = gi.home_team_id THEN gi.away_team_id ELSE gi.home_team_id END AS conceding_team_id,
          COALESCE(ge.from_shot, true) AS from_shot,
          CASE WHEN ge.team_id = gi.home_team_id THEN gl.away_goalie_id ELSE gl.home_goalie_id END AS conceding_goalie_id
        FROM "public"."game_events" ge
        CROSS JOIN game_info gi
        JOIN "public"."game_goalie_log" gl
          ON gl.game_id = ge.game_id
         AND gl.time_seconds <= ge.time_seconds
        WHERE ge.game_id = $1
          AND ge.event_type = 'goal'
          AND COALESCE(ge.goal_strength, '') <> 'ps'
        ORDER BY ge.id, gl.time_seconds DESC
      ),
      ga_from_shot_stats AS (
        -- Голы С БРОСКА, забитые против КОНКРЕТНОГО вратаря (не пустые ворота).
        -- Уменьшают saves команды, против вратаря которой забили.
        SELECT conceding_team_id, COUNT(*)::int AS ga_from_shot
        FROM goal_to_goalie
        WHERE conceding_goalie_id IS NOT NULL
          AND from_shot = true
        GROUP BY conceding_team_id
      ),
      empty_net_goals_scored AS (
        -- Голы в пустые ворота С БРОСКА (на момент гола в журнале у соперника NULL-вратарь).
        -- Засчитываются в SOG атакующей команды как +1 бросок в створ ворот.
        -- Голы без броска (закатили, рикошет) в SOG не идут.
        SELECT scoring_team_id AS team_id, COUNT(*)::int AS empty_net_goals
        FROM goal_to_goalie
        WHERE conceding_goalie_id IS NULL
          AND from_shot = true
        GROUP BY scoring_team_id
      )
      SELECT
        gi.home_team_id::int,
        gi.away_team_id::int,
        gi.status::varchar,
        COALESCE(hg.total_goals, 0)::int  AS home_goals,
        COALESCE(hg.pp_goals, 0)::int     AS home_pp_goals,
        COALESCE(hg.sh_goals, 0)::int     AS home_sh_goals,
        COALESCE(hg.goals_from_shot, 0)::int AS home_goals_from_shot,
        COALESCE(ag.total_goals, 0)::int  AS away_goals,
        COALESCE(ag.pp_goals, 0)::int     AS away_pp_goals,
        COALESCE(ag.sh_goals, 0)::int     AS away_sh_goals,
        COALESCE(ag.goals_from_shot, 0)::int AS away_goals_from_shot,
        COALESCE(hp.pim, 0)::int          AS home_pim,
        COALESCE(ap.pim, 0)::int          AS away_pim,
        COALESCE(hsf.shots_faced, 0)::int AS home_shots_faced,
        COALESCE(asf.shots_faced, 0)::int AS away_shots_faced,
        COALESCE(hga.ga_from_shot, 0)::int AS home_ga_from_shot,
        COALESCE(aga.ga_from_shot, 0)::int AS away_ga_from_shot,
        COALESCE(heng.empty_net_goals, 0)::int AS home_empty_net_goals,
        COALESCE(aeng.empty_net_goals, 0)::int AS away_empty_net_goals
      FROM game_info gi
      LEFT JOIN goal_stats hg    ON hg.team_id = gi.home_team_id
      LEFT JOIN goal_stats ag    ON ag.team_id = gi.away_team_id
      LEFT JOIN penalty_stats hp ON hp.team_id = gi.home_team_id
      LEFT JOIN penalty_stats ap ON ap.team_id = gi.away_team_id
      LEFT JOIN shots_faced_stats   hsf  ON hsf.team_id = gi.home_team_id
      LEFT JOIN shots_faced_stats   asf  ON asf.team_id = gi.away_team_id
      LEFT JOIN ga_from_shot_stats  hga  ON hga.conceding_team_id = gi.home_team_id
      LEFT JOIN ga_from_shot_stats  aga  ON aga.conceding_team_id = gi.away_team_id
      LEFT JOIN empty_net_goals_scored heng ON heng.team_id = gi.home_team_id
      LEFT JOIN empty_net_goals_scored aeng ON aeng.team_id = gi.away_team_id;
    `;
 
    // ── 2. Статистика полевых игроков ──────────────────────────────────
    const skatersQuery = `
      SELECT 
        gr.player_id::int,
        gr.team_id::int,
        gr.jersey_number::int,
        u.first_name::varchar,
        u.last_name::varchar,
        tm.photo_url::varchar,
        COALESCE(g.goals, 0)::int AS goals,
        COALESCE(a.assists, 0)::int AS assists,
        (COALESCE(g.goals, 0) + COALESCE(a.assists, 0))::int AS points,
        COALESCE(pm.plus_minus, 0)::int AS plus_minus,
        COALESCE(pen.penalty_minutes, 0)::int AS penalty_minutes
      FROM "public"."game_rosters" gr
      JOIN "public"."users" u ON gr.player_id = u.id
      LEFT JOIN "public"."team_members" tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
      LEFT JOIN (
        SELECT scorer_id, team_id, COUNT(*)::int AS goals
        FROM "public"."game_events"
        WHERE game_id = $1 AND event_type = 'goal'
        GROUP BY scorer_id, team_id
      ) g ON g.scorer_id = gr.player_id AND g.team_id = gr.team_id
      LEFT JOIN (
        SELECT player_id, team_id, COUNT(*)::int AS assists FROM (
          SELECT assist1_id AS player_id, team_id FROM "public"."game_events"
          WHERE game_id = $1 AND event_type = 'goal' AND assist1_id IS NOT NULL
          UNION ALL
          SELECT assist2_id AS player_id, team_id FROM "public"."game_events"
          WHERE game_id = $1 AND event_type = 'goal' AND assist2_id IS NOT NULL
        ) sub GROUP BY player_id, team_id
      ) a ON a.player_id = gr.player_id AND a.team_id = gr.team_id
      LEFT JOIN (
        SELECT pm.player_id, pm.team_id,
          SUM(CASE WHEN ge.team_id = pm.team_id THEN 1 ELSE -1 END)::int AS plus_minus
        FROM "public"."game_plus_minus" pm
        JOIN "public"."game_events" ge ON pm.event_id = ge.id
        WHERE ge.game_id = $1 AND ge.event_type = 'goal'
        GROUP BY pm.player_id, pm.team_id
      ) pm ON pm.player_id = gr.player_id AND pm.team_id = gr.team_id
      LEFT JOIN (
        SELECT penalty_player_id, team_id, SUM(penalty_minutes)::int AS penalty_minutes
        FROM "public"."game_events"
        WHERE game_id = $1 AND event_type = 'penalty'
        GROUP BY penalty_player_id, team_id
      ) pen ON pen.penalty_player_id = gr.player_id AND pen.team_id = gr.team_id
      WHERE gr.game_id = $1 AND gr.is_in_lineup = true AND gr.position_in_line != 'G'
      ORDER BY gr.team_id,
        (COALESCE(g.goals, 0) + COALESCE(a.assists, 0)) DESC,
        COALESCE(g.goals, 0) DESC;
    `;
 
    // ── 3. Статистика вратарей ─────────────────────────────────────────
    const goaliesQuery = `
      WITH game_info AS (
        SELECT home_team_id, away_team_id FROM "public"."games" WHERE id = $1
      ),
      -- Для каждого гола определяем кто стоял в воротах команды-соперника
      -- через game_goalie_log: берём последнюю запись лога ДО момента гола
      goal_goalie AS (
        SELECT
          ge.id AS event_id,
          ge.team_id AS scoring_team_id,
          ge.time_seconds,
          COALESCE(ge.from_shot, true) AS from_shot,
          gi.home_team_id,
          gi.away_team_id,
          -- Если забила домашняя команда — пропущенный у вратаря гостей
          CASE WHEN ge.team_id = gi.home_team_id
            THEN (
              SELECT ggl.away_goalie_id
              FROM "public"."game_goalie_log" ggl
              WHERE ggl.game_id = $1 AND ggl.time_seconds <= ge.time_seconds
              ORDER BY ggl.time_seconds DESC LIMIT 1
            )
            ELSE (
              SELECT ggl.home_goalie_id
              FROM "public"."game_goalie_log" ggl
              WHERE ggl.game_id = $1 AND ggl.time_seconds <= ge.time_seconds
              ORDER BY ggl.time_seconds DESC LIMIT 1
            )
          END AS goalie_id
        FROM "public"."game_events" ge
        CROSS JOIN game_info gi
        WHERE ge.game_id = $1 AND ge.event_type = 'goal'
          AND COALESCE(ge.goal_strength, '') <> 'ps'
      ),
      goals_against_per_goalie AS (
        -- Все пропущенные шайбы (для отображения GA)
        SELECT goalie_id, COUNT(*)::int AS goals_against
        FROM goal_goalie
        WHERE goalie_id IS NOT NULL
        GROUP BY goalie_id
      ),
      goals_against_from_shot AS (
        -- Только пропущенные с броска (для знаменателя save_percent)
        SELECT goalie_id, COUNT(*)::int AS ga_fs
        FROM goal_goalie
        WHERE goalie_id IS NOT NULL AND from_shot = true
        GROUP BY goalie_id
      )
      SELECT
        gr.player_id::int,
        gr.team_id::int,
        gr.jersey_number::int,
        u.first_name::varchar,
        u.last_name::varchar,
        tm.photo_url::varchar,
        -- Отражённые броски = (все броски в створ вратарю) − (голы С БРОСКА против него).
        -- Если бросков по вратарю нет — NULL (фронт покажет «—», а не 0).
        CASE
          WHEN COALESCE(s.shots_against, 0) > 0
          THEN GREATEST(COALESCE(s.shots_against, 0) - COALESCE(gfs.ga_fs, 0), 0)
          ELSE NULL
        END::int AS saves,
        COALESCE(ga.goals_against, 0)::int AS goals_against,
        CASE
          WHEN COALESCE(s.shots_against, 0) > 0
          THEN ROUND(
                 GREATEST(COALESCE(s.shots_against, 0) - COALESCE(gfs.ga_fs, 0), 0)::numeric
                 / COALESCE(s.shots_against, 0) * 100, 1
               )
          ELSE NULL
        END::float AS save_percent,
        COALESCE(ga.goals_against, 0)::float AS goals_against_average,
        CASE WHEN COALESCE(ga.goals_against, 0) = 0 AND COALESCE(s.shots_against, 0) > 0 THEN 1 ELSE 0 END::int AS shutouts
      FROM "public"."game_rosters" gr
      JOIN "public"."users" u ON gr.player_id = u.id
      LEFT JOIN "public"."team_members" tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
      LEFT JOIN (
        -- shots_count хранит ВСЕ броски в створ вратарю (включая ставшие голами с броска).
        SELECT goalie_id, team_id, SUM(shots_count)::int AS shots_against
        FROM "public"."game_shots_by_goalie"
        WHERE game_id = $1
        GROUP BY goalie_id, team_id
      ) s ON s.goalie_id = gr.player_id AND s.team_id = gr.team_id
      LEFT JOIN goals_against_per_goalie ga  ON ga.goalie_id  = gr.player_id
      LEFT JOIN goals_against_from_shot   gfs ON gfs.goalie_id = gr.player_id
      WHERE gr.game_id = $1 AND gr.is_in_lineup = true AND gr.position_in_line = 'G'
      ORDER BY gr.team_id, COALESCE(s.shots_against, 0) DESC;
    `;
 
    // ── Параллельное выполнение всех запросов ──────────────────────────
    const [teamResult, skatersResult, goaliesResult] = await Promise.all([
      pool.query(teamQuery, [eventId]),
      pool.query(skatersQuery, [eventId]),
      pool.query(goaliesQuery, [eventId])
    ]);
 
    if (teamResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }
 
    const r = teamResult.rows[0];

    // Статистику отдаём всегда (даже до публикации) — фронт показывает составы
    // команд из заявок с пустой статистикой. Командные метрики у несыгранного
    // матча = 0 / «—» (см. флаги has* ниже).

    // ── Вычисляемые командные параметры ────────────────────────────────
    // Командные броски в створ атакующей команды = сумма бросков по вратарям соперника
    // + голы атакующей команды в пустые ворота соперника.
    const homeShotsOnGoal = r.away_shots_faced + r.home_empty_net_goals;
    const awayShotsOnGoal = r.home_shots_faced + r.away_empty_net_goals;

    // Командные отражённые = (броски в створ нашим вратарям) − (голы С БРОСКА против них).
    // Голы без броска (рикошет от конька и т.п.) не уменьшают saves — они только в GA.
    const homeSaves = Math.max(r.home_shots_faced - r.home_ga_from_shot, 0);
    const awaySaves = Math.max(r.away_shots_faced - r.away_ga_from_shot, 0);

    const homeShootingPct = homeShotsOnGoal > 0
      ? parseFloat((r.home_goals / homeShotsOnGoal * 100).toFixed(1)) : 0;
    const awayShootingPct = awayShotsOnGoal > 0
      ? parseFloat((r.away_goals / awayShotsOnGoal * 100).toFixed(1)) : 0;

    // % отражённых вратарей команды = saves / броски в створ ПО НАШИМ ВРАТАРЯМ.
    // (Не делим на SOG соперника, потому что пустые ворота в знаменатель не идут.)
    const homeSavePct = r.home_shots_faced > 0
      ? parseFloat((homeSaves / r.home_shots_faced * 100).toFixed(1)) : 0;
    const awaySavePct = r.away_shots_faced > 0
      ? parseFloat((awaySaves / r.away_shots_faced * 100).toFixed(1)) : 0;
 
    // ── Разбивка игроков по командам ───────────────────────────────────
    const homeSkaters = skatersResult.rows.filter(p => p.team_id === r.home_team_id);
    const awaySkaters = skatersResult.rows.filter(p => p.team_id === r.away_team_id);
    const homeGoalies = goaliesResult.rows.filter(p => p.team_id === r.home_team_id);
    const awayGoalies = goaliesResult.rows.filter(p => p.team_id === r.away_team_id);

    // Заявка считается отправленной, если у команды есть игроки в составе
    // (строки game_rosters создаёт только submitMatchRoster).
    const homeRosterSubmitted = homeSkaters.length > 0 || homeGoalies.length > 0;
    const awayRosterSubmitted = awaySkaters.length > 0 || awayGoalies.length > 0;
 
    // Если броски не заполнены — отдаём null (фронт покажет «—», а не ноль).
    // shots_on_goal / shooting_pct зависят от бросков в створ команды (её атака),
    // saves / save_pct — от бросков в створ ПО ВРАТАРЯМ этой команды (её оборона).
    const homeHasFor = homeShotsOnGoal > 0;
    const awayHasFor = awayShotsOnGoal > 0;
    const homeHasAgainst = r.home_shots_faced > 0;
    const awayHasAgainst = r.away_shots_faced > 0;

    res.json({
      success: true,
      stats: {
        home: {
          shots_on_goal: homeHasFor ? homeShotsOnGoal : null,
          shooting_pct: homeHasFor ? homeShootingPct : null,
          pp_goals: r.home_pp_goals,
          sh_goals: r.home_sh_goals,
          pim: r.home_pim,
          saves: homeHasAgainst ? homeSaves : null,
          save_pct: homeHasAgainst ? homeSavePct : null,
          roster_submitted: homeRosterSubmitted,
          skaters: homeSkaters,
          goalies: homeGoalies
        },
        away: {
          shots_on_goal: awayHasFor ? awayShotsOnGoal : null,
          shooting_pct: awayHasFor ? awayShootingPct : null,
          pp_goals: r.away_pp_goals,
          sh_goals: r.away_sh_goals,
          pim: r.away_pim,
          saves: awayHasAgainst ? awaySaves : null,
          save_pct: awayHasAgainst ? awaySavePct : null,
          roster_submitted: awayRosterSubmitted,
          skaters: awaySkaters,
          goalies: awayGoalies
        }
      }
    });
  } catch (err) {
    console.error('Ошибка получения статистики матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ХОД МАТЧА — события по периодам (голы, штрафы, буллиты)
// =============================================================================
export const getMatchProtocol = async (req, res) => {
  try {
    const { eventId } = req.params;

    // Ленивая смена статуса (scheduled → finished_no_result после game_date).
    await promoteExpiredMatchesToNoResult(eventId);

    const query = `
      SELECT
        ge.id::int,
        ge.period::varchar,
        ge.time_seconds::int,
        ge.event_type::varchar,
        ge.team_id::int,
        ge.goal_strength::varchar,
        ge.from_shot::boolean,
        ge.penalty_minutes::int,
        ge.penalty_class::varchar,
        ge.penalty_violation::varchar,

        -- +/- по сторонам (нужно для пред-заполнения формы редактирования)
        COALESCE((
          SELECT array_agg(pm.player_id ORDER BY pm.id)
            FROM "public"."game_plus_minus" pm
           WHERE pm.event_id = ge.id AND pm.team_id = g.home_team_id
        ), ARRAY[]::int[]) AS plus_minus_home,
        COALESCE((
          SELECT array_agg(pm.player_id ORDER BY pm.id)
            FROM "public"."game_plus_minus" pm
           WHERE pm.event_id = ge.id AND pm.team_id = g.away_team_id
        ), ARRAY[]::int[]) AS plus_minus_away,

        -- Автор гола / оштрафованный
        scorer.id::int            AS scorer_id,
        scorer.first_name::varchar AS scorer_first_name,
        scorer.last_name::varchar  AS scorer_last_name,
        scorer_gr.jersey_number::int AS scorer_jersey,
        scorer_tm.photo_url::varchar AS scorer_photo,

        -- Ассистент 1
        a1.id::int                AS assist1_id,
        a1.first_name::varchar    AS assist1_first_name,
        a1.last_name::varchar     AS assist1_last_name,
        a1_gr.jersey_number::int  AS assist1_jersey,

        -- Ассистент 2
        a2.id::int                AS assist2_id,
        a2.first_name::varchar    AS assist2_first_name,
        a2.last_name::varchar     AS assist2_last_name,
        a2_gr.jersey_number::int  AS assist2_jersey,

        -- Вратарь (для буллитов)
        gk.first_name::varchar    AS goalie_first_name,
        gk.last_name::varchar     AS goalie_last_name,
        gk_gr.jersey_number::int  AS goalie_jersey

      FROM "public"."game_events" ge
      JOIN "public"."games" g ON g.id = ge.game_id

      -- Автор гола / нарушитель
      LEFT JOIN "public"."users" scorer
        ON scorer.id = COALESCE(ge.scorer_id, ge.penalty_player_id)
      LEFT JOIN "public"."game_rosters" scorer_gr
        ON scorer_gr.player_id = scorer.id AND scorer_gr.game_id = ge.game_id
      LEFT JOIN "public"."team_members" scorer_tm
        ON scorer_tm.user_id = scorer.id AND scorer_tm.team_id = ge.team_id

      -- Ассистент 1
      LEFT JOIN "public"."users" a1 ON a1.id = ge.assist1_id
      LEFT JOIN "public"."game_rosters" a1_gr
        ON a1_gr.player_id = a1.id AND a1_gr.game_id = ge.game_id

      -- Ассистент 2
      LEFT JOIN "public"."users" a2 ON a2.id = ge.assist2_id
      LEFT JOIN "public"."game_rosters" a2_gr
        ON a2_gr.player_id = a2.id AND a2_gr.game_id = ge.game_id

      -- Вратарь (буллит)
      LEFT JOIN "public"."users" gk ON gk.id = ge.against_goalie_id
      LEFT JOIN "public"."game_rosters" gk_gr
        ON gk_gr.player_id = gk.id AND gk_gr.game_id = ge.game_id

      WHERE ge.game_id = $1
        AND ge.event_type IN ('goal', 'penalty', 'shootout_goal', 'shootout_miss', 'failed_ps')
      ORDER BY
        CASE ge.period
          WHEN '1'  THEN 1
          WHEN '2'  THEN 2
          WHEN '3'  THEN 3
          WHEN 'OT' THEN 4
          WHEN 'SO' THEN 5
        END,
        ge.time_seconds ASC;
    `;

    const { rows } = await pool.query(query, [eventId]);

    // Группируем по периодам
    const periodOrder = ['1', '2', '3', 'OT', 'SO'];
    const periodLabels = {
      '1': '1-й период',
      '2': '2-й период',
      '3': '3-й период',
      'OT': 'Овертайм',
      'SO': 'Серия бросков',
    };

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.period]) grouped[row.period] = [];
      grouped[row.period].push(row);
    }

    const periods = periodOrder
      .filter(p => grouped[p])
      .map(p => ({
        period: p,
        label: periodLabels[p],
        events: grouped[p],
      }));

    res.json({ success: true, periods });
  } catch (err) {
    console.error('Ошибка получения хода матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};