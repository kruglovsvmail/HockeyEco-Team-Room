import pool from '../config/db.js';
import { checkPermissionInternal } from '../utils/checkPermission.js';
import { sendPushToTeamExcept, getTrainingInfo, getUserName } from '../services/pushService.js';

// =============================================================================
// ПЕРЕКЛЮЧЕНИЕ СТАТУСА ПРИСУТСТВИЯ НА ТРЕНИРОВКЕ
// =============================================================================
export const toggleTrainingAttendance = async (req, res) => {
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
        const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'TRAINING_ATTENDANCE_MANAGE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя' });
        }
      }
    }

    switch (eventType) {
      case 'team_training':
        if (isAttending) {
          await pool.query(`INSERT INTO team_training_attendance (team_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT team_train_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM team_training_attendance WHERE team_training_id = $1 AND user_id = $2`, [eventId, targetId]);
        }
        break;

      case 'club_training':
        if (isAttending) {
          await pool.query(`INSERT INTO club_training_attendance (club_training_id, user_id) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT club_train_att_unique DO NOTHING`, [eventId, targetId]);
        } else {
          await pool.query(`DELETE FROM club_training_attendance WHERE club_training_id = $1 AND user_id = $2`, [eventId, targetId]);
        }
        break;

      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    (async () => {
      const [name, info] = await Promise.all([getUserName(targetId), getTrainingInfo(eventId, eventType)]);
      sendPushToTeamExcept(teamId, targetId, 'attendance', {
        title: isAttending ? 'Новая отметка' : 'Снятие отметки',
        body: isAttending
          ? `${name} отметился на тренировку: ${info.text}`
          : `${name} снял отметку с тренировки: ${info.text}`,
        url: `/event/${eventType}/${eventId}`,
        tag: `attend-${eventId}-${targetId}`,
      });
    })().catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка переключения присутствия на тренировке:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОЛУЧЕНИЕ СПИСКА ОТМЕТИВШИХСЯ НА ТРЕНИРОВКУ
// =============================================================================
export const getTrainingAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventType } = req.query;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    let query = '';
    let params = [eventId];

    switch (eventType) {
      case 'team_training':
        // photo_url берём из team_members команды, которой принадлежит тренировка
        query = `
          SELECT
            u.id, u.first_name, u.last_name, u.avatar_url,
            tm.photo_url AS team_photo,
            tr.position,
            tta.has_pay_tag
          FROM team_training_attendance tta
          JOIN users u ON tta.user_id = u.id
          JOIN team_training tt ON tt.id = tta.team_training_id
          LEFT JOIN team_members tm ON tm.user_id = u.id
            AND tm.team_id = tt.team_id
            AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE tta.team_training_id = $1
          ORDER BY u.last_name ASC, u.first_name ASC
        `;
        break;

      case 'club_training':
        // Клубная тренировка: игроки из разных команд клуба,
        // фото берём из avatar_url (личный профиль), position — из любого активного ростера
        query = `
          SELECT
            u.id, u.first_name, u.last_name,
            u.avatar_url,
            u.avatar_url AS team_photo,
            tr.position,
            cta.has_pay_tag
          FROM club_training_attendance cta
          JOIN users u ON cta.user_id = u.id
          LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
          LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
          WHERE cta.club_training_id = $1
          ORDER BY u.last_name ASC, u.first_name ASC
        `;
        break;

      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    const result = await pool.query(query, params);
    res.json({ success: true, attendees: result.rows });
  } catch (err) {
    console.error('Ошибка получения списка отметившихся на тренировку:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ФИНАНСОВАЯ ПОМЕТКА УЧАСТНИКА (₽) НА ТРЕНИРОВКЕ
// =============================================================================
export const toggleTrainingAttendanceTag = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { eventType, teamId, targetUserId, hasPayTag } = req.body;

    if (!eventType || !targetUserId) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязательны' });
    }

    if (teamId) {
      const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'TRAINING_ATTENDANCE_MANAGE');
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя для выставления пометок' });
      }
    }

    switch (eventType) {
      case 'team_training':
        await pool.query(`UPDATE team_training_attendance SET has_pay_tag = $1 WHERE team_training_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      case 'club_training':
        await pool.query(`UPDATE club_training_attendance SET has_pay_tag = $1 WHERE club_training_id = $2 AND user_id = $3`, [hasPayTag, eventId, targetUserId]);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения финансовой пометки на тренировке:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ДОСТУПНЫЙ СОСТАВ НА ТРЕНИРОВКУ (для шторки добавления участников)
//
// team_training → игроки из team_rosters данной команды
// club_training → игроки из всех team_rosters команд клуба (без дублей по user_id)
//
// Также возвращает staff (список ролей участников команды)
// =============================================================================
export const getTrainingRoster = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId, eventType } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }
    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    let rosterRows = [];

    if (eventType === 'team_training') {
      // ── Командная тренировка: состав только своей команды ─────────────────
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

    } else if (eventType === 'club_training') {
      // ── Клубная тренировка: состав всех команд клуба (без дублей) ─────────
      // Сначала определяем club_id команды, через которую открыта тренировка
      const clubRes = await pool.query(
        `SELECT club_id FROM teams WHERE id = $1`,
        [teamId]
      );

      if (clubRes.rowCount === 0 || !clubRes.rows[0].club_id) {
        // Команда не привязана к клубу — возвращаем только её состав
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

        // Все игроки всех команд клуба — DISTINCT ON (u.id) устраняет дубли
        // Приоритет отдаётся основной команде (той, через которую открыта тренировка)
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
            -- Игроки «основной» команды имеют приоритет при дублях
            (CASE WHEN tm.team_id = $2 THEN 0 ELSE 1 END),
            u.last_name ASC, u.first_name ASC
          `,
          [clubId, teamId]
        );
        rosterRows = result.rows;
      }

    } else {
      return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    // ── Штаб команды (роли) ─────────────────────────────────────────────────
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
    console.error('Ошибка получения состава на тренировку:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};