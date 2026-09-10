import pool from '../../config/db.js';
import s3 from '../../config/s3.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { assertPlayersAllowedInDivision, assertApplicationRosterAllowed, loadDivisionQualificationRules } from '../../utils/qualificationAccess.js';
import { resetAdmissionByRosterIds, resetAdmissionForPersons } from '../../utils/admissionReset.js';

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

// Все типы личных документов допуска: по такой плитке на каждый в PlayerDocsModal.
// Теми же словами названы колонки в tournament_person_docs (medical_url / medical_expires_at)
// и поля формы, которыми файлы и сроки приходят с фронта.
const DOC_TYPES = ['medical', 'insurance', 'consent'];

// Типы документов, которые бывают общими на команду: одна бумага со списком игроков внутри.
// Тем же словом названы колонки в tournament_rosters (medical_url / medical_expires_at).
// Согласия тут нет намеренно: его подписывает каждый лично, общего согласия не бывает.
const BULK_DOC_TYPES = ['medical', 'insurance'];

/**
 * Роли представителя в турнирной заявке. Их ровно три — в отличие от ролей внутри команды
 * (team_roles), где дополнительно живёт head_coach. Главный тренер и тренер команды
 * подаются в заявку одной ролью 'coach'.
 * Один человек может занимать несколько ролей сразу — на каждую роль заводится своя строка
 * в tournament_team_roles (уникальность по тройке заявка+человек+роль).
 */
export const TOURNAMENT_ROLES = ['team_manager', 'team_admin', 'coach'];

// Роль в команде -> роль в заявке. head_coach схлопывается в тренера: в заявке
// разделения на главного и рядового тренера нет.
const toTournamentRole = (teamRole) => (teamRole === 'head_coach' ? 'coach' : teamRole);

// Нормализация набора ролей из запроса: только валидные значения, без дублей
const normalizeRoles = (roles) => {
  if (!Array.isArray(roles)) return [];
  return [...new Set(roles.map(toTournamentRole))].filter(r => TOURNAMENT_ROLES.includes(r));
};

/**
 * Дивизион, где состав заявки ведёт лига: она вносит игроков и представителей сама,
 * из раздела «Дивизионы» в LMS, после того как прикрепила утверждённый заявочный лист.
 * Команде остаются скан, номера, нашивки и документы игроков.
 *
 * Флаг осмыслен только в бумажном дивизионе: в цифровом заявочного листа нет вовсе,
 * и состав всегда ведёт команда.
 */
const isLeagueManagedRoster = (division) => !division.digital_applications_only && !!division.league_managed_roster;

/**
 * Проверяет, что заявка appId принадлежит команде teamId, и что она сейчас
 * редактируема: статус draft/revision и не заблокирована ожиданием проверки
 * бумажной заявки лигой (paper_roster_league_url ещё не загружен лигой).
 * Бросает Error с полем status для унифицированной обработки в контроллерах.
 *
 * composition = true — операция меняет СОСТАВ заявки (добавить/убрать игрока или
 * представителя). В дивизионах с league_managed_roster состав ведёт лига, и команде
 * такие операции закрыты в любом статусе. Правка карточки игрока (номер, нашивки,
 * амплуа) и загрузка документов идут с composition = false и остаются команде
 * в статусах «Формируется» и «На исправлении».
 */
const assertApplicationEditable = async (client, appId, teamId, { composition = false } = {}) => {
  const { rows } = await client.query(`
    SELECT tt.id, tt.status, tt.team_id, tt.division_id, tt.paper_roster_league_url,
           d.digital_applications_only, d.league_managed_roster
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

  // Проверяем раньше статуса: иначе команде в статусе «На проверке» вернётся отказ про
  // статус, хотя дело не в нём — состав ей закрыт совсем.
  if (composition && isLeagueManagedRoster(app)) {
    const err = new Error('Состав заявки ведёт лига: добавить или убрать человека может только она');
    err.status = 403;
    throw err;
  }

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
      SELECT l.id as league_id, l.name as league_name, l.short_name as league_short_name, l.logo_url as league_logo,
             s.id as season_id, s.name as season_name,
             json_agg(json_build_object(
                 'id', d.id, 'name', d.name,
                 'app_start', d.application_start, 'app_end', d.application_end,
                 'digital_applications_only', d.digital_applications_only,
                 'league_managed_roster', d.league_managed_roster
             ) ORDER BY d.name) as divisions
      FROM divisions d
      JOIN seasons s ON d.season_id = s.id
      JOIN leagues l ON s.league_id = l.id
      WHERE d.is_published = true
        AND NOW() BETWEEN d.application_start AND d.application_end
        AND NOT EXISTS (
          SELECT 1 FROM tournament_teams tt WHERE tt.team_id = $1 AND tt.division_id = d.id
        )
      GROUP BY l.id, l.name, l.short_name, l.logo_url, s.id, s.name
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
         d.id as division_id, d.name as division_name, d.short_name as division_short_name, d.end_date as division_end_date,
         d.digital_applications_only, d.league_managed_roster, d.req_med_cert, d.req_insurance, d.req_consent,
         s.name as season_name,
         l.name as league_name, l.logo_url as league_logo,

         -- Как только в дивизионе сыгран хотя бы один матч (любой командой), полное удаление
         -- игрока из заявки запрещаем — см. removePlayerFromApplication.
         EXISTS (SELECT 1 FROM games g WHERE g.division_id = d.id AND g.status = 'finished') as division_has_games,

         COALESCE(
             (SELECT json_agg(json_build_object(
                 'id', tr.id, 'player_id', tr.player_id, 'jersey_number', tr.jersey_number,
                 'position', tr.position, 'is_captain', tr.is_captain, 'is_assistant', tr.is_assistant,
                 'application_status', tr.application_status,
                 'medical_url', tpd.medical_url, 'insurance_url', tpd.insurance_url, 'consent_url', tpd.consent_url,
                 'medical_expires_at', tpd.medical_expires_at, 'insurance_expires_at', tpd.insurance_expires_at, 'consent_expires_at', tpd.consent_expires_at,
                 'first_name', u.first_name, 'last_name', u.last_name,
                 'user_avatar_url', u.avatar_url,
                 'team_member_photo_url', tm.photo_url,

                 -- Квалификация лиговая (одна на человека во всей лиге), заявка её не хранит.
                 -- qualification_conflict — действующая квалификация не входит в список допущенных
                 -- дивизионом: из турнира это никого не выкидывает (правила проверяются в момент
                 -- заявки), но команда должна видеть расхождение у себя в составе.
                 'qualification_id', uq.qualification_id,
                 'qualification_name', lq.name,
                 'qualification_short_name', lq.short_name,
                 'qualification_conflict', (
                     EXISTS (SELECT 1 FROM division_qualifications dq WHERE dq.division_id = d.id)
                     AND NOT EXISTS (
                         SELECT 1 FROM division_qualifications dq
                         WHERE dq.division_id = d.id
                           AND dq.qualification_id IS NOT DISTINCT FROM uq.qualification_id
                     )
                 )
             ) ORDER BY u.last_name ASC)
             FROM tournament_rosters tr
             JOIN users u ON tr.player_id = u.id
             -- Документы допуска лежат на паре «заявка + человек»: у играющего
             -- представителя они одни и те же и в составе, и в штабе
             LEFT JOIN tournament_person_docs tpd
                    ON tpd.tournament_team_id = tt.id AND tpd.user_id = u.id
             LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
             LEFT JOIN user_qualifications uq
                    ON uq.user_id = u.id AND uq.league_id = s.league_id AND uq.ended_at IS NULL
             LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
             WHERE tr.tournament_team_id = tt.id AND tr.period_end IS NULL),
         '[]'::json) as roster,

         COALESCE(
             (SELECT json_agg(json_build_object(
                 'id', ttr.id,
                 'user_id', ttr.user_id,
                 'role', ttr.tournament_role,
                 'first_name', u.first_name, 'last_name', u.last_name,
                 'user_avatar_url', u.avatar_url,
                 'team_member_photo_url', tm.photo_url,
                 -- Те же документы допуска, что и у игроков: дивизион требует их с
                 -- представителей по тем же флагам req_med_cert / req_insurance / req_consent
                 'medical_url', tpd.medical_url, 'insurance_url', tpd.insurance_url, 'consent_url', tpd.consent_url,
                 'medical_expires_at', tpd.medical_expires_at, 'insurance_expires_at', tpd.insurance_expires_at, 'consent_expires_at', tpd.consent_expires_at
             ) ORDER BY u.last_name ASC)
             FROM tournament_team_roles ttr
             JOIN users u ON ttr.user_id = u.id
             LEFT JOIN tournament_person_docs tpd
                    ON tpd.tournament_team_id = tt.id AND tpd.user_id = u.id
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

    // appId === 'new' — «виртуальная» заявка (записи в БД нет): отдаём полный состав команды
    // без исключений. Используется шторками добавления игроков/штаба, пока заявка собирается
    // локально на фронте (см. SeasonRosterDetails, виртуальный режим).
    const isVirtual = appId === 'new';
    // Пикер — это шторка добавления, поэтому его закрывает то же правило, что и сами
    // добавления: там, где состав ведёт лига, команде выбирать некого.
    if (!isVirtual) await assertApplicationEditable(pool, appId, teamId, { composition: true });
    const exclusionAppId = isVirtual ? -1 : appId;

    // Штаб добавляется в заявку отдельно на каждую роль, поэтому из списка прячем не всех,
    // кто уже в заявке, а только тех, у кого уже есть ИМЕННО ЭТА роль. Без ?role= (старое
    // поведение и пикер игроков) прячем любого, кто уже есть в штабе.
    const roleFilter = TOURNAMENT_ROLES.includes(req.query.role) ? req.query.role : null;

    // Дивизион нужен, чтобы пометить в пикере тех, кого не пропустит квалификация. У реальной
    // заявки он берётся из неё, у виртуальной («new») приходит параметром — форма создания
    // заявки дивизион уже выбрала. Шторка при этом только подсказывает: сохранение проверяет
    // допуск само (assertPlayersAllowedInDivision).
    let divisionId = req.query.divisionId ? Number(req.query.divisionId) : null;
    if (!isVirtual) {
      const { rows } = await pool.query(`SELECT division_id FROM tournament_teams WHERE id = $1`, [appId]);
      divisionId = rows[0]?.division_id ?? null;
    }
    const qualRules = await loadDivisionQualificationRules(pool, divisionId);

    const playersRes = await pool.query(`
      SELECT tm.user_id as id, u.first_name, u.last_name, u.avatar_url, tm.photo_url,
             tr.position, tr.jersey_number,
             uq.qualification_id, lq.name as qualification_name, lq.short_name as qualification_short_name
      FROM team_rosters tr
      JOIN team_members tm ON tr.member_id = tm.id
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN user_qualifications uq
             ON uq.user_id = tm.user_id AND uq.league_id = $3::int AND uq.ended_at IS NULL
      LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
      WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM tournament_rosters ex
          WHERE ex.tournament_team_id = $2 AND ex.player_id = tm.user_id AND ex.period_end IS NULL
        )
      ORDER BY u.last_name ASC, u.first_name ASC
    `, [teamId, exclusionAppId, qualRules?.leagueId ?? null]);

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
            AND ($3::varchar IS NULL OR ex.tournament_role = $3)
        )
      GROUP BY tm.user_id, u.first_name, u.last_name, u.avatar_url, tm.photo_url
      ORDER BY u.last_name ASC, u.first_name ASC
    `, [teamId, exclusionAppId, roleFilter]);

    // qual_block_reason — почему игрока нельзя добавить в эту заявку. null у всех, если
    // контроль в дивизионе выключен или дивизион неизвестен. Квалификацию в шторке подписываем
    // полным названием, поэтому и в отказе стоит оно, а не сокращение.
    const allowedQualIds = new Set((qualRules?.allowed || []).map(q => q.id));
    const players = playersRes.rows.map(player => {
      if (!qualRules?.enabled) return { ...player, qual_block_reason: null };

      const isAllowed = player.qualification_id
        ? allowedQualIds.has(player.qualification_id)
        : qualRules.allowsNone;

      return {
        ...player,
        qual_block_reason: isAllowed
          ? null
          : `${player.qualification_name || 'Квалификации нет'} — не допускается`,
      };
    });

    return res.json({ success: true, players, staff: staffRes.rows });
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
    let { divisionId, players, staff, asDraft } = req.body;

    if (!divisionId) {
      const err = new Error('Не выбран дивизион для подачи заявки');
      err.status = 400;
      throw err;
    }

    // Фронт собирает заявку локально (виртуальный режим SeasonRosterDetails) и отправляет одним
    // запросом. asDraft выбирает, чем этот запрос заканчивается:
    //   false — заявка сразу улетает в лигу (pending), как раньше;
    //   true  — остаётся черновиком (draft), команда дособирает состав и, главное, догружает
    //           документы игроков — они принимаются только в статусах draft/revision
    //           (см. assertApplicationEditable), а до появления записи в БД грузить их некуда.
    // Требования к полноте заявки черновика не касаются: их проверяет sendApplicationForReview
    // в момент отправки. Единственное, что проверяется всегда, — допуск по квалификации:
    // непроходного игрока не пускаем в заявку вообще, даже в черновую.
    // players: [{ player_id, position, jersey_number, is_captain, is_assistant }], staff: [{ user_id, role }]
    const isDraft = asDraft === true || asDraft === 'true';
    if (typeof players === 'string') { try { players = JSON.parse(players); } catch (e) { players = []; } }
    if (!Array.isArray(players)) players = [];
    if (typeof staff === 'string') { try { staff = JSON.parse(staff); } catch (e) { staff = []; } }
    if (!Array.isArray(staff)) staff = [];

    // Одна строка = одна пара «человек + роль», поэтому один и тот же user_id может прийти
    // несколько раз с разными ролями. Невалидные роли отсекаем сразу, чтобы проверка
    // «заявка без представителей» ниже считала реально пригодные записи.
    const staffRows = staff
      .map(s => ({ user_id: Number(s.user_id), role: toTournamentRole(s.role) }))
      .filter(s => s.user_id && TOURNAMENT_ROLES.includes(s.role));

    const dupCheck = await client.query(
      `SELECT id FROM tournament_teams WHERE team_id = $1 AND division_id = $2`,
      [teamId, divisionId]
    );
    if (dupCheck.rows.length > 0) {
      const err = new Error('Заявка в этот дивизион уже существует');
      err.status = 400;
      throw err;
    }

    const divRes = await client.query(`SELECT digital_applications_only FROM divisions WHERE id = $1`, [divisionId]);
    if (divRes.rows.length === 0) {
      const err = new Error('Дивизион не найден');
      err.status = 400;
      throw err;
    }
    const isDigital = divRes.rows[0].digital_applications_only;

    if (!isDraft && !isDigital && !req.file) {
      const err = new Error('Сначала загрузите скан заявочного листа');
      err.status = 400;
      throw err;
    }
    if (!isDraft && isDigital && staffRows.length === 0) {
      const err = new Error('Нельзя отправить заявку: необходимо добавить хотя бы одного представителя команды (тренера или руководителя)');
      err.status = 400;
      throw err;
    }

    if (isDigital) {
      await assertPlayersAllowedInDivision(client, divisionId, players.map(p => p.player_id));
    }

    const appRes = await client.query(
      `INSERT INTO tournament_teams (division_id, team_id, status) VALUES ($1, $2, $3) RETURNING id`,
      [divisionId, teamId, isDraft ? 'draft' : 'pending']
    );
    const appId = appRes.rows[0].id;

    if (req.file) {
      const key = `uploads/paper_application_tournament_teams_${appId}.${getFileExt(req.file.originalname)}`;
      const url = await uploadBufferToS3(req.file, key);
      await client.query(`UPDATE tournament_teams SET paper_roster_team_url = $1 WHERE id = $2`, [url, appId]);
    }

    if (isDigital && players.length > 0) {
      // Валидность игроков подтверждаем членством в команде; амплуа/номер/капитанство берём из запроса
      await client.query(`
        INSERT INTO tournament_rosters (tournament_team_id, player_id, position, jersey_number, is_captain, is_assistant)
        SELECT $1, tm.user_id, x.position, x.jersey_number, COALESCE(x.is_captain, false), COALESCE(x.is_assistant, false)
        FROM jsonb_to_recordset($3::jsonb) AS x(player_id int, position varchar, jersey_number int, is_captain boolean, is_assistant boolean)
        JOIN team_members tm ON tm.user_id = x.player_id AND tm.team_id = $2 AND tm.left_at IS NULL
      `, [appId, teamId, JSON.stringify(players)]);
    }

    if (isDigital && staffRows.length > 0) {
      // Штаб заявки формируется только из активного штата команды (team_roles)
      await client.query(`
        INSERT INTO tournament_team_roles (tournament_team_id, user_id, tournament_role)
        SELECT $1, tm.user_id, x.role
        FROM jsonb_to_recordset($3::jsonb) AS x(user_id int, role varchar)
        JOIN team_members tm ON tm.user_id = x.user_id AND tm.team_id = $2 AND tm.left_at IS NULL
        JOIN team_roles trole ON trole.member_id = tm.id AND trole.left_at IS NULL
        GROUP BY tm.user_id, x.role
        ON CONFLICT (tournament_team_id, user_id, tournament_role) DO UPDATE SET left_at = NULL
      `, [appId, teamId, JSON.stringify(staffRows)]);
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
      SELECT tt.status, tt.paper_roster_team_url, tt.paper_roster_league_url,
             d.digital_applications_only, d.league_managed_roster,
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

    // Бумажный дивизион: пока лига не проверила скан, отправка возможна только с загруженным сканом
    if (!app.digital_applications_only && app.paper_roster_league_url === null && !app.paper_roster_team_url) {
      return res.status(400).json({ success: false, error: 'Сначала загрузите скан заявочного листа' });
    }

    // Представителей требуем только там, где их вносит сама команда. Когда состав ведёт
    // лига, штаб появится уже после проверки — иначе команда не смогла бы отправить
    // заявку повторно после возврата на исправление.
    if (!isLeagueManagedRoster(app) && (app.digital_applications_only || app.paper_roster_league_url !== null)) {
      if (parseInt(app.staff_count, 10) === 0) {
        return res.status(400).json({ success: false, error: 'Нельзя отправить заявку: необходимо добавить хотя бы одного представителя команды (тренера или руководителя)' });
      }
    }

    // Состав собирали раньше, а лига могла за это время сменить игроку квалификацию или
    // список допущенных в дивизион — поэтому перед отправкой проверяем заявку целиком.
    await assertApplicationRosterAllowed(pool, appId);

    await pool.query(`UPDATE tournament_teams SET status = 'pending', updated_at = NOW() WHERE id = $1`, [appId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Send Application For Review Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при отправке заявки на проверку' });
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

// POST /:teamId/applications/:appId/roster  { playerIds: number[], position?: varchar }
// position — амплуа блока, из которого добавляют (перекрывает амплуа игрока в составе
// команды): вратаря можно заявить нападающим и наоборот.
export const addPlayersToApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { teamId, appId } = req.params;
    const { playerIds, position } = req.body;

    const app = await assertApplicationEditable(client, appId, teamId, { composition: true });

    if (Array.isArray(playerIds) && playerIds.length > 0) {
      await assertPlayersAllowedInDivision(client, app.division_id, playerIds);

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
        const effectivePosition = position || row.position;
        if (existingPids.has(row.pid)) {
          updateValues.push(`($${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++}, $${updateIdx++})`);
          updateParams.push(appId, row.pid, effectivePosition, row.jersey_number, row.is_captain || false, row.is_assistant || false);
        } else {
          insertValues.push(`($${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++}, $${insertIdx++})`);
          insertParams.push(appId, row.pid, effectivePosition, row.jersey_number, row.is_captain || false, row.is_assistant || false);
        }
      }

      if (updateValues.length > 0) {
        await client.query(`
          UPDATE tournament_rosters AS tr
          SET period_end = NULL,
              application_status = 'pending',
              -- Игрок вернулся в заявку и снова ждёт проверки, значит прежний слепок
              -- фото больше не действует: гасим его тем же движением, что и сброс
              -- допуска (см. utils/admissionReset.js), иначе лига сверяла бы человека
              -- по кадру, допущенному ещё до отзаявки.
              photo_snapshot_prev_url = photo_snapshot_url,
              photo_snapshot_url = NULL,
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
// Полностью удаляет игрока из заявки (не soft-delete через period_end), но только пока
// в дивизионе не сыгран ни один матч — проверяем ВЕСЬ дивизион, а не только эту команду,
// так как исторические протоколы/статистика других команд тоже ссылаются на tournament_rosters.
export const removePlayerFromApplication = async (req, res) => {
  try {
    const { teamId, appId, rosterId } = req.params;
    const app = await assertApplicationEditable(pool, appId, teamId, { composition: true });

    const gamesCheck = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM games WHERE division_id = $1 AND status = 'finished') as has_games`,
      [app.division_id]
    );
    if (gamesCheck.rows[0].has_games) {
      return res.status(400).json({ success: false, error: 'В дивизионе уже сыграны матчи — полное удаление игрока из заявки недоступно' });
    }

    const { rows } = await pool.query(
      `DELETE FROM tournament_rosters WHERE id = $1 AND tournament_team_id = $2 RETURNING id`,
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

      // Данные изменились — проверка лиги относилась уже к другим данным (utils/admissionReset.js)
      await resetAdmissionByRosterIds(pool, [rosterId]);

      if (is_captain === true) {
        // Капитан в заявке один: у прежнего нашивку снимаем, и это тоже правка его
        // данных — значит и его допуск уходит на перепроверку. Условие is_captain
        // здесь обязательно: без него UPDATE трогал бы всю заявку целиком и сносил
        // допуск всей команде разом, хотя менялся один человек.
        const { rows: dethroned } = await pool.query(
          `UPDATE tournament_rosters SET is_captain = false, updated_at = NOW()
            WHERE tournament_team_id = $1 AND id != $2 AND period_end IS NULL AND is_captain = true
            RETURNING id`,
          [appId, rosterId]
        );
        await resetAdmissionByRosterIds(pool, dethroned.map(r => r.id));
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[Update Roster Entry Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при сохранении данных игрока' });
  }
};

// ─────────────────── ДОКУМЕНТЫ ДОПУСКА В ЗАЯВКЕ ───────────────────
// Живут на паре «заявка + человек» (tournament_person_docs), а не на строке игрока.
// Причина одна и важная: представитель команды может быть заявлен и игроком, и тогда
// справка у него должна быть одна на обе роли. Держи их в двух местах — разъедутся
// в первый же день, потому что грузить будут то из состава, то из штаба.
//
// Побочный полезный эффект: документы переживают отзаявку и повторное добавление
// игрока — раньше они лежали на строке ростера и с ней же терялись.

const personDocKey = (appId, userId, type) => `uploads/tournament_person_${appId}_${userId}_${type}`;

// Ключ файлов, загруженных до переезда документов: они лежат от строки ростера.
const legacyDocKey = (type) => new RegExp(`^uploads/tournament_rosters_\\d+_${type}`);

// Прежний файл документа в S3 после замены. Вызывать строго ПОСЛЕ успешной записи в БД:
// иначе сбой на UPDATE оставил бы заявку со ссылкой на уже удалённый файл.
const deleteReplacedPersonDoc = async (previousUrl, newUrl, appId, userId, type) => {
  const key = (previousUrl || '').replace(/^\//, '');
  if (!key || `/${key}` === newUrl) return;

  // Трогаем только файлы этого же слота документа — своего формата ключа или старого,
  // от строки ростера. Ссылка на что-то постороннее удаляться не должна.
  const isOwn = key.startsWith(personDocKey(appId, userId, type)) || legacyDocKey(type).test(key);
  if (!isOwn) return;

  await s3
    .send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
    .catch((err) => console.error(`Не удалось удалить прежний файл (${type}):`, err.message));
};

// Человек должен быть в этой заявке — игроком или представителем. Иначе документы
// повисли бы на постороннем пользователе.
const assertPersonInApplication = async (client, appId, userId) => {
  const { rowCount } = await client.query(`
    SELECT 1 FROM tournament_rosters
     WHERE tournament_team_id = $1 AND player_id = $2 AND period_end IS NULL
    UNION ALL
    SELECT 1 FROM tournament_team_roles
     WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
     LIMIT 1
  `, [appId, userId]);

  if (rowCount === 0) {
    const err = new Error('Этот человек не заявлен в составе или штабе заявки');
    err.status = 404;
    throw err;
  }
};

const loadPersonDocs = async (client, appId, userId) => {
  const { rows } = await client.query(
    `SELECT medical_url, insurance_url, consent_url FROM tournament_person_docs
      WHERE tournament_team_id = $1 AND user_id = $2`,
    [appId, userId]
  );
  return rows[0] || {};
};

// Запись документов одного человека. Строка заводится по факту первой загрузки.
const savePersonDocs = async (client, appId, userId, patch) => {
  const columns = Object.keys(patch);
  if (columns.length === 0) return;

  const insertCols = ['tournament_team_id', 'user_id', ...columns];
  const values = [appId, userId, ...columns.map(c => patch[c])];
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const updates = columns.map(c => `${c} = EXCLUDED.${c}`);

  await client.query(`
    INSERT INTO tournament_person_docs (${insertCols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT ON CONSTRAINT tournament_person_docs_unique
    DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
  `, values);
};

// POST /:teamId/applications/:appId/docs/:userId (multipart: insurance?, medical?, consent?)
//
// Удаления тут нет намеренно: документ допуска нельзя просто убрать из заявки, его можно
// только заменить другим файлом (см. PlayerDocsModal — крестика у плитки нет).
export const uploadPersonDocs = async (req, res) => {
  try {
    const { teamId, appId, userId } = req.params;

    await assertApplicationEditable(pool, appId, teamId);
    await assertPersonInApplication(pool, appId, userId);

    // Ссылки на текущие файлы забираем до записи: после UPDATE узнать, что лежало
    // раньше, уже неоткуда, а старые объекты надо убрать из бакета.
    const previous = await loadPersonDocs(pool, appId, userId);

    const files = req.files || {};
    const patch = {};
    const uploaded = {};

    for (const type of DOC_TYPES) {
      const file = files[type]?.[0];
      if (file) {
        const key = `${personDocKey(appId, userId, type)}.${getFileExt(file.originalname)}`;
        uploaded[type] = await uploadBufferToS3(file, key);
        patch[`${type}_url`] = uploaded[type];
      }

      const expires = req.body[`${type}_expires_at`];
      if (expires !== undefined) patch[`${type}_expires_at`] = expires || null;
    }

    await savePersonDocs(pool, appId, userId, patch);

    // Панель документов сохраняет каждое действие сразу и по одному документу за раз
    // (см. PlayerDocsModal — общей кнопки «Сохранить» там нет). Значит непустой patch
    // это всегда осознанная замена файла или сдвиг срока, и допуск уходит на перепроверку.
    if (Object.keys(patch).length > 0) {
      await resetAdmissionForPersons(pool, appId, [userId]);
    }

    for (const type of DOC_TYPES) {
      if (uploaded[type]) {
        await deleteReplacedPersonDoc(previous[`${type}_url`], uploaded[type], appId, userId, type);
      }
    }

    return res.json({
      success: true,
      medical_url: uploaded.medical,
      insurance_url: uploaded.insurance,
      consent_url: uploaded.consent,
    });
  } catch (err) {
    console.error('[Upload Person Docs Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при загрузке документов' });
  }
};

// POST /:teamId/applications/:appId/docs/bulk (multipart: file, type, expires_at, userIds)
//
// Командный документ — одна бумага со списком людей внутри (типовой пример: медицинское
// заключение по приложению N2 к приказу Минздрава N 1144н). Отдельной сущности под неё в базе
// нет: файл раскладывается копиями по выбранным людям, и дальше это обычные личные
// документы — со своей плиткой, своим сроком и своей заменой у каждого.
//
// Отмечает людей менеджер сам: в списке справки есть не все, а кого-то могли и не допустить.
// В списке и игроки, и представители — играющий тренер в бумажной справке обычно есть.
export const bulkUploadPersonDocs = async (req, res) => {
  try {
    const { teamId, appId } = req.params;
    const { type, expires_at } = req.body;

    if (!BULK_DOC_TYPES.includes(type)) {
      const err = new Error('Неизвестный тип документа');
      err.status = 400;
      throw err;
    }
    if (!req.file) {
      const err = new Error('Файл документа не передан');
      err.status = 400;
      throw err;
    }

    // userIds приходит строкой: запрос multipart, JSON в теле нет
    let userIds;
    try {
      userIds = JSON.parse(req.body.userIds || '[]');
    } catch {
      userIds = [];
    }
    userIds = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter(Number.isInteger))];

    if (userIds.length === 0) {
      const err = new Error('Не выбран ни один человек');
      err.status = 400;
      throw err;
    }

    await assertApplicationEditable(pool, appId, teamId);

    // Проверяем разом, что все выбранные действительно в этой заявке — игроками или
    // представителями, — и заодно забираем прежние файлы.
    const { rows } = await pool.query(`
      SELECT p.user_id, tpd.${type}_url AS previous_url
        FROM (
          SELECT DISTINCT player_id AS user_id FROM tournament_rosters
           WHERE tournament_team_id = $1 AND period_end IS NULL
          UNION
          SELECT DISTINCT user_id FROM tournament_team_roles
           WHERE tournament_team_id = $1 AND left_at IS NULL
        ) p
        LEFT JOIN tournament_person_docs tpd
               ON tpd.tournament_team_id = $1 AND tpd.user_id = p.user_id
       WHERE p.user_id = ANY($2::int[])
    `, [appId, userIds]);

    if (rows.length !== userIds.length) {
      const err = new Error('Часть выбранных людей не найдена в этой заявке');
      err.status = 400;
      throw err;
    }

    // Файл кладём в бакет столько раз, сколько отмечено людей, — по ключу на человека.
    // Копия у каждого своя намеренно: ключи и удаление прежних файлов завязаны на пару
    // «заявка + человек», и одна общая ссылка на всех означала бы, что замена документа
    // у одного уносит файл у всех остальных.
    const ext = getFileExt(req.file.originalname);
    const targets = rows.map(row => ({
      userId: row.user_id,
      previousUrl: row.previous_url,
      url: `/${personDocKey(appId, row.user_id, type)}.${ext}`,
    }));

    await Promise.all(targets.map(t => uploadBufferToS3(req.file, t.url.replace(/^\//, ''))));

    await pool.query(`
      INSERT INTO tournament_person_docs (tournament_team_id, user_id, ${type}_url, ${type}_expires_at)
      SELECT $1, v.user_id, v.url, $2
        FROM unnest($3::int[], $4::text[]) AS v(user_id, url)
      ON CONFLICT ON CONSTRAINT tournament_person_docs_unique
      DO UPDATE SET ${type}_url = EXCLUDED.${type}_url,
                    ${type}_expires_at = EXCLUDED.${type}_expires_at,
                    updated_at = NOW()
    `, [appId, expires_at || null, targets.map(t => t.userId), targets.map(t => t.url)]);

    // Одна бумага — но у каждого отмеченного это замена его личного документа, поэтому
    // на перепроверку уходят все разом. Команда, заливая общую справку на допущенный
    // состав, снимает допуск всему списку — это и есть цена массовой операции.
    await resetAdmissionForPersons(pool, appId, targets.map(t => t.userId));

    // Только после успешной записи: сбой на INSERT оставил бы заявку со ссылками на удалённое
    for (const t of targets) {
      await deleteReplacedPersonDoc(t.previousUrl, t.url, appId, t.userId, type);
    }

    return res.json({ success: true, updated: targets.length });
  } catch (err) {
    console.error('[Bulk Upload Person Docs Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при массовой загрузке документа' });
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

    await assertApplicationEditable(client, appId, teamId, { composition: true });

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

    // roles — ПОЛНЫЙ набор ролей этого человека в заявке, а не одна роль: человек может быть
    // одновременно руководителем, тренером и администратором. Приводим состояние в БД к набору:
    // лишние роли закрываем, недостающие открываем. Пустой набор = убрать из заявки совсем.
    const nextRoles = normalizeRoles(roles);

    await client.query(
      `UPDATE tournament_team_roles SET left_at = NOW()
       WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
         AND NOT (tournament_role = ANY($3::varchar[]))`,
      [appId, userId, nextRoles]
    );

    if (nextRoles.length > 0) {
      // Повторное добавление ранее убранной роли переоткрывает ту же строку (left_at = NULL),
      // а не плодит дубли — уникальность по тройке заявка+человек+роль.
      await client.query(
        `INSERT INTO tournament_team_roles (tournament_team_id, user_id, tournament_role)
         SELECT $1, $2, r FROM unnest($3::varchar[]) AS r
         ON CONFLICT (tournament_team_id, user_id, tournament_role) DO UPDATE SET left_at = NULL`,
        [appId, userId, nextRoles]
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

// DELETE /:teamId/applications/:appId/staff/:userId       — убрать человека из заявки целиком
// DELETE /:teamId/applications/:appId/staff/:userId/:role — снять только одну его роль
export const removeStaffFromApplication = async (req, res) => {
  try {
    const { teamId, appId, userId, role } = req.params;
    await assertApplicationEditable(pool, appId, teamId, { composition: true });

    const roleFilter = TOURNAMENT_ROLES.includes(role) ? role : null;

    await pool.query(
      `UPDATE tournament_team_roles SET left_at = NOW()
       WHERE tournament_team_id = $1 AND user_id = $2 AND left_at IS NULL
         AND ($3::varchar IS NULL OR tournament_role = $3)`,
      [appId, userId, roleFilter]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[Remove Staff From Application Error]:', err);
    return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Ошибка сервера при удалении сотрудника из заявки' });
  }
};
