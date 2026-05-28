import pool from '../config/db.js';
import s3 from '../config/s3.js';
import path from 'path';

// Получение всех команд текущего пользователя
export const getMyTeams = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT DISTINCT t.id, t.name, t.short_name, t.logo_url, t.city, t.description,
                            t.jersey_dark_url, t.jersey_light_url, t.color_home_1, t.color_home_2,
                            t.color_away_1, t.color_away_2
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.left_at IS NULL
            LEFT JOIN club_members cm ON cm.club_id = t.club_id AND cm.left_at IS NULL
            WHERE (tm.user_id = $1 OR cm.user_id = $1)
            ORDER BY t.name
        `;
        const { rows } = await pool.query(query, [userId]);
        res.json({ teams: rows });
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

    // Собираем все активные роли запрашивающего сотрудника в этой команде
    const reqUserRolesRes = await pool.query(`
      SELECT 'admin' as role FROM users WHERE id = $1 AND global_role = 'admin'
      UNION
      SELECT tr.role FROM team_roles tr
      JOIN team_members tm ON tr.member_id = tm.id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
      UNION
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
    `, [reqUserId, teamId]);

    const reqUserRoles = reqUserRolesRes.rows.map(r => r.role);
    const hasGlobalAdmin = reqUserRoles.includes('admin');
    const isTeamManager = reqUserRoles.includes('team_manager') || reqUserRoles.includes('top_manager');
    const isTeamAdmin = reqUserRoles.includes('team_admin') || reqUserRoles.includes('club_admin');

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

    // Только руководитель команды или клуба видит виртуальный код (VIEW_VIRTUAL_CODE)
    if (!isTeamManager && !hasGlobalAdmin) {
      delete memberData.virtual_code;
    }

    // Возвращаем строго вычисленные флаги доступов согласно разрешенным правилам
    res.json({ 
      success: true, 
      member: memberData, 
      isManager: isTeamManager,
      isOwnProfile: reqUserId === memberData.user_id,
      permissions: {
        canEditRoles: isTeamManager || hasGlobalAdmin,
        canEditGameProfile: isTeamManager || isTeamAdmin || hasGlobalAdmin,
        canEditHeader: isTeamManager || isTeamAdmin || hasGlobalAdmin
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
    // Вычисляем роли запрашивающего пользователя перед выполнением транзакции
    const reqUserRolesRes = await pool.query(`
      SELECT 'admin' as role FROM users WHERE id = $1 AND global_role = 'admin'
      UNION
      SELECT tr.role FROM team_roles tr
      JOIN team_members tm ON tr.member_id = tm.id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
      UNION
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
    `, [reqUserId, teamId]);

    const reqUserRoles = reqUserRolesRes.rows.map(r => r.role);
    const hasGlobalAdmin = reqUserRoles.includes('admin');
    const isTeamManager = reqUserRoles.includes('team_manager') || reqUserRoles.includes('top_manager');
    const isTeamAdmin = reqUserRoles.includes('team_admin') || reqUserRoles.includes('club_admin');

    await pool.query('BEGIN');

    // 1. ПРОВЕРКА ПРАВ ДЛЯ ИГРОВОГО ПРОФИЛЬНОГО БЛОКА (Менеджер и Админ)
    if (position !== undefined || jerseyNumber !== undefined) {
      if (!isTeamManager && !isTeamAdmin && !hasGlobalAdmin) {
        return res.status(403).json({ error: 'Недостаточно прав для изменения игрового профиля' });
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

    // 2. ПРОВЕРКА ПРАВ ДЛЯ БЛОКА ШАПКИ/КАПИТАНСТВА (Менеджер и Админ)
    if (isCaptain !== undefined || isAssistant !== undefined) {
      if (!isTeamManager && !isTeamAdmin && !hasGlobalAdmin) {
        return res.status(403).json({ error: 'Недостаточно прав для изменения капитанских статусов' });
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

    // 3. ПРОВЕРКА ПРАВ ДЛЯ АДМИНИСТРАТИВНЫХ СТАТУСОВ (Только руководитель)
    if (roles !== undefined) {
      if (!isTeamManager && !hasGlobalAdmin) {
        return res.status(403).json({ error: 'Недостаточно прав для изменения административного статуса' });
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

// ВОЗВРАЩЕНО: Метод загрузки/замены кастомной аватарки игрока в S3
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

// ВОЗВРАЩЕНО: Метод удаления кастомного фото участника
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
      return res.json({ success: true, message: 'Членство пользователя в команде успешно восстановлено' });
    }

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)`, 
      [teamId, userId]
    );
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