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
  if (req.query?.teamId) return req.query.teamId;

  const isTeamRoute = req.baseUrl?.includes('/api/teams') || req.originalUrl?.includes('/api/teams');
  if (req.params?.id && isTeamRoute) {
    return req.params.id;
  }

  // /:eventId и /:gameId — оба параметра указывают на games.id
  const matchId = req.params?.eventId || req.params?.gameId || req.body?.eventId || req.body?.gameId;
  if (matchId) {
    const res = await pool.query(
      'SELECT home_team_id, away_team_id FROM games WHERE id = $1',
      [matchId]
    );
    if (res.rows.length > 0) {
      return [res.rows[0].home_team_id, res.rows[0].away_team_id];
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

    // Извлекаем глобальную роль и дату окончания подписки пользователя
    const userRes = await pool.query(
      'SELECT global_role, subscription_expires_at FROM users WHERE id = $1', 
      [userId]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const { global_role, subscription_expires_at } = userRes.rows[0];

    // Глобальный суперадмин системы проходит всегда беспрепятственно
    if (global_role === ROLES.GLOBAL_ADMIN) {
      return next();
    }

    const permission = PERMISSIONS[permissionKey];
    if (!permission) {
      return res.status(403).json({ message: 'Доступ закрыт (Неизвестное правило прав)' });
    }

    let teamIds = await getTeamIdFromContext(req);
    if (!teamIds) {
      return res.status(400).json({ message: 'Невозможно определить контекст команды для проверки прав' });
    }
    if (!Array.isArray(teamIds)) teamIds = [teamIds];

    // Вычисляем статус личной подписки пользователя на текущий момент времени
    const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();

    let hasAccess = false;

    // Проверяем доступ изолированно по каждой команде из контекста запроса
    for (const tId of teamIds) {
      let userRoles = [];

      // 1. Динамическая проверка на Владельца команды (owner_id)
      const teamOwnerRes = await pool.query(
        'SELECT owner_id FROM teams WHERE id = $1',
        [tId]
      );
      if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
        userRoles.push(ROLES.OWNER);
      }

      // 2. Роли внутри команды (активное членство и активная роль)
      const trRes = await pool.query(`
        SELECT tr.role FROM team_roles tr 
        JOIN team_members tm ON tr.member_id = tm.id 
        WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
      `, [userId, tId]);
      userRoles.push(...trRes.rows.map(r => r.role));

      // 3. Роли внутри клуба (активное членство и активная роль)
      const crRes = await pool.query(`
        SELECT cr.role FROM club_roles cr
        JOIN teams t ON t.club_id = cr.club_id
        JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
        WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
      `, [userId, tId]);
      userRoles.push(...crRes.rows.map(r => r.role));

      // 4. Проверка на статус активного игрока состава
      const memberRes = await pool.query(`
        SELECT id FROM team_members 
        WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
      `, [userId, tId]);
      if (memberRes.rows.length > 0) {
        userRoles.push(ROLES.PLAYER);
      }

      // Атомарный анализ пересечения ролей для данной конкретной команды
      const teamHasAccess = userRoles.some(role => {
        // Если роль вообще не входит в список разрешенных для этого действия — пропускаем её
        if (!permission.allowedRoles.includes(role)) return false;

        // Выясняем, требует ли конкретно эта роль наличие подписки
        let roleRequiresSub = false;
        if (permission.requiresSubscription === true) {
          roleRequiresSub = true;
        } else if (Array.isArray(permission.requiresSubscription)) {
          roleRequiresSub = permission.requiresSubscription.includes(role);
        }

        // Если подписка для роли нужна, но у пользователя её нет — эта роль блокируется
        if (roleRequiresSub && !hasSubscription) {
          return false;
        }

        // Если роль подошла и прошла фильтр подписки — доступ открыт
        return true;
      });

      if (teamHasAccess) {
        hasAccess = true;
        break; // Достаточно подтверждения прав хотя бы по одной из контекстных команд
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Недостаточно прав доступа или требуется продление подписки' });
    }

    next();
  } catch (err) {
    console.error('[RBAC Team Error]:', err);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};