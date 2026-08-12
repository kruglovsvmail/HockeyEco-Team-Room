import pool from '../config/db.js';
import { isCoachAnywhere } from '../utils/checkPermission.js';

// Библиотека упражнений Кабинета тренера.
//
// Упражнение принадлежит человеку, а не команде и не клубу: тренер работает с разными
// составами, меняет клубы, и его методика уходит вместе с ним. Поэтому во всех ручках
// ниже владелец — req.user.id, и чужую строку не отдаст и не тронет ни одна из них.
//
// Единственная механика обмена — копирование: «поделиться» создаёт получателю
// независимую копию. Ничего общего и изменяемого между тренерами не существует.

const RINK_TYPES = ['full', 'top', 'bottom'];

// Названия площадок сменились вместе с разворотом катка на вертикаль. Старые значения
// принимаем и переводим на месте: упражнение не должно ломаться из-за переименования.
const LEGACY_RINK_TYPES = { half: 'top', zone: 'top' };

// Пустая сцена для упражнения, у которого включили доску, но ещё ничего не расставили.
// Кадр всегда есть хотя бы один — на нём стоит вся отрисовка и проигрывание.
const EMPTY_BOARD = { objects: [], frames: [{ id: 'f1', note: '', positions: {}, shapes: [] }] };

/**
 * Приводит присланные клиентом поля к тому, что можно писать в БД.
 * Возвращает { error } при некорректных данных — вызывающий сам решает, как ответить.
 */
const normalizeDrillInput = (body) => {
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Название упражнения обязательно' };
  if (name.length > 255) return { error: 'Название слишком длинное' };

  const description = body?.description ? String(body.description).trim() : null;

  // Планшет есть у упражнения всегда: в него можно зайти и сохранить схему, даже если
  // показывать её в упражнении тренер не собирается. За показ отвечает отдельный флаг
  // board_enabled — иначе выключение планшета стирало бы нарисованное.
  let rinkType = body?.rink_type || 'full';
  rinkType = LEGACY_RINK_TYPES[rinkType] || rinkType;
  if (!RINK_TYPES.includes(rinkType)) {
    return { error: 'Некорректный тип площадки' };
  }

  let boardJson = body?.board_json && typeof body.board_json === 'object' ? body.board_json : EMPTY_BOARD;
  if (!Array.isArray(boardJson.frames) || boardJson.frames.length === 0) {
    boardJson = { ...boardJson, frames: EMPTY_BOARD.frames };
  }
  if (!Array.isArray(boardJson.objects)) {
    boardJson = { ...boardJson, objects: [] };
  }

  const boardEnabled = body?.board_enabled !== false;

  // Теги свободные, но храним их нормализованными: обрезанными, без пустых и дублей.
  const rawTags = Array.isArray(body?.tags) ? body.tags : [];
  const tags = [...new Set(
    rawTags.map(t => String(t).trim()).filter(t => t.length > 0 && t.length <= 40)
  )].slice(0, 20);

  return { name, description, rinkType, boardJson, boardEnabled, tags };
};

// Меняется ли содержимое упражнения — то, ради чего закрываются детали в прошедших
// тренировках. Переименование и смена тегов сюда намеренно не входят: обидно закрыть
// всю историю из-за того, что тренер добавил тег.
const isContentChanged = (row, next) => (
  (row.description || null) !== (next.description || null) ||
  (row.rink_type || null) !== (next.rinkType || null) ||
  row.board_enabled !== next.boardEnabled ||
  JSON.stringify(row.board_json) !== JSON.stringify(next.boardJson)
);

// =============================================================================
// СПИСОК УПРАЖНЕНИЙ ТРЕНЕРА
// board_json намеренно не отдаём: сцена весит килобайты, а списку нужны только
// карточки. Полное упражнение приезжает отдельным запросом при открытии.
// =============================================================================
export const getMyDrills = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, tag } = req.query;

    const params = [userId];
    let where = 'd.author_user_id = $1';

    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      where += ` AND (d.name ILIKE $${params.length} OR d.description ILIKE $${params.length})`;
    }

    if (tag && String(tag).trim()) {
      params.push(JSON.stringify([String(tag).trim()]));
      where += ` AND d.tags @> $${params.length}::jsonb`;
    }

    const { rows } = await pool.query(`
      SELECT
        d.id, d.name, d.description, d.rink_type, d.board_enabled, d.tags,
        d.created_at, d.updated_at,
        d.shared_from_user_id,
        CASE WHEN d.shared_from_user_id IS NOT NULL
             THEN TRIM(CONCAT(su.last_name, ' ', su.first_name))
        END AS shared_from_name,
        -- Число кадров нужно карточке, чтобы показать «анимация из N кадров»,
        -- но тянуть ради этого всю сцену незачем
        CASE WHEN d.board_json IS NULL THEN 0
             ELSE jsonb_array_length(COALESCE(d.board_json->'frames', '[]'::jsonb))
        END AS frames_count
      FROM drills d
      LEFT JOIN users su ON su.id = d.shared_from_user_id
      WHERE ${where}
      ORDER BY d.updated_at DESC
    `, params);

    res.json({ success: true, drills: rows });
  } catch (err) {
    console.error('Ошибка получения библиотеки упражнений:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// СПИСОК СВОИХ ТЕГОВ — для автоподсказки в форме упражнения.
// Без неё в библиотеке через полгода живут «пас», «пасы» и «передачи» как три
// разных тега, и фильтр перестаёт что-либо значить.
// =============================================================================
export const getMyDrillTags = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tag, COUNT(*)::int AS usage_count
      FROM drills d, jsonb_array_elements_text(d.tags) AS tag
      WHERE d.author_user_id = $1
      GROUP BY tag
      ORDER BY usage_count DESC, tag ASC
    `, [req.user.id]);

    res.json({ success: true, tags: rows });
  } catch (err) {
    console.error('Ошибка получения тегов упражнений:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ОДНО УПРАЖНЕНИЕ ЦЕЛИКОМ (вместе со сценой доски)
// =============================================================================
export const getDrill = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.*,
        CASE WHEN d.shared_from_user_id IS NOT NULL
             THEN TRIM(CONCAT(su.last_name, ' ', su.first_name))
        END AS shared_from_name
      FROM drills d
      LEFT JOIN users su ON su.id = d.shared_from_user_id
      WHERE d.id = $1 AND d.author_user_id = $2
    `, [req.params.drillId, req.user.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Упражнение не найдено' });
    }

    res.json({ success: true, drill: rows[0] });
  } catch (err) {
    console.error('Ошибка получения упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// СОЗДАНИЕ УПРАЖНЕНИЯ
// =============================================================================
export const createDrill = async (req, res) => {
  try {
    const input = normalizeDrillInput(req.body);
    if (input.error) {
      return res.status(400).json({ success: false, error: input.error });
    }

    const { rows } = await pool.query(`
      INSERT INTO drills (author_user_id, name, description, rink_type, board_json, board_enabled, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
    `, [
      req.user.id,
      input.name,
      input.description,
      input.rinkType,
      JSON.stringify(input.boardJson),
      input.boardEnabled,
      JSON.stringify(input.tags),
    ]);

    res.json({ success: true, drill: rows[0] });
  } catch (err) {
    console.error('Ошибка создания упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// РЕДАКТИРОВАНИЕ УПРАЖНЕНИЯ
//
// content_updated_at двигаем только при смене содержимого. По нему решается, открыть
// ли детали упражнения в прошедшей тренировке: если тренер переделал упражнение после
// того, как оно было проведено, показывать новую версию под старой датой нельзя.
//
// Любое сохранение получателем подарка стирает отметку об отправителе: с этого момента
// упражнение его собственное.
// =============================================================================
export const updateDrill = async (req, res) => {
  try {
    const { drillId } = req.params;
    const userId = req.user.id;

    const input = normalizeDrillInput(req.body);
    if (input.error) {
      return res.status(400).json({ success: false, error: input.error });
    }

    const current = await pool.query(
      'SELECT description, rink_type, board_json, board_enabled FROM drills WHERE id = $1 AND author_user_id = $2',
      [drillId, userId]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Упражнение не найдено' });
    }

    const contentChanged = isContentChanged(current.rows[0], input);

    const { rows } = await pool.query(`
      UPDATE drills SET
        name = $3,
        description = $4,
        rink_type = $5,
        board_json = $6,
        board_enabled = $7,
        tags = $8::jsonb,
        shared_from_user_id = NULL,
        updated_at = CURRENT_TIMESTAMP,
        content_updated_at = CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE content_updated_at END
      WHERE id = $1 AND author_user_id = $2
      RETURNING *
    `, [
      drillId,
      userId,
      input.name,
      input.description,
      input.rinkType,
      JSON.stringify(input.boardJson),
      input.boardEnabled,
      JSON.stringify(input.tags),
      contentChanged,
    ]);

    res.json({ success: true, drill: rows[0] });
  } catch (err) {
    console.error('Ошибка сохранения упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// УДАЛЕНИЕ УПРАЖНЕНИЯ
//
// Планы прошедших тренировок это не ломает: там лежит копия названия, а ссылка
// на упражнение гасится в NULL (ON DELETE SET NULL). Список плана читается
// по-прежнему, недоступными становятся только детали.
// =============================================================================
export const deleteDrill = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM drills WHERE id = $1 AND author_user_id = $2',
      [req.params.drillId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Упражнение не найдено' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОИСК ТРЕНЕРА ПО ТЕЛЕФОНУ (получатель при «поделиться»)
//
// Ищем строго среди тренеров: библиотека — тренерский раздел, и отдавать поиск по
// всей базе пользователей ради подарка упражнения незачем. Телефон — уникальный
// логин в системе, поэтому совпадение всегда одно.
// =============================================================================
export const searchCoachByPhone = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Параметр phone обязателен' });
    }

    const last10Digits = String(phone).replace(/\D/g, '').slice(-10);
    if (last10Digits.length < 10) {
      return res.status(400).json({ success: false, error: 'Введите номер полностью' });
    }

    const { rows } = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.avatar_url
      FROM users u
      WHERE right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = $1
      LIMIT 1
    `, [last10Digits]);

    if (rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь с таким номером не зарегистрирован' });
    }

    const target = rows[0];

    if (target.id === req.user.id) {
      return res.json({ success: false, message: 'Это ваш собственный номер' });
    }

    if (!(await isCoachAnywhere(target.id))) {
      return res.json({ success: false, message: 'У этого пользователя нет роли тренера' });
    }

    res.json({ success: true, coach: target });
  } catch (err) {
    console.error('Ошибка поиска тренера по телефону:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОДЕЛИТЬСЯ УПРАЖНЕНИЕМ
//
// Создаём получателю независимую копию — редактирует, переименовывает и удаляет он
// её как свою, на оригинал это никак не влияет. Подтверждение не спрашиваем, но в
// копии остаётся отметка об отправителе; она стирается при первом же сохранении.
// =============================================================================
export const shareDrill = async (req, res) => {
  try {
    const { drillId } = req.params;
    const { targetUserId } = req.body;
    const userId = req.user.id;

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'Не указан получатель' });
    }
    if (Number(targetUserId) === userId) {
      return res.status(400).json({ success: false, error: 'Нельзя поделиться с самим собой' });
    }
    if (!(await isCoachAnywhere(targetUserId))) {
      return res.status(400).json({ success: false, error: 'У получателя нет роли тренера' });
    }

    // INSERT ... SELECT: копия собирается прямо в базе, сцену не гоняем через Node
    const { rows } = await pool.query(`
      INSERT INTO drills (author_user_id, name, description, rink_type, board_json, board_enabled, tags, shared_from_user_id)
      SELECT $2, d.name, d.description, d.rink_type, d.board_json, d.board_enabled, d.tags, $1
      FROM drills d
      WHERE d.id = $3 AND d.author_user_id = $1
      RETURNING id
    `, [userId, targetUserId, drillId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Упражнение не найдено' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка отправки упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
