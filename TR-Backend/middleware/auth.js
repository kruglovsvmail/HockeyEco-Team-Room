import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { ROLES, PERMISSIONS } from '../utils/permissions.js';

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ message: 'Отсутствует токен доступа' });
  }

  const secret = process.env.JWT_SECRET || 'hockeyeco_pwa_secret_key';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Недействительный или просроченный токен' });
    }
    req.user = decoded; 
    next();
  });
};

const getTeamIdFromContext = async (req) => {
  if (req.params?.teamId) return req.params.teamId;
  if (req.body?.teamId) return req.body.teamId;

  const isTeamRoute = req.baseUrl?.includes('/api/teams') || req.originalUrl?.includes('/api/teams');
  if (req.params?.id && isTeamRoute) {
    return req.params.id;
  }

  if (req.params?.gameId || req.body?.gameId) {
    const gameId = req.params?.gameId || req.body?.gameId;
    const res = await pool.query(
      'SELECT home_team_id, away_team_id FROM games WHERE id = $1', 
      [gameId]
    );
    if (res.rows.length > 0) {
      return [res.rows[0].home_team_id, res.rows[0].away_team_id]; 
    }
  }

  if (req.params?.eventId || req.body?.eventId) {
    const eventId = req.params?.eventId || req.body?.eventId;
    const res = await pool.query(
      'SELECT my_team_id FROM events WHERE event_id = $1', 
      [eventId]
    );
    if (res.rows.length > 0) {
      return res.rows[0].my_team_id;
    }
  }

  return null;
};

export const requireTeamPermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Пользователь не идентифицирован' });
    }

    // Глобальный админ
    const userRes = await pool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.global_role === ROLES.GLOBAL_ADMIN) {
      return next();
    }

    const allowedRoles = PERMISSIONS[permissionKey];
    if (!allowedRoles || allowedRoles.length === 0) {
      return res.status(403).json({ message: 'Доступ закрыт' });
    }

    let teamIds = await getTeamIdFromContext(req);
    if (!teamIds) {
      return res.status(400).json({ message: 'Невозможно определить контекст команды для проверки прав' });
    }
    if (!Array.isArray(teamIds)) teamIds = [teamIds];

    let userRoles = [];

    for (const tId of teamIds) {
      // 1. Роли в команде (учитываем, что и членство, и роль должны быть активны)
      const trRes = await pool.query(`
        SELECT tr.role FROM team_roles tr 
        JOIN team_members tm ON tr.member_id = tm.id 
        WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
      `, [userId, tId]);
      userRoles.push(...trRes.rows.map(r => r.role));

      // 2. Роли в клубе (добавлена жесткая проверка cr.left_at IS NULL и cm.left_at IS NULL)
      const crRes = await pool.query(`
        SELECT cr.role FROM club_roles cr
        JOIN teams t ON t.club_id = cr.club_id
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
      `, [userId, tId]);
      userRoles.push(...crRes.rows.map(r => r.role));

      // 3. Проверка на активного игрока
      const memberRes = await pool.query(`
        SELECT id FROM team_members 
        WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
      `, [userId, tId]);
      if (memberRes.rows.length > 0) {
        userRoles.push(ROLES.PLAYER);
      }
    }

    const hasAccess = userRoles.some(role => allowedRoles.includes(role));

    if (!hasAccess) {
      return res.status(403).json({ message: 'Недостаточно прав доступа' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Team Error]:', err);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};