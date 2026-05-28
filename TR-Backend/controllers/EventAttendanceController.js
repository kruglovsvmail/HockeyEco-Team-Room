import pool from '../config/db.js';

export const getAvailableRoster = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    const gameCheck = await pool.query(
      `SELECT stage_type, division_id FROM games WHERE id = $1`,
      [eventId]
    );

    if (gameCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const { stage_type, division_id } = gameCheck.rows[0];
    let rosterRows = [];

    if ((stage_type === 'regular' || stage_type === 'playoff') && division_id) {
      const officialQuery = `
        SELECT 
          u.id AS user_id,
          u.first_name,
          u.last_name,
          u.avatar_url,
          tm.photo_url AS team_photo,
          tr.position,
          tr.jersey_number,
          tr.is_captain,
          tr.is_assistant,
          EXISTS (
            SELECT 1 FROM disqualifications dq 
            WHERE dq.tournament_roster_id = tr.id AND dq.status = 'active'
          ) AS is_disqualified
        FROM tournament_rosters tr
        JOIN users u ON tr.player_id = u.id
        JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
        WHERE tt.division_id = $1 
          AND tt.team_id = $2
          AND tr.period_end IS NULL
          AND tr.application_status = 'approved'
        ORDER BY u.last_name ASC, u.first_name ASC
      `;
      const result = await pool.query(officialQuery, [division_id, teamId]);
      rosterRows = result.rows;
    } else {
      const friendlyQuery = `
        SELECT 
          u.id AS user_id,
          u.first_name,
          u.last_name,
          u.avatar_url,
          tm.photo_url AS team_photo,
          tr.position,
          tr.jersey_number,
          tr.is_captain,
          tr.is_assistant,
          false AS is_disqualified
        FROM team_rosters tr
        JOIN team_members tm ON tr.member_id = tm.id
        JOIN users u ON tm.user_id = u.id
        WHERE tm.team_id = $1 
          AND tm.left_at IS NULL 
          AND tr.left_at IS NULL
        ORDER BY u.last_name ASC, u.first_name ASC
      `;
      const result = await pool.query(friendlyQuery, [teamId]);
      rosterRows = result.rows;
    }

    const staffQuery = `
      SELECT 
          tm.id as member_id, u.id as user_id, 
          string_agg(trole.role, ', ') as roles
      FROM team_roles trole
      JOIN team_members tm ON tm.id = trole.member_id
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
      GROUP BY tm.id, u.id
    `;
    const staffResult = await pool.query(staffQuery, [teamId]);

    res.json({ success: true, roster: rosterRows, staff: staffResult.rows });
  } catch (err) {
    console.error('Ошибка получения доступного состава:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const toggleEventAttendance = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { isAttending, eventType, teamId, targetUserId } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    const targetId = targetUserId || initiatorId;

    if (targetId !== initiatorId) {
      const roleCheckQuery = `
        SELECT 1 FROM team_members tm
        JOIN team_roles tr ON tr.member_id = tm.id
        WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
        UNION
        SELECT 1 FROM club_roles cr
        JOIN teams t ON t.club_id = cr.club_id
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL AND cr.role IN ('top_manager', 'club_admin')
        UNION
        SELECT 1 FROM users WHERE id = $1 AND global_role = 'admin'
      `;
      
      if (teamId) {
        const roleCheck = await pool.query(roleCheckQuery, [initiatorId, teamId]);
        if (roleCheck.rowCount === 0) {
          return res.status(403).json({ success: false, error: 'У вас нет прав администратора для отметки других пользователей' });
        }
      }
    }

    switch (eventType) {
      case 'match':
        if (!teamId) return res.status(400).json({ success: false, error: 'teamId обязателен для матча' });
        if (isAttending) {
          await pool.query(`INSERT INTO team_game_attendance (game_id, user_id, team_id) VALUES ($1, $2, $3) ON CONFLICT ON CONSTRAINT team_game_att_unique DO NOTHING`, [eventId, targetId, teamId]);
        } else {
          await pool.query(`DELETE FROM team_game_attendance WHERE game_id = $1 AND user_id = $2 AND team_id = $3`, [eventId, targetId, teamId]);
        }
        break;

      case 'team_training':
        if (isAttending) {
          await pool.query(`INSERT INTO team_training_attendance (team_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_train_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM team_training_attendance WHERE team_training_id = $1 AND user_id = $2`, [eventId, targetId]);
        }
        break;

      case 'team_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO team_meeting_attendance (team_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_meet_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM team_meeting_attendance WHERE team_meeting_id = $1 AND user_id = $2`, [eventId, targetId]);
        }
        break;

      case 'club_training':
        if (isAttending) {
          await pool.query(`INSERT INTO club_training_attendance (club_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_train_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM club_training_attendance WHERE club_training_id = $1 AND user_id = $2`, [eventId, targetId]);
        }
        break;

      case 'club_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO club_meeting_attendance (club_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_meet_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM club_meeting_attendance WHERE club_meeting_id = $1 AND user_id = $2`, [eventId, targetId]);
        }
        break;

      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип события' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка переключения тумблера:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const getEventAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventType, teamId } = req.query;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    let query = '';
    let params = [];

    switch (eventType) {
      case 'match': {
        if (!teamId) return res.status(400).json({ success: false, error: 'teamId обязателен для матча' });
        
        const gameCheck = await pool.query(
          `SELECT stage_type, division_id FROM games WHERE id = $1`,
          [eventId]
        );
        
        const stageType = gameCheck.rows[0]?.stage_type || 'friendly';
        const divisionId = gameCheck.rows[0]?.division_id;

        if ((stageType === 'regular' || stageType === 'playoff') && divisionId) {
          query = `
            SELECT u.id, u.first_name, u.last_name, tm.photo_url AS team_photo, u.avatar_url, tr.position, tga.has_pay_tag
            FROM team_game_attendance tga
            JOIN users u ON tga.user_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
            LEFT JOIN tournament_teams tt ON tt.division_id = $3 AND tt.team_id = $2
            LEFT JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id AND tr.player_id = u.id AND tr.period_end IS NULL
            WHERE tga.game_id = $1 AND tga.team_id = $2
            ORDER BY u.last_name ASC, u.first_name ASC
          `;
          params = [eventId, teamId, divisionId];
        } else {
          query = `
            SELECT u.id, u.first_name, u.last_name, tm.photo_url AS team_photo, u.avatar_url, tr.position, tga.has_pay_tag
            FROM team_game_attendance tga
            JOIN users u ON tga.user_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
            LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
            WHERE tga.game_id = $1 AND tga.team_id = $2
            ORDER BY u.last_name ASC, u.first_name ASC
          `;
          params = [eventId, teamId];
        }
        break;
      }

      case 'team_training':
        query = `
          SELECT u.id, u.first_name, u.last_name, u.avatar_url, tr.position, tta.has_pay_tag 
          FROM team_training_attendance tta 
          JOIN users u ON tta.user_id = u.id 
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE tta.team_training_id = $1 
          ORDER BY u.last_name ASC
        `;
        params = [eventId];
        break;

      case 'team_meeting':
        query = `
          SELECT u.id, u.first_name, u.last_name, u.avatar_url, tr.position, tma.has_pay_tag 
          FROM team_meeting_attendance tma 
          JOIN users u ON tma.user_id = u.id 
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE tma.team_meeting_id = $1 
          ORDER BY u.last_name ASC
        `;
        params = [eventId];
        break;

      case 'club_training':
        query = `
          SELECT u.id, u.first_name, u.last_name, u.avatar_url, tr.position, cta.has_pay_tag 
          FROM club_training_attendance cta 
          JOIN users u ON cta.user_id = u.id 
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE cta.club_training_id = $1 
          ORDER BY u.last_name ASC
        `;
        params = [eventId];
        break;

      case 'club_meeting':
        query = `
          SELECT u.id, u.first_name, u.last_name, u.avatar_url, tr.position, cma.has_pay_tag 
          FROM club_meeting_attendance cma 
          JOIN users u ON cma.user_id = u.id 
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE cma.club_meeting_id = $1 
          ORDER BY u.last_name ASC
        `;
        params = [eventId];
        break;

      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип события' });
    }

    const result = await pool.query(query, params);
    res.json({ success: true, attendees: result.rows });
  } catch (err) {
    console.error('Ошибка получения списка отметившихся:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const toggleEventAttendanceTag = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { eventType, teamId, targetUserId, hasPayTag } = req.body;

    if (!eventType || !targetUserId) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязателен' });
    }

    const roleCheckQuery = `
      SELECT 1 FROM team_members tm
      JOIN team_roles tr ON tr.member_id = tm.id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
      UNION
      SELECT 1 FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL AND cr.role IN ('top_manager', 'club_admin')
      UNION
      SELECT 1 FROM users WHERE id = $1 AND global_role = 'admin'
    `;
    
    if (teamId) {
      const roleCheck = await pool.query(roleCheckQuery, [initiatorId, teamId]);
      if (roleCheck.rowCount === 0) {
        return res.status(403).json({ success: false, error: 'У вас нет прав администратора для выставления пометок' });
      }
    }

    switch (eventType) {
      case 'match':
        await pool.query(`UPDATE team_game_attendance SET has_pay_tag = $1 WHERE game_id = $2 AND user_id = $3 AND team_id = $4`, [hasPayTag, eventId, targetUserId, teamId]);
        break;
      case 'team_training':
        await pool.query(`UPDATE team_training_attendance SET has_pay_tag = $1 WHERE team_training_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      case 'team_meeting':
        await pool.query(`UPDATE team_meeting_attendance SET has_pay_tag = $1 WHERE team_meeting_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      case 'club_training':
        await pool.query(`UPDATE club_training_attendance SET has_pay_tag = $1 WHERE club_training_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      case 'club_meeting':
        await pool.query(`UPDATE club_meeting_attendance SET has_pay_tag = $1 WHERE club_meeting_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип события' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения финансовой пометки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};