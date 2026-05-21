import pool from '../config/db.js';
import s3 from '../config/s3.js';
import path from 'path';

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
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.id;
        
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
        
        const [rosterRes, staffRes] = await Promise.all([
            pool.query(rosterQuery, [teamId]),
            pool.query(staffQuery, [teamId])
        ]);
        
        res.json({ roster: rosterRes.rows, staff: staffRes.rows });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

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
    if (request && typeof request.promise === 'function') {
      return request.promise();
    }
    return request;
  }

  throw new Error('Конфигурация S3 S3Client не поддерживается бэкендом');
};

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

    // 1. Логика обработки Логотипа
    if (req.files?.['logo']?.[0]) {
      const file = req.files['logo'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_logo${ext}`;
      await uploadBufferToS3(file, key);
      logo_url = `/${key}`;
    } else if (delete_logo === 'true') {
      logo_url = null; // Принудительное стирание в БД
    }

    // 2. Логика обработки Темной джерси
    if (req.files?.['jersey_dark']?.[0]) {
      const file = req.files['jersey_dark'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_dark${ext}`;
      await uploadBufferToS3(file, key);
      jersey_dark_url = `/${key}`;
    } else if (delete_jersey_dark === 'true') {
      jersey_dark_url = null;
    }

    // 3. Логика обработки Светлой джерси
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
      // Разрешаем null значения проходить валидацию для полной очистки полей в БД
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