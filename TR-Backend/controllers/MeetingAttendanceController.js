import pool from '../config/db.js';
import { checkPermissionInternal, checkClubPermissionInternal } from '../utils/checkPermission.js';
import { sendPushToEventScopeExcept, getMeetingInfo, getUserName } from '../services/pushService.js';
import { getFeeContext, isAfterWithdrawDeadline, describeSplitFee } from '../utils/eventFees.js';

// =============================================================================
// ПЕРЕКЛЮЧЕНИЕ СТАТУСА ПРИСУТСТВИЯ НА СОБРАНИИ
// =============================================================================
export const toggleMeetingAttendance = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { isAttending, eventType, teamId, clubId, targetUserId, purge } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    const targetId = targetUserId || initiatorId;

    // purge — полное удаление отметки, в том числе снятой после дедлайна. Это
    // право руководителя, поэтому даже на самого себя идёт через ветку управления.
    const isPurge = purge === true;

    // Проверка прав: самоотметка или управление руководителем.
    // Клубное собрание живёт в контексте клуба, командное — в контексте команды.
    if (targetId === initiatorId && !isPurge) {
      if (clubId) {
        const hasAccess = await checkClubPermissionInternal(initiatorId, clubId, 'EVENT_SELF_ATTENDANCE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Доступ ограничен. Для самостоятельной отметки явки требуется продлить подписку' });
        }
      } else if (teamId) {
        const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'EVENT_SELF_ATTENDANCE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Доступ ограничен. Для самостоятельной отметки явки требуется продлить подписку' });
        }
      }
    } else {
      if (clubId) {
        const hasAccess = await checkClubPermissionInternal(initiatorId, clubId, 'CLUB_EVENT_ATTENDANCE_MANAGE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя' });
        }
      } else if (teamId) {
        const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MEETING_ATTENDANCE_MANAGE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя' });
        }
      }
    }

    if (eventType !== 'team_meeting' && eventType !== 'club_meeting') {
      return res.status(400).json({ success: false, error: 'Неизвестный тип собрания' });
    }

    const isClub = eventType === 'club_meeting';
    const table = isClub ? 'club_meeting_attendance' : 'team_meeting_attendance';
    const fk = isClub ? 'club_meeting_id' : 'team_meeting_id';
    const uniq = isClub ? 'club_meet_att_unique' : 'team_meet_att_unique';

    // Дедлайн снятия отметки — как у тренировок: после него отметка не удаляется,
    // а помечается withdrawn_at, и участник остаётся в делителе стоимости.
    // Амплуа на собрании не спрашиваем: список плоский, все участники платят
    // одинаково, освободить конкретного человека можно только вручную (free).
    const feeCtx = await getFeeContext(eventType, eventId, teamId);
    const lateWithdraw = !isAttending && !isPurge && isAfterWithdrawDeadline(feeCtx);

    if (isAttending) {
      await pool.query(
        `INSERT INTO ${table} (${fk}, user_id) VALUES ($1, $2)
         ON CONFLICT ON CONSTRAINT ${uniq} DO UPDATE SET withdrawn_at = NULL`,
        [eventId, targetId]
      );
    } else if (lateWithdraw) {
      await pool.query(
        `UPDATE ${table} SET withdrawn_at = NOW() WHERE ${fk} = $1 AND user_id = $2 AND withdrawn_at IS NULL`,
        [eventId, targetId]
      );
    } else {
      await pool.query(`DELETE FROM ${table} WHERE ${fk} = $1 AND user_id = $2`, [eventId, targetId]);
    }

    (async () => {
      const [name, info, feeText] = await Promise.all([
        getUserName(targetId),
        getMeetingInfo(eventId, eventType),
        lateWithdraw ? Promise.resolve('') : describeSplitFee(eventType, eventId, teamId),
      ]);
      sendPushToEventScopeExcept({ teamId, clubId }, targetId, 'attendance', {
        title: isAttending ? 'Новая отметка' : 'Снятие отметки',
        body: isAttending
          ? `${name} отметился на собрание: ${info.text}${feeText}`
          : `${name} снял отметку с собрания: ${info.text}${feeText}`,
        url: `/event/${eventType}/${eventId}`,
        tag: `attend-${eventId}-${targetId}`,
      });
    })().catch(() => {});

    res.json({ success: true, withdrawnLate: lateWithdraw });
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
            tma.has_pay_tag,
            tma.pay_role,
            tma.withdrawn_at,
            tma.final_fee
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
            cma.has_pay_tag,
            cma.pay_role,
            cma.withdrawn_at,
            cma.final_fee
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
    const { eventType, teamId, clubId, targetUserId, hasPayTag } = req.body;

    if (!eventType || !targetUserId) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязательны' });
    }

    if (clubId) {
      const hasAccess = await checkClubPermissionInternal(initiatorId, clubId, 'CLUB_EVENT_ATTENDANCE_MANAGE');
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя для выставления пометок' });
      }
    } else if (teamId) {
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
// club_meeting → общая база клуба (club_members), включая людей вне команд
//
// Также возвращает staff (роли участников: командные либо клубные).
// =============================================================================
export const getMeetingRoster = async (req, res) => {
  try {
    const { teamId, clubId, eventType } = req.query;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }
    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    let rosterRows = [];

    // ── Клубное собрание: состав клуба целиком ──────────────────────────────
    if (eventType === 'club_meeting' && clubId) {
      const rosterResult = await pool.query(
        `
        SELECT DISTINCT ON (u.id)
          u.id          AS user_id,
          u.first_name,
          u.last_name,
          u.avatar_url,
          u.avatar_url  AS team_photo,
          tr.position,
          tr.jersey_number,
          t.name        AS team_name
        FROM club_members cm
        JOIN users u          ON u.id = cm.user_id
        LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
        LEFT JOIN teams t         ON t.id = tm.team_id AND t.club_id = cm.club_id
        LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
        WHERE cm.club_id = $1 AND cm.left_at IS NULL
        ORDER BY u.id, t.name NULLS LAST, u.last_name ASC, u.first_name ASC
        `,
        [clubId]
      );

      const staffResult = await pool.query(
        `
        SELECT
          cm.id AS member_id,
          u.id  AS user_id,
          string_agg(CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END, ', ') AS roles
        FROM club_roles cr
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        JOIN users u          ON u.id = cr.user_id
        WHERE cr.club_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
        GROUP BY cm.id, u.id
        `,
        [clubId]
      );

      return res.json({
        success: true,
        roster: rosterResult.rows,
        staff:  staffResult.rows,
      });
    }

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

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
