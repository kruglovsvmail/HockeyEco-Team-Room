import pool from '../config/db.js';
import { checkPermissionInternal } from '../utils/checkPermission.js';
import { sendPushToTeamExcept, getMeetingInfo, getUserName } from '../services/pushService.js';

// =============================================================================
// ПЕРЕКЛЮЧЕНИЕ СТАТУСА ПРИСУТСТВИЯ НА СОБРАНИИ
// =============================================================================
export const toggleMeetingAttendance = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { isAttending, eventType, teamId, targetUserId } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    const targetId = targetUserId || initiatorId;

    // Проверка прав: самоотметка или управление менеджером
    if (targetId === initiatorId) {
      if (teamId) {
        const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'EVENT_SELF_ATTENDANCE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Доступ ограничен. Для самостоятельной отметки явки требуется продлить подписку' });
        }
      }
    } else {
      if (teamId) {
        const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MEETING_ATTENDANCE_MANAGE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя' });
        }
      }
    }

    switch (eventType) {
      case 'team_meeting':
        if (isAttending) {
          await pool.query(`INSERT INTO team_meeting_attendance (team_meeting_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_meet_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM team_meeting_attendance WHERE team_meeting_id = $1 AND user_id = $2`, [eventId, targetId]);
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
        return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    (async () => {
      const [name, info] = await Promise.all([getUserName(targetId), getMeetingInfo(eventId, eventType)]);
      sendPushToTeamExcept(teamId, targetId, 'attendance', {
        title: isAttending ? 'Новая отметка' : 'Снятие отметки',
        body: isAttending
          ? `${name} отметился на собрание: ${info.text}`
          : `${name} снял отметку с собрания: ${info.text}`,
        url: `/event/${eventType}/${eventId}`,
        tag: `attend-${eventId}-${targetId}`,
      });
    })().catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка переключения присутствия на собрании:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОЛУЧЕНИЕ СПИСКА ОТМЕТИВШИХСЯ НА СОБРАНИЕ
// =============================================================================
export const getMeetingAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventType } = req.query;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    let query = '';
    let params = [eventId];

    switch (eventType) {
      case 'team_meeting':
        // photo_url берём из team_members команды, к которой относится собрание
        query = `
          SELECT
            u.id, u.first_name, u.last_name, u.avatar_url,
            tm.photo_url AS team_photo,
            tr.position,
            tma.has_pay_tag
          FROM team_meeting_attendance tma
          JOIN users u ON tma.user_id = u.id
          JOIN team_meeting tmtg ON tmtg.id = tma.team_meeting_id
          LEFT JOIN team_members tm ON tm.user_id = u.id
            AND tm.team_id = tmtg.team_id
            AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE tma.team_meeting_id = $1
          ORDER BY u.last_name ASC, u.first_name ASC
        `;
        break;

      case 'club_meeting':
        query = `
          SELECT
            u.id, u.first_name, u.last_name,
            u.avatar_url,
            u.avatar_url AS team_photo,
            tr.position,
            cma.has_pay_tag
          FROM club_meeting_attendance cma
          JOIN users u ON cma.user_id = u.id
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE cma.club_meeting_id = $1
          ORDER BY u.last_name ASC, u.first_name ASC
        `;
        break;

      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    const result = await pool.query(query, params);
    res.json({ success: true, attendees: result.rows });
  } catch (err) {
    console.error('Ошибка получения списка отметившихся на собрание:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ФИНАНСОВАЯ ПОМЕТКА УЧАСТНИКА (₽) НА СОБРАНИИ
// =============================================================================
export const toggleMeetingAttendanceTag = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { eventType, teamId, targetUserId, hasPayTag } = req.body;

    if (!eventType || !targetUserId) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязательны' });
    }

    if (teamId) {
      const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MEETING_ATTENDANCE_MANAGE');
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя для выставления пометок' });
      }
    }

    switch (eventType) {
      case 'team_meeting':
        await pool.query(`UPDATE team_meeting_attendance SET has_pay_tag = $1 WHERE team_meeting_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      case 'club_meeting':
        await pool.query(`UPDATE club_meeting_attendance SET has_pay_tag = $1 WHERE club_meeting_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения финансовой пометки на собрании:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ДОСТУПНЫЙ СОСТАВ НА СОБРАНИЕ (для шторки добавления участников)
//
// team_meeting → состав только своей команды
// club_meeting → состав всех команд клуба (без дублей по user_id)
//
// Также возвращает staff (роли участников команды) для проверки права управления.
// =============================================================================
export const getMeetingRoster = async (req, res) => {
  try {
    const { teamId, eventType } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    let rosterRows = [];

    if (eventType === 'team_meeting') {
      const result = await pool.query(
        `
        SELECT DISTINCT ON (u.id)
          u.id          AS user_id,
          u.first_name,
          u.last_name,
          u.avatar_url,
          tm.photo_url  AS team_photo,
          tr.position,
          tr.jersey_number,
          t.name        AS team_name
        FROM team_members tm
        JOIN users u          ON u.id  = tm.user_id
        JOIN team_rosters tr  ON tr.member_id = tm.id
        JOIN teams t          ON t.id  = tm.team_id
        WHERE tm.team_id  = $1
          AND tm.left_at  IS NULL
          AND tr.left_at  IS NULL
        ORDER BY u.id, u.last_name ASC, u.first_name ASC
        `,
        [teamId]
      );
      rosterRows = result.rows;

    } else if (eventType === 'club_meeting') {
      const clubRes = await pool.query(
        `SELECT club_id FROM teams WHERE id = $1`,
        [teamId]
      );

      if (clubRes.rowCount === 0 || !clubRes.rows[0].club_id) {
        const result = await pool.query(
          `
          SELECT DISTINCT ON (u.id)
            u.id          AS user_id,
            u.first_name,
            u.last_name,
            u.avatar_url,
            tm.photo_url  AS team_photo,
            tr.position,
            tr.jersey_number,
            t.name        AS team_name
          FROM team_members tm
          JOIN users u          ON u.id  = tm.user_id
          JOIN team_rosters tr  ON tr.member_id = tm.id
          JOIN teams t          ON t.id  = tm.team_id
          WHERE tm.team_id  = $1
            AND tm.left_at  IS NULL
            AND tr.left_at  IS NULL
          ORDER BY u.id, u.last_name ASC, u.first_name ASC
          `,
          [teamId]
        );
        rosterRows = result.rows;
      } else {
        const clubId = clubRes.rows[0].club_id;
        const result = await pool.query(
          `
          SELECT DISTINCT ON (u.id)
            u.id          AS user_id,
            u.first_name,
            u.last_name,
            u.avatar_url,
            tm.photo_url  AS team_photo,
            tr.position,
            tr.jersey_number,
            t.name        AS team_name
          FROM team_members tm
          JOIN users u          ON u.id  = tm.user_id
          JOIN team_rosters tr  ON tr.member_id = tm.id
          JOIN teams t          ON t.id  = tm.team_id
          WHERE t.club_id   = $1
            AND tm.left_at  IS NULL
            AND tr.left_at  IS NULL
          ORDER BY u.id,
            (CASE WHEN tm.team_id = $2 THEN 0 ELSE 1 END),
            u.last_name ASC, u.first_name ASC
          `,
          [clubId, teamId]
        );
        rosterRows = result.rows;
      }

    } else {
      return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    const staffResult = await pool.query(
      `
      SELECT
        tm.id AS member_id,
        u.id  AS user_id,
        string_agg(trole.role, ', ') AS roles
      FROM team_roles trole
      JOIN team_members tm ON tm.id = trole.member_id
      JOIN users u          ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND tm.left_at  IS NULL
        AND trole.left_at IS NULL
      GROUP BY tm.id, u.id
      `,
      [teamId]
    );

    res.json({
      success: true,
      roster: rosterRows,
      staff:  staffResult.rows,
    });
  } catch (err) {
    console.error('Ошибка получения состава на собрание:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
