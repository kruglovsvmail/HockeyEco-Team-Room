import pool from '../config/db.js';
import { DEADLINES, PERMISSIONS } from '../utils/permissions.js';

/**
 * Внутренняя функция для проверки гранулярных прав доступа и подписки
 */
async function checkPermissionInternal(userId, teamId, permissionKey, client = pool) {
  if (!userId) return false;

  const userRes = await client.query(
    'SELECT global_role, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return false;
  const { global_role, subscription_expires_at } = userRes.rows[0];

  if (global_role === 'admin') return true;

  const permission = PERMISSIONS[permissionKey];
  if (!permission) return false;

  const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();
  let userRoles = [];

  if (teamId) {
    const teamOwnerRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
      userRoles.push('owner');
    }

    const trRes = await client.query(`
      SELECT tr.role FROM team_roles tr 
      JOIN team_members tm ON tr.member_id = tm.id 
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...trRes.rows.map(r => r.role));

    const crRes = await client.query(`
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...crRes.rows.map(r => r.role));

    const memberRes = await client.query(`
      SELECT id FROM team_members 
      WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
    `, [userId, teamId]);
    if (memberRes.rows.length > 0) {
      userRoles.push('player');
    }
  }

  return userRoles.some(role => {
    if (!permission.allowedRoles.includes(role)) return false;

    let roleRequiresSub = false;
    if (permission.requiresSubscription === true) {
      roleRequiresSub = true;
    } else if (Array.isArray(permission.requiresSubscription)) {
      roleRequiresSub = permission.requiresSubscription.includes(role);
    }

    if (roleRequiresSub && !hasSubscription) return false;
    return true;
  });
}

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
    
    const officialCheck = await pool.query(
      `SELECT 1 FROM game_rosters WHERE game_id = $1 AND team_id = $2 LIMIT 1`, 
      [eventId, teamId]
    );

    res.json({ 
      success: true, 
      isPublished: officialCheck.rowCount > 0,
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

    const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'LINES_MANAGE', client);
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

    await client.query('BEGIN');
    
    await client.query(`DELETE FROM team_formation_game WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);
    await client.query(`DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);

    if (lines.length > 0) {
      for (const player of lines) {
        let defaultJersey = player.jersey_number;
        let defaultCaptain = player.is_captain;
        let defaultAssistant = player.is_assistant;

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

    await client.query('COMMIT');
    res.json({ success: true });

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

    const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'LINES_EDIT_PLAYER_PARAMS', client);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется активная подписка руководителя' });
    }

    const eventsCheck = await client.query(`
      SELECT 1 FROM game_events WHERE game_id = $1
      UNION
      SELECT 1 FROM game_goalie_log WHERE game_id = $1
      UNION
      SELECT 1 FROM game_plus_minus gpm JOIN game_events ge ON gpm.event_id = ge.id WHERE ge.game_id = $1
      LIMIT 1
    `, [eventId]);
    if (eventsCheck.rowCount > 0) {
      return res.status(403).json({ success: false, error: 'Матч уже начался, изменение параметров игроков заблокировано' });
    }

    const gameQuery = await client.query(`SELECT game_date FROM games WHERE id = $1`, [eventId]);
    if (gameQuery.rowCount === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });

    const diffMinutes = (new Date(gameQuery.rows[0].game_date) - new Date()) / 1000 / 60;
    
    if (diffMinutes < DEADLINES.ROSTER_SUBMIT_MINUTES) {
      return res.status(403).json({ success: false, error: `Время изменения вышло (менее ${DEADLINES.ROSTER_SUBMIT_MINUTES} минут до старта)` });
    }

    await client.query('BEGIN');

    const currentLines = await client.query(
      `SELECT player_id, jersey_number, is_captain, is_assistant FROM team_formation_game WHERE game_id = $1 AND team_id = $2`,
      [eventId, teamId]
    );

    if (jerseyNumber !== undefined && jerseyNumber !== null && jerseyNumber !== '') {
      const duplicate = currentLines.rows.find(p => String(p.player_id) !== String(playerId) && p.jersey_number === parseInt(jerseyNumber));
      if (duplicate) {
        const uQuery = await client.query(`SELECT last_name FROM users WHERE id = $1`, [duplicate.player_id]);
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
        return res.status(400).json({ success: false, error: 'Уже назначено 2 ассистента. Снимите статус с другого игрока' });
      }
    }

    await client.query(`
      UPDATE team_formation_game 
      SET jersey_number = $4, is_captain = $5, is_assistant = $6
      WHERE game_id = $1 AND team_id = $2 AND player_id = $3
    `, [eventId, teamId, playerId, jerseyNumber === '' ? null : jerseyNumber, isCaptain || false, isAssistant || false]);

    await client.query(`DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);

    await client.query('COMMIT');
    res.json({ success: true });

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

    const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'ROSTER_SUBMIT', client);
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

    const eventsCheck = await client.query(`
      SELECT 1 FROM game_events WHERE game_id = $1
      UNION
      SELECT 1 FROM game_goalie_log WHERE game_id = $1
      UNION
      SELECT 1 FROM game_plus_minus gpm JOIN game_events ge ON gpm.event_id = ge.id WHERE ge.game_id = $1
      LIMIT 1
    `, [eventId]);
    if (eventsCheck.rowCount > 0) {
      return res.status(403).json({ success: false, error: 'Матч уже начался, изменение заявки невозможно' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);

    let insertQuery = '';
    let insertParams = [eventId, teamId];

    // Формирование официального протокола игры на основе локального или турнирного ростера
    if (game_type !== 'official') {
      insertQuery = `
        INSERT INTO game_rosters (game_id, team_id, player_id, is_in_lineup, line_number, position_in_line, jersey_number, is_captain, is_assistant)
        SELECT 
          tfg.game_id, tfg.team_id, tfg.player_id, true, tfg.line_number, tfg.position_in_line,
          COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
          COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
          COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant
        FROM team_formation_game tfg
        JOIN users u ON u.id = tfg.player_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
        WHERE tfg.game_id = $1 AND tfg.team_id = $2
      `;
    } else {
      insertQuery = `
        INSERT INTO game_rosters (game_id, team_id, player_id, is_in_lineup, line_number, position_in_line, jersey_number, is_captain, is_assistant)
        SELECT 
          tfg.game_id, tfg.team_id, tfg.player_id, true, tfg.line_number, tfg.position_in_line,
          COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
          COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
          COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant
        FROM team_formation_game tfg
        JOIN users u ON u.id = tfg.player_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        LEFT JOIN tournament_teams tt ON tt.team_id = $2 AND tt.division_id = $3
        LEFT JOIN tournament_rosters tr ON tr.player_id = u.id AND tr.tournament_team_id = tt.id AND tr.period_end IS NULL AND tr.application_status = 'approved'
        WHERE tfg.game_id = $1 AND tfg.team_id = $2
      `;
      insertParams.push(division_id);
    }

    await client.query(insertQuery, insertParams);
    await client.query('COMMIT');
    
    res.json({ success: true, message: 'Официальная заявка отправлена' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка отправки заявки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};