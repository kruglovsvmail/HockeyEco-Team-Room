// matchController.js
// Универсальный контроллер матча — работает для любого типа игры (турнирной, товарищеской и т.д.)
import pool from '../config/db.js';

class MatchController {

  // Полная детализация матча: таймлайн + командная статистика + броски по вратарям
  async getGameDetails(req, res) {
    try {
      const { eventId: gameId } = req.params;

      // ── ТАЙМЛАЙН СОБЫТИЙ ────────────────────────────────────────────────────
      const timelineQuery = `
        SELECT
          ge.id,
          ge.event_type,
          ge.period,
          ge.time_seconds,
          ge.goal_strength,
          ge.penalty_minutes,
          ge.penalty_violation,
          ge.team_id,
          g.home_team_id,
          g.away_team_id,

          -- Автор гола / нарушитель
          scorer.id         AS scorer_id,
          scorer.first_name AS scorer_first,
          scorer.last_name  AS scorer_last,
          gr_scorer.jersey_number AS scorer_number,

          -- Ассистент 1
          a1.id         AS assist1_id,
          a1.first_name AS assist1_first,
          a1.last_name  AS assist1_last,
          gr_a1.jersey_number AS assist1_number,

          -- Ассистент 2
          a2.id         AS assist2_id,
          a2.first_name AS assist2_first,
          a2.last_name  AS assist2_last,
          gr_a2.jersey_number AS assist2_number,

          -- Нарушитель (штраф)
          pp.id         AS penalty_player_id,
          pp.first_name AS penalty_first,
          pp.last_name  AS penalty_last,
          gr_pp.jersey_number AS penalty_number

        FROM game_events ge
        JOIN games g ON ge.game_id = g.id

        LEFT JOIN users scorer ON ge.scorer_id = scorer.id
        LEFT JOIN game_rosters gr_scorer
               ON gr_scorer.game_id = ge.game_id
              AND gr_scorer.player_id = ge.scorer_id

        LEFT JOIN users a1 ON ge.assist1_id = a1.id
        LEFT JOIN game_rosters gr_a1
               ON gr_a1.game_id = ge.game_id
              AND gr_a1.player_id = ge.assist1_id

        LEFT JOIN users a2 ON ge.assist2_id = a2.id
        LEFT JOIN game_rosters gr_a2
               ON gr_a2.game_id = ge.game_id
              AND gr_a2.player_id = ge.assist2_id

        LEFT JOIN users pp ON ge.penalty_player_id = pp.id
        LEFT JOIN game_rosters gr_pp
               ON gr_pp.game_id = ge.game_id
              AND gr_pp.player_id = ge.penalty_player_id

        WHERE ge.game_id = $1
          AND ge.event_type IN ('goal', 'penalty', 'shootout_goal', 'shootout_miss')

        ORDER BY
          CASE ge.period
            WHEN '1'  THEN 1
            WHEN '2'  THEN 2
            WHEN '3'  THEN 3
            WHEN '4'  THEN 4
            WHEN '5'  THEN 5
            WHEN 'OT' THEN 99
            WHEN 'SO' THEN 100
            ELSE 101
          END,
          ge.time_seconds ASC
      `;

      const { rows: timeline } = await pool.query(timelineQuery, [gameId]);

      // ── БРОСКИ ПО ВРАТАРЯМ ──────────────────────────────────────────────────
      const goalieShotsQuery = `
        SELECT
          gsb.goalie_id,
          gsb.team_id,
          SUM(gsb.shots_count) AS total_shots,
          u.first_name,
          u.last_name,
          gr.jersey_number
        FROM game_shots_by_goalie gsb
        LEFT JOIN users u ON gsb.goalie_id = u.id
        LEFT JOIN game_rosters gr
               ON gr.game_id = $1
              AND gr.player_id = gsb.goalie_id
        WHERE gsb.game_id = $1
          AND gsb.goalie_id IS NOT NULL
        GROUP BY gsb.goalie_id, gsb.team_id, u.first_name, u.last_name, gr.jersey_number
        ORDER BY gsb.team_id, u.last_name
      `;
      const { rows: goalieShots } = await pool.query(goalieShotsQuery, [gameId]);

      // ── КОМАНДНАЯ СТАТИСТИКА ────────────────────────────────────────────────
      const teamEventsQuery = `
        SELECT
          ge.team_id,
          COUNT(*) FILTER (WHERE ge.event_type = 'goal')                                            AS goals,
          COUNT(*) FILTER (WHERE ge.event_type = 'goal' AND ge.goal_strength IN ('pp1', 'pp2'))     AS pp_goals,
          COUNT(*) FILTER (WHERE ge.event_type = 'goal' AND ge.goal_strength IN ('sh1', 'sh2'))     AS sh_goals,
          COALESCE(SUM(ge.penalty_minutes) FILTER (WHERE ge.event_type = 'penalty'), 0)             AS pim
        FROM game_events ge
        WHERE ge.game_id = $1
          AND ge.event_type IN ('goal', 'penalty')
        GROUP BY ge.team_id
      `;

      // Отражённые броски вратарей (shots_count = уже saves, НЕ shots faced)
      const teamGoalieSavesQuery = `
        SELECT team_id, SUM(shots_count) AS saves
        FROM game_shots_by_goalie
        WHERE game_id = $1
        GROUP BY team_id
      `;

      const [teamEventsResult, teamGoalieSavesResult] = await Promise.all([
        pool.query(teamEventsQuery, [gameId]),
        pool.query(teamGoalieSavesQuery, [gameId])
      ]);

      // home/away из таблицы games
      const gameInfoQuery = `SELECT home_team_id, away_team_id FROM games WHERE id = $1`;
      const { rows: [gameInfo] } = await pool.query(gameInfoQuery, [gameId]);

      const buildTeamStats = (teamId, opponentTeamId) => {
        const eventsRow = teamEventsResult.rows.find(r => Number(r.team_id) === Number(teamId));
        const opponentEventsRow = teamEventsResult.rows.find(r => Number(r.team_id) === Number(opponentTeamId));

        const goals = Number(eventsRow?.goals || 0);
        const ppGoals = Number(eventsRow?.pp_goals || 0);
        const shGoals = Number(eventsRow?.sh_goals || 0);
        const pim = Number(eventsRow?.pim || 0);

        // Отражённые: shots_count в game_shots_by_goalie — это УЖЕ saves
        const mySavesRow = teamGoalieSavesResult.rows.find(r => Number(r.team_id) === Number(teamId));
        const opponentSavesRow = teamGoalieSavesResult.rows.find(r => Number(r.team_id) === Number(opponentTeamId));

        const saves = Number(mySavesRow?.saves || 0);
        const opponentSaves = Number(opponentSavesRow?.saves || 0);
        const goalsAgainst = Number(opponentEventsRow?.goals || 0);

        // Броски в створ = отражённые вратарём соперника + забитые голы этой командой
        const totalShots = opponentSaves + goals;

        // % отражённых = saves / (saves + пропущенные голы)
        const saveDenom = saves + goalsAgainst;
        const savePct = saveDenom > 0 ? ((saves / saveDenom) * 100).toFixed(1) : '0.0';

        // % реализации = забитые / броски в створ
        const shootingPct = totalShots > 0 ? ((goals / totalShots) * 100).toFixed(1) : '0.0';

        return {
          shots: totalShots,
          shooting_pct: shootingPct,
          pp_goals: ppGoals,
          sh_goals: shGoals,
          pim,
          saves,
          save_pct: savePct
        };
      };

      const teamStats = gameInfo ? {
        home: buildTeamStats(gameInfo.home_team_id, gameInfo.away_team_id),
        away: buildTeamStats(gameInfo.away_team_id, gameInfo.home_team_id)
      } : null;

      return res.json({
        success: true,
        timeline,
        goalie_shots: goalieShots,
        team_stats: teamStats
      });
    } catch (err) {
      console.error('Ошибка в MatchController.getGameDetails:', err);
      return res.status(500).json({
        success: false,
        error: 'Ошибка сервера при загрузке данных матча'
      });
    }
  }

  // =============================================================================
  // СУДЕЙСКАЯ БРИГАДА МАТЧА
  // =============================================================================
  async getMatchStaff(req, res) {
    try {
      const { eventId: gameId } = req.params;

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

      const { rows } = await pool.query(query, [gameId]);
      res.json({ success: true, staff: rows });
    } catch (err) {
      console.error('Ошибка получения судейской бригады матча:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // =============================================================================
  // ИСТОРИЯ ОЧНЫХ ПРОТИВОСТОЯНИЙ H2H
  // =============================================================================
  async getMatchH2H(req, res) {
    try {
      const { eventId: gameId } = req.params;

      const gameRes = await pool.query(
        'SELECT home_team_id, away_team_id, away_external_id FROM "public"."games" WHERE id = $1',
        [gameId]
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

      let total = 0, wins = 0, draws = 0, losses = 0;
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

      res.json({ success: true, h2h: { summary: { total, wins, draws, losses }, games: rows } });
    } catch (err) {
      console.error('Ошибка получения истории встреч H2H:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // =============================================================================
  // ОБНОВЛЕНИЕ МЕДИА-ССЫЛОК
  // =============================================================================
  async updateMatchMedia(req, res) {
    try {
      const { eventId: gameId } = req.params;
      const { video_yt_url, video_vk_url } = req.body;
      const teamId = this._getTeamId(req);

      if (!teamId) {
        return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
      }

      const gameRes = await pool.query(
        'SELECT game_type, status, initiator_team_id FROM "public"."games" WHERE id = $1',
        [gameId]
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
        `UPDATE "public"."games" SET video_yt_url = $1, video_vk_url = $2, updated_at = NOW() WHERE id = $3`,
        [video_yt_url || null, video_vk_url || null, gameId]
      );

      res.json({ success: true, message: 'Ссылки на трансляции успешно обновлены' });
    } catch (err) {
      console.error('Ошибка обновления медиа-ссылок матча:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // =============================================================================
  // ОБНОВЛЕНИЕ РАСПИСАНИЯ: ДАТА, ВРЕМЯ, ЛОКАЦИЯ
  // =============================================================================
  async updateMatchSchedule(req, res) {
    try {
      const { eventId: gameId } = req.params;
      const { date, time, arena_id, location, location_url, custom_timezone } = req.body;
      const teamId = this._getTeamId(req);

      if (!teamId) {
        return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
      }

      const gameRes = await pool.query(
        'SELECT game_type, status, initiator_team_id, arena_id, custom_timezone, location, location_url FROM "public"."games" WHERE id = $1',
        [gameId]
      );

      if (gameRes.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Матч не найден' });
      }

      const game = gameRes.rows[0];

      if (game.game_type === 'official') {
        return res.status(400).json({ success: false, error: 'Запрещено менять дату, время или локацию официального матча' });
      }

      const finalArenaId = arena_id !== undefined ? arena_id : game.arena_id;
      const isManual = !finalArenaId;
      const finalLocation = isManual ? (location !== undefined ? location : game.location) : null;
      const finalLocationUrl = isManual ? (location_url !== undefined ? location_url : game.location_url) : null;
      const finalCustomTz = isManual ? (custom_timezone || game.custom_timezone || 'Europe/Moscow') : null;

      let arenaTz = 'Europe/Moscow';
      if (!isManual) {
        const arenaRes = await pool.query('SELECT timezone FROM "public"."arenas" WHERE id = $1', [finalArenaId]);
        if (arenaRes.rowCount > 0) arenaTz = arenaRes.rows[0].timezone;
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
        await pool.query(
          `UPDATE "public"."games" 
           SET game_date = (((game_date AT TIME ZONE $1)::date + $2::time)::timestamp AT TIME ZONE $1),
               arena_id = $3, location = $4, location_url = $5, custom_timezone = $6, updated_at = NOW() 
           WHERE id = $7`,
          [arenaTz, `${time}:00`, finalArenaId, finalLocation, finalLocationUrl, finalCustomTz, gameId]
        );
      } else if (game.game_type === 'friendly_ext' || game.game_type === 'tournament_ext') {
        if (!date || !time) {
          return res.status(400).json({ success: false, error: 'Для внешних матчей обязательны и дата, и время' });
        }
        const fullTimestamp = `${date} ${time}:00`;
        await pool.query(
          `UPDATE "public"."games" 
           SET game_date = $1::timestamp AT TIME ZONE $2,
               arena_id = $3, location = $4, location_url = $5, custom_timezone = $6, updated_at = NOW() 
           WHERE id = $7`,
          [fullTimestamp, arenaTz, finalArenaId, finalLocation, finalLocationUrl, finalCustomTz, gameId]
        );
      } else {
        return res.status(400).json({ success: false, error: 'Неподдерживаемый тип матча для изменения расписания' });
      }

      res.json({ success: true, message: 'Параметры расписания успешно сохранены' });
    } catch (err) {
      console.error('Ошибка обновления расписания матча:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // =============================================================================
  // ОБНОВЛЕНИЕ ФОРМЫ И ВЗНОСА
  // =============================================================================
  async updateMatchFinances(req, res) {
    try {
      const { eventId: gameId } = req.params;
      const { player_fee, home_jersey_type, away_jersey_type } = req.body;
      const teamId = this._getTeamId(req);

      if (!teamId) {
        return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
      }

      const gameRes = await pool.query(
        'SELECT game_type, status, initiator_team_id, home_team_id, away_team_id FROM "public"."games" WHERE id = $1',
        [gameId]
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

      if (game.game_type === 'official') {
        await pool.query(
          `UPDATE "public"."games" SET ${feeColumn} = $1, updated_at = NOW() WHERE id = $2`,
          [player_fee !== undefined ? player_fee : null, gameId]
        );
        return res.json({ success: true, message: 'Стоимость участия для игроков вашей команды успешно обновлена' });
      }

      if (game.game_type === 'friendly_pwa') {
        const isInitiator = Number(game.initiator_team_id) === teamId;
        if (!isInitiator) {
          await pool.query(
            `UPDATE "public"."games" SET ${feeColumn} = $1, updated_at = NOW() WHERE id = $2`,
            [player_fee !== undefined ? player_fee : null, gameId]
          );
          return res.json({ success: true, message: 'Стоимость участия для вашей команды успешно обновлена' });
        }
        if (game.status === 'pending') {
          await pool.query(
            `UPDATE "public"."games" SET ${feeColumn} = $1, home_jersey_type = $2, away_jersey_type = $3, updated_at = NOW() WHERE id = $4`,
            [player_fee !== undefined ? player_fee : null, home_jersey_type || null, away_jersey_type || null, gameId]
          );
        } else {
          await pool.query(
            `UPDATE "public"."games" SET ${feeColumn} = $1, updated_at = NOW() WHERE id = $2`,
            [player_fee !== undefined ? player_fee : null, gameId]
          );
        }
        return res.json({ success: true, message: 'Финансово-экипировочные параметры успешно сохранены' });
      }

      if (game.game_type === 'friendly_ext' || game.game_type === 'tournament_ext') {
        await pool.query(
          `UPDATE "public"."games" SET ${feeColumn} = $1, home_jersey_type = $2, away_jersey_type = $3, updated_at = NOW() WHERE id = $4`,
          [player_fee !== undefined ? player_fee : null, home_jersey_type || null, away_jersey_type || null, gameId]
        );
        return res.json({ success: true, message: 'Параметры внешнего матча успешно изменены' });
      }

      res.status(400).json({ success: false, error: 'Неизвестный тип игры' });
    } catch (err) {
      console.error('Ошибка обновления финансов и формы матча:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // =============================================================================
  // УДАЛЕНИЕ МАТЧА
  // =============================================================================
  async deleteMatch(req, res) {
    try {
      const { eventId: gameId } = req.params;
      const teamId = this._getTeamId(req);

      if (!teamId) {
        return res.status(400).json({ success: false, error: 'Параметр teamId обязателен' });
      }

      const numericId = Number(gameId);
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

      res.json({ success: true, message: 'Матч успешно удален из расписания календаря' });
    } catch (err) {
      console.error('Ошибка удаления матча из базы данных:', err);
      res.status(500).json({ success: false, error: `Ошибка бэкенда СУБД: ${err.message || 'Неизвестная ошибка'}` });
    }
  }

  // Вспомогательная функция извлечения teamId из запроса
  _getTeamId(req) {
    if (!req) return null;
    return Number(req.body?.teamId || req.query?.teamId || req.params?.teamId);
  }
}

export default new MatchController();