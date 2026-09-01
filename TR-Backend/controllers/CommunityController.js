import pool from '../config/db.js';
import { PUBLISH_MODES } from '../utils/communityPublish.js';

// Где сообщество держит свой чат. Список закрытый: под каждый мессенджер во
// фронте нарисован фирменный значок, и произвольное значение показать нечем.
const CHAT_MESSENGERS = ['telegram', 'max', 'vk'];
import s3 from '../config/s3.js';
import path from 'path';
import { ROLES } from '../utils/permissions.js';

// Вспомогательный метод загрузки в S3-хранилище (тот же, что у команды и клуба)
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

// Логотипы сообществ лежат отдельной папкой, а не вперемешку с командными
// и клубными в общем uploads/: так их видно списком в консоли S3 и можно
// чистить пачкой, если сообщество удалили в обход приложения.
const logoKey = (communityId, originalName) => {
  const ext = path.extname(originalName || '') || '.png';
  // Метка времени в имени обязательна: без неё браузер и CDN продолжали бы
  // отдавать прежнюю картинку по тому же адресу. Старый файл вместо этого
  // удаляем — мусор не копится.
  return `communities/${communityId}/logo_${Date.now()}${ext}`;
};

// Удаление объекта по ссылке из БД. Тихое: файла могло уже не быть, и валить
// из-за этого правку профиля или удаление сообщества незачем.
const deleteFromS3 = async (url) => {
  const key = url ? String(url).replace(/^\//, '') : null;
  if (!key || !s3) return;
  try {
    if (typeof s3.send === 'function') {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
        Key: key,
      }));
    } else if (typeof s3.deleteObject === 'function') {
      await s3.deleteObject({
        Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
        Key: key,
      }).promise();
    }
  } catch (err) {
    console.warn('[Community Logo Cleanup]:', err.message);
  }
};

const CATEGORIES = ['skating', 'open_game'];
const STAFF_ROLES = [ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN];

// Подпись должности в штабе: ручной ввод, а если пусто — стандартная по роли.
// Держим на сервере, чтобы фронт и push давали одинаковый текст.
const ROLE_LABELS = {
  [ROLES.COMMUNITY_MANAGER]: 'Руководитель',
  [ROLES.COMMUNITY_ADMIN]: 'Администратор',
};

/**
 * Приведение лесенки дедлайнов к виду, который умеет читать resolveConfirmMinutes.
 *
 * Сортируем по убыванию before_minutes: правило «первая ступень, у которой порог
 * не больше остатка времени» работает только на упорядоченном списке, а порядок
 * ввода в настройках гарантировать нельзя.
 */
const sanitizeLadder = (input) => {
  if (!Array.isArray(input)) return null;

  const rungs = input
    .map(r => ({
      before_minutes: Math.round(Number(r?.before_minutes)),
      confirm_minutes: Math.round(Number(r?.confirm_minutes)),
    }))
    .filter(r => Number.isFinite(r.before_minutes) && r.before_minutes >= 0
      && Number.isFinite(r.confirm_minutes) && r.confirm_minutes > 0)
    .sort((a, b) => b.before_minutes - a.before_minutes);

  return rungs;
};

// =============================================================================
// КАТАЛОГ СООБЩЕСТВ (раздел «Сообщества» в сайдбаре)
//
// Показываем все сообщества платформы: человек приходит сюда именно чтобы найти
// чужое. Набор не закрывается — если состав события уже полон, вступивший просто
// попадёт в резерв, поэтому фильтра «есть места» тут нет.
// =============================================================================
export const getCommunityCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q, category, city } = req.query;

    const conditions = [];
    const values = [userId];

    if (q && String(q).trim()) {
      values.push(`%${String(q).trim().toLowerCase()}%`);
      conditions.push(`(lower(c.name) LIKE $${values.length} OR lower(COALESCE(c.city, '')) LIKE $${values.length})`);
    }
    if (category && CATEGORIES.includes(category)) {
      values.push(category);
      conditions.push(`c.category = $${values.length}`);
    }
    if (city && String(city).trim()) {
      values.push(String(city).trim());
      conditions.push(`c.city = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(`
      SELECT
        c.id, c.name, c.category, c.logo_url, c.city, c.description,
        c.color_1, c.color_2, c.owner_id,
        c.chat_messenger, c.chat_url,
        (SELECT COUNT(*) FROM community_members cm
          WHERE cm.community_id = c.id AND cm.left_at IS NULL)::int AS members_count,
        EXISTS (
          SELECT 1 FROM community_members cm
          WHERE cm.community_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
        ) AS is_member,
        (c.owner_id = $1) AS is_owner,
        -- Должность в штабе членства не требует, но для панели это тоже «своё»:
        -- такой человек может выйти из сообщества, сложив полномочия.
        EXISTS (
          SELECT 1 FROM community_roles cr
          WHERE cr.community_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL
        ) AS is_staff,
        u.first_name AS owner_first_name,
        u.last_name AS owner_last_name
      FROM communities c
      LEFT JOIN users u ON u.id = c.owner_id
      ${where}
      ORDER BY c.name
      LIMIT 200
    `, values);

    res.json({ communities: rows });
  } catch (error) {
    console.error('[Get Community Catalog Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// СООБЩЕСТВА ПОЛЬЗОВАТЕЛЯ
//
// Сообщество попадает в список трём категориям людей: владельцу, штабу и
// вступившим участникам. Роли считаем так же, как getCommunityRoles, иначе фронт
// нарисует кнопки, которые сервер потом отклонит.
// =============================================================================
export const getMyCommunities = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(`
      SELECT
        c.id, c.name, c.category, c.logo_url, c.city, c.description,
        c.color_1, c.color_2, c.owner_id, c.owner_title,
        c.calendar_scope, c.reserve_ladder, c.chat_messenger, c.chat_url,
        (
          SELECT string_agg(DISTINCT role, ',') FROM (
            SELECT cr.role FROM community_roles cr
            WHERE cr.community_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL
            UNION
            SELECT 'community_member' AS role FROM community_members cm
            WHERE cm.community_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
            UNION
            SELECT 'community_owner' AS role WHERE c.owner_id = $1
          ) AS roles
        ) AS user_role,
        (SELECT COUNT(*) FROM community_members cm
          WHERE cm.community_id = c.id AND cm.left_at IS NULL)::int AS members_count
      FROM communities c
      WHERE c.owner_id = $1
        OR EXISTS (SELECT 1 FROM community_members cm
                   WHERE cm.community_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL)
        OR EXISTS (SELECT 1 FROM community_roles cr
                   WHERE cr.community_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL)
      ORDER BY c.name
    `, [userId]);

    const communities = rows.map(c => {
      const roles = c.user_role ? c.user_role.split(',') : [];
      return {
        ...c,
        user_role: roles.join(','),
        user_roles: roles,
        is_owner: c.owner_id === userId,
        // Подписка на события сообществ не влияет ни на что: ни вступление,
        // ни отметка её не требуют. Поле отдаём для единообразия с командами.
        has_subscription: true,
      };
    });

    res.json({ communities });
  } catch (error) {
    console.error('[Get My Communities Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// СОЗДАНИЕ СООБЩЕСТВА
// Создать может любой пользователь. Владельцем становится создатель.
//
// В участники его при этом НЕ записываем: владелец сообщества и участник —
// разные вещи, тренер тренировок обычно сам не катается. Захочет отмечаться на
// свои же события — вступит обычной кнопкой.
// =============================================================================
export const createCommunity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, city, description } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название сообщества' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Неизвестная категория сообщества' });
    }

    // Логотип приходит вместе с формой создания, а не отдельным шагом: иначе
    // сообщество на секунду появлялось бы в каталоге без картинки. Имя файла
    // содержит id, поэтому строку создаём первой, а ссылку дописываем следом.
    const { rows } = await pool.query(`
      INSERT INTO communities (name, category, city, description, owner_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [String(name).trim(), category, city || null, description || null, userId]);

    let community = rows[0];

    const file = req.files?.['logo']?.[0];
    if (file) {
      try {
        const key = logoKey(community.id, file.originalname);
        await uploadBufferToS3(file, key);
        const updated = await pool.query(
          'UPDATE communities SET logo_url = $1 WHERE id = $2 RETURNING *',
          [`/${key}`, community.id]
        );
        community = updated.rows[0];
      } catch (uploadError) {
        // Сообщество уже создано — сбой загрузки картинки его не отменяет.
        // Логотип человек добавит из профиля сообщества.
        console.error('[Create Community Logo Error]:', uploadError.message);
      }
    }

    res.status(201).json({ success: true, community });
  } catch (error) {
    console.error('[Create Community Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// СТРАНИЦА СООБЩЕСТВА: УЧАСТНИКИ, ШТАБ, ИНФОРМАЦИЯ
//
// Участников отдаём одним списком с амплуа и группой — фронт сам делит их на
// блоки «Полевые» и «Вратари» и фильтрует поисковой строкой по ФИО.
// В штабе первым идёт владелец: строки в community_roles у него нет, поэтому
// подмешиваем его отдельно.
// =============================================================================
export const getCommunityDetails = async (req, res) => {
  try {
    const { communityId } = req.params;

    const communityQuery = `
      SELECT id, name, category, logo_url, city, description, color_1, color_2,
             owner_id, owner_title, calendar_scope, reserve_ladder, created_at,
             chat_messenger, chat_url,
             default_cost_mode, default_cost, default_total_cost,
             default_goalies_free, default_cost_min_participants,
             default_attendance_deadline_hours,
             default_max_skaters, default_max_goalies,
             default_publish_mode, default_publish_hours_before
      FROM communities WHERE id = $1
    `;

    // Информационные блоки вкладки «Инфо»: правила, полезное и что ещё
    // сообщество считает нужным написать. Порядок задаёт владелец.
    const infoBlocksQuery = `
      SELECT id, title, content, sort_order
      FROM community_info_blocks
      WHERE community_id = $1
      ORDER BY sort_order, id
    `;

    // И действующие, и ушедшие: фронт делит их по left_at, как во вкладке «Состав» команды
    const membersQuery = `
      SELECT
        cm.id AS member_id, u.id AS user_id,
        u.first_name, u.last_name, u.middle_name, u.birth_date, u.avatar_url,
        cm.position, cm.group_id, cm.joined_at, cm.left_at,
        g.name AS group_name
      FROM community_members cm
      JOIN users u ON u.id = cm.user_id
      LEFT JOIN community_groups g ON g.id = cm.group_id
      WHERE cm.community_id = $1
      ORDER BY u.last_name, u.first_name
    `;

    // Штаб. Владелец идёт первой строкой и с фиксированной подписью, если
    // owner_title не задан; у остальных пустой title подменяется меткой роли.
    const staffQuery = `
      SELECT
        u.id AS user_id, u.first_name, u.last_name, u.avatar_url,
        'community_owner' AS role,
        NULLIF(TRIM(COALESCE(c.owner_title, '')), '') AS title,
        0 AS sort_rank
      FROM communities c
      JOIN users u ON u.id = c.owner_id
      WHERE c.id = $1

      UNION ALL

      SELECT
        u.id AS user_id, u.first_name, u.last_name, u.avatar_url,
        cr.role,
        NULLIF(TRIM(COALESCE(cr.title, '')), '') AS title,
        1 AS sort_rank
      FROM community_roles cr
      JOIN users u ON u.id = cr.user_id
      WHERE cr.community_id = $1 AND cr.left_at IS NULL

      ORDER BY sort_rank, last_name, first_name
    `;

    const groupsQuery = `
      SELECT g.id, g.name, g.description, g.sort_order,
             (SELECT COUNT(*) FROM community_members cm
               WHERE cm.group_id = g.id AND cm.left_at IS NULL)::int AS members_count
      FROM community_groups g
      WHERE g.community_id = $1
      ORDER BY g.sort_order, g.name
    `;

    const [communityRes, membersRes, staffRes, groupsRes, infoRes] = await Promise.all([
      pool.query(communityQuery, [communityId]),
      pool.query(membersQuery, [communityId]),
      pool.query(staffQuery, [communityId]),
      pool.query(groupsQuery, [communityId]),
      pool.query(infoBlocksQuery, [communityId]),
    ]);

    if (communityRes.rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    const staff = staffRes.rows.map(s => ({
      ...s,
      // Владелец без ручной подписи так и подписан «Владелец» — ручной ввод
      // ему не обязателен, в отличие от остального штаба
      title_label: s.title || (s.role === ROLES.COMMUNITY_OWNER ? 'Владелец' : ROLE_LABELS[s.role] || ''),
    }));

    res.json({
      community: communityRes.rows[0],
      members: membersRes.rows,
      staff,
      groups: groupsRes.rows,
      info_blocks: infoRes.rows,
    });
  } catch (error) {
    console.error('[Get Community Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ВСТУПЛЕНИЕ В СООБЩЕСТВО
// Открыто всем: закрывать набор не нужно, переполнение регулируется резервом
// на конкретном событии, а не на входе в сообщество.
// =============================================================================
export const joinCommunity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { communityId } = req.params;
    const { position } = req.body;

    const exists = await pool.query('SELECT id FROM communities WHERE id = $1', [communityId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    const pos = position === 'goalie' || position === 'skater' ? position : null;

    // Повторное вступление после выхода — та же строка, гасим left_at
    const { rows } = await pool.query(`
      INSERT INTO community_members (community_id, user_id, position, joined_at)
      VALUES ($1, $2, $3, CURRENT_DATE)
      ON CONFLICT ON CONSTRAINT community_members_community_id_user_id_key
      DO UPDATE SET left_at = NULL,
                    joined_at = CURRENT_DATE,
                    position = COALESCE(EXCLUDED.position, community_members.position)
      RETURNING *
    `, [communityId, userId, pos]);

    // Настройки уведомлений заводим сразу со всеми включёнными группами: без
    // строки они и так считаются включёнными, но так пользователю есть что
    // выключать в интерфейсе, не создавая строку на лету.
    await pool.query(`
      INSERT INTO community_notification_settings (user_id, community_id)
      VALUES ($1, $2)
      ON CONFLICT ON CONSTRAINT community_notification_settings_user_community_key DO NOTHING
    `, [userId, communityId]);

    res.json({ success: true, member: rows[0] });
  } catch (error) {
    console.error('[Join Community Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ВЫХОД ИЗ СООБЩЕСТВА
// Строку не удаляем — она хранит историю участия, гасим left_at, как в клубе.
// =============================================================================
export const leaveCommunity = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { communityId } = req.params;

    const { rows } = await client.query('SELECT owner_id FROM communities WHERE id = $1', [communityId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    // Владельцу выход не закрыт: он снимает с себя членство, а владение остаётся —
    // communities.owner_id тут не трогается вовсе. Сообщество без хозяина не остаётся,
    // а расстаться с ним насовсем можно только удалением.
    await client.query('BEGIN');

    await client.query(`
      UPDATE community_members SET left_at = CURRENT_DATE
      WHERE community_id = $1 AND user_id = $2 AND left_at IS NULL
    `, [communityId, userId]);

    // Уходя, человек складывает и полномочия: должность в штабе членства не
    // требует, и оставив её, он продолжал бы распоряжаться чужими событиями.
    await client.query(`
      UPDATE community_roles SET left_at = CURRENT_DATE
      WHERE community_id = $1 AND user_id = $2 AND left_at IS NULL
    `, [communityId, userId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Leave Community Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// =============================================================================
// УДАЛЕНИЕ СООБЩЕСТВА
//
// Каскадом уходит всё: участники, штаб, группы, события, отметки, расстановки
// и настройки уведомлений — на всех внешних ключах стоит ON DELETE CASCADE.
// Действие необратимо, поэтому на фронте оно закрыто шторкой подтверждения.
// =============================================================================
export const deleteCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM communities WHERE id = $1 RETURNING name, logo_url',
      [communityId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    // Строку каскад унёс, а файл в S3 каскадам не подчиняется — убираем руками
    deleteFromS3(rows[0].logo_url);

    res.json({ success: true });
  } catch (error) {
    console.error('[Delete Community Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ПРОФИЛЬ СООБЩЕСТВА (название, логотип, город, описание, цвета, подпись владельца)
// =============================================================================
export const updateCommunityProfile = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { name, city, description, color_1, color_2, owner_title, delete_logo, chat_messenger, chat_url } = req.body;

    let logo_url = undefined;

    // Прежний файл запоминаем до записи: после UPDATE ссылка на него уже потеряна,
    // и объект остался бы в хранилище навсегда.
    const { rows: prevRows } = await pool.query(
      'SELECT logo_url FROM communities WHERE id = $1', [communityId]
    );
    const previousLogo = prevRows[0]?.logo_url || null;

    if (req.files?.['logo']?.[0]) {
      const file = req.files['logo'][0];
      const key = logoKey(communityId, file.originalname);
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
    // Пустая строка = вернуть стандартную подпись «Владелец»
    if (owner_title !== undefined) {
      pushField('owner_title', String(owner_title).trim() || null);
    }

    // Чат сообщества. Мессенджер и ссылка идут парой: значок без адреса никуда
    // не ведёт, адрес без значка нечем показать — поэтому пустое значение
    // одного гасит и второе.
    if (chat_messenger !== undefined || chat_url !== undefined) {
      const messenger = String(chat_messenger || '').trim();
      const url = String(chat_url || '').trim();

      if (messenger && !CHAT_MESSENGERS.includes(messenger)) {
        return res.status(400).json({ error: 'Неизвестный мессенджер' });
      }
      if (url && !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Ссылка на чат должна начинаться с http:// или https://' });
      }

      const hasChat = !!messenger && !!url;
      pushField('chat_messenger', hasChat ? messenger : null);
      pushField('chat_url', hasChat ? url.slice(0, 500) : null);
    }
    if (logo_url !== undefined) pushField('logo_url', logo_url);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    queryValues.push(communityId);
    const { rows } = await pool.query(
      `UPDATE communities SET ${updateFields.join(', ')} WHERE id = $${counter} RETURNING *`,
      queryValues
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    // Логотип сменили или сняли — старый файл больше не нужен
    if (logo_url !== undefined && previousLogo && previousLogo !== logo_url) {
      deleteFromS3(previousLogo);
    }

    res.json({ success: true, community: rows[0] });
  } catch (error) {
    console.error('[Update Community Profile Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// НАСТРОЙКИ СООБЩЕСТВА: лесенка резерва и видимость чужих групп в календаре
// =============================================================================
export const updateCommunitySettings = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { reserve_ladder, calendar_scope } = req.body;

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    if (reserve_ladder !== undefined) {
      const ladder = sanitizeLadder(reserve_ladder);
      if (!ladder) {
        return res.status(400).json({ error: 'Лесенка резерва должна быть массивом ступеней' });
      }
      if (ladder.length === 0) {
        return res.status(400).json({ error: 'Нужна хотя бы одна ступень: без неё резерв никому не сможет предложить место' });
      }
      updateFields.push(`"reserve_ladder" = $${counter}`);
      queryValues.push(JSON.stringify(ladder));
      counter++;
    }

    if (calendar_scope !== undefined) {
      if (!['own_groups', 'all'].includes(calendar_scope)) {
        return res.status(400).json({ error: 'Недопустимое значение видимости календаря' });
      }
      updateFields.push(`"calendar_scope" = $${counter}`);
      queryValues.push(calendar_scope);
      counter++;
    }

    // Умолчания для создания события. Отдельного экрана у них нет: это те же
    // поля формы, только заранее заполненные, поэтому и проверки те же.
    const {
      default_cost_mode, default_cost, default_total_cost,
      default_goalies_free, default_cost_min_participants,
      default_attendance_deadline_hours,
      default_max_skaters, default_max_goalies,
      default_publish_mode, default_publish_hours_before,
    } = req.body;

    if (default_cost_mode !== undefined) {
      if (!['per_person', 'split'].includes(default_cost_mode)) {
        return res.status(400).json({ error: 'Недопустимый способ расчёта взноса' });
      }
      updateFields.push(`"default_cost_mode" = $${counter}`);
      queryValues.push(default_cost_mode);
      counter++;
    }

    if (default_publish_mode !== undefined) {
      if (!PUBLISH_MODES.includes(default_publish_mode)) {
        return res.status(400).json({ error: 'Недопустимый режим публикации' });
      }
      updateFields.push(`"default_publish_mode" = $${counter}`);
      queryValues.push(default_publish_mode);
      counter++;
    }

    // Числовые умолчания. null здесь осмысленен — «не задано», поэтому
    // пропускаем только undefined, а пустое значение сохраняем как NULL.
    const numericDefaults = {
      default_cost, default_total_cost, default_cost_min_participants,
      default_attendance_deadline_hours, default_max_skaters, default_max_goalies,
      default_publish_hours_before,
    };
    for (const [column, raw] of Object.entries(numericDefaults)) {
      if (raw === undefined) continue;
      const value = raw === null || raw === '' ? null : Number(raw);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return res.status(400).json({ error: `Недопустимое значение поля ${column}` });
      }
      updateFields.push(`"${column}" = $${counter}`);
      queryValues.push(value);
      counter++;
    }

    if (default_goalies_free !== undefined) {
      updateFields.push(`"default_goalies_free" = $${counter}`);
      queryValues.push(Boolean(default_goalies_free));
      counter++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    queryValues.push(communityId);
    const { rows } = await pool.query(
      `UPDATE communities SET ${updateFields.join(', ')} WHERE id = $${counter} RETURNING *`,
      queryValues
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }

    res.json({ success: true, community: rows[0] });
  } catch (error) {
    console.error('[Update Community Settings Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// КАРТОЧКА УЧАСТНИКА: амплуа и тренировочная группа
//
// Амплуа решает, в какую очередь человек встаёт на событии с лимитом, поэтому
// менять его вправе только штаб — сам участник указывает его лишь при вступлении.
// =============================================================================
export const updateCommunityMember = async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    const { position, group_id } = req.body;

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    if (position !== undefined) {
      if (position !== null && !['skater', 'goalie'].includes(position)) {
        return res.status(400).json({ error: 'Амплуа может быть только skater или goalie' });
      }
      updateFields.push(`"position" = $${counter}`);
      queryValues.push(position);
      counter++;
    }

    if (group_id !== undefined) {
      if (group_id !== null) {
        const check = await pool.query(
          'SELECT id FROM community_groups WHERE id = $1 AND community_id = $2',
          [group_id, communityId]
        );
        if (check.rows.length === 0) {
          return res.status(400).json({ error: 'Группа не принадлежит этому сообществу' });
        }
      }
      updateFields.push(`"group_id" = $${counter}`);
      queryValues.push(group_id);
      counter++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    queryValues.push(communityId, userId);
    const { rows } = await pool.query(`
      UPDATE community_members SET ${updateFields.join(', ')}
      WHERE community_id = $${counter} AND user_id = $${counter + 1}
      RETURNING *
    `, queryValues);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Участник не найден' });
    }

    res.json({ success: true, member: rows[0] });
  } catch (error) {
    console.error('[Update Community Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ИСКЛЮЧЕНИЕ УЧАСТНИКА
// Полномочия в штабе исключение НЕ снимает: роль там живёт отдельно от членства
// и человек мог никогда не быть участником.
// =============================================================================
export const excludeCommunityMember = async (req, res) => {
  try {
    const { communityId, userId } = req.params;

    const { rowCount } = await pool.query(`
      UPDATE community_members SET left_at = CURRENT_DATE
      WHERE community_id = $1 AND user_id = $2 AND left_at IS NULL
    `, [communityId, userId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Активный участник не найден' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Exclude Community Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ШТАБ: назначение должности и ручной подписи
//
// Владельца сюда не пускаем: он и так на первой строке штаба, а его подпись
// правится через профиль сообщества (owner_title).
// =============================================================================
export const setCommunityStaff = async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    const { role, title } = req.body;

    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Недопустимая должность' });
    }

    const owner = await pool.query('SELECT owner_id FROM communities WHERE id = $1', [communityId]);
    if (owner.rows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }
    if (Number(owner.rows[0].owner_id) === Number(userId)) {
      return res.status(400).json({ error: 'Владелец уже в штабе, его подпись меняется в профиле сообщества' });
    }

    const cleanTitle = title === undefined || title === null
      ? null
      : String(title).trim().slice(0, 50) || null;

    // Один человек занимает в штабе ровно одну должность — уникальность стоит по
    // паре «сообщество + человек», поэтому повторное назначение перезаписывает роль
    const { rows } = await pool.query(`
      INSERT INTO community_roles (community_id, user_id, role, title)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ON CONSTRAINT community_roles_community_id_user_id_key
      DO UPDATE SET role = EXCLUDED.role, title = EXCLUDED.title, left_at = NULL
      RETURNING *
    `, [communityId, userId, role, cleanTitle]);

    res.json({ success: true, staff: rows[0] });
  } catch (error) {
    console.error('[Set Community Staff Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Снятие полномочий. Членство в участниках при этом не трогаем.
export const removeCommunityStaff = async (req, res) => {
  try {
    const { communityId, userId } = req.params;

    const { rowCount } = await pool.query(`
      UPDATE community_roles SET left_at = CURRENT_DATE
      WHERE community_id = $1 AND user_id = $2 AND left_at IS NULL
    `, [communityId, userId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Действующая должность не найдена' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Remove Community Staff Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ПОИСК ПОЛЬЗОВАТЕЛЯ ПО ТЕЛЕФОНУ ДЛЯ ШТАБА
// Схема как у команды и клуба: человек уже должен существовать в системе.
// =============================================================================
export const searchUserByPhoneForCommunity = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Укажите номер телефона' });
    }

    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10) {
      return res.status(400).json({ error: 'Номер телефона слишком короткий' });
    }

    const { rows } = await pool.query(`
      SELECT id, first_name, last_name, middle_name, avatar_url, phone
      FROM users
      WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $1
      LIMIT 5
    `, [`%${digits.slice(-10)}`]);

    res.json({ users: rows });
  } catch (error) {
    console.error('[Search User For Community Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ТРЕНИРОВОЧНЫЕ ГРУППЫ (только категория skating)
// =============================================================================
const assertSkating = async (communityId) => {
  const { rows } = await pool.query('SELECT category FROM communities WHERE id = $1', [communityId]);
  return rows[0]?.category === 'skating';
};

export const createCommunityGroup = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { name, description, sort_order } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название группы' });
    }
    if (!(await assertSkating(communityId))) {
      return res.status(400).json({ error: 'Тренировочные группы есть только у сообществ категории «Тренировки»' });
    }

    const { rows } = await pool.query(`
      INSERT INTO community_groups (community_id, name, description, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      communityId,
      String(name).trim(),
      String(description || '').trim() || null,
      Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
    ]);

    res.status(201).json({ success: true, group: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Группа с таким названием уже есть' });
    }
    console.error('[Create Community Group Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCommunityGroup = async (req, res) => {
  try {
    const { communityId, groupId } = req.params;
    const { name, description, sort_order } = req.body;

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ error: 'Название группы не может быть пустым' });
      }
      updateFields.push(`"name" = $${counter}`);
      queryValues.push(String(name).trim());
      counter++;
    }
    if (description !== undefined) {
      updateFields.push(`"description" = $${counter}`);
      queryValues.push(String(description || '').trim() || null);
      counter++;
    }
    if (sort_order !== undefined && Number.isFinite(Number(sort_order))) {
      updateFields.push(`"sort_order" = $${counter}`);
      queryValues.push(Number(sort_order));
      counter++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    queryValues.push(groupId, communityId);
    const { rows } = await pool.query(`
      UPDATE community_groups SET ${updateFields.join(', ')}
      WHERE id = $${counter} AND community_id = $${counter + 1}
      RETURNING *
    `, queryValues);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    res.json({ success: true, group: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Группа с таким названием уже есть' });
    }
    console.error('[Update Community Group Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Удаление группы. У участников group_id гасится в NULL внешним ключом
// (ON DELETE SET NULL) — люди из сообщества не пропадают, просто остаются без группы
// и попадают на события с включённым «и те, кто без группы».
export const deleteCommunityGroup = async (req, res) => {
  try {
    const { communityId, groupId } = req.params;

    const { rowCount } = await pool.query(
      'DELETE FROM community_groups WHERE id = $1 AND community_id = $2',
      [groupId, communityId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Delete Community Group Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// НАСТРОЙКИ УВЕДОМЛЕНИЙ УЧАСТНИКА
//
// Группы отличаются от командных: Расписание, Составы, План тренировки (только
// тренировки) и Выход из резерва. Последняя особенно важна — без неё резервист
// молча пропускает свою очередь, поэтому фронт предлагает включить её шторкой
// в момент постановки в резерв.
// =============================================================================
const NOTIFICATION_COLUMNS = ['enabled', 'schedule', 'lines', 'training_plan', 'reserve'];

export const getCommunityNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { communityId } = req.params;

    const { rows } = await pool.query(`
      SELECT enabled, schedule, lines, training_plan, reserve
      FROM community_notification_settings
      WHERE community_id = $1 AND user_id = $2
    `, [communityId, userId]);

    // Нет строки — всё включено по умолчанию, как и в командных настройках
    res.json({
      settings: rows[0] || {
        enabled: true, schedule: true, lines: true, training_plan: true, reserve: true
      }
    });
  } catch (error) {
    console.error('[Get Community Notification Settings Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCommunityNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { communityId } = req.params;

    const patch = {};
    for (const col of NOTIFICATION_COLUMNS) {
      if (req.body[col] !== undefined) {
        patch[col] = req.body[col] === true || req.body[col] === 'true';
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    const cols = Object.keys(patch);
    const values = cols.map(c => patch[c]);

    const insertCols = ['user_id', 'community_id', ...cols];
    const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`);
    const updateClause = cols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

    const { rows } = await pool.query(`
      INSERT INTO community_notification_settings (${insertCols.map(c => `"${c}"`).join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
      ON CONFLICT ON CONSTRAINT community_notification_settings_user_community_key
      DO UPDATE SET ${updateClause}
      RETURNING enabled, schedule, lines, training_plan, reserve
    `, [userId, communityId, ...values]);

    res.json({ success: true, settings: rows[0] });
  } catch (error) {
    console.error('[Update Community Notification Settings Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ДОБАВЛЕНИЕ УЧАСТНИКА ШТАБОМ
//
// Человек уже должен быть в системе — как и в командах с клубами: найти его
// можно поиском по телефону. Ушедшего возвращаем той же строкой, а не заводим
// новую: она хранит историю участия, по которой считается посещаемость.
// =============================================================================
export const addCommunityMember = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId, position } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }
    const pos = position === 'goalie' || position === 'skater' ? position : null;

    const { rows } = await pool.query(
      'SELECT id, left_at FROM community_members WHERE community_id = $1 AND user_id = $2',
      [communityId, userId]
    );

    if (rows.length > 0) {
      if (rows[0].left_at === null) {
        return res.status(409).json({ error: 'Этот человек уже в сообществе' });
      }
      await pool.query(`
        UPDATE community_members
        SET left_at = NULL, joined_at = CURRENT_DATE,
            position = COALESCE($2, position)
        WHERE id = $1
      `, [rows[0].id, pos]);
      return res.json({ success: true, restored: true });
    }

    await pool.query(`
      INSERT INTO community_members (community_id, user_id, position, joined_at)
      VALUES ($1, $2, $3, CURRENT_DATE)
    `, [communityId, userId, pos]);

    // Настройки уведомлений заводим сразу, как и при самостоятельном вступлении
    await pool.query(`
      INSERT INTO community_notification_settings (user_id, community_id)
      VALUES ($1, $2)
      ON CONFLICT ON CONSTRAINT community_notification_settings_user_community_key DO NOTHING
    `, [userId, communityId]);

    res.json({ success: true, restored: false });
  } catch (error) {
    console.error('[Add Community Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// КАРТОЧКА УЧАСТНИКА
//
// Личные данные (телефон и дата рождения) человек скрывает отдельно в каждом
// сообществе: где-то это его право, а где-то правила требуют контакт. Поэтому
// флаг живёт в членстве, а не в профиле. Скрытые поля не просто не показываются —
// они не уезжают с сервера вовсе, иначе «скрытие» держалось бы на честности фронта.
// Самому себе и владельцу видно всегда: владельцу нужно с кем-то связываться
// по льду, а себя прятать от себя бессмысленно.
// =============================================================================
export const getCommunityMemberDetails = async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    const viewerId = req.user.id;

    // Идём от пользователя, а не от членства: карточку открывают и на людях
    // из штаба, а должность в сообществе членства не требует. У такого человека
    // member_id пустой — по нему фронт и понимает, что посещаемости не будет.
    const { rows } = await pool.query(`
      SELECT
        cm.id AS member_id, cm.position, cm.group_id, cm.joined_at, cm.left_at,
        g.name AS group_name,
        cr.role AS staff_role,
        NULLIF(TRIM(COALESCE(cr.title, '')), '') AS staff_title,
        -- Подпись владельца живёт не в ролях, а в самом сообществе:
        -- владелец не строка в штабе, он у сообщества один и по определению
        NULLIF(TRIM(COALESCE(c.owner_title, '')), '') AS owner_title,
        u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
        u.height, u.weight, u.grip,
        COALESCE(cm.hide_personal_info, false) AS hide_personal_info,
        u.phone, u.birth_date,
        (c.owner_id = u.id) AS is_owner,
        (c.owner_id = $3) AS viewer_is_owner
      FROM users u
      JOIN communities c ON c.id = $1
      LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = u.id
      LEFT JOIN community_groups g ON g.id = cm.group_id
      LEFT JOIN community_roles cr ON cr.community_id = c.id AND cr.user_id = u.id
        AND cr.left_at IS NULL
      WHERE u.id = $2
    `, [communityId, userId, viewerId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Человек не найден' });
    }

    const row = rows[0];
    const isSelf = Number(row.user_id) === Number(viewerId);
    const canSeePersonal = isSelf || row.viewer_is_owner || !row.hide_personal_info;

    const { viewer_is_owner, hide_personal_info, phone, birth_date, ...member } = row;

    res.json({
      success: true,
      member: {
        ...member,
        is_self: isSelf,
        // Своё скрытие человек должен видеть переключателем; чужое наружу
        // не отдаём — о нём и так говорит personal_hidden
        hide_personal_info: isSelf ? row.hide_personal_info : undefined,
        personal_hidden: !canSeePersonal,
        phone: canSeePersonal ? phone : null,
        birth_date: canSeePersonal ? birth_date : null,
      },
    });
  } catch (error) {
    console.error('[Get Community Member Details Error]:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// =============================================================================
// ПОСЕЩАЕМОСТЬ УЧАСТНИКА
//
// Считаем только то, что человек реально мог посетить:
//   • события в промежутке его членства — до вступления и после ухода они
//     к нему отношения не имеют;
//   • у тренировок ещё и адресация по группам: подкатка чужой группы в знаменатель
//     не идёт, иначе человек из группы «Начинающие» получал бы 30% за то,
//     что не ходил на лёд «Продолжающих».
//
// В числитель идут только те отметки, где человек действительно вышел на лёд:
// резерв, не дождавшийся своей очереди, посещением не считается.
// =============================================================================
export const getCommunityMemberStats = async (req, res) => {
  try {
    const { communityId, userId } = req.params;

    const trainingQuery = `
      WITH period AS (
        SELECT joined_at::timestamp AS joined_at, left_at::timestamp AS left_at, group_id
        FROM community_members WHERE community_id = $1 AND user_id = $2
      )
      SELECT
        COUNT(DISTINCT ct.id)::int AS total,
        COUNT(DISTINCT a.community_training_id)::int AS attended
      FROM community_training ct
      JOIN period p ON true
      LEFT JOIN community_training_attendance a
        ON a.community_training_id = ct.id AND a.user_id = $2
       AND a.slot_status = 'main' AND a.withdrawn_at IS NULL
      WHERE ct.community_id = $1
        AND ct.training_date < NOW()
        AND ct.training_date >= p.joined_at
        AND (p.left_at IS NULL OR ct.training_date < p.left_at)
        AND (
          CASE
            WHEN p.group_id IS NULL THEN ct.include_ungrouped
            ELSE (
              NOT EXISTS (SELECT 1 FROM community_training_groups tg
                          WHERE tg.community_training_id = ct.id)
              OR EXISTS (SELECT 1 FROM community_training_groups tg
                         WHERE tg.community_training_id = ct.id AND tg.group_id = p.group_id)
            )
          END
        )
    `;

    const gameQuery = `
      WITH period AS (
        SELECT joined_at::timestamp AS joined_at, left_at::timestamp AS left_at
        FROM community_members WHERE community_id = $1 AND user_id = $2
      )
      SELECT
        COUNT(DISTINCT cg.id)::int AS total,
        COUNT(DISTINCT a.community_game_id)::int AS attended
      FROM community_game cg
      JOIN period p ON true
      LEFT JOIN community_game_attendance a
        ON a.community_game_id = cg.id AND a.user_id = $2
       AND a.slot_status = 'main' AND a.withdrawn_at IS NULL
      WHERE cg.community_id = $1
        AND cg.game_date < NOW()
        AND cg.game_date >= p.joined_at
        AND (p.left_at IS NULL OR cg.game_date < p.left_at)
    `;

    const [trainingRes, gameRes] = await Promise.all([
      pool.query(trainingQuery, [communityId, userId]),
      pool.query(gameQuery, [communityId, userId]),
    ]);

    const training = trainingRes.rows[0] || { total: 0, attended: 0 };
    const game = gameRes.rows[0] || { total: 0, attended: 0 };
    const percent = (attended, total) => (total > 0 ? Math.round((attended / total) * 100) : 0);

    res.json({
      success: true,
      training: { ...training, percent: percent(training.attended, training.total) },
      game: { ...game, percent: percent(game.attended, game.total) },
    });
  } catch (error) {
    console.error('[Get Community Member Stats Error]:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// =============================================================================
// СВОИ ЛИЧНЫЕ ДАННЫЕ В ЭТОМ СООБЩЕСТВЕ
//
// Правит только сам человек и только свою строку: это не управление составом,
// а личная настройка, и штабу тут делать нечего. Поэтому отдельная ручка,
// а не поле в общей правке карточки участника.
// =============================================================================
export const updateMyCommunityPrivacy = async (req, res) => {
  try {
    const userId = req.user.id;
    const { communityId } = req.params;
    const { hide_personal_info } = req.body;

    if (typeof hide_personal_info !== 'boolean') {
      return res.status(400).json({ error: 'Ожидается булево значение' });
    }

    const { rowCount } = await pool.query(`
      UPDATE community_members SET hide_personal_info = $3
      WHERE community_id = $1 AND user_id = $2 AND left_at IS NULL
    `, [communityId, userId, hide_personal_info]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Вы не состоите в этом сообществе' });
    }

    res.json({ success: true, hide_personal_info });
  } catch (error) {
    console.error('[Update Community Privacy Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ИНФОРМАЦИОННЫЕ БЛОКИ ВКЛАДКИ «ИНФО»
//
// Сколько сообществу нужно, столько и заводит: правила, что взять с собой,
// как оплачивать. Заголовок рукописный, содержимое — простой текст.
// Порядок хранится числом: перетаскивание отдаёт весь список разом.
// =============================================================================
export const createCommunityInfoBlock = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { title, content } = req.body;

    const cleanTitle = String(title || '').trim().slice(0, 100);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Нужно название блока' });
    }

    // Новый блок встаёт в конец: место ему выберут перетаскиванием
    const { rows } = await pool.query(`
      INSERT INTO community_info_blocks (community_id, title, content, sort_order)
      VALUES ($1, $2, $3, COALESCE(
        (SELECT MAX(sort_order) + 1 FROM community_info_blocks WHERE community_id = $1), 0
      ))
      RETURNING id, title, content, sort_order
    `, [communityId, cleanTitle, String(content || '').trim() || null]);

    res.json({ success: true, block: rows[0] });
  } catch (error) {
    console.error('[Create Community Info Block Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCommunityInfoBlock = async (req, res) => {
  try {
    const { communityId, blockId } = req.params;
    const { title, content } = req.body;

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    if (title !== undefined) {
      const cleanTitle = String(title).trim().slice(0, 100);
      if (!cleanTitle) return res.status(400).json({ error: 'Название блока не может быть пустым' });
      updateFields.push(`title = $${counter}`);
      queryValues.push(cleanTitle);
      counter++;
    }

    if (content !== undefined) {
      updateFields.push(`content = $${counter}`);
      queryValues.push(String(content || '').trim() || null);
      counter++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    queryValues.push(communityId, blockId);
    const { rows } = await pool.query(`
      UPDATE community_info_blocks
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE community_id = $${counter} AND id = $${counter + 1}
      RETURNING id, title, content, sort_order
    `, queryValues);

    if (rows.length === 0) return res.status(404).json({ error: 'Блок не найден' });
    res.json({ success: true, block: rows[0] });
  } catch (error) {
    console.error('[Update Community Info Block Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCommunityInfoBlock = async (req, res) => {
  try {
    const { communityId, blockId } = req.params;
    const { rowCount } = await pool.query(
      'DELETE FROM community_info_blocks WHERE community_id = $1 AND id = $2',
      [communityId, blockId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Блок не найден' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Delete Community Info Block Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Порядок приходит целиком — списком id в нужной последовательности. Позиция
// блока осмысленна только относительно соседей, и правка по одному оставляла бы
// список в промежуточных состояниях.
export const reorderCommunityInfoBlocks = async (req, res) => {
  const client = await pool.connect();
  try {
    const { communityId } = req.params;
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'Ожидается список идентификаторов блоков' });
    }

    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE community_info_blocks SET sort_order = $3 WHERE community_id = $1 AND id = $2',
        [communityId, order[i], i]
      );
    }
    await client.query('COMMIT');

    const { rows } = await client.query(`
      SELECT id, title, content, sort_order FROM community_info_blocks
      WHERE community_id = $1 ORDER BY sort_order, id
    `, [communityId]);

    res.json({ success: true, blocks: rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Reorder Community Info Blocks Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};
