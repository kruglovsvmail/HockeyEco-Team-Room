import pool from '../config/db.js';

export const toggleEventAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    
    const { isAttending, eventType, teamId } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    switch (eventType) {
      case 'match':
        if (!teamId) return res.status(400).json({ success: false, error: 'teamId обязателен для матча' });
        if (isAttending) {
          await pool.query(`INSERT INTO team_game_attendance (game_id, user_id, team_id) VALUES ($1, $2, $3) ON CONFLICT ON CONSTRAINT team_game_att_unique DO NOTHING`, [eventId, userId, teamId]);
        } else {
          await pool.query(`DELETE FROM team_game_attendance WHERE game_id = $1 AND user_id = $2 AND team_id = $3`, [eventId, userId, teamId]);
        }
        break;

      case 'team_training':
        if (isAttending) {
          await pool.query(`INSERT INTO team_training_attendance (team_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_train_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM team_training_attendance WHERE team_training_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      case 'team_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO team_meeting_attendance (team_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_meet_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM team_meeting_attendance WHERE team_meeting_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      case 'club_training':
        if (isAttending) {
          await pool.query(`INSERT INTO club_training_attendance (club_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_train_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM club_training_attendance WHERE club_training_id = $1 AND user_id = $2`, [eventId, userId]);
        }
        break;

      case 'club_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO club_meeting_attendance (club_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_meet_att_unique DO NOTHING`, [eventId, userId]);
        } else {
          await pool.query(`DELETE FROM club_meeting_attendance WHERE club_meeting_id = $1 AND user_id = $2`, [eventId, userId]);
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