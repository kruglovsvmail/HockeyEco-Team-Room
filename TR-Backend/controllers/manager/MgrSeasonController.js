import pool from '../../config/db.js';
import s3 from '../../config/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = process.env.S3_BUCKET || 'hockeyeco-uploads';

const uploadBufferToS3 = async (file, key) => {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));
  return `/${key}`;
};

const getFileExt = (originalname) => (originalname.split('.').pop() || 'bin');

/**
 * Проверяет, что заявка appId принадлежит команде teamId, и что она сейчас
 * редактируема: статус draft/revision и не заблокирована ожиданием проверки
 * бумажной заявки лигой (paper_roster_league_url ещё не загружен лигой).
 * Бросает Error с полем status для унифицированной обработки в контроллерах.
 */
const assertApplicationEditable = async (client, appId, teamId) => {
  const { rows } = await client.query(`
    SELECT tt.id, tt.status, tt.team_id, tt.paper_roster_league_url, d.digital_applications_only
    FROM tournament_teams tt
    JOIN divisions d ON tt.division_id = d.id
    WHERE tt.id = $1
  `, [appId]);

  if (rows.length === 0 || String(rows[0].team_id) !== String(teamId)) {
    const err = new Error('Заявка не найдена');
    err.status = 404;
    throw err;
  }

  const app = rows[0];
  const isPaperBlocked = !app.digital_applications_only && !app.paper_roster_league_url;
  if (isPaperBlocked || !['draft', 'revision'].includes(app.status)) {
    const err = new Error(isPaperBlocked
      ? 'Добавление игроков заблокировано: ожидается проверка бумажной заявки лигой'
      : 'Заявка недоступна для редактирования в текущем статусе');
    err.status = 400;
    throw err;
  }

  return app;
};

/**
 * Проверяет только принадлежность заявки команде (без проверки редактируемости) —
 * нужна для операций, разрешённых вне статусов draft/revision (например, просмотр).
 */
const assertApplicationOwnership = async (client, appId, teamId) => {
  const { rows } = await client.query(
    `SELECT id, status, paper_roster_league_url FROM tournament_teams WHERE id = $1 AND team_id = $2`,
    [appId, teamId]
  );
  if (rows.length === 0) {
    const err = new Error('Заявка не найдена');
    err.status = 404;
    throw err;
  }
  return rows[0];
};

// GET /:teamId/available-divisions
export const getAvailableDivisions = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { rows } = await pool.query(`
      SELECT l.id as league_id, l.name as league_name, l.logo_url as league_logo,
             s.id as season_id, s.name as season_name,
             json_agg(json_build_object(
                 'id', d.id, 'name', d.name,
                 'app_start', d.application_start, 'app_end', d.application_end,
                 'digital_applications_only', d.digital_applications_only
             ) ORDER BY d.name) as divisions
      FROM divisions d
      JOIN seasons s ON d.season_id = s.id
      JOIN leagues l ON s.league_id = l.id
      WHERE d.is_published = true
        AND NOW() BETWEEN d.application_start AND d.application_end
        AND NOT EXISTS (
          SELECT 1 FROM tournament_teams tt WHERE tt.team_id = $1 AND tt.division_id = d.id
        )
      GROUP BY l.id, l.name, l.logo_url, s.id, s.name
      ORDER BY l.name, s.name
    `, [teamId]);
    return res.json({ success: true, leagues: rows });
  } catch (err) {
    console.error('[Get Available Divisions Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении списка открытых дивизионов' });
  }
};

// Общий SELECT для карточки заявки (список и одиночная выборка используют одну и ту же форму)
const APPLICATION_SELECT_SQL = `
  SELECT tt.id, tt.status, tt.created_at, tt.paper_roster_team_url, tt.paper_roster_league_url,
         d.id as division_id, d.name as division_name, d.end_date as division_end_date,
         d.digital_applications_only, d.req_med_cert, d.req_insurance, d.req_consent,
         s.name as season_name,
         l.name as league_name, l.logo_url as league_logo,

         COALESCE(
             (SELECT json_agg(json_build_object(
                 'id', tr.id, 'player_id', tr.player_id, 'jersey_number', tr.jersey_number,
                 'position', tr.position, 'is_captain', tr.is_captain, 'is_assistant', tr.is_assistant,
                 'application_status', tr.application_status,
                 'medical_url', tr.medical_url, 'insurance_url', tr.insurance_url, 'consent_url', tr.consent_url,
                 'medical_expires_at', tr.medical_expires_at, 'insurance_expires_at', tr.insurance_expires_at, 'consent_expires_at', tr.consent_expires_at,
                 'first_name', u.first_name, 'last_name', u.last_name,
                 'user_avatar_url', u.avatar_url,
                 'team_member_photo_url', tm.photo_url
             ) ORDER BY u.last_name ASC)
             FROM tournament_rosters tr
             JOIN users u ON tr.player_id = u.id
             LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
             WHERE tr.tournament_team_id = tt.id AND tr.period_end IS NULL),
         '[]'::json) as roster,

         COALESCE(
             (SELECT json_agg(json_build_object(
                 'user_id', ttr.user_id,
                 'role', ttr.tournament_role,
                 'first_name', u.first_name, 'last_name', u.last_name,
                 'user_avatar_url', u.avatar_url,
                 'team_member_photo_url', tm.photo_url
             ) ORDER BY u.last_name ASC)
             FROM tournament_team_roles ttr
             JOIN users u ON ttr.user_id = u.id
             LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
             WHERE ttr.tournament_team_id = tt.id AND ttr.left_at IS NULL),
         '[]'::json) as staff

  FROM tournament_teams tt
  JOIN divisions d ON tt.division_id = d.id
  JOIN seasons s ON d.season_id = s.id
  JOIN leagues l ON s.league_id = l.id
`;

// GET /:teamId/applications
export const getTeamApplications = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { rows } = await pool.query(
      `${APPLICATION_SELECT_SQL} WHERE tt.team_id = $1 ORDER BY tt.created_at DESC`,
      [teamId]
    );
    return res.json({ success: true, applications: rows });
  } catch (err) {
    console.error('[Get Team Applications Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении списка заявок' });
  }
};

// GET /:teamId/applications/:appId
export const getApplicationById = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    const { rows } = await pool.query(
      `${APPLICATION_SELECT_SQL} WHERE tt.id = $1 AND tt.team_id = $2`,
      [appId, teamId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Заявка не найдена' });
    }
    return res.json({ success: true, application: rows[0] });
  } catch (err) {
    console.error('[Get Application By Id Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении заявки' });
  }
};

// GET /:teamId/applications/:appId/roster-picker
export const getTeamRosterForPicker = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    await assertApplicationOwnership(pool, appId, teamId);

    const playersRes = await pool.query(`
      SELECT tm.user_id as id, u.first_name, u.last_name, u.avatar_url, tm.photo_url,
             tr.position, tr.jersey_number
      FROM team_rosters tr
      JOIN team_members tm ON tr.member_id = tm.id
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM tournament_rosters ex
          WHERE ex.tournament_team_id = $2 AND ex.player_id = tm.user_id AND ex.period_end IS NULL
        )
      ORDER BY u.last_name ASC, u.first_name ASC
    `, [teamId, appId]);

    const staffRes = await pool.query(`
      SELECT tm.user_id as id, u.first_name, u.last_name, u.avatar_url, tm.photo_url,
             string_agg(trole.role, ',' ORDER BY trole.role) as roles
      FROM team_roles trole
      JOIN team_members tm ON trole.member_id = tm.id
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM tournament_team_roles ex
          WHERE ex.tournament_team_id = $2 AND ex.user_id = tm.user_id AND ex.left_at IS NULL
        )
      GROUP BY tm.user_id, u.first_name, u.last_name, u.avatar_url, tm.photo_url
      ORDER BY u.last_name ASC, u.first_name ASC
    `, [teamId, appId]);

    return res.json({ success: true, players: playersRes.rows, staff: staffRes.rows });
  } catch (err) {
    console.error('[Get Team Roster For Picker Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при получении состава команды' });
  }
};

// POST /:teamId/applications (multipart: file?)
export const createApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { teamId } = req.params;
    let { divisionId, playerIds } = req.body;

    if (!divisionId) {
      const err = new Error('Не выбран дивизион для подачи заявки');
      err.status = 400;
      throw err;
    }

    if (typeof playerIds === 'string') {
      try { playerIds = JSON.parse(playerIds); } catch (e) { playerIds = []; }
    }

    const dupCheck = await client.query(
      `SELECT id FROM tournament_teams WHERE team_id = $1 AND division_id = $2`,
      [teamId, divisionId]
    );
    if (dupCheck.rows.length > 0) {
      const err = new Error('Заявка в этот дивизион уже существует');
      err.status = 400;
      throw err;
    }

    const status = req.file ? 'pending' : 'draft';
    const appRes = await client.query(
      `INSERT INTO tournament_teams (division_id, team_id, status) VALUES ($1, $2, $3) RETURNING id`,
      [divisionId, teamId, status]
    );
    const appId = appRes.rows[0].id;

    if (req.file) {
      const key = `uploads/paper_application_tournament_teams_${appId}.${getFileExt(req.file.originalname)}`;
      const url = await uploadBufferToS3(req.file, key);
      await client.query(`UPDATE tournament_teams SET paper_roster_team_url = $1 WHERE id = $2`, [url, appId]);
    }

    if (Array.isArray(playerIds) && playerIds.length > 0) {
      await client.query(`
        INSERT INTO tournament_rosters (tournament_team_id, player_id, position, jersey_number, is_captain, is_assistant)
        SELECT $1, tm.user_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
        FROM team_rosters tr
        JOIN team_members tm ON tr.member_id = tm.id
        WHERE tm.team_id = $2 AND tm.user_id = ANY($3::int[]) AND tm.left_at IS NULL AND tr.left_at IS NULL
      `, [appId, teamId, playerIds]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, applicationId: appId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Create Application Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при создании заявки' });
  } finally {
    client.release();
  }
};

// DELETE /:teamId/applications/:appId
export const deleteApplication = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    const { rows } = await pool.query(
      `DELETE FROM tournament_teams WHERE id = $1 AND team_id = $2 AND status IN ('draft', 'rejected') RETURNING id`,
      [appId, teamId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Удаление возможно только для заявок в статусе «Формируется» или «Отклонена»' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[Delete Application Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при удалении заявки' });
  }
};

// POST /:teamId/applications/:appId/send-review
export const sendApplicationForReview = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    const { rows } = await pool.query(`
      SELECT tt.status, tt.paper_roster_league_url, d.digital_applications_only,
             (SELECT COUNT(*) FROM tournament_team_roles WHERE tournament_team_id = tt.id AND left_at IS NULL) as staff_count
      FROM tournament_teams tt
      JOIN divisions d ON tt.division_id = d.id
      WHERE tt.id = $1 AND tt.team_id = $2
    `, [appId, teamId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Заявка не найдена' });
    }

    const app = rows[0];
    if (!['draft', 'revision'].includes(app.status)) {
      return res.status(400).json({ success: false, error: 'Заявку можно отправить на проверку только из статуса «Формируется» или «На исправлении»' });
    }

    if (app.digital_applications_only || app.paper_roster_league_url !== null) {
      if (parseInt(app.staff_count, 10) === 0) {
        return res.status(400).json({ success: false, error: 'Нельзя отправить заявку: необходимо добавить хотя бы одного представителя команды (тренера или менеджера)' });
      }
    }

    await pool.query(`UPDATE tournament_teams SET status = 'pending', updated_at = NOW() WHERE id = $1`, [appId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Send Application For Review Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при отправке заявки на проверку' });
  }
};

// POST /:teamId/applications/:appId/paper (multipart: file)
export const uploadApplicationPaper = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Файл не найден' });
    }

    const app = await assertApplicationOwnership(pool, appId, teamId);
    // Загружать/менять скан можно только пока заявка формируется или отправлена на исправление —
    // на рассмотрении, допущенную или отклонённую заявку команда менять не вправе.
    if (!['draft', 'revision'].includes(app.status)) {
      return res.status(400).json({ success: false, error: 'Заявка недоступна для загрузки скана в текущем статусе' });
    }

    const key = `uploads/paper_application_tournament_teams_${appId}.${getFileExt(req.file.originalname)}`;
    const url = await uploadBufferToS3(req.file, key);
    await pool.query(`UPDATE tournament_teams SET paper_roster_team_url = $1, updated_at = NOW() WHERE id = $2`, [url, appId]);

    return res.json({ success: true, url });
  } catch (err) {
    console.error('[Upload Application Paper Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при загрузке скана заявки' });
  }
};

// DELETE /:teamId/applications/:appId/paper
export const deleteApplicationPaper = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    const { rows } = await pool.query(
      `SELECT status, paper_roster_team_url FROM tournament_teams WHERE id = $1 AND team_id = $2`,
      [appId, teamId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Заявка не найдена' });
    }

    const app = rows[0];
    if (!['draft', 'revision'].includes(app.status)) {
      return res.status(400).json({ success: false, error: 'Заявка недоступна для удаления скана в текущем статусе' });
    }

    if (app.paper_roster_team_url) {
      try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: app.paper_roster_team_url.replace(/^\//, '') }));
      } catch (e) {
        console.error('[Delete Application Paper S3 Error]:', e);
      }
    }

    await pool.query(`UPDATE tournament_teams SET paper_roster_team_url = NULL, updated_at = NOW() WHERE id = $1`, [appId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Delete Application Paper Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при удалении скана заявки' });
  }
};

// POST /:teamId/applications/:appId/roster  { playerIds: number[] }
export const addPlayersToApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { teamId, appId } = req.params;
    const { playerIds } = req.body;

    await assertApplicationEditable(client, appId, teamId);

    if (Array.isArray(playerIds) && playerIds.length > 0) {
      const pRes = await client.query(`
        SELECT tm.user_id as pid, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
        FROM team_rosters tr
        JOIN team_members tm ON tr.member_id = tm.id
        WHERE tm.team_id = $1 AND tm.user_id = ANY($2::int[]) AND tm.left_at IS NULL AND tr.left_at IS NULL
      `, [teamId, playerIds]);

      const existingRes = await client.query(
        `SELECT player_id FROM tournament_rosters WHERE tournament_team_id = $1 AND player_id = ANY($2::int[])`,
        [appId, playerIds]
      );
      const existingPids = new Set(existingRes.rows.map(r => r.player_id));

      const insertValues = []; const insertParams = []; let insertIdx = 1;
      const updateValues = []; const updateParams = []; let updateIdx = 1;

      for (const row of pRes.rows) {
        if (existingPids.has(row.pid)) {
          updateValues.push(`($${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++})`);
          updateParams.push(appId, row.pid, row.position, row.jersey_number, row.is_captain || false, row.is_assistant || false);
        } else {
          insertValues.push(`($${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++})`);
          insertParams.push(appId, row.pid, row.position, row.jersey_number, row.is_captain || false, row.is_assistant || false);
        }
      }

      if (updateValues.length > 0) {
        await client.query(`
          UPDATE tournament_rosters AS tr
          SET period_end = NULL,
              application_status = 'pending',
              position = v.position,
              jersey_number = v.jersey_number::int,
              is_captain = v.is_captain::boolean,
              is_assistant = v.is_assistant::boolean,
              updated_at = NOW()
          FROM (VALUES ${updateValues.join(', ')}) AS v(app_id, pid, position, jersey_number, is_captain, is_assistant)
          WHERE tr.tournament_team_id = v.app_id::int AND tr.player_id = v.pid::int
        `, updateParams);
      }

      if (insertValues.length > 0) {
        await client.query(`
          INSERT INTO tournament_rosters (tournament_team_id, player_id, position, jersey_number, is_captain, is_assistant)
          VALUES ${insertValues.join(', ')}
        `, insertParams);
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Add Players To Application Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при добавлении игроков в заявку' });
  } finally {
    client.release();
  }
};

// DELETE /:teamId/applications/:appId/roster/:rosterId
export const removePlayerFromApplication = async (req, res) => {
  try {
    const { teamId, appId, rosterId } = req.params;
    await assertApplicationEditable(pool, appId, teamId);

    const { rows } = await pool.query(
      `UPDATE tournament_rosters SET period_end = NOW() WHERE id = $1 AND tournament_team_id = $2 RETURNING id`,
      [rosterId, appId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Игрок не найден в этой заявке' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[Remove Player From Application Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при удалении игрока из заявки' });
  }
};

// PATCH /:teamId/applications/:appId/roster/:rosterId  { position?, jersey_number?, is_captain?, is_assistant? }
export const updateRosterEntry = async (req, res) => {
  try {
    const { teamId, appId, rosterId } = req.params;
    const { position, jersey_number, is_captain, is_assistant } = req.body;

    await assertApplicationEditable(pool, appId, teamId);

    if (jersey_number !== undefined && jersey_number !== null && jersey_number !== '') {
      const conflict = await pool.query(
        `SELECT id FROM tournament_rosters WHERE tournament_team_id = $1 AND jersey_number = $2 AND id != $3 AND period_end IS NULL`,
        [appId, jersey_number, rosterId]
      );
      if (conflict.rows.length > 0) {
        return res.status(400).json({ success: false, error: `Номер ${jersey_number} уже занят другим игроком в этой заявке` });
      }
    }

    const updates = []; const values = []; let counter = 1;
    if (position !== undefined) { updates.push(`position = $${counter++}`); values.push(position); }
    if (jersey_number !== undefined) { updates.push(`jersey_number = $${counter++}`); values.push(jersey_number !== '' ? jersey_number : null); }
    if (is_captain !== undefined) { updates.push(`is_captain = $${counter++}`); values.push(is_captain); }
    if (is_assistant !== undefined) { updates.push(`is_assistant = $${counter++}`); values.push(is_assistant); }

    if (updates.length > 0) {
      values.push(rosterId);
      await pool.query(`UPDATE tournament_rosters SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${counter}`, values);

      if (is_captain === true) {
        await pool.query(
          `UPDATE tournament_rosters SET is_captain = false WHERE tournament_team_id = $1 AND id != $2 AND period_end IS NULL`,
          [appId, rosterId]
        );
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[Update Roster Entry Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при сохранении данных игрока' });
  }
};

// POST /:teamId/applications/:appId/roster/:rosterId/docs (multipart: insurance?, medical?, consent?)
export const uploadRosterDocs = async (req, res) => {
  try {
    const { teamId, appId, rosterId } = req.params;
    const {
      insurance_cleared, medical_cleared, consent_cleared,
      insurance_expires_at, medical_expires_at, consent_expires_at
    } = req.body;

    await assertApplicationEditable(pool, appId, teamId);

    const ownerCheck = await pool.query(
      `SELECT id FROM tournament_rosters WHERE id = $1 AND tournament_team_id = $2`,
      [rosterId, appId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Игрок не найден в этой заявке' });
    }

    const files = req.files || {};
    let insuranceUrl, medicalUrl, consentUrl;

    if (insurance_cleared === 'true') insuranceUrl = null;
    else if (files['insurance']?.[0]) {
      const f = files['insurance'][0];
      insuranceUrl = await uploadBufferToS3(f, `uploads/tournament_rosters_${rosterId}_insurance.${getFileExt(f.originalname)}`);
    }

    if (medical_cleared === 'true') medicalUrl = null;
    else if (files['medical']?.[0]) {
      const f = files['medical'][0];
      medicalUrl = await uploadBufferToS3(f, `uploads/tournament_rosters_${rosterId}_medical.${getFileExt(f.originalname)}`);
    }

    if (consent_cleared === 'true') consentUrl = null;
    else if (files['consent']?.[0]) {
      const f = files['consent'][0];
      consentUrl = await uploadBufferToS3(f, `uploads/tournament_rosters_${rosterId}_consent.${getFileExt(f.originalname)}`);
    }

    const updates = ['updated_at = NOW()']; const values = []; let counter = 1;
    if (insuranceUrl !== undefined) { updates.push(`insurance_url = $${counter++}`); values.push(insuranceUrl); }
    if (insurance_expires_at !== undefined) { updates.push(`insurance_expires_at = $${counter++}`); values.push(insurance_expires_at || null); }
    if (medicalUrl !== undefined) { updates.push(`medical_url = $${counter++}`); values.push(medicalUrl); }
    if (medical_expires_at !== undefined) { updates.push(`medical_expires_at = $${counter++}`); values.push(medical_expires_at || null); }
    if (consentUrl !== undefined) { updates.push(`consent_url = $${counter++}`); values.push(consentUrl); }
    if (consent_expires_at !== undefined) { updates.push(`consent_expires_at = $${counter++}`); values.push(consent_expires_at || null); }

    if (updates.length > 1) {
      values.push(rosterId);
      await pool.query(`UPDATE tournament_rosters SET ${updates.join(', ')} WHERE id = $${counter}`, values);
    }

    return res.json({ success: true, insurance_url: insuranceUrl, medical_url: medicalUrl, consent_url: consentUrl });
  } catch (err) {
    console.error('[Upload Roster Docs Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при загрузке документов игрока' });
  }
};

// POST /:teamId/applications/:appId/staff  { userId, roles: string[] }
export const addStaffToApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { teamId, appId } = req.params;
    const { userId, roles } = req.body;

    if (!userId) {
      const err = new Error('User ID обязателен');
      err.status = 400;
      throw err;
    }

    await assertApplicationEditable(client, appId, teamId);

    // Штаб заявки формируется только из активного штата самой команды
    const staffCheck = await client.query(`
      SELECT 1 FROM team_roles trole
      JOIN team_members tm ON trole.member_id = tm.id
      WHERE tm.team_id = $1 AND tm.user_id = $2 AND tm.left_at IS NULL AND trole.left_at IS NULL
      LIMIT 1
    `, [teamId, userId]);
    if (staffCheck.rows.length === 0) {
      const err = new Error('Этот человек не входит в текущий тренерский/административный штаб команды');
      err.status = 400;
      throw err;
    }

    if (!roles || roles.length === 0) {
      await client.query(
        `UPDATE tournament_team_roles SET left_at = NOW() WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [appId, userId]
      );
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    const primaryRole = roles[0];
    const existing = await client.query(
      `SELECT id FROM tournament_team_roles WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [appId, userId]
    );

    if (existing.rows.length > 0) {
      await client.query(`UPDATE tournament_team_roles SET tournament_role = $1 WHERE id = $2`, [primaryRole, existing.rows[0].id]);
    } else {
      await client.query(
        `INSERT INTO tournament_team_roles (tournament_team_id, user_id, tournament_role) VALUES ($1, $2, $3)`,
        [appId, userId, primaryRole]
      );
    }

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Add Staff To Application Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при добавлении сотрудника в заявку' });
  } finally {
    client.release();
  }
};

// DELETE /:teamId/applications/:appId/staff/:userId
export const removeStaffFromApplication = async (req, res) => {
  try {
    const { teamId, appId, userId } = req.params;
    await assertApplicationEditable(pool, appId, teamId);

    await pool.query(
      `UPDATE tournament_team_roles SET left_at = NOW() WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [appId, userId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[Remove Staff From Application Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при удалении сотрудника из заявки' });
  }
};
