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
  if (req.params.teamId) return req.params.teamId;
  if (req.body.teamId) return req.body.teamId;

  if (req.params.gameId || req.body.gameId) {
    const gameId = req.params.gameId || req.body.gameId;
    const res = await pool.query(
      'SELECT home_team_id, away_team_id FROM games WHERE id = $1', 
      [gameId]
    );
    if (res.rows.length > 0) {
      return [res.rows[0].home_team_id, res.rows[0].away_team_id]; 
    }
  }
  return null;
};

export const requireTeamPermission = (permissionKey) => async (req, res, next) => {
  try {
    const userId = req.user.id;

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
      return res.status(400).json({ message: 'Невозможно определить контекст команды' });
    }
    if (!Array.isArray(teamIds)) teamIds = [teamIds];

    let userRoles = [];

    for (const tId of teamIds) {
      // Роли в команде
      const trRes = await pool.query(`
        SELECT role FROM team_roles tr 
        JOIN team_members tm ON tr.member_id = tm.id 
        WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL
      `, [userId, tId]);
      userRoles.push(...trRes.rows.map(r => r.role));

      // Роли в клубе
      const crRes = await pool.query(`
        SELECT cr.role FROM club_roles cr
        JOIN teams t ON t.club_id = cr.club_id
        WHERE cr.user_id = $1 AND t.id = $2
      `, [userId, tId]);
      userRoles.push(...crRes.rows.map(r => r.role));

      // Проверка на игрока
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