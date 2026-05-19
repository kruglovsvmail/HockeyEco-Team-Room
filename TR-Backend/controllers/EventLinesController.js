import pool from '../config/db.js';

export const getMatchLines = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    const query = `
      SELECT 
        tfg.player_id, 
        tfg.line_number, 
        tfg.position_in_line,
        u.first_name, 
        u.last_name, 
        COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
      FROM team_formation_game tfg
      JOIN users u ON u.id = tfg.player_id
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
      WHERE tfg.game_id = $1 AND tfg.team_id = $2
    `;

    const result = await pool.query(query, [eventId, teamId]);
    
    res.json({ 
      success: true, 
      isPublished: result.rowCount > 0,
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

    // Проверка прав (как в отметках)
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
      return res.status(403).json({ success: false, error: 'У вас нет прав для публикации состава' });
    }

    // Начинаем транзакцию: удаляем старый состав и записываем новый
    await client.query('BEGIN');
    
    await client.query(`DELETE FROM team_formation_game WHERE game_id = $1 AND team_id = $2`, [eventId, teamId]);

    if (lines.length > 0) {
      const insertQuery = `
        INSERT INTO team_formation_game (game_id, team_id, player_id, line_number, position_in_line)
        VALUES ($1, $2, $3, $4, $5)
      `;
      for (const player of lines) {
        await client.query(insertQuery, [
          eventId, 
          teamId, 
          player.player_id, 
          player.line_number, 
          player.position_in_line
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