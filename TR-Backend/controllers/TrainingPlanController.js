import pool from '../config/db.js';
import { checkPermissionInternal, checkClubPermissionInternal } from '../utils/checkPermission.js';
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

const isClubTraining = (eventType) => eventType === 'club_training';

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

    const isClub = isClubTraining(eventType);
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

    const planTable = isClub ? 'club_training_plan' : 'team_training_plan';
    const eventColumn = isClub ? 'club_training_id' : 'team_training_id';

    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.position,
        p.drill_id,
        p.drill_name,
        p.created_at AS added_at,
        d.name        AS live_name,
        d.description,
        d.rink_type,
        d.board_json,
        d.board_enabled,
        (d.id IS NOT NULL)                     AS drill_exists,
        (d.content_updated_at <= p.created_at) AS content_untouched
      FROM ${planTable} p
      LEFT JOIN drills d ON d.id = p.drill_id
      WHERE p.${eventColumn} = $1
      ORDER BY p.position
    `, [eventId]);

    const items = rows.map(row => {
      const detailsAvailable = row.drill_exists && (!training.is_past || row.content_untouched);
      // Планшет отдаём, только если тренер оставил его включённым: схема у упражнения
      // есть всегда, но показывать её команде — отдельное решение
      const showBoard = detailsAvailable && row.board_enabled;

      return {
        id: row.id,
        position: row.position,
        drill_id: row.drill_id,
        // Прошедшая тренировка показывает название, которое было на момент добавления:
        // история есть история. Предстоящая живёт вместе с библиотекой.
        name: training.is_past ? row.drill_name : (row.live_name || row.drill_name),
        details_available: detailsAvailable,
        description: detailsAvailable ? row.description : null,
        rink_type:   showBoard ? row.rink_type  : null,
        board_json:  showBoard ? row.board_json : null,
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

    const isClub = isClubTraining(eventType);
    const planTable = isClub ? 'club_training_plan' : 'team_training_plan';
    const eventColumn = isClub ? 'club_training_id' : 'team_training_id';

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
    await client.query(
      `DELETE FROM ${planTable} WHERE ${eventColumn} = $1 AND NOT (id = ANY($2::int[]))`,
      [eventId, keptIds]
    );

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
