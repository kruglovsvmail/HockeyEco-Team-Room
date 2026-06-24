import pool from '../config/db.js';
import s3 from '../config/s3.js';
import path from 'path';
import { PERMISSIONS } from '../utils/permissions.js';
import { sendPushToTeamExcept } from '../services/pushService.js';

/**
 * Внутренняя функция для проверки гранулярных прав доступа и подписки
 */
async function checkPermissionInternal(userId, teamId, permissionKey, client = pool) {
  if (!userId) return false;

  const userRes = await client.query(
    'SELECT global_role, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return false;
  const { global_role, subscription_expires_at } = userRes.rows[0];

  if (global_role === 'admin') return true;

  const permission = PERMISSIONS[permissionKey];
  if (!permission) return false;

  const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();
  let userRoles = [];

  if (teamId) {
    const teamOwnerRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
      userRoles.push('owner');
    }

    const trRes = await client.query(`
      SELECT tr.role FROM team_roles tr 
      JOIN team_members tm ON tr.member_id = tm.id 
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...trRes.rows.map(r => r.role));

    const crRes = await client.query(`
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...crRes.rows.map(r => r.role));

    const memberRes = await client.query(`
      SELECT id FROM team_members 
      WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
    `, [userId, teamId]);
    if (memberRes.rows.length > 0) {
      userRoles.push('player');
    }
  }

  return userRoles.some(role => {
    if (!permission.allowedRoles.includes(role)) return false;

    let roleRequiresSub = false;
    if (permission.requiresSubscription === true) {
      roleRequiresSub = true;
    } else if (Array.isArray(permission.requiresSubscription)) {
      roleRequiresSub = permission.requiresSubscription.includes(role);
    }

    if (roleRequiresSub && !hasSubscription) return false;
    return true;
  });
}

// Получение всех команд текущего пользователя
export const getMyTeams = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Базовый список команд пользователя
        const teamsQuery = `
            SELECT DISTINCT t.id, t.name, t.short_name, t.logo_url, t.city, t.description,
                            t.jersey_dark_url, t.jersey_light_url, t.color_home_1, t.color_home_2,
                            t.color_away_1, t.color_away_2, t.owner_id
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.left_at IS NULL
            LEFT JOIN club_members cm ON cm.club_id = t.club_id AND cm.left_at IS NULL
            WHERE (tm.user_id = $1 OR cm.user_id = $1 OR t.owner_id = $1)
            ORDER BY t.name
        `;
        const { rows: teams } = await pool.query(teamsQuery, [userId]);

        if (teams.length === 0) {
            return res.json({ teams: [] });
        }

        const teamIds = teams.map(t => t.id);

        // 2. Роли пользователя в командах (team_roles)
        const teamRolesRes = await pool.query(`
            SELECT tm.team_id, tr.role
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            WHERE tm.user_id = $1 AND tm.team_id = ANY($2) AND tr.left_at IS NULL AND tm.left_at IS NULL
        `, [userId, teamIds]);

        // 3. Роли пользователя через клуб (club_roles → команды клуба)
        const clubRolesRes = await pool.query(`
            SELECT t.id AS team_id, cr.role
            FROM club_roles cr
            JOIN teams t ON t.club_id = cr.club_id
            JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
            WHERE cr.user_id = $1 AND t.id = ANY($2) AND cr.left_at IS NULL AND cm.left_at IS NULL
        `, [userId, teamIds]);

        // 4. Статус подписки пользователя
        const subRes = await pool.query(
            'SELECT subscription_expires_at FROM users WHERE id = $1',
            [userId]
        );
        const subExpires = subRes.rows[0]?.subscription_expires_at;
        const hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;

        // 5. Склеиваем роли в карту по team_id
        const rolesByTeam = {};
        for (const { team_id, role } of teamRolesRes.rows) {
            if (!rolesByTeam[team_id]) rolesByTeam[team_id] = new Set();
            rolesByTeam[team_id].add(role);
        }
        for (const { team_id, role } of clubRolesRes.rows) {
            if (!rolesByTeam[team_id]) rolesByTeam[team_id] = new Set();
            rolesByTeam[team_id].add(role);
        }

        // 6. Собираем итоговый массив команд с ролями
        const enrichedTeams = teams.map(team => {
            const isOwner = team.owner_id === userId;
            const roles = Array.from(rolesByTeam[team.id] || []);
            if (isOwner) roles.unshift('owner');

            return {
                ...team,
                user_role: roles.join(','),       // строка для обратной совместимости с фолбеком
                user_roles: roles,                 // массив для accessMatrix
                has_subscription: hasSubscription,
                is_owner: isOwner,
            };
        });

        res.json({ teams: enrichedTeams });
    } catch (error) {
        console.error('[Get My Teams Error]:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Получение детализированных списков участников хоккейной команды
export const getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.id;
        
        // 1. Запрос полного списка членов команды (активные участники состава)
        const membersQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date, u.height, u.weight,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            LEFT JOIN team_rosters tr ON tm.id = tr.member_id AND tr.left_at IS NULL
            WHERE tm.team_id = $1 AND tm.left_at IS NULL
            ORDER BY u.last_name, u.first_name
        `;

        // 2. Запрос активного игрового ростера на турниры
        const rosterQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date, u.height, u.weight,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
            FROM team_rosters tr
            JOIN team_members tm ON tm.id = tr.member_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
            ORDER BY tr.jersey_number
        `;
        
        // 3. Запрос административного и тренерского штаба
        const staffQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                string_agg(trole.role, ', ') as roles
            FROM team_roles trole
            JOIN team_members tm ON tm.id = trole.member_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
            GROUP BY tm.id, u.id, u.first_name, u.last_name, tm.photo_url, u.avatar_url, u.birth_date
            ORDER BY u.last_name, u.first_name
        `;
        
        const [membersRes, rosterRes, staffRes] = await Promise.all([
            pool.query(membersQuery, [teamId]),
            pool.query(rosterQuery, [teamId]),
            pool.query(staffQuery, [teamId])
        ]);
        
        res.json({ 
            members: membersRes.rows, 
            roster: rosterRes.rows, 
            staff: staffRes.rows 
        });
    } catch (error) {
        console.error('[Get Team Details Error]:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Получение анкеты участника команды с селективной защитой виртуального кода и выдачей карты прав
export const getTeamMemberDetails = async (req, res) => {
  const { teamId, userId } = req.params;
  const reqUserId = req.user?.id;

  try {
    if (!reqUserId) {
      return res.status(401).json({ error: 'Пользователь не идентифицирован' });
    }

    // Вычисляем динамические права на основе эталонной матрицы permissions.js
    const canEditRoles = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_ROLES');
    const canEditGameProfile = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_HOCKEY');
    const canEditHeader = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_BASE');
    const canViewVirtualCode = await checkPermissionInternal(reqUserId, teamId, 'VIEW_VIRTUAL_CODE');

    const query = `
      SELECT 
        u.id as user_id, tm.id as member_id, u.first_name, u.last_name, u.middle_name, 
        u.phone, u.birth_date, u.height, u.weight, u.grip, u.virtual_code,
        tm.photo_url as team_photo_url,
        COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
        tr.id as roster_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant,
        (
          SELECT string_agg(trole.role, ', ') 
          FROM team_roles trole 
          WHERE trole.member_id = tm.id AND trole.left_at IS NULL
        ) as roles
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_rosters tr ON tm.id = tr.member_id AND tr.left_at IS NULL
      WHERE tm.team_id = $1 AND u.id = $2 AND tm.left_at IS NULL
    `;

    const { rows } = await pool.query(query, [teamId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Участник команды не найден' });
    }

    const memberData = rows[0];

    // Если у пользователя нет прав (или нет подписки) — скрываем виртуальный код
    if (!canViewVirtualCode) {
      delete memberData.virtual_code;
    }

    res.json({ 
      success: true, 
      member: memberData, 
      isManager: canViewVirtualCode,
      isOwnProfile: reqUserId === memberData.user_id,
      permissions: {
        canEditRoles,
        canEditGameProfile,
        canEditHeader
      }
    });
  } catch (error) {
    console.error('[Get Team Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Интерактивное автоматическое сохранение параметров участника команды руководителем / админом
export const updateMemberDetails = async (req, res) => {
  const { teamId, memberId } = req.params;
  const { position, jerseyNumber, roles, isCaptain, isAssistant } = req.body;
  const reqUserId = req.user?.id;

  try {
    await pool.query('BEGIN');

    // 1. ПРОВЕРКА ПРАВ ДЛЯ ИГРОВОГО ПРОФИЛЬНОГО БЛОКА
    if (position !== undefined || jerseyNumber !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_HOCKEY');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Недостаточно прав или требуется продлить подписку для изменения игрового профиля' });
      }

      if (jerseyNumber) {
        const numCheck = await pool.query(
          `SELECT 1 FROM team_rosters 
           WHERE team_id = $1 AND jersey_number = $2 AND member_id != $3 AND left_at IS NULL`,
          [teamId, jerseyNumber, memberId]
        );
        if (numCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Этот игровой номер уже занят другим активным игроком' });
        }
      }

      await pool.query(
        `UPDATE team_rosters 
         SET position = COALESCE($1, position), 
             jersey_number = COALESCE($2, jersey_number)
         WHERE member_id = $3 AND team_id = $4 AND left_at IS NULL`,
        [position, jerseyNumber, memberId, teamId]
      );
    }

    // 2. ПРОВЕРКА ПРАВ ДЛЯ БЛОКА ШАПКИ/КАПИТАНСТВА
    if (isCaptain !== undefined || isAssistant !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_BASE');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Недостаточно прав или требуется продлить подписку для изменения капитанских статусов' });
      }

      if (isCaptain !== undefined) {
        if (isCaptain === true) {
          await pool.query(
            `UPDATE team_rosters SET is_captain = false WHERE team_id = $1 AND left_at IS NULL`,
            [teamId]
          );
          await pool.query(
            `UPDATE team_rosters SET is_captain = true, is_assistant = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        } else {
          await pool.query(
            `UPDATE team_rosters SET is_captain = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        }
      }

      if (isAssistant !== undefined) {
        if (isAssistant === true) {
          const assistCheck = await pool.query(
            `SELECT COUNT(*) FROM team_rosters 
             WHERE team_id = $1 AND is_assistant = true AND member_id != $2 AND left_at IS NULL`,
            [teamId, memberId]
          );
          if (parseInt(assistCheck.rows[0].count) >= 2) {
            return res.status(400).json({ error: 'В ростере команды уже зафиксировано 2 ассистента' });
          }
          await pool.query(
            `UPDATE team_rosters SET is_assistant = true, is_captain = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        } else {
          await pool.query(
            `UPDATE team_rosters SET is_assistant = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        }
      }
    }

    // 3. ПРОВЕРКА ПРАВ ДЛЯ АДМИНИСТРАТИВНЫХ СТАТУСОВ (Управление ролями)
    if (roles !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_ROLES');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Недостаточно прав или требуется продлить подписку для изменения административного статуса' });
      }

      const memberUserRes = await pool.query(
        `SELECT user_id FROM team_members WHERE id = $1`,
        [memberId]
      );
      
      const rolesArray = roles.split(',').map(r => r.trim()).filter(Boolean);

      // Защита от саморазжалования руководителя
      if (memberUserRes.rows.length > 0 && memberUserRes.rows[0].user_id === reqUserId) {
        if (!rolesArray.includes('team_manager')) {
          return res.status(400).json({ error: 'Вы не можете лишить самого себя роли Руководителя команды' });
        }
      }

      if (rolesArray.length > 0) {
        await pool.query(
          `UPDATE team_roles 
           SET left_at = CURRENT_DATE 
           WHERE member_id = $1 AND left_at IS NULL AND NOT (role = ANY($2))`,
          [memberId, rolesArray]
        );
      } else {
        await pool.query(
          `UPDATE team_roles 
           SET left_at = CURRENT_DATE 
           WHERE member_id = $1 AND left_at IS NULL`,
          [memberId]
        );
      }

      for (const role of rolesArray) {
        await pool.query(
          `INSERT INTO team_roles (member_id, role, joined_at, left_at) 
           VALUES ($1, $2, NOW(), NULL)
           ON CONFLICT (member_id, role) 
           DO UPDATE SET left_at = NULL`,
          [memberId, role]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true, message: 'Изменения успешно сохранены' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('[Update Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Вспомогательный метод загрузки в S3-хранилище
const uploadBufferToS3 = async (file, bucketKey) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
    Key: bucketKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  if (s3 && typeof s3.send === 'function') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    return s3.send(new PutObjectCommand(params));
  }
  if (s3 && typeof s3.putObject === 'function') {
    const request = s3.putObject(params);
    return typeof request.promise === 'function' ? request.promise() : request;
  }
  throw new Error('S3 Client не настроен на сервере');
};

// Метод загрузки/замены кастомной аватарки игрока в S3
export const updateMemberPhoto = async (req, res) => {
  const { teamId, memberId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Файл фотографии не предоставлен' });
  }

  try {
    const memberRes = await pool.query(
      `SELECT user_id FROM team_members WHERE id = $1 AND team_id = $2 AND left_at IS NULL`,
      [memberId, teamId]
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ error: 'Участник состава не найден или заархивирован' });
    }
    const userId = memberRes.rows[0].user_id;

    const ext = path.extname(req.file.originalname) || '.png';
    const bucketKey = `uploads/teams_${teamId}_users_${userId}_photo${ext}`;
    
    await uploadBufferToS3(req.file, bucketKey);
    const photoUrl = `/${bucketKey}`;

    await pool.query(
      `UPDATE team_members SET photo_url = $1 WHERE id = $2 AND team_id = $3`,
      [photoUrl, memberId, teamId]
    );

    res.json({ success: true, photo_url: photoUrl });
  } catch (error) {
    console.error('[Update Member Photo Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Метод удаления кастомного фото участника
export const deleteMemberPhoto = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    await pool.query(
      `UPDATE team_members SET photo_url = NULL WHERE id = $1 AND team_id = $2 AND left_at IS NULL`,
      [memberId, teamId]
    );
    res.json({ success: true, message: 'Фотография успешно удалена' });
  } catch (error) {
    console.error('[Delete Member Photo Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Обновление визуального профиля хоккейной команды
export const updateTeamProfile = async (req, res) => {
  try {
    const teamId = req.params.id;
    const { 
      name, short_name, city, description, 
      color_home_1, color_home_2, color_away_1, color_away_2,
      delete_logo, delete_jersey_dark, delete_jersey_light
    } = req.body;

    let logo_url = undefined;
    let jersey_dark_url = undefined;
    let jersey_light_url = undefined;

    if (req.files?.['logo']?.[0]) {
      const file = req.files['logo'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_logo${ext}`;
      await uploadBufferToS3(file, key);
      logo_url = `/${key}`;
    } else if (delete_logo === 'true') {
      logo_url = null;
    }

    if (req.files?.['jersey_dark']?.[0]) {
      const file = req.files['jersey_dark'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_dark${ext}`;
      await uploadBufferToS3(file, key);
      jersey_dark_url = `/${key}`;
    } else if (delete_jersey_dark === 'true') {
      jersey_dark_url = null;
    }

    if (req.files?.['jersey_light']?.[0]) {
      const file = req.files['jersey_light'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_light${ext}`;
      await uploadBufferToS3(file, key);
      jersey_light_url = `/${key}`;
    } else if (delete_jersey_light === 'true') {
      jersey_light_url = null;
    }

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    const pushField = (columnName, value) => {
      if (value !== undefined) {
        updateFields.push(`"${columnName}" = $${counter}`);
        queryValues.push(value);
        counter++;
      }
    };

    pushField('name', name);
    pushField('short_name', short_name);
    pushField('city', city);
    pushField('description', description);
    pushField('color_home_1', color_home_1);
    pushField('color_home_2', color_home_2);
    pushField('color_away_1', color_away_1);
    pushField('color_away_2', color_away_2);

    if (logo_url !== undefined) pushField('logo_url', logo_url);
    if (jersey_dark_url !== undefined) pushField('jersey_dark_url', jersey_dark_url);
    if (jersey_light_url !== undefined) pushField('jersey_light_url', jersey_light_url);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    queryValues.push(teamId);
    const sqlQuery = `
      UPDATE teams 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${counter} 
      RETURNING *
    `;

    const { rows } = await pool.query(sqlQuery, queryValues);
    res.json({ success: true, team: rows[0] });

  } catch (error) {
    console.error('[Update Team Profile Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Исключение участника из игрового ростера на турнир
export const excludeFromRoster = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    const updateRosterQuery = `
      UPDATE team_rosters 
      SET left_at = CURRENT_DATE 
      WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateRosterQuery, [memberId, teamId]);
    res.json({ success: true, message: 'Игрок успешно исключен из турнирного ростера' });
  } catch (error) {
    console.error('[Exclude From Roster Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Полное исключение из членства команды (состав + ростер)
export const excludeFromMembership = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    await pool.query('BEGIN');

    const updateMemberQuery = `
      UPDATE team_members 
      SET left_at = CURRENT_DATE 
      WHERE id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateMemberQuery, [memberId, teamId]);

    const updateRosterQuery = `
      UPDATE team_rosters 
      SET left_at = CURRENT_DATE 
      WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateRosterQuery, [memberId, teamId]);

    await pool.query('COMMIT');

    // Push: участник покинул команду
    const { rows: [excluded] } = await pool.query(
      'SELECT u.last_name, u.first_name FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.id = $1',
      [memberId]
    );
    const eName = excluded ? `${excluded.last_name} ${excluded.first_name}` : 'Участник';
    sendPushToTeamExcept(teamId, null, 'team_news', {
      title: 'Уход из команды', body: `${eName} покинул команду`,
      url: '/my-team', tag: `member-leave-${memberId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'Пользователь полностью удален из состава и ростеров команды' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('[Exclude From Membership Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Поиск зарегистрированного пользователя по номеру телефона
export const searchUserByPhone = async (req, res) => {
  const { teamId } = req.params;
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'Параметр phone обязателен' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const last10Digits = cleanPhone.slice(-10);

    const query = `
      SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.virtual_code, u.status,
             (tm.id IS NOT NULL AND tm.left_at IS NULL) as is_already_in_team,
             (tm.id IS NOT NULL AND tm.left_at IS NOT NULL) as is_archived_in_team
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1
      WHERE right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [teamId, last10Digits]);

    if (rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь с таким номером не зарегистрирован' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('[Search User By Phone Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Добавление или восстановление членства пользователя в команде
export const addOrRestoreTeamMember = async (req, res) => {
  const { teamId } = req.params;
  const { userId } = req.body;

  try {
    const checkQuery = `SELECT id, left_at FROM team_members WHERE team_id = $1 AND user_id = $2`;
    const { rows } = await pool.query(checkQuery, [teamId, userId]);

    if (rows.length > 0) {
      const existing = rows[0];
      if (existing.left_at === null) {
        return res.status(400).json({ error: 'Пользователь уже находится в составе команды' });
      }

      await pool.query(
        `UPDATE team_members SET left_at = NULL, joined_at = CURRENT_DATE WHERE id = $1`, 
        [existing.id]
      );
      // Push: участник вернулся
      const { rows: [restored] } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
      const rName = restored ? `${restored.last_name} ${restored.first_name}` : 'Участник';
      sendPushToTeamExcept(teamId, userId, 'team_news', {
        title: 'Возвращение в команду', body: `${rName} вернулся в состав`,
        url: '/my-team', tag: `member-join-${userId}`,
      }).catch(() => {});

      return res.json({ success: true, message: 'Членство пользователя в команде успешно восстановлено' });
    }

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)`,
      [teamId, userId]
    );

    // Push: новый участник
    const { rows: [added] } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
    const aName = added ? `${added.last_name} ${added.first_name}` : 'Новый участник';
    sendPushToTeamExcept(teamId, userId, 'team_news', {
      title: 'Новый участник', body: `${aName} добавлен в состав`,
      url: '/my-team', tag: `member-join-${userId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'Пользователь успешно добавлен в состав команды' });
  } catch (error) {
    console.error('[Add/Restore Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Включение члена основного состава в турнирный игровой ростер
export const addTeamMemberToRoster = async (req, res) => {
  const { teamId } = req.params;
  const { memberId, position, jerseyNumber } = req.body;

  try {
    const numCheck = `
      SELECT tr.id FROM team_rosters tr
      WHERE tr.team_id = $1 AND tr.jersey_number = $2 AND tr.left_at IS NULL
    `;
    const { rows: numRows } = await pool.query(numCheck, [teamId, jerseyNumber]);
    if (numRows.length > 0) {
      return res.status(400).json({ error: 'Этот игровой номер уже занят активным игроком ростера' });
    }

    const teamRes = await pool.query(`SELECT club_id FROM teams WHERE id = $1`, [teamId]);
    const clubId = teamRes.rows[0]?.club_id || null;

    const rosterCheck = `SELECT id, left_at FROM team_rosters WHERE member_id = $1`;
    const { rows: rosterRows } = await pool.query(rosterCheck, [memberId]);

    if (rosterRows.length > 0) {
      const existingRoster = rosterRows[0];
      await pool.query(`
        UPDATE team_rosters 
        SET left_at = NULL, team_id = $1, club_id = $2, position = $3, jersey_number = $4, joined_at = NOW()
        WHERE id = $5
      `, [teamId, clubId, position, jerseyNumber, existingRoster.id]);
    } else {
      await pool.query(`
        INSERT INTO team_rosters (club_id, team_id, member_id, position, jersey_number, joined_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [clubId, teamId, memberId, position, jerseyNumber]);
    }

    res.json({ success: true, message: 'Игрок успешно добавлен в активный ростер' });
  } catch (error) {
    console.error('[Add Member To Roster Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// НОВЫЙ БЛОК: СИСТЕМА УПРАВЛЕНИЯ ВНЕШНИМИ ТУРНИРАМИ И ДИВИЗИОНАМИ КОМАНДЫ
// =============================================================================

// Получить список внешних турниров команды вместе со вложенными дивизионами
export const getExternalTournaments = async (req, res) => {
  const { teamId } = req.params;
  try {
    const query = `
      SELECT t.id, t.team_id, t.name, t.short_name, t.logo_url, t.city, t.created_at,
             COALESCE(
               json_agg(
                 json_build_object('id', d.id, 'name', d.name)
               ) FILTER (WHERE d.id IS NOT NULL), '[]'
             ) as divisions
      FROM team_external_tournaments t
      LEFT JOIN team_external_divisions d ON t.id = d.tournament_id
      WHERE t.team_id = $1
      GROUP BY t.id
      ORDER BY t.name ASC
    `;
    const { rows } = await pool.query(query, [teamId]);
    res.json({ success: true, tournaments: rows });
  } catch (error) {
    console.error('[Get External Tournaments Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Создать новый кастомный внешний турнир команды
export const createExternalTournament = async (req, res) => {
  const { teamId } = req.params;
  const { name, short_name, city } = req.body;
  const reqUserId = req.user?.id;

  try {
    const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'TEAM_MANAGE_TAB_ALL');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Недостаточно прав для создания внешнего турнира' });
    }

    let logo_url = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_ext_tour_logo_${Date.now()}${ext}`;
      await uploadBufferToS3(req.file, key);
      logo_url = `/${key}`;
    }

    const query = `
      INSERT INTO team_external_tournaments (team_id, name, short_name, logo_url, city)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [teamId, name, short_name, logo_url, city]);
    res.json({ success: true, tournament: rows[0] });
  } catch (error) {
    console.error('[Create External Tournament Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Полностью удалить внешний турнир (каскадом удалит и дивизионы)
export const deleteExternalTournament = async (req, res) => {
  const { teamId, id } = req.params;
  const reqUserId = req.user?.id;

  try {
    const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'TEAM_MANAGE_TAB_ALL');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Недостаточно прав для удаления внешнего турнира' });
    }

    const query = `DELETE FROM team_external_tournaments WHERE id = $1 AND team_id = $2 RETURNING *`;
    const { rowCount } = await pool.query(query, [id, teamId]);
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Внешний турнир не найден' });
    }

    res.json({ success: true, message: 'Внешний турнир успешно удален' });
  } catch (error) {
    console.error('[Delete External Tournament Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Создать кастомный дивизион внутри внешнего турнира
export const createExternalDivision = async (req, res) => {
  const { teamId, tournamentId } = req.params;
  const { name } = req.body;
  const reqUserId = req.user?.id;

  try {
    const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'TEAM_MANAGE_TAB_ALL');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Недостаточно прав для создания дивизиона' });
    }

    const tourCheck = await pool.query(
      'SELECT 1 FROM team_external_tournaments WHERE id = $1 AND team_id = $2', 
      [tournamentId, teamId]
    );
    if (tourCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Внешний турнир не найден для данной команды' });
    }

    const query = `
      INSERT INTO team_external_divisions (tournament_id, name)
      VALUES ($1, $2)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [tournamentId, name]);
    res.json({ success: true, division: rows[0] });
  } catch (error) {
    console.error('[Create External Division Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Удалить кастомный дивизион внешнего турнира
export const deleteExternalDivision = async (req, res) => {
  const { teamId, id } = req.params;
  const reqUserId = req.user?.id;

  try {
    const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'TEAM_MANAGE_TAB_ALL');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Недостаточно прав для удаления дивизиона' });
    }

    const divCheck = await pool.query(`
      SELECT d.id FROM team_external_divisions d
      JOIN team_external_tournaments t ON d.tournament_id = t.id
      WHERE d.id = $1 AND t.team_id = $2
    `, [id, teamId]);

    if (divCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Дивизион не найден или не принадлежит вашей команде' });
    }

    await pool.query('DELETE FROM team_external_divisions WHERE id = $1', [id]);
    res.json({ success: true, message: 'Дивизион успешно удален' });
  } catch (error) {
    console.error('[Delete External Division Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// НОВЫЙ БЛОК: СУЩНОСТЬ ЕДИНОГО СПРАВОЧНИКА ВНЕШНИХ СОПЕРНИКОВ КОМАНДЫ
// =============================================================================

// Получить список кастомных соперников команды
export const getExternalOpponents = async (req, res) => {
  const { teamId } = req.params;
  try {
    const query = `SELECT * FROM external_opponents WHERE team_id = $1 ORDER BY name ASC`;
    const { rows } = await pool.query(query, [teamId]);
    res.json({ success: true, opponents: rows });
  } catch (error) {
    console.error('[Get External Opponents Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Создать карточку внешнего соперника с загрузкой логотипа в S3
export const createExternalOpponent = async (req, res) => {
  const { teamId } = req.params;
  const { name, short_name, city } = req.body;
  const reqUserId = req.user?.id;

  try {
    const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'TEAM_MANAGE_TAB_ALL');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Недостаточно прав для добавления карточки соперника' });
    }

    let logo_url = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_ext_opp_logo_${Date.now()}${ext}`;
      await uploadBufferToS3(req.file, key);
      logo_url = `/${key}`;
    }

    const query = `
      INSERT INTO external_opponents (team_id, name, short_name, city, logo_url, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *
    `;
    const { rows } = await pool.query(query, [teamId, name, short_name, city, logo_url]);
    res.json({ success: true, opponent: rows[0] });
  } catch (error) {
    console.error('[Create External Opponent Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Удалить карточку внешнего соперника из справочника команды
export const deleteExternalOpponent = async (req, res) => {
  const { teamId, id } = req.params;
  const reqUserId = req.user?.id;

  try {
    const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'TEAM_MANAGE_TAB_ALL');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Недостаточно прав для удаления карточки соперника' });
    }

    const query = `DELETE FROM external_opponents WHERE id = $1 AND team_id = $2 RETURNING *`;
    const { rowCount } = await pool.query(query, [id, teamId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Внешний соперник не найден' });
    }

    res.json({ success: true, message: 'Внешний соперник успешно удален из вашего справочника' });
  } catch (error) {
    console.error('[Delete External Opponent Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};