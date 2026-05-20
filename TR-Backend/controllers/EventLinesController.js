import pool from '../config/db.js';

export const getMatchLines = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    // ДОБАВЛЕНО: Вытягиваем новые поля из team_formation_game
    const query = `
      SELECT 
        tfg.player_id, 
        tfg.line_number, 
        tfg.position_in_line,
        tfg.jersey_number,
        tfg.is_captain,
        tfg.is_assistant,
        u.first_name, 
        u.last_name, 
        COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
      FROM team_formation_game tfg
      JOIN users u ON u.id = tfg.player_id
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
      WHERE tfg.game_id = $1 AND tfg.team_id = $2
    `;

    const result = await pool.query(query, [eventId, teamId]);
    
    // Проверяем, есть ли отправленная официальная заявка в game_rosters
    const officialCheck = await pool.query(
      `SELECT 1 FROM game_rosters WHERE game_id = $1 AND team_id = $2 LIMIT 1`, 
      [eventId, teamId]
    );

    res.json({ 
      success: true, 
      isPublished: officialCheck.rowCount > 0, // Изменено: теперь Published означает наличие в game_rosters
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

    // Проверка прав тренера/менеджера (LINES_MANAGE)
    const roleCheckQuery = `
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.member_id = tm.id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL
      AND tr.role IN ('team_manager', 'team_admin', 'head_coach', 'coach')
      UNION
      SELECT 1 FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.role IN ('top_manager', 'club_admin')
      UNION
      SELECT 1 FROM users WHERE id = $1 AND global_role = 'admin'
    `;
    
    const roleCheck = await client.query(roleCheckQuery, [initiatorId, teamId]);
    if (roleCheck.rowCount === 0) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для сохранения расстановки' });
    }

    await client.query('BEGIN');
    
    // 1. Очищаем старый черновик
    await client.query(`DELETE FROM team_formation_game WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);
    
    // 2. ВАЖНО: Если тренер поменял состав, официальная заявка СБРАСЫВАЕТСЯ!
    await client.query(`DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);

    // 3. Записываем новый черновик
    if (lines.length > 0) {
      const insertQuery = `
        INSERT INTO team_formation_game (game_id, team_id, player_id, line_number, position_in_line, jersey_number, is_captain, is_assistant)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      for (const player of lines) {
        await client.query(insertQuery, [
          eventId, 
          teamId, 
          player.player_id, 
          player.line_number, 
          player.position_in_line,
          player.jersey_number || null,
          player.is_captain || false,
          player.is_assistant || false
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

// НОВЫЙ МЕТОД: Отправка официальной заявки в Лигу
export const submitMatchRoster = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    // 1. Проверка прав (ROSTER_SUBMIT) - Тренерам нельзя!
    const roleCheckQuery = `
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.member_id = tm.id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL
      AND tr.role IN ('team_manager', 'team_admin')
      UNION
      SELECT 1 FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.role IN ('top_manager', 'club_admin')
      UNION
      SELECT 1 FROM users WHERE id = $1 AND global_role = 'admin'
    `;
    
    const roleCheck = await client.query(roleCheckQuery, [initiatorId, teamId]);
    if (roleCheck.rowCount === 0) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для отправки официальной заявки' });
    }

    // 2. Проверка времени (за 8 минут)
    const gameQuery = await client.query(`SELECT game_date FROM games WHERE id = $1`, [eventId]);
    if (gameQuery.rowCount === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });

    const gameDate = new Date(gameQuery.rows[0].game_date);
    const now = new Date();
    const diffMinutes = (gameDate - now) / 1000 / 60;

    if (diffMinutes < 8) {
      return res.status(403).json({ success: false, error: 'Время подачи заявки вышло (менее 8 минут до старта)' });
    }

    // 3. Проверка на начавшийся матч (события)
    const eventsCheck = await client.query(`SELECT 1 FROM game_events WHERE game_id = $1 LIMIT 1`, [eventId]);
    if (eventsCheck.rowCount > 0) {
      return res.status(403).json({ success: false, error: 'Матч уже начался, изменение заявки невозможно' });
    }

    await client.query('BEGIN');
    
    // Удаляем старую заявку (если была)
    await client.query(`DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);

    // Переносим из черновика в официальный протокол
    const insertQuery = `
      INSERT INTO game_rosters (game_id, team_id, player_id, is_in_lineup, line_number, position_in_line, jersey_number, is_captain, is_assistant)
      SELECT game_id, team_id, player_id, true, line_number, position_in_line, jersey_number, is_captain, is_assistant
      FROM team_formation_game
      WHERE game_id = $1 AND team_id = $2
    `;
    await client.query(insertQuery, [eventId, teamId]);

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