import pool from '../config/db.js';
import { checkPermissionInternal, checkClubPermissionInternal } from '../utils/checkPermission.js';
import { normalizeDrillInput } from '../utils/drillContent.js';
import { sendPushToEventScopeExcept, getTrainingInfo } from '../services/pushService.js';

// План тренировки — упорядоченный список упражнений из личной библиотеки тренера.
//
// Пункт плана хранит ссылку на упражнение и копию его названия. Копия нужна ровно для
// одного случая: тренер удалил упражнение или ушёл вместе со своей библиотекой, а план
// проведённой тренировки должен по-прежнему читаться списком названий.
//
// Детали (описание и анимация) живут в самом упражнении и по нему же и читаются:
//   • предстоящая тренировка — всегда актуальная версия из библиотеки;
//   • прошедшая, упражнение с тех пор не менялось — открыты;
//   • прошедшая, упражнение отредактировано или удалено — закрыты. Показывать под
//     старой датой новую версию упражнения нельзя: команда отрабатывала не её.
//
// Отдельным видом пункта живёт разовое упражнение — придуманное под одну тренировку и
// в библиотеку не попавшее (см. блок «РАЗОВОЕ УПРАЖНЕНИЕ» ниже).

const isClubTraining = (eventType) => eventType === 'club_training';

// Куда смотреть за планом: у командной и клубной тренировки таблицы разные, а логика
// одна. Возвращаем обе части адреса сразу — они всегда нужны вместе.
const planTarget = (eventType) => (
  isClubTraining(eventType)
    ? { planTable: 'club_training_plan', eventColumn: 'club_training_id' }
    : { planTable: 'team_training_plan', eventColumn: 'team_training_id' }
);

// Может ли пользователь распоряжаться планом: добавлять упражнения, менять порядок
// и публиковать план игрокам. У клубной тренировки это строго тренер клуба.
const canManagePlan = async (userId, { teamId, clubId, eventType }, client = pool) => (
  isClubTraining(eventType)
    ? checkClubPermissionInternal(userId, clubId, 'CLUB_TRAINING_PLAN_MANAGE', client)
    : checkPermissionInternal(userId, teamId, 'TRAINING_PLAN_MANAGE', client)
);

// Тренировка + признак «уже прошла». Дату сравниваем в базе, чтобы не зависеть от
// часового пояса процесса: сервер живёт в UTC, training_date хранится timestamptz.
const loadTraining = async (eventId, eventType, client = pool) => {
  const table = isClubTraining(eventType) ? 'club_training' : 'team_training';
  const { rows } = await client.query(`
    SELECT id, plan_published, (training_date < now()) AS is_past
    FROM "${table}" WHERE id = $1
  `, [eventId]);
  return rows[0] || null;
};

// =============================================================================
// ПОЛУЧЕНИЕ ПЛАНА
//
// Детали доступных упражнений отдаём сразу вместе со списком: сцена весит килобайты,
// а раскрытие пункта должно открываться мгновенно, без отдельного запроса и спиннера.
// =============================================================================
export const getTrainingPlan = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId, clubId, eventType } = req.query;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    const training = await loadTraining(eventId, eventType);
    if (!training) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }

    const canManage = await canManagePlan(req.user.id, { teamId, clubId, eventType });

    // Неопубликованный план виден только тренерскому составу: пока тренер собирает
    // тренировку, команде незачем видеть два упражнения из восьми.
    if (!training.plan_published && !canManage) {
      return res.json({
        success: true,
        items: [],
        plan_published: false,
        is_past: training.is_past,
        can_manage: false,
      });
    }

    const { planTable, eventColumn } = planTarget(eventType);

    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.position,
        p.drill_id,
        p.drill_name,
        p.is_adhoc,
        d.name        AS live_name,
        d.description,
        d.rink_type,
        d.board_json,
        d.board_enabled,
        (d.id IS NOT NULL) AS drill_exists,
        (s.id IS NOT NULL) AS has_snapshot,
        s.description   AS snapshot_description,
        s.rink_type     AS snapshot_rink_type,
        s.board_json    AS snapshot_board_json,
        s.board_enabled AS snapshot_board_enabled
      FROM ${planTable} p
      LEFT JOIN drills d ON d.id = p.drill_id
      LEFT JOIN drill_snapshots s ON s.id = p.drill_snapshot_id
      WHERE p.${eventColumn} = $1
      ORDER BY p.position
    `, [eventId]);

    const items = rows.map(row => {
      // Слепок снимается перед правкой или удалением упражнения и с этого момента
      // главнее библиотеки: он и есть то, что команда реально отрабатывала. Живёт
      // отдельной строкой, общей для всех тренировок, замороженных одной правкой.
      const frozen = row.has_snapshot ? {
        description: row.snapshot_description,
        rink_type: row.snapshot_rink_type,
        board_json: row.snapshot_board_json,
        board_enabled: row.snapshot_board_enabled,
      } : null;

      const source = frozen || (row.drill_exists ? row : null);
      const detailsAvailable = !!source;

      // Планшет отдаём, только если тренер оставил его включённым: схема у упражнения
      // есть всегда, но показывать её команде — отдельное решение
      const showBoard = detailsAvailable && source.board_enabled !== false;

      return {
        id: row.id,
        position: row.position,
        drill_id: row.drill_id,
        // Прошедшая тренировка показывает название, которое было на момент добавления:
        // история есть история. Предстоящая живёт вместе с библиотекой.
        name: training.is_past ? row.drill_name : (row.live_name || row.drill_name),
        is_adhoc: row.is_adhoc,
        details_available: detailsAvailable,
        description: detailsAvailable ? source.description : null,
        rink_type:   showBoard ? source.rink_type  : null,
        board_json:  showBoard ? source.board_json : null,

        // Разовое упражнение правится прямо из плана, поэтому тренеру отдаём его
        // содержимое целиком — вместе со схемой, спрятанной выключенным тумблером.
        // Игрокам она не уходит: поле появляется только у того, кто планом
        // распоряжается, и только у разовых пунктов. Библиотечное упражнение
        // правится в Тренерской и открывается там по своему id.
        edit_content: (canManage && row.is_adhoc && detailsAvailable) ? {
          name: row.drill_name,
          description: source.description,
          rink_type: source.rink_type,
          board_json: source.board_json,
          board_enabled: source.board_enabled !== false,
        } : null,
      };
    });

    res.json({
      success: true,
      items,
      plan_published: training.plan_published,
      is_past: training.is_past,
      can_manage: canManage,
    });
  } catch (err) {
    console.error('Ошибка получения плана тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// СОХРАНЕНИЕ ПЛАНА
//
// Полной перезаписи (DELETE ALL + INSERT) здесь быть не может: created_at пункта —
// это момент добавления упражнения в план, по нему решается доступность деталей в
// прошедшей тренировке. Перезапись сбрасывала бы отсчёт при каждом сохранении, и
// любое старое упражнение выглядело бы только что добавленным.
//
// Поэтому: существующие пункты приходят со своим id и только двигаются по позициям,
// новые вставляются, пропавшие удаляются.
// =============================================================================
export const saveTrainingPlan = async (req, res) => {
  const client = await pool.connect();
  try {
    const { eventId } = req.params;
    const { teamId, clubId, eventType, items } = req.body;
    const userId = req.user.id;

    if ((!teamId && !clubId) || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Некорректные данные' });
    }

    if (!(await canManagePlan(userId, { teamId, clubId, eventType }, client))) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для изменения плана' });
    }

    const training = await loadTraining(eventId, eventType, client);
    if (!training) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }

    const { planTable, eventColumn } = planTarget(eventType);

    // Названия новых пунктов берём из библиотеки, а не из тела запроса: клиент мог бы
    // прислать любое. Заодно это проверка владения — чужое упражнение в план не попадёт.
    const newDrillIds = items.filter(i => !i.id).map(i => Number(i.drill_id)).filter(Boolean);
    const nameByDrillId = new Map();
    if (newDrillIds.length > 0) {
      const { rows } = await client.query(
        'SELECT id, name FROM drills WHERE id = ANY($1::int[]) AND author_user_id = $2',
        [newDrillIds, userId]
      );
      rows.forEach(r => nameByDrillId.set(r.id, r.name));
    }

    await client.query('BEGIN');

    // Пункты, которых больше нет в присланном списке
    const keptIds = items.map(i => Number(i.id)).filter(Boolean);
    const removed = await client.query(
      `DELETE FROM ${planTable} WHERE ${eventColumn} = $1 AND NOT (id = ANY($2::int[]))
       RETURNING is_adhoc, drill_snapshot_id`,
      [eventId, keptIds]
    );

    // Слепок разового упражнения создавался ради одного этого пункта и больше ни на
    // что не ссылается — вместе с пунктом уходит и он. Слепки библиотечных упражнений
    // не трогаем: одна и та же строка обслуживает все тренировки, замороженные одной
    // правкой, и убрать её из-за одного плана значило бы обнулить детали у остальных.
    const orphanSnapshots = removed.rows
      .filter(r => r.is_adhoc && r.drill_snapshot_id)
      .map(r => r.drill_snapshot_id);

    if (orphanSnapshots.length > 0) {
      await client.query('DELETE FROM drill_snapshots WHERE id = ANY($1::int[])', [orphanSnapshots]);
    }

    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (item.id) {
        await client.query(
          `UPDATE ${planTable} SET position = $3 WHERE id = $1 AND ${eventColumn} = $2`,
          [item.id, eventId, index]
        );
        continue;
      }

      const drillId = Number(item.drill_id);
      const drillName = nameByDrillId.get(drillId);
      // Упражнения нет в библиотеке автора — молча пропускаем пункт, а не валим
      // сохранение целиком: остальной план тренер потерять не должен.
      if (!drillName) continue;

      await client.query(
        `INSERT INTO ${planTable} (${eventColumn}, position, drill_id, drill_name) VALUES ($1, $2, $3, $4)`,
        [eventId, index, drillId, drillName]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка сохранения плана тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ПУБЛИКАЦИЯ ПЛАНА ИГРОКАМ
//
// План для того и нужен, чтобы игроки заранее видели, чем будут заниматься, и не
// тратили время на объяснения уже на льду. Отдельный флаг существует только ради
// черновика: до нажатия команда не видит наполовину собранную тренировку.
// =============================================================================
export const setPlanPublished = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { teamId, clubId, eventType, published } = req.body;
    const userId = req.user.id;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    if (!(await canManagePlan(userId, { teamId, clubId, eventType }))) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для публикации плана' });
    }

    const isClub = isClubTraining(eventType);
    const table = isClub ? 'club_training' : 'team_training';

    const before = await loadTraining(eventId, eventType);
    if (!before) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }

    const nextValue = Boolean(published);
    await pool.query(`UPDATE "${table}" SET plan_published = $2 WHERE id = $1`, [eventId, nextValue]);

    // Пуш только на переход «черновик → опубликован»: снятие публикации и повторные
    // сохранения команду не касаются.
    if (nextValue && !before.plan_published) {
      getTrainingInfo(eventId, eventType).then(info => {
        sendPushToEventScopeExcept({ teamId, clubId }, userId, 'training_plan', {
          title: 'Опубликован план тренировки',
          body: info.text,
          url: `/event/${eventType}/${eventId}`,
          tag: `plan-${eventId}`,
        });
      }).catch(() => {});
    }

    res.json({ success: true, plan_published: nextValue });
  } catch (err) {
    console.error('Ошибка публикации плана тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// РАЗОВОЕ УПРАЖНЕНИЕ
//
// Не всё, что тренер даёт на льду, заслуживает места в библиотеке: разминка под
// сегодняшний состав, разбор вчерашней ошибки, придуманное по дороге на каток. Такое
// упражнение живёт внутри плана своей тренировки и больше нигде.
//
// Хранится оно тем же слепком, что и замороженные версии библиотечных упражнений:
// набор полей у них совпадает до буквы, и заводить рядом вторую таблицу с описанием,
// площадкой и сценой значило бы держать два места для одного и того же. Отличий два —
// слепок создаётся сразу, а не в ответ на правку, и drill_id у него пуст, потому что
// библиотечной строки никогда не существовало. Пункт плана помечен is_adhoc: снаружи
// он неотличим от пункта, чьё упражнение удалили из библиотеки, а вести себя должен
// иначе — его можно править и забирать себе.
// =============================================================================

// Пункт плана вместе со слепком и датой тренировки. Возвращает null, если пункта нет
// или он принадлежит другой тренировке: id пункта приходит от клиента, и проверять
// принадлежность обязательно — иначе чужой план правился бы по одному номеру.
const loadPlanItem = async (eventId, eventType, itemId, client = pool) => {
  const { planTable, eventColumn } = planTarget(eventType);
  const table = isClubTraining(eventType) ? 'club_training' : 'team_training';

  const { rows } = await client.query(`
    SELECT
      p.id, p.is_adhoc, p.drill_name, p.drill_snapshot_id,
      s.description, s.rink_type, s.board_json, s.board_enabled,
      (t.training_date < now()) AS is_past
    FROM ${planTable} p
    JOIN ${table} t ON t.id = p.${eventColumn}
    LEFT JOIN drill_snapshots s ON s.id = p.drill_snapshot_id
    WHERE p.id = $1 AND p.${eventColumn} = $2
  `, [itemId, eventId]);

  return rows[0] || null;
};

// =============================================================================
// СОЗДАНИЕ РАЗОВОГО УПРАЖНЕНИЯ
//
// Встаёт в конец плана — как и упражнение из библиотеки. Прошедшей тренировке отказываем:
// дописывать задним числом то, чего на льду не было, значит подменять историю.
// =============================================================================
export const createAdhocDrill = async (req, res) => {
  const client = await pool.connect();
  try {
    const { eventId } = req.params;
    const { teamId, clubId, eventType } = req.body;
    const userId = req.user.id;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    if (!(await canManagePlan(userId, { teamId, clubId, eventType }, client))) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для изменения плана' });
    }

    const training = await loadTraining(eventId, eventType, client);
    if (!training) {
      return res.status(404).json({ success: false, error: 'Тренировка не найдена' });
    }
    if (training.is_past) {
      return res.status(400).json({ success: false, error: 'Тренировка уже прошла' });
    }

    const input = normalizeDrillInput(req.body);
    if (input.error) {
      return res.status(400).json({ success: false, error: input.error });
    }

    const { planTable, eventColumn } = planTarget(eventType);

    await client.query('BEGIN');

    const snapshot = await client.query(`
      INSERT INTO drill_snapshots (drill_id, description, rink_type, board_json, board_enabled)
      VALUES (NULL, $1, $2, $3, $4)
      RETURNING id
    `, [input.description, input.rinkType, JSON.stringify(input.boardJson), input.boardEnabled]);

    const { rows: [tail] } = await client.query(
      `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM ${planTable} WHERE ${eventColumn} = $1`,
      [eventId]
    );

    await client.query(`
      INSERT INTO ${planTable} (${eventColumn}, position, drill_id, drill_name, drill_snapshot_id, is_adhoc)
      VALUES ($1, $2, NULL, $3, $4, true)
    `, [eventId, tail.next, input.name, snapshot.rows[0].id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания разового упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ПРАВКА РАЗОВОГО УПРАЖНЕНИЯ
//
// Правится слепок на месте: он и есть само упражнение, а не его копия, и заводить
// «слепок слепка» не от чего.
//
// После тренировки правка закрыта. Смысл заморозки в том и состоит, что план
// проведённой тренировки показывает отработанное, а не то, что тренер передумал
// потом, — и разовое упражнение здесь ничем не особеннее библиотечного.
// =============================================================================
export const updateAdhocDrill = async (req, res) => {
  const client = await pool.connect();
  try {
    const { eventId, itemId } = req.params;
    const { teamId, clubId, eventType } = req.body;
    const userId = req.user.id;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    if (!(await canManagePlan(userId, { teamId, clubId, eventType }, client))) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для изменения плана' });
    }

    const item = await loadPlanItem(eventId, eventType, itemId, client);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Упражнение не найдено' });
    }
    if (!item.is_adhoc || !item.drill_snapshot_id) {
      return res.status(400).json({ success: false, error: 'Это упражнение правится в библиотеке' });
    }
    if (item.is_past) {
      return res.status(400).json({ success: false, error: 'Тренировка уже прошла — упражнение не изменить' });
    }

    const input = normalizeDrillInput(req.body);
    if (input.error) {
      return res.status(400).json({ success: false, error: input.error });
    }

    const { planTable, eventColumn } = planTarget(eventType);

    await client.query('BEGIN');

    await client.query(`
      UPDATE drill_snapshots
      SET description = $2, rink_type = $3, board_json = $4, board_enabled = $5
      WHERE id = $1
    `, [item.drill_snapshot_id, input.description, input.rinkType, JSON.stringify(input.boardJson), input.boardEnabled]);

    await client.query(
      `UPDATE ${planTable} SET drill_name = $3 WHERE id = $1 AND ${eventColumn} = $2`,
      [itemId, eventId, input.name]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка сохранения разового упражнения:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// РАЗОВОЕ УПРАЖНЕНИЕ → В СВОЮ БИБЛИОТЕКУ
//
// Придуманное на месте нередко оказывается удачным, и тогда ему место в библиотеке.
// Копия независимая: план остаётся на слепке и после этого не следует за библиотекой —
// иначе правка новорождённого упражнения переписывала бы уже проведённую тренировку.
//
// Забрать может любой, кто распоряжается планом, а не только автор пункта: если тренеров
// в команде двое, упражнение придумано на общей тренировке и принадлежит обоим. Копия
// уходит в библиотеку того, кто нажал, — библиотека у каждого своя.
//
// Прошедшая тренировка тут не помеха, скорее наоборот: понимание, что упражнение стоит
// оставить, обычно приходит уже после льда.
// =============================================================================
export const copyAdhocToLibrary = async (req, res) => {
  try {
    const { eventId, itemId } = req.params;
    const { teamId, clubId, eventType } = req.body;
    const userId = req.user.id;

    if (!teamId && !clubId) {
      return res.status(400).json({ success: false, error: 'teamId или clubId обязателен' });
    }

    if (!(await canManagePlan(userId, { teamId, clubId, eventType }))) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для изменения плана' });
    }

    const item = await loadPlanItem(eventId, eventType, itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Упражнение не найдено' });
    }
    if (!item.is_adhoc || !item.drill_snapshot_id) {
      return res.status(400).json({ success: false, error: 'Это упражнение уже есть в библиотеке' });
    }

    const { rows } = await pool.query(`
      INSERT INTO drills (author_user_id, name, description, rink_type, board_json, board_enabled, tags)
      VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb)
      RETURNING id, name
    `, [
      userId,
      item.drill_name,
      item.description,
      item.rink_type,
      JSON.stringify(item.board_json),
      item.board_enabled !== false,
    ]);

    res.json({ success: true, drill: rows[0] });
  } catch (err) {
    console.error('Ошибка сохранения разового упражнения в библиотеку:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
