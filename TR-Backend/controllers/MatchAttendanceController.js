import pool from '../config/db.js';
import { checkPermissionInternal, getTeamIdFromRequest } from '../utils/checkPermission.js';
import { sendPushToTeamExcept, getMatchInfo, getUserName } from '../services/pushService.js';

// =============================================================================
// ДОСТУПНЫЙ СОСТАВ НА МАТЧ (с учетом регламентов и дисквалификаций)
// =============================================================================
export const getAvailableRoster = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    const gameCheck = await pool.query(
      `SELECT game_type, division_id FROM games WHERE id = $1`,
      [eventId]
    );

    if (gameCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const { game_type, division_id } = gameCheck.rows[0];
    let rosterRows = [];

    if (game_type === 'official' && division_id) {
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
    console.error('Ошибка получения доступного состава матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПЕРЕКЛЮЧЕНИЕ СТАТУСА ПРИСУТСТВИЯ НА МАТЧЕ
// =============================================================================
export const toggleMatchAttendance = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { isAttending, teamId, targetUserId } = req.body;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен для матча' });
    }

    const targetId = targetUserId || initiatorId;

    // Проверка прав: самоотметка или управление менеджером
    if (targetId === initiatorId) {
      const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'EVENT_SELF_ATTENDANCE');
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Доступ ограничен. Для самостоятельной отметки явки требуется продлить подписку' });
      }
    } else {
      const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MATCH_ATTENDANCE_MANAGE');
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя' });
      }
    }

    if (isAttending) {
      await pool.query(
        `INSERT INTO team_game_attendance (game_id, user_id, team_id) VALUES ($1, $2, $3) ON CONFLICT ON CONSTRAINT team_game_att_unique DO NOTHING`,
        [eventId, targetId, teamId]
      );
    } else {
      await pool.query(
        `DELETE FROM team_game_attendance WHERE game_id = $1 AND user_id = $2 AND team_id = $3`,
        [eventId, targetId, teamId]
      );
    }

    (async () => {
      const [name, info] = await Promise.all([getUserName(targetId), getMatchInfo(eventId)]);
      sendPushToTeamExcept(teamId, targetId, 'attendance', {
        title: isAttending ? 'Новая отметка' : 'Снятие отметки',
        body: isAttending
          ? `${name} отметился на матч: ${info.text}`
          : `${name} снял отметку с матча: ${info.text}`,
        url: `/event/match/${eventId}`,
        tag: `attend-${eventId}-${targetId}`,
      });
    })().catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка переключения присутствия на матче:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОЛУЧЕНИЕ СПИСКА ОТМЕТИВШИХСЯ НА МАТЧ
// =============================================================================
export const getMatchAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен для матча' });
    }

    const gameCheck = await pool.query(
      `SELECT game_type, division_id FROM games WHERE id = $1`,
      [eventId]
    );

    const gameType = gameCheck.rows[0]?.game_type || 'friendly_pwa';
    const divisionId = gameCheck.rows[0]?.division_id;

    let query = '';
    let params = [];

    if (gameType === 'official' && divisionId) {
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

    const result = await pool.query(query, params);
    res.json({ success: true, attendees: result.rows });
  } catch (err) {
    console.error('Ошибка получения списка отметившихся на матч:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ФИНАНСОВАЯ ПОМЕТКА ИГРОКА (₽) НА МАТЧЕ
// =============================================================================
export const toggleMatchAttendanceTag = async (req, res) => {
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { teamId, targetUserId, hasPayTag } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'targetUserId обязателен' });
    }

    if (teamId) {
      const hasAccess = await checkPermissionInternal(initiatorId, teamId, 'MATCH_ATTENDANCE_MANAGE');
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав доступа или требуется продление подписки руководителя для выставления пометок' });
      }
    }

    await pool.query(
      `UPDATE team_game_attendance SET has_pay_tag = $1 WHERE game_id = $2 AND user_id = $3 AND team_id = $4`,
      [hasPayTag, eventId, targetUserId, teamId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения финансовой пометки на матче:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОДТВЕРЖДЕНИЕ ТОВАРИЩЕСКОГО МАТЧА FRIENDLY_PWA
// =============================================================================
export const confirmFriendlyMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    const hasAccess = await checkPermissionInternal(userId, teamId, 'MATCH_CONFIRM_CANCEL');
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для подтверждения матча' });
    }

    const gameRes = await pool.query(
      `SELECT game_type, status, initiator_team_id, confirm_deadline, home_team_id, away_team_id 
       FROM games WHERE id = $1`,
      [eventId]
    );

    if (gameRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const game = gameRes.rows[0];

    if (game.game_type !== 'friendly_pwa') {
      return res.status(400).json({ success: false, error: 'Этот тип матча не поддерживает подтверждение через PWA' });
    }

    if (game.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Нельзя подтвердить матч в статусе: ${game.status}` });
    }

    if (Number(game.initiator_team_id) === Number(teamId)) {
      return res.status(400).json({ success: false, error: 'Команда-инициатор не может подтвердить собственный вызов' });
    }

    if (Number(game.home_team_id) !== Number(teamId) && Number(game.away_team_id) !== Number(teamId)) {
      return res.status(400).json({ success: false, error: 'Ваша команда не участвует в данном матче' });
    }

    if (game.confirm_deadline && new Date(game.confirm_deadline) < new Date()) {
      return res.status(400).json({ success: false, error: 'Срок подтверждения вызова на матч истек' });
    }

    await pool.query(
      `UPDATE games SET status = 'scheduled', updated_at = NOW() WHERE id = $1`,
      [eventId]
    );

    res.json({ success: true, message: 'Матч успешно подтвержден' });
  } catch (err) {
    console.error('Ошибка подтверждения матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ОТМЕНА ТОВАРИЩЕСКОГО МАТЧА FRIENDLY_PWA
// =============================================================================
export const cancelFriendlyMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const teamId = getTeamIdFromRequest(req);

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'teamId обязателен' });
    }

    const hasAccess = await checkPermissionInternal(userId, teamId, 'MATCH_CONFIRM_CANCEL');
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для управления статусом матча' });
    }

    const gameRes = await pool.query(
      `SELECT game_type, status, home_team_id, away_team_id 
       FROM games WHERE id = $1`,
      [eventId]
    );

    if (gameRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Матч не найден' });
    }

    const game = gameRes.rows[0];

    if (game.game_type !== 'friendly_pwa') {
      return res.status(400).json({ success: false, error: 'Этот тип матча не поддерживает отмену через PWA' });
    }

    if (game.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Можно отменить только матч, ожидающий подтверждения' });
    }

    if (Number(game.home_team_id) !== Number(teamId) && Number(game.away_team_id) !== Number(teamId)) {
      return res.status(400).json({ success: false, error: 'Ваша команда не участвует в данном матче' });
    }

    await pool.query(
      `UPDATE games SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [eventId]
    );

    res.json({ success: true, message: 'Матч успешно отменен' });
  } catch (err) {
    console.error('Ошибка отмены матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};