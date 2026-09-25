import pool from '../config/db.js';
import { COMMUNITY_EVENT_MAP } from '../utils/communityReserve.js';
import { parseFeeSettings, buildFeeUpdate } from '../utils/eventFees.js';
import {
  sendPushToCommunityExcept,
  cancelScheduledNotifications,
  getCommunityEventInfo,
  eventUrl,
} from '../services/pushService.js';
import {
  parsePublishSettings,
  initialPublishedAt,
  announceCommunityEvent,
  scheduleCommunityReminder,
  publishCommunityEvent,
} from '../utils/communityPublish.js';

// Типы тренировки те же, что у команды и клуба: код в БД, русская подпись во фронте
const TRAINING_TYPES = ['general', 'shooting', 'fitness', 'dribbling', 'tactics', 'skating', 'game', 'strength'];

// Какая категория сообщества какое событие проводит. Тренировки не устраивают солянок
// и наоборот — иначе календарь и настройки групп разъедутся с содержимым события.
const CATEGORY_BY_EVENT = {
  community_training: 'skating',
  community_game: 'open_game',
};

const JERSEY_COLORS = ['White', 'Black', 'Cardinal', 'Yellow', 'Blue', 'Green'];

const cfgFor = (eventType) => COMMUNITY_EVENT_MAP[eventType] || null;

/**
 * Дата и время в «наивную» строку без таймзоны — ровно как parseDateTime
 * в MgrEventController. В БД она уходит через `AT TIME ZONE` таймзоны арены,
 * иначе 19:00 в Красноярске стало бы 19:00 UTC.
 */
const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  if (String(dateStr).includes('-')) return `${dateStr}T${timeStr}:00`;
  const [d, m, y] = String(dateStr).split('.');
  return `${y}-${m}-${d}T${timeStr}:00`;
};

/**
 * Локация события: либо арена из справочника, либо ручной адрес со ссылкой на карту.
 * Смешивать нельзя — в БД стоит CHECK, и он должен получить уже согласованный набор.
 *
 * Принимает и объект selectedArena (так шлёт страница создания события), и плоские
 * поля arena_id/location/location_url — так удобнее правкам из карточки события.
 */
const parseLocation = (body) => {
  const arena = body.selectedArena;

  if (arena) {
    if (arena.isManual === true) {
      if (!arena.name) return null;
      return {
        arena_id: null,
        location: String(arena.name),
        location_url: String(arena.location_url || ''),
        timezone: arena.custom_timezone || arena.timezone || 'Europe/Moscow',
        custom_timezone: arena.custom_timezone || null,
      };
    }
    if (!arena.id) return null;
    return {
      arena_id: Number(arena.id),
      location: null,
      location_url: null,
      timezone: arena.timezone || arena.arena_timezone || 'Europe/Moscow',
      custom_timezone: null,
    };
  }

  const arenaId = body.arena_id === '' || body.arena_id === undefined || body.arena_id === null
    ? null : Number(body.arena_id);

  if (arenaId) {
    return { arena_id: arenaId, location: null, location_url: null, timezone: null, custom_timezone: null };
  }
  if (body.location && body.location_url) {
    return {
      arena_id: null,
      location: String(body.location),
      location_url: String(body.location_url),
      timezone: body.custom_timezone || null,
      custom_timezone: body.custom_timezone || null,
    };
  }
  return null;
};

/**
 * Таймзона места проведения после правки — по ней календарь потом покажет
 * событие: сначала арена, потом ручная таймзона. Арену смотрим в справочнике:
 * плоские поля её таймзону не несут, а custom_timezone фронт присылает от
 * прежней локации. Локацию не меняли — берём ту, что уже стоит у события.
 */
const resolveEventTimezone = async (cfg, eventId, communityId, patch) => {
  if ('arena_id' in patch) {
    if (!patch.arena_id) return patch.custom_timezone || 'Europe/Moscow';
    const { rows } = await pool.query('SELECT timezone FROM arenas WHERE id = $1', [patch.arena_id]);
    return rows[0]?.timezone || 'Europe/Moscow';
  }

  const { rows } = await pool.query(`
    SELECT a.timezone AS arena_timezone, e.custom_timezone
    FROM "public"."${cfg.table}" e
    LEFT JOIN arenas a ON a.id = e.arena_id
    WHERE e.id = $1 AND e.community_id = $2
  `, [eventId, communityId]);
  return rows[0]?.arena_timezone || patch.custom_timezone || rows[0]?.custom_timezone || 'Europe/Moscow';
};

/**
 * Событие этого сообщества по id. Гейт маршрута проверяет роль в communityId из
 * пути, но не то, что событие из пути — его. Правка расписания, взноса и удаление
 * несут условие community_id прямо в своём запросе; эта функция — для действий,
 * где до такого запроса что-то успевает случиться (группы тренировки) или где
 * запрос общий с кроном и сообщества не знает (публикация).
 */
const findCommunityEvent = async (cfg, eventId, communityId) => {
  const { rows } = await pool.query(
    `SELECT * FROM "public"."${cfg.table}" WHERE id = $1 AND community_id = $2`,
    [eventId, communityId]
  );
  return rows[0] || null;
};

/**
 * Список допущенных групп у тренировки. Пустой список означает «для всех групп»,
 * поэтому отсутствие строк — не ошибка, а осмысленное состояние.
 */
const replaceTrainingGroups = async (client, trainingId, communityId, groupIds) => {
  await client.query('DELETE FROM community_training_groups WHERE community_training_id = $1', [trainingId]);
  if (!Array.isArray(groupIds) || groupIds.length === 0) return;

  await client.query(`
    INSERT INTO community_training_groups (community_training_id, group_id)
    SELECT $1, g.id FROM community_groups g
    WHERE g.community_id = $2 AND g.id = ANY($3::int[])
  `, [trainingId, communityId, groupIds.map(Number).filter(Number.isInteger)]);
};

// =============================================================================
// СОЗДАНИЕ СОБЫТИЯ СООБЩЕСТВА
// =============================================================================
export const createCommunityEvent = async (req, res) => {
  const client = await pool.connect();
  try {
    const { communityId } = req.params;
    const { eventType, title, eventDate, eventTime, training_type } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg) {
      return res.status(400).json({ error: 'Неизвестный тип события сообщества' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Укажите название события' });
    }

    const eventTimestamp = parseDateTime(eventDate, eventTime);
    if (!eventTimestamp) {
      return res.status(400).json({ error: 'Укажите дату и время' });
    }

    const { rows: communityRows } = await client.query(`
      SELECT id, category, default_publish_mode, default_publish_hours_before
      FROM communities WHERE id = $1
    `, [communityId]);
    if (communityRows.length === 0) {
      return res.status(404).json({ error: 'Сообщество не найдено' });
    }
    if (communityRows[0].category !== CATEGORY_BY_EVENT[eventType]) {
      return res.status(400).json({
        error: eventType === 'community_training'
          ? 'Тренировки проводят только сообщества этой категории'
          : 'Солянки проводят только сообщества этой категории'
      });
    }

    const loc = parseLocation(req.body);
    if (!loc) {
      return res.status(400).json({ error: 'Выберите арену или укажите адрес вместе со ссылкой на карту' });
    }

    const fees = parseFeeSettings(req.body, { goalieAware: true });
    const limits = parseLimits(req.body, eventType);

    // Когда событие увидят участники: сразу, за N часов до начала или вручную.
    // Умолчание берём из настроек сообщества — обычно оно там одно и то же.
    const publish = parsePublishSettings(req.body, communityRows[0]);

    const columns = {
      community_id: communityId,
      title: String(title).trim(),
      arena_id: loc.arena_id,
      location: loc.location,
      location_url: loc.location_url,
      custom_timezone: loc.custom_timezone,
      ...fees,
      ...limits,
      ...publish,
      published_at: initialPublishedAt(publish.publish_mode),
    };

    if (eventType === 'community_training') {
      columns.training_type = TRAINING_TYPES.includes(training_type) ? training_type : 'general';
    }

    await client.query('BEGIN');

    // Колонка с датой собирается отдельно: «наивную» строку надо привести к
    // таймзоне арены прямо в запросе, простым значением это не выразить.
    const cols = Object.keys(columns);
    const values = cols.map(c => columns[c]);
    const tsIndex = values.length + 1;

    const { rows } = await client.query(`
      INSERT INTO "public"."${cfg.table}" (${cols.map(c => `"${c}"`).join(', ')}, "${cfg.dateCol}")
      VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${tsIndex}::timestamp AT TIME ZONE $${tsIndex + 1})
      RETURNING *
    `, [...values, eventTimestamp, loc.timezone || 'Europe/Moscow']);

    const event = rows[0];

    if (eventType === 'community_training') {
      await replaceTrainingGroups(client, event.id, communityId, req.body.group_ids);
    }

    await client.query('COMMIT');

    // Уведомления и напоминание — вне транзакции: их сбой не должен отменять
    // событие. Отложенное событие пока молчит: рассылать пуш о том, чего люди
    // ещё не видят в календаре, бессмысленно — оповестит публикация.
    if (event.published_at) {
      announceCommunityEvent({
        event, eventType, communityId: Number(communityId), exceptUserId: req.user.id,
      }).catch(err => console.error('[Community Event Notify Error]:', err.message));
    }

    res.status(201).json({ success: true, event });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Create Community Event Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

/**
 * Лимиты состава.
 *
 * У max_goalies три состояния, и все три осмысленные: 0 — вратари на этом событии
 * не нужны (дриблинг), NULL — лимита нет, N — лимит. Поэтому пустую строку и null
 * разводим явно, а не через привычное «нет значения = 0».
 */
// eventType обязателен: include_ungrouped — колонка только тренировок, у солянки
// групп нет вовсе, и попытка записать это поле роняет INSERT целиком.
function parseLimits(body = {}, eventType = null) {
  const patch = {};
  const parse = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  if ('max_skaters' in body) {
    const v = parse(body.max_skaters);
    // CHECK требует минимум 1: ноль полевых означал бы событие, на которое некому идти
    patch.max_skaters = v === null || v < 1 ? null : v;
  }
  if ('max_goalies' in body) {
    patch.max_goalies = parse(body.max_goalies);
  }
  if ('include_ungrouped' in body && eventType === 'community_training') {
    patch.include_ungrouped = body.include_ungrouped === true || body.include_ungrouped === 'true';
  }
  return patch;
}

// Общая часть трёх ручек редактирования: собрать патч, применить, уведомить.
//
// eventTimestamp — дата из формы «наивной» строкой, как при создании. В обычный
// патч её класть нельзя: база прочла бы её по часам своей сессии (Москва), и
// 19:00 в Екатеринбурге стало бы 21:00. Поэтому она уходит отдельной частью SET
// через AT TIME ZONE таймзоны места проведения (eventTz).
const applyEventPatch = async (req, res, patch, { notify = null, eventTimestamp = null, eventTz = null } = {}) => {
  const { eventType, eventId } = req.params;
  const cfg = cfgFor(eventType);
  if (!cfg) {
    return res.status(400).json({ error: 'Неизвестный тип события сообщества' });
  }

  const { clause, values, isEmpty } = buildFeeUpdate(patch, 1);
  if (isEmpty && !eventTimestamp) {
    return res.status(400).json({ error: 'Нет полей для обновления' });
  }

  const sets = isEmpty ? [] : [clause];
  if (eventTimestamp) {
    values.push(eventTimestamp, eventTz || 'Europe/Moscow');
    sets.push(`"${cfg.dateCol}" = $${values.length - 1}::timestamp AT TIME ZONE $${values.length}`);
  }

  const { rows } = await pool.query(`
    UPDATE "public"."${cfg.table}" SET ${sets.join(', ')}
    WHERE id = $${values.length + 1} AND community_id = $${values.length + 2}
    RETURNING *
  `, [...values, eventId, req.params.communityId]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Событие не найдено' });
  }

  // Напоминание за сутки собрано из названия, даты и места. Правка задела что-то
  // из этого — напоминание в очереди уже врёт: убираем его и ставим новое по
  // записанной строке, где дата уже момент времени. Только после UPDATE: упади
  // запрос раньше — событие осталось бы без напоминания при старой дате.
  // Сбой напоминания правку не отменяет, она уже в базе.
  const reminderCols = ['title', cfg.dateCol, 'arena_id', 'location', 'custom_timezone'];
  if (eventTimestamp || reminderCols.some(col => col in patch)) {
    const event = rows[0];
    try {
      await cancelScheduledNotifications(event.id, { communityId: event.community_id });
      // Неопубликованному событию напоминание поставит публикация — уже от новой даты
      if (event.published_at) {
        await scheduleCommunityReminder({ event, eventType, communityId: event.community_id });
      }
    } catch (err) {
      console.error('[Community Event Reminder Error]:', err.message);
    }
  }

  if (notify) {
    (async () => {
      const info = await getCommunityEventInfo(eventId, eventType);
      await sendPushToCommunityExcept(Number(req.params.communityId), req.user.id, 'schedule', {
        title: notify,
        body: `${rows[0].title} — ${info.text}`,
        url: eventUrl(eventType, eventId),
        tag: `upd-${eventType}-${eventId}`,
      });
    })().catch(() => {});
  }

  return res.json({ success: true, event: rows[0] });
};

// =============================================================================
// РАСПИСАНИЕ СОБЫТИЯ (дата, время, арена или ручная локация, название, тип)
// =============================================================================
export const updateCommunityEventSchedule = async (req, res) => {
  try {
    const { eventType, eventId, communityId } = req.params;
    const cfg = cfgFor(eventType);
    if (!cfg) return res.status(400).json({ error: 'Неизвестный тип события сообщества' });

    const patch = {};
    if (req.body.title !== undefined) {
      if (!String(req.body.title).trim()) {
        return res.status(400).json({ error: 'Название не может быть пустым' });
      }
      patch.title = String(req.body.title).trim();
    }
    if (req.body.event_date !== undefined) patch[cfg.dateCol] = req.body.event_date;
    if (req.body.custom_timezone !== undefined) patch.custom_timezone = req.body.custom_timezone || null;

    // Пара «дата + время» — тот же контракт, что у создания: стенные часы места
    // проведения. В патч не кладём — applyEventPatch переведёт её сам (см. там)
    let eventTimestamp = null;
    if (req.body.eventDate !== undefined && req.body.eventTime !== undefined) {
      eventTimestamp = parseDateTime(req.body.eventDate, req.body.eventTime);
      if (!eventTimestamp) return res.status(400).json({ error: 'Некорректные дата или время' });
      delete patch[cfg.dateCol];
    }

    if (eventType === 'community_training' && req.body.training_type !== undefined) {
      if (!TRAINING_TYPES.includes(req.body.training_type)) {
        return res.status(400).json({ error: 'Неизвестный тип тренировки' });
      }
      patch.training_type = req.body.training_type;
    }

    // Локацию меняем целиком: половина арены и половина ручного адреса не пройдёт CHECK
    if ('arena_id' in req.body || 'location' in req.body) {
      const loc = parseLocation(req.body);
      if (!loc) {
        return res.status(400).json({ error: 'Выберите арену или укажите адрес вместе со ссылкой на карту' });
      }
      Object.assign(patch, loc);
      // timezone — не колонка события, а подсказка для перевода времени: при
      // создании она уходит только в AT TIME ZONE, в UPDATE её тоже не пускаем
      delete patch.timezone;
    }

    const eventTz = eventTimestamp
      ? await resolveEventTimezone(cfg, eventId, communityId, patch)
      : null;

    return await applyEventPatch(req, res, patch, {
      notify: 'Изменение в расписании', eventTimestamp, eventTz,
    });
  } catch (error) {
    console.error('[Update Community Event Schedule Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ВЗНОС ЗА УЧАСТИЕ
// =============================================================================
export const updateCommunityEventFinances = async (req, res) => {
  try {
    const patch = parseFeeSettings(req.body, { goalieAware: true });
    return await applyEventPatch(req, res, patch, { notify: 'Изменение стоимости' });
  } catch (error) {
    console.error('[Update Community Event Finances Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ЛИМИТЫ СОСТАВА И АДРЕСАЦИЯ ПО ГРУППАМ
//
// Лимит вниз никого не выбрасывает: те, кто уже в основе, там и остаются.
// Лимит вверх ничего не делает вручную — освободившиеся места раздаст крон
// резервной очереди на ближайшем проходе, по общему правилу очереди.
// =============================================================================
export const updateCommunityEventLimits = async (req, res) => {
  try {
    const { eventType, eventId, communityId } = req.params;
    const cfg = cfgFor(eventType);
    if (!cfg) return res.status(400).json({ error: 'Неизвестный тип события сообщества' });

    const patch = parseLimits(req.body, eventType);

    // Своё ли событие — до замены групп. Она пишет мимо applyEventPatch, и раньше
    // чужая тренировка успевала лишиться адресации по группам, прежде чем ответ
    // становился 404: удаление групп идёт по одному id тренировки.
    const current = await findCommunityEvent(cfg, eventId, communityId);
    if (!current) return res.status(404).json({ error: 'Событие не найдено' });

    if (eventType === 'community_training' && req.body.group_ids !== undefined) {
      await replaceTrainingGroups(pool, Number(eventId), Number(communityId), req.body.group_ids);
      // Изменились только группы, а колонок события патч не трогает — отвечаем сами:
      // строка события та же, что прочитана выше, группы живут в своей таблице
      if (Object.keys(patch).length === 0) {
        return res.json({ success: true, event: current });
      }
    }

    if (eventType === 'community_game' && 'include_ungrouped' in patch) {
      // У солянок групп нет — колонки тоже
      delete patch.include_ungrouped;
    }

    return await applyEventPatch(req, res, patch);
  } catch (error) {
    console.error('[Update Community Event Limits Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// УДАЛЕНИЕ СОБЫТИЯ
// Отметки, план, расстановка и составы уходят каскадом по внешним ключам.
// Мимо каскада проходят только слепки разовых упражнений из плана — их стираем сами.
// =============================================================================
export const deleteCommunityEvent = async (req, res) => {
  try {
    const { communityId, eventType, eventId } = req.params;
    const cfg = cfgFor(eventType);
    if (!cfg) return res.status(400).json({ error: 'Неизвестный тип события сообщества' });

    // Разовое упражнение плана хранит содержимое в drill_snapshots, а слепок к событию не
    // привязан: пункт плана уйдёт каскадом вместе с тренировкой, слепок останется ничьим.
    // Номера запоминаем, пока пункты на месте, а стираем после удаления — раньше не даст
    // внешний ключ пункта на слепок (ON DELETE RESTRICT). Слепки библиотечных упражнений
    // не трогаем: они общие для всех тренировок, замороженных одной правкой. У солянки
    // плана нет.
    let adhocSnapshots = [];
    if (eventType === 'community_training') {
      const { rows: plan } = await pool.query(`
        SELECT drill_snapshot_id FROM community_training_plan
        WHERE community_training_id = $1 AND is_adhoc AND drill_snapshot_id IS NOT NULL
      `, [eventId]);
      adhocSnapshots = plan.map(r => r.drill_snapshot_id);
    }

    const { rows } = await pool.query(
      `DELETE FROM "public"."${cfg.table}" WHERE id = $1 AND community_id = $2 RETURNING title`,
      [eventId, communityId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    // Сбой чистки удаление не отменяет: события уже нет, а лишний слепок никому не мешает
    if (adhocSnapshots.length > 0) {
      await pool.query('DELETE FROM drill_snapshots WHERE id = ANY($1::int[])', [adhocSnapshots])
        .catch(err => console.error('[Delete Community Event Snapshots Error]:', err.message));
    }

    await cancelScheduledNotifications(Number(eventId), { communityId: Number(communityId) });

    (async () => {
      await sendPushToCommunityExcept(Number(communityId), req.user.id, 'schedule', {
        title: eventType === 'community_game' ? 'Солянка отменена' : 'Тренировка отменена',
        body: rows[0].title,
        // Событие удалено — открывать нечего, ведём в календарь, как и отмена
        // командных событий. Маршрута /schedule в приложении нет.
        url: '/',
        tag: `del-${eventType}-${eventId}`,
      });
    })().catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error('[Delete Community Event Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ОПУБЛИКОВАТЬ СОБЫТИЕ СЕЙЧАС
//
// Работает и для отложенной публикации по часам, и для ручной: в обоих случаях
// это «показать участникам прямо сейчас». Повторное нажатие ничего не портит —
// published_at ставится только когда он ещё пуст.
// =============================================================================
export const publishCommunityEventNow = async (req, res) => {
  try {
    const { eventType, eventId, communityId } = req.params;
    const cfg = cfgFor(eventType);
    if (!cfg) {
      return res.status(400).json({ error: 'Неизвестный тип события сообщества' });
    }

    // publishCommunityEvent общая с кроном и ищет событие только по id. Без этой
    // проверки штаб одного сообщества открывал скрытое событие другого, а его
    // участникам уходил пуш о новой тренировке или солянке.
    if (!(await findCommunityEvent(cfg, eventId, communityId))) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const event = await publishCommunityEvent(eventType, eventId, req.user.id);
    if (!event) {
      return res.status(409).json({ error: 'Событие уже опубликовано' });
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error('[Publish Community Event Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
