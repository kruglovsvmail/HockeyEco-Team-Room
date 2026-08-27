import pool from '../config/db.js';
import s3 from '../config/s3.js';
import path from 'path';
import { checkClubPermissionInternal, toClubRoleName } from '../utils/checkPermission.js';
import { ROLES } from '../utils/permissions.js';

// Вспомогательный метод загрузки в S3-хранилище (тот же, что и у команды)
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

// =============================================================================
// СПИСОК КЛУБОВ ПОЛЬЗОВАТЕЛЯ
// Клуб виден владельцу (clubs.owner_id) и любому активному члену (club_members).
// Роли считаются так же, как в getClubRoles — иначе фронт нарисует кнопки,
// которые сервер потом отклонит.
// =============================================================================
export const getMyClubs = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows: clubs } = await pool.query(`
      SELECT c.id, c.name, c.logo_url, c.city, c.description, c.color_1, c.color_2, c.owner_id,
        (
          SELECT string_agg(DISTINCT role, ',') FROM (
            SELECT cr.role FROM club_roles cr
            JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
            WHERE cr.club_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL

            UNION

            SELECT 'player' AS role FROM club_members cm
            WHERE cm.club_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL

            UNION

            SELECT 'owner' AS role FROM clubs WHERE id = c.id AND owner_id = $1
          ) AS roles
        ) AS user_role
      FROM clubs c
      WHERE c.owner_id = $1
      OR EXISTS (
        SELECT 1 FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
      )
      ORDER BY c.name
    `, [userId]);

    const subRes = await pool.query(
      'SELECT subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );
    const subExpires = subRes.rows[0]?.subscription_expires_at;
    const hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;

    const enriched = clubs.map(club => {
      // Роли приводим к клубным именам матрицы прав (coach → club_coach)
      const roles = club.user_role ? club.user_role.split(',').map(toClubRoleName) : [];
      const isOwner = club.owner_id === userId;
      if (isOwner && !roles.includes(ROLES.CLUB_OWNER)) roles.push(ROLES.CLUB_OWNER);

      return {
        ...club,
        user_role: roles.join(','),
        user_roles: roles,
        is_owner: isOwner,
        has_subscription: hasSubscription,
      };
    });

    res.json({ clubs: enriched });
  } catch (error) {
    console.error('[Get My Clubs Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// СОСТАВ, ШТАБ И КОМАНДЫ КЛУБА
//
// У клуба нет игрового ростера — номера и амплуа живут в командах. Поэтому
// отдаём только людей и их принадлежность к командам клуба (чипсы в карточке).
// =============================================================================
export const getClubDetails = async (req, res) => {
  try {
    const { clubId } = req.params;

    const clubQuery = `
      SELECT id, name, logo_url, city, description, color_1, color_2, owner_id
      FROM clubs WHERE id = $1
    `;

    // Состав: и действующие, и ушедшие — фронт делит их по left_at, как во вкладке
    // «Состав» команды. teams — команды ЭТОГО клуба, где человек активен.
    const membersQuery = `
      SELECT
        cm.id AS member_id, u.id AS user_id,
        u.first_name, u.last_name, u.middle_name, u.birth_date, u.height, u.weight,
        u.avatar_url,
        cm.joined_at, cm.left_at,
        (
          SELECT string_agg(cr.role, ', ')
          FROM club_roles cr
          WHERE cr.club_id = cm.club_id AND cr.user_id = u.id AND cr.left_at IS NULL
        ) AS roles,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', t.id, 'name', t.name, 'short_name', t.short_name, 'logo_url', t.logo_url
          ) ORDER BY t.name)
          FROM team_members tm
          JOIN teams t ON t.id = tm.team_id
          WHERE tm.user_id = u.id AND tm.left_at IS NULL AND t.club_id = cm.club_id
        ), '[]'::json) AS teams
      FROM club_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.club_id = $1
      ORDER BY u.last_name, u.first_name
    `;

    // Штаб клуба — только активные клубные роли активных членов клуба
    const staffQuery = `
      SELECT
        cm.id AS member_id, u.id AS user_id,
        u.first_name, u.last_name, u.birth_date, u.avatar_url,
        string_agg(cr.role, ', ') AS roles
      FROM club_roles cr
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      JOIN users u ON u.id = cr.user_id
      WHERE cr.club_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
      GROUP BY cm.id, u.id, u.first_name, u.last_name, u.birth_date, u.avatar_url
      ORDER BY u.last_name, u.first_name
    `;

    // Команды клуба с числом активных участников — карточки на вкладке «Команды»
    const teamsQuery = `
      SELECT
        t.id, t.name, t.short_name, t.logo_url, t.city, t.color_home_1, t.ui_color,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id AND tm.left_at IS NULL)::int AS members_count
      FROM teams t
      WHERE t.club_id = $1
      ORDER BY t.name
    `;

    const [clubRes, membersRes, staffRes, teamsRes] = await Promise.all([
      pool.query(clubQuery, [clubId]),
      pool.query(membersQuery, [clubId]),
      pool.query(staffQuery, [clubId]),
      pool.query(teamsQuery, [clubId]),
    ]);

    if (clubRes.rows.length === 0) {
      return res.status(404).json({ error: 'Клуб не найден' });
    }

    res.json({
      club: clubRes.rows[0],
      members: membersRes.rows,
      staff: staffRes.rows,
      teams: teamsRes.rows,
    });
  } catch (error) {
    console.error('[Get Club Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ОБНОВЛЕНИЕ ПРОФИЛЯ КЛУБА (название, логотип, город, описание, цвета)
// =============================================================================
export const updateClubProfile = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { name, city, description, color_1, color_2, delete_logo } = req.body;

    let logo_url = undefined;

    if (req.files?.['logo']?.[0]) {
      const file = req.files['logo'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/clubs_${clubId}_logo_${Date.now()}${ext}`;
      await uploadBufferToS3(file, key);
      logo_url = `/${key}`;
    } else if (delete_logo === 'true') {
      logo_url = null;
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
    pushField('city', city);
    pushField('description', description);
    pushField('color_1', color_1);
    pushField('color_2', color_2);
    if (logo_url !== undefined) pushField('logo_url', logo_url);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    queryValues.push(clubId);
    const { rows } = await pool.query(
      `UPDATE clubs SET ${updateFields.join(', ')} WHERE id = $${counter} RETURNING *`,
      queryValues
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Клуб не найден' });
    }

    res.json({ success: true, club: rows[0] });
  } catch (error) {
    console.error('[Update Club Profile Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ПОИСК ЗАРЕГИСТРИРОВАННОГО ПОЛЬЗОВАТЕЛЯ ПО ТЕЛЕФОНУ ДЛЯ ДОБАВЛЕНИЯ В КЛУБ
// Схема ровно как у команды: человек уже должен существовать в системе.
// =============================================================================
export const searchUserByPhoneForClub = async (req, res) => {
  const { clubId } = req.params;
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'Параметр phone обязателен' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const last10Digits = cleanPhone.slice(-10);

    const { rows } = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.virtual_code, u.status,
             (cm.id IS NOT NULL AND cm.left_at IS NULL) AS is_already_in_club,
             (cm.id IS NOT NULL AND cm.left_at IS NOT NULL) AS is_archived_in_club
      FROM users u
      LEFT JOIN club_members cm ON cm.user_id = u.id AND cm.club_id = $1
      WHERE right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = $2
      LIMIT 1
    `, [clubId, last10Digits]);

    if (rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь с таким номером не зарегистрирован' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('[Search User For Club Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ДОБАВЛЕНИЕ ИЛИ ВОССТАНОВЛЕНИЕ ЧЛЕНСТВА В КЛУБЕ
//
// Роли при восстановлении намеренно НЕ возвращаются: человек, вернувшийся в клуб,
// получает их заново руками — иначе к нему молча вернулись бы старые полномочия.
// =============================================================================
export const addOrRestoreClubMember = async (req, res) => {
  const { clubId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Параметр userId обязателен' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, left_at FROM club_members WHERE club_id = $1 AND user_id = $2',
      [clubId, userId]
    );

    if (rows.length > 0) {
      if (rows[0].left_at === null) {
        return res.status(409).json({ error: 'Пользователь уже состоит в клубе' });
      }
      await pool.query(
        'UPDATE club_members SET left_at = NULL, joined_at = CURRENT_DATE WHERE id = $1',
        [rows[0].id]
      );
      return res.json({ success: true, restored: true, message: 'Участник возвращён в состав клуба' });
    }

    await pool.query(
      'INSERT INTO club_members (club_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)',
      [clubId, userId]
    );

    res.json({ success: true, restored: false, message: 'Участник добавлен в состав клуба' });
  } catch (error) {
    console.error('[Add Club Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ИСКЛЮЧЕНИЕ ИЗ КЛУБА — КАСКАДОМ
//
// Одной транзакцией закрываем датой:
//   club_members  — членство в клубе,
//   team_members  — членство в командах ЭТОГО клуба (чужие команды и команды
//                   без клуба не трогаем: человек может играть где-то ещё),
//   team_rosters  — игровые карточки в этих же командах (триггер сам архивирует
//                   период в team_roster_periods, история не теряется),
//   team_roles / club_roles — полномочия, чтобы они не воскресли при возврате.
// =============================================================================
export const excludeFromClub = async (req, res) => {
  const { clubId, userId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Команды этого клуба, где человек сейчас активен — вернём их фронту для тоста
    const { rows: affectedTeams } = await client.query(`
      SELECT t.id, t.name
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = $1 AND tm.left_at IS NULL AND t.club_id = $2
      ORDER BY t.name
    `, [userId, clubId]);

    await client.query(
      'UPDATE club_members SET left_at = CURRENT_DATE WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
      [clubId, userId]
    );

    await client.query(
      'UPDATE club_roles SET left_at = CURRENT_DATE WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
      [clubId, userId]
    );

    await client.query(`
      UPDATE team_rosters tr
      SET left_at = CURRENT_DATE
      FROM team_members tm, teams t
      WHERE tr.member_id = tm.id
        AND t.id = tm.team_id
        AND tm.user_id = $1
        AND t.club_id = $2
        AND tr.left_at IS NULL
    `, [userId, clubId]);

    await client.query(`
      UPDATE team_roles trole
      SET left_at = CURRENT_DATE
      FROM team_members tm, teams t
      WHERE trole.member_id = tm.id
        AND t.id = tm.team_id
        AND tm.user_id = $1
        AND t.club_id = $2
        AND trole.left_at IS NULL
    `, [userId, clubId]);

    await client.query(`
      UPDATE team_members tm
      SET left_at = CURRENT_DATE
      FROM teams t
      WHERE t.id = tm.team_id
        AND tm.user_id = $1
        AND t.club_id = $2
        AND tm.left_at IS NULL
    `, [userId, clubId]);

    await client.query('COMMIT');

    res.json({
      success: true,
      affectedTeams,
      message: 'Участник исключён из клуба и его команд',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Exclude From Club Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// =============================================================================
// КАРТОЧКА ЧЕЛОВЕКА В КЛУБНОМ КОНТЕКСТЕ
//
// Игрового профиля здесь нет (номер и амплуа — атрибуты команды), вместо него
// отдаём список команд клуба, в которых человек состоит.
// =============================================================================
export const getClubMemberDetails = async (req, res) => {
  const { clubId, userId } = req.params;
  const reqUserId = req.user?.id;

  try {
    if (!reqUserId) {
      return res.status(401).json({ error: 'Пользователь не идентифицирован' });
    }

    const canManageRoles = await checkClubPermissionInternal(reqUserId, Number(clubId), 'CLUB_MANAGE_ROLES');
    const canViewVirtualCode = await checkClubPermissionInternal(reqUserId, Number(clubId), 'CLUB_MANAGE_MEMBERS');

    const { rows } = await pool.query(`
      SELECT
        u.id AS user_id, cm.id AS member_id,
        u.first_name, u.last_name, u.middle_name,
        u.phone, u.birth_date, u.height, u.weight, u.grip, u.virtual_code,
        u.avatar_url,
        cm.joined_at, cm.left_at,
        (
          SELECT string_agg(cr.role, ', ')
          FROM club_roles cr
          WHERE cr.club_id = cm.club_id AND cr.user_id = u.id AND cr.left_at IS NULL
        ) AS roles,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', t.id, 'name', t.name, 'short_name', t.short_name, 'logo_url', t.logo_url
          ) ORDER BY t.name)
          FROM team_members tm
          JOIN teams t ON t.id = tm.team_id
          WHERE tm.user_id = u.id AND tm.left_at IS NULL AND t.club_id = cm.club_id
        ), '[]'::json) AS teams
      FROM club_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.club_id = $1 AND u.id = $2
    `, [clubId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Участник клуба не найден' });
    }

    const memberData = rows[0];

    if (!canViewVirtualCode) {
      delete memberData.virtual_code;
    }

    res.json({
      success: true,
      member: memberData,
      isManager: canManageRoles || canViewVirtualCode,
      isOwnProfile: reqUserId === memberData.user_id,
      permissions: {
        canEditRoles: canManageRoles,
      },
    });
  } catch (error) {
    console.error('[Get Club Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// НАЗНАЧЕНИЕ И СНЯТИЕ КЛУБНЫХ РОЛЕЙ
//
// Роль работает только у активного члена клуба (так её читает getClubRoles),
// поэтому назначение человеку вне состава отклоняем сразу, а не молча.
// =============================================================================
const ALLOWED_CLUB_ROLES = ['top_manager', 'club_admin', 'coach'];

export const updateClubMemberRoles = async (req, res) => {
  const { clubId, userId } = req.params;
  const { roles } = req.body;
  const reqUserId = req.user?.id;

  try {
    const requestedRoles = String(roles || '')
      .split(',')
      .map(r => r.trim())
      .filter(Boolean);

    const invalid = requestedRoles.filter(r => !ALLOWED_CLUB_ROLES.includes(r));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Недопустимая клубная роль: ${invalid.join(', ')}` });
    }

    const memberRes = await pool.query(
      'SELECT id FROM club_members WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
      [clubId, userId]
    );
    if (memberRes.rowCount === 0) {
      return res.status(400).json({ error: 'Человек не состоит в составе клуба — сначала добавьте его в клуб' });
    }

    // Руководитель не может снять эту роль сам с себя — иначе клуб останется без управления
    if (String(reqUserId) === String(userId) && !requestedRoles.includes('top_manager')) {
      const selfRes = await pool.query(
        `SELECT 1 FROM club_roles
         WHERE club_id = $1 AND user_id = $2 AND role = 'top_manager' AND left_at IS NULL`,
        [clubId, userId]
      );
      if (selfRes.rowCount > 0) {
        return res.status(400).json({ error: 'Нельзя снять с себя роль руководителя клуба' });
      }
    }

    // Транзакцию ведём на выделенном соединении: BEGIN через пул мог бы уехать
    // в другое соединение и оставить снятие ролей без их выдачи.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE club_roles SET left_at = CURRENT_DATE
         WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL AND role <> ALL($3)`,
        [clubId, userId, requestedRoles]
      );

      for (const role of requestedRoles) {
        await client.query(
          `INSERT INTO club_roles (club_id, user_id, role, created_at, left_at)
           VALUES ($1, $2, $3, NOW(), NULL)
           ON CONFLICT (club_id, user_id, role)
           DO UPDATE SET left_at = NULL`,
          [clubId, userId, role]
        );
      }

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Изменения успешно сохранены' });
  } catch (error) {
    console.error('[Update Club Member Roles Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// СТАТИСТИКА ЧЕЛОВЕКА В КЛУБЕ (панель «Статистика в клубе»)
//
// Матчей у клуба нет — только посещаемость клубных тренировок и собраний.
// Считаем от даты вступления в клуб до даты выхода: события, прошедшие вне
// периода членства, в знаменатель не попадают.
// =============================================================================
export const getClubMemberStats = async (req, res) => {
  const { clubId, userId } = req.params;

  try {
    const infoQuery = `
      SELECT u.first_name, u.last_name, u.middle_name, u.avatar_url
      FROM club_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.club_id = $1 AND cm.user_id = $2
    `;

    // period подключаем через JOIN ... ON true, а не запятой: при смешивании
    // запятой с LEFT JOIN условие ON не имеет права ссылаться на ct/cm.
    const trainingQuery = `
      WITH period AS (
        SELECT joined_at::timestamp AS joined_at, left_at::timestamp AS left_at
        FROM club_members WHERE club_id = $1 AND user_id = $2
      )
      SELECT
        COUNT(DISTINCT ct.id)::int AS total,
        COUNT(DISTINCT cta.club_training_id)::int AS attended
      FROM club_training ct
      JOIN period p ON true
      LEFT JOIN club_training_attendance cta
        ON cta.club_training_id = ct.id AND cta.user_id = $2 AND cta.withdrawn_at IS NULL
      WHERE ct.club_id = $1
        AND ct.training_date < NOW()
        AND ct.training_date >= p.joined_at
        AND (p.left_at IS NULL OR ct.training_date < p.left_at)
    `;

    const meetingQuery = `
      WITH period AS (
        SELECT joined_at::timestamp AS joined_at, left_at::timestamp AS left_at
        FROM club_members WHERE club_id = $1 AND user_id = $2
      )
      SELECT
        COUNT(DISTINCT cm.id)::int AS total,
        COUNT(DISTINCT cma.club_meeting_id)::int AS attended
      FROM club_meeting cm
      JOIN period p ON true
      LEFT JOIN club_meeting_attendance cma
        ON cma.club_meeting_id = cm.id AND cma.user_id = $2 AND cma.withdrawn_at IS NULL
      WHERE cm.club_id = $1
        AND cm.meeting_date < NOW()
        AND cm.meeting_date >= p.joined_at
        AND (p.left_at IS NULL OR cm.meeting_date < p.left_at)
    `;

    const [infoRes, trainingRes, meetingRes] = await Promise.all([
      pool.query(infoQuery, [clubId, userId]),
      pool.query(trainingQuery, [clubId, userId]),
      pool.query(meetingQuery, [clubId, userId]),
    ]);

    if (infoRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Участник клуба не найден' });
    }

    const training = trainingRes.rows[0] || { total: 0, attended: 0 };
    const meeting = meetingRes.rows[0] || { total: 0, attended: 0 };

    const percent = (attended, total) => (total > 0 ? Math.round((attended / total) * 100) : 0);

    res.json({
      success: true,
      info: infoRes.rows[0],
      training: {
        total: training.total,
        attended: training.attended,
        percent: percent(training.attended, training.total),
      },
      meeting: {
        total: meeting.total,
        attended: meeting.attended,
        percent: percent(meeting.attended, meeting.total),
      },
    });
  } catch (error) {
    console.error('[Get Club Member Stats Error]:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
