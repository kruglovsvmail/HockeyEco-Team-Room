import pool from '../config/db.js';
import { checkPermissionInternal, checkClubPermissionInternal } from '../utils/checkPermission.js';
import { sendPushToEventScopeExcept, getTrainingInfo } from '../services/pushService.js';

export const getTrainingLines = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId, clubId, eventType } = req.query;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    const isClub = eventType === 'club_training';
    const table = isClub ? 'club_training' : 'team_training';

    const check = await pool.query(`SELECT id FROM "${table}" WHERE id = $1`, [eventId]);
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }

    // Клубная расстановка живёт в своей таблице: у неё нет команды, а фото человека
    // берётся из личного профиля — на общий лёд приходят игроки разных составов.
    if (isClub) {
      const result = await pool.query(`
        SELECT
          cft.player_id,
          cft.line_number,
          cft.position_in_line,
          cft.jersey_color,
          u.first_name,
          u.last_name,
          u.avatar_url
        FROM club_formation_training cft
        JOIN users u ON u.id = cft.player_id
        WHERE cft.club_training_id = $1 AND cft.club_id = $2
      `, [eventId, clubId]);

      return res.json({ success: true, lines: result.rows });
    }

    const result = await pool.query(`
      SELECT
        tft.player_id,
        tft.line_number,
        tft.position_in_line,
        tft.jersey_color,
        u.first_name,
        u.last_name,
        COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
      FROM team_formation_training tft
      JOIN users u ON u.id = tft.player_id
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
      WHERE tft.team_training_id = $1 AND tft.team_id = $2
    `, [eventId, teamId]);

    res.json({ success: true, lines: result.rows });
  } catch (err) {
    console.error('Ошибка получения расстановки тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const saveTrainingLines = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { teamId, clubId, eventType, lines } = req.body;

    if ((!teamId && !clubId) || !Array.isArray(lines)) {
      return res.status(400).json({ success: false, error: 'Некорректные данные' });
    }

    const isClub = eventType === 'club_training';

    // Расстановку на клубной тренировке ставит только тренер клуба
    const hasAccess = isClub
      ? await checkClubPermissionInternal(initiatorId, clubId, 'CLUB_TRAINING_LINES_MANAGE', client)
      : await checkPermissionInternal(initiatorId, teamId, 'TRAINING_LINES_MANAGE', client);

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для сохранения расстановки' });
    }

    const table = isClub ? 'club_training' : 'team_training';
    const check = await client.query(`SELECT id FROM "${table}" WHERE id = $1`, [eventId]);
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }

    await client.query('BEGIN');

    if (isClub) {
      await client.query(
        `DELETE FROM club_formation_training WHERE club_training_id = $1 AND club_id = $2`,
        [eventId, clubId]
      );

      for (const player of lines) {
        await client.query(`
          INSERT INTO club_formation_training (club_training_id, club_id, player_id, line_number, position_in_line, jersey_color)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [eventId, clubId, player.player_id, player.line_number, player.position_in_line, player.jersey_color || null]);
      }
    } else {
      await client.query(
        `DELETE FROM team_formation_training WHERE team_training_id = $1 AND team_id = $2`,
        [eventId, teamId]
      );

      for (const player of lines) {
        await client.query(`
          INSERT INTO team_formation_training (team_training_id, team_id, player_id, line_number, position_in_line, jersey_color)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [eventId, teamId, player.player_id, player.line_number, player.position_in_line, player.jersey_color || null]);
      }
    }

    await client.query('COMMIT');

    getTrainingInfo(eventId, eventType).then(info => {
      sendPushToEventScopeExcept({ teamId, clubId }, req.user.id, 'lines', {
        title: 'Состав на тренировку обновлён',
        body: info.text,
        url: `/event/${eventType}/${eventId}`,
        tag: `lines-${eventId}`,
      });
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка сохранения расстановки тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};
