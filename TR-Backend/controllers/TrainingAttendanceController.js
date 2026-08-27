import pool from '../config/db.js';
import { checkPermissionInternal, checkClubPermissionInternal } from '../utils/checkPermission.js';
import { sendPushToEventScopeExcept, getTrainingInfo, getUserName } from '../services/pushService.js';
import { resolvePayRole, getFeeContext, isAfterWithdrawDeadline, describeSplitFee } from '../utils/eventFees.js';

// =============================================================================
// ПЕРЕКЛЮЧЕНИЕ СТАТУСА ПРИСУТСТВИЯ НА ТРЕНИРОВКЕ
// =============================================================================
export const toggleTrainingAttendance = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { isAttending, eventType, teamId, clubId, targetUserId, purge } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }

    const targetId = targetUserId || initiatorId;

    // purge — полное удаление отметки, в том числе снятой после дедлайна.
    // Это право руководителя: обычное снятие после дедлайна оставляет строку,
    // чтобы человек остался плательщиком, а убрать его оттуда может только тот,
    // кто распоряжается отметками. Поэтому и на самого себя purge идёт через
    // ветку управления, а не самоотметки.
    const isPurge = purge === true;

    // Проверка прав: самоотметка или управление руководителем.
    // Клубная тренировка живёт в контексте клуба, командная — в контексте команды.
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
        const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'TRAINING_ATTENDANCE_MANAGE');
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя' });
        }
      }
    }

    if (eventType !== 'team_training' && eventType !== 'club_training') {
      return res.status(400).json({ success: false, error: 'Неизвестный тип тренировки' });
    }

    const isClub = eventType === 'club_training';
    const table = isClub ? 'club_training_attendance' : 'team_training_attendance';
    const fk = isClub ? 'club_training_id' : 'team_training_id';
    const uniq = isClub ? 'club_train_att_unique' : 'team_train_att_unique';

    // Дедлайн снятия отметки: до него отметка просто удаляется, после — остаётся
    // со штампом withdrawn_at. Такой участник продолжает считаться плательщиком
    // и не выпадает из делителя, иначе позднее снятие дорожало бы всем остальным.
    const feeCtx = await getFeeContext(eventType, eventId, teamId);
    const lateWithdraw = !isAttending && !isPurge && isAfterWithdrawDeadline(feeCtx);

    if (isAttending) {
      // pay_role пишем снимком только при первой отметке. При возврате после
      // позднего снятия роль не трогаем: ручное освобождение (free), выставленное
      // руководителем, повторная отметка перетереть не должна.
      const payRole = await resolvePayRole(targetId, eventType, { teamId, clubId });
      await pool.query(
        `INSERT INTO ${table} (${fk}, user_id, pay_role) VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT ${uniq} DO UPDATE SET withdrawn_at = NULL`,
        [eventId, targetId, payRole]
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
      // Стоимость дописываем в текст только когда она долевая и уже видима:
      // при позднем снятии цена не меняется (участник остался плательщиком),
      // поэтому там суммы нет вовсе.
      const [name, info, feeText] = await Promise.all([
        getUserName(targetId),
        getTrainingInfo(eventId, eventType),
        lateWithdraw ? Promise.resolve('') : describeSplitFee(eventType, eventId, teamId),
      ]);
      sendPushToEventScopeExcept({ teamId, clubId }, targetId, 'attendance', {
        title: isAttending ? 'Новая отметка' : 'Снятие отметки',
        body: isAttending
          ? `${name} отметился на тренировку: ${info.text}${feeText}`
          : `${name} снял отметку с тренировки: ${info.text}${feeText}`,
        url: `/event/${eventType}/${eventId}`,
        tag: `attend-${eventId}-${targetId}`,
      });
    })().catch(() => {});

    res.json({ success: true, withdrawnLate: lateWithdraw });
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
            tta.has_pay_tag,
            tta.pay_role,
            tta.withdrawn_at,
            tta.final_fee
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
            cta.has_pay_tag,
            cta.pay_role,
            cta.withdrawn_at,
            cta.final_fee
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
// club_training → общая база клуба (club_members), включая тех, кто пока
//                 не заявлен ни в одну команду — это и есть смысл клубного состава
//
// Также возвращает staff (роли участников: командные либо клубные)
// =============================================================================
export const getTrainingRoster = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId, clubId, eventType } = req.query;

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'eventType обязателен' });
    }
    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    let rosterRows = [];

    // ── Клубная тренировка: состав клуба целиком ────────────────────────────
    if (eventType === 'club_training' && clubId) {
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
