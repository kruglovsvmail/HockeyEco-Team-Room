import pool from '../config/db.js';

// =============================================================================
// РЕЗЕРВНАЯ ОЧЕРЕДЬ СОБЫТИЙ СООБЩЕСТВА
//
// У тренировки и солянки есть лимит состава (max_skaters / max_goalies). Когда он
// набран, следующий отметившийся попадает не на лёд, а в резерв. Освободившееся
// место НЕ занимается автоматически: первому в очереди уходит предложение с
// таймером, и только подтверждение переводит его в основу. Не подтвердил в срок —
// предложение уходит следующему, и так по всей очереди.
//
// Длина таймера зависит от того, сколько осталось до события: лесенка ступеней
// лежит в communities.reserve_ladder и настраивается организатором.
//
// Три вещи, которые тут легко упустить:
//   1. Очередь у полевых и вратарей раздельная — освободившееся место полевого
//      вратарю не предлагается и наоборот.
//   2. Дорожка определяется по амплуа из community_members.position, а НЕ по
//      pay_role: последний отвечает за деньги, и штаб переводит им людей в 'free',
//      затирая информацию о том, вратарь человек или нет.
//   3. Место, под которое уже выдано предложение, считается занятым. Иначе
//      следующий отметившийся проскочил бы вперёд того, кто честно ждёт в очереди.
// =============================================================================

// Конфигурация двух типов событий сообщества. Устроена как EVENT_MAP в eventFees.js.
export const COMMUNITY_EVENT_MAP = {
  community_training: {
    table: 'community_training',
    att: 'community_training_attendance',
    fk: 'community_training_id',
    dateCol: 'training_date',
  },
  community_game: {
    table: 'community_game',
    att: 'community_game_attendance',
    fk: 'community_game_id',
    dateCol: 'game_date',
  },
};

export const isCommunityEvent = (eventType) => Boolean(COMMUNITY_EVENT_MAP[eventType]);

// ── Кто платит за событие сообщества ────────────────────────────────────────
// Отличие от команд и клубов: резерв не платит вообще (человек на лёд не вышел),
// а слившийся после дедлайна освобождается от оплаты, если его место занял другой —
// замена зафиксирована в replaced_by_user_id. Слившийся без замены платит, как везде.
// Фрагмент подставляется в WHERE к алиасу строки отметки.
export const payerPredicate = (alias = 'a') =>
  `${alias}.slot_status = 'main' AND ${alias}.replaced_by_user_id IS NULL`;

// Дорожка очереди: вратарь или полевой. Амплуа берём из членства в сообществе,
// у гостя без строки в community_members его нет — считаем полевым.
const laneExpr = (attAlias, communityIdParam) => `
  COALESCE((
    SELECT cm.position FROM community_members cm
    WHERE cm.community_id = ${communityIdParam} AND cm.user_id = ${attAlias}.user_id
  ), 'skater')
`;

/**
 * Сколько минут даётся на подтверждение места.
 *
 * Лесенка читается сверху вниз до первой ступени, у которой before_minutes не
 * больше остатка времени до события. Если не подошла ни одна — берётся последняя,
 * она же catch-all для всего, что ближе самой мелкой ступени.
 *
 * @param {Array} ladder - communities.reserve_ladder
 * @param {number} minutesUntilEvent - сколько минут осталось до начала
 * @returns {number|null} минут на подтверждение, null если предложение выдавать нельзя
 */
export function resolveConfirmMinutes(ladder, minutesUntilEvent) {
  const rungs = Array.isArray(ladder) ? ladder : [];
  if (rungs.length === 0) return null;
  if (!Number.isFinite(minutesUntilEvent) || minutesUntilEvent <= 0) return null;

  for (const rung of rungs) {
    const before = Number(rung?.before_minutes);
    const confirm = Number(rung?.confirm_minutes);
    if (!Number.isFinite(before) || !Number.isFinite(confirm)) continue;
    if (minutesUntilEvent >= before) return confirm > 0 ? confirm : null;
  }

  const last = rungs[rungs.length - 1];
  const confirm = Number(last?.confirm_minutes);
  return Number.isFinite(confirm) && confirm > 0 ? confirm : null;
}

/**
 * Занятость дорожки: сколько мест лимита уже израсходовано.
 *
 * Считаем и тех, кто в основе и не слился, и тех, кому выдано висящее предложение:
 * под предложение место придержано, и пока таймер идёт, отдавать его новому
 * отметившемуся нельзя.
 */
async function laneUsage(client, cfg, event, lane) {
  const { rows } = await client.query(`
    SELECT
      count(*) FILTER (WHERE a.slot_status = 'main' AND a.withdrawn_at IS NULL)::int AS occupied,
      count(*) FILTER (WHERE a.slot_status = 'offered')::int AS offered
    FROM "public"."${cfg.att}" a
    WHERE a.${cfg.fk} = $1 AND ${laneExpr('a', '$2')} = $3
  `, [event.id, event.community_id, lane]);

  const row = rows[0] || { occupied: 0, offered: 0 };
  return { occupied: row.occupied, offered: row.offered, used: row.occupied + row.offered };
}

const laneLimit = (event, lane) => (lane === 'goalie' ? event.max_goalies : event.max_skaters);

/**
 * Дорожка очереди для человека. Единственное место, где решается «вратарь или полевой»
 * применительно к местам на льду — держим его тут, чтобы правило не разъехалось
 * с laneExpr, которым считается занятость.
 */
export async function resolveLane(client, communityId, userId) {
  const { rows } = await client.query(`
    SELECT position FROM community_members
    WHERE community_id = $1 AND user_id = $2
  `, [communityId, userId]);
  return rows[0]?.position === 'goalie' ? 'goalie' : 'skater';
}

/**
 * Куда попадает человек в момент отметки: в основу или в резерв.
 * Лимит NULL — очереди нет вообще, все идут в основу.
 *
 * @returns {'main'|'reserve'} статус, с которым надо создать отметку
 */
export async function resolveSlotOnMark(client, cfg, event, lane) {
  const limit = laneLimit(event, lane);
  if (limit === null || limit === undefined) return 'main';
  if (Number(limit) === 0) return 'reserve';

  const { used } = await laneUsage(client, cfg, event, lane);
  return used < Number(limit) ? 'main' : 'reserve';
}

/**
 * Привязка замены: кого из слившихся освобождает от оплаты человек,
 * только что вставший в основу.
 *
 * Работает одинаково для обоих путей — и когда место подтвердили из резерва по
 * предложению, и когда резерва не было и место просто занял новый отметившийся.
 * Если слились несколько, а место занял один, освобождается тот, кто слился раньше.
 *
 * @param preferredForUserId - чьё место предлагалось (offer_for_user_id), если известно
 */
export async function linkReplacement(client, cfg, event, lane, newUserId, preferredForUserId = null) {
  if (preferredForUserId) {
    const { rowCount } = await client.query(`
      UPDATE "public"."${cfg.att}"
      SET replaced_by_user_id = $3
      WHERE ${cfg.fk} = $1 AND user_id = $2
        AND withdrawn_at IS NOT NULL AND replaced_by_user_id IS NULL
    `, [event.id, preferredForUserId, newUserId]);
    if (rowCount > 0) return preferredForUserId;
  }

  // Свободное занятие места: ищем самого раннего слившегося без замены в своей дорожке
  const { rows } = await client.query(`
    UPDATE "public"."${cfg.att}" a
    SET replaced_by_user_id = $3
    WHERE a.id = (
      SELECT a2.id FROM "public"."${cfg.att}" a2
      WHERE a2.${cfg.fk} = $1
        AND a2.withdrawn_at IS NOT NULL
        AND a2.replaced_by_user_id IS NULL
        AND a2.slot_status = 'main'
        AND a2.user_id <> $3
        AND ${laneExpr('a2', '$2')} = $4
      ORDER BY a2.withdrawn_at
      LIMIT 1
    )
    RETURNING a.user_id
  `, [event.id, event.community_id, newUserId, lane]);

  return rows[0]?.user_id || null;
}

/**
 * Подтверждение предложенного места участником.
 *
 * Проверяем не только статус, но и срок: между нажатием и запросом таймер мог
 * истечь, а крон — уже передать место следующему. В этом случае возвращаем false,
 * и фронт показывает, что очередь ушла дальше.
 *
 * @returns {boolean} true если место закреплено за человеком
 */
export async function confirmReserveOffer(eventType, eventId, userId) {
  const cfg = COMMUNITY_EVENT_MAP[eventType];
  if (!cfg) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: eventRows } = await client.query(`
      SELECT e.id, e.community_id, e.${cfg.dateCol} AS event_date,
             e.max_skaters, e.max_goalies, e.cost_locked_at
      FROM "public"."${cfg.table}" e WHERE e.id = $1 FOR UPDATE
    `, [eventId]);
    const event = eventRows[0];
    if (!event || event.cost_locked_at) {
      await client.query('ROLLBACK');
      return false;
    }

    const { rows: attRows } = await client.query(`
      SELECT a.id, a.slot_status, a.offer_expires_at, a.offer_for_user_id,
             ${laneExpr('a', '$3')} AS lane
      FROM "public"."${cfg.att}" a
      WHERE a.${cfg.fk} = $1 AND a.user_id = $2
    `, [eventId, userId, event.community_id]);
    const att = attRows[0];

    if (!att || att.slot_status !== 'offered'
        || !att.offer_expires_at || new Date(att.offer_expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(`
      UPDATE "public"."${cfg.att}"
      SET slot_status = 'main', offer_expires_at = NULL, withdrawn_at = NULL
      WHERE id = $1
    `, [att.id]);

    await linkReplacement(client, cfg, event, att.lane, userId, att.offer_for_user_id);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Отказ от предложенного места: человек сам говорит «не поеду».
 * Уходит в expired, место тут же освобождается для следующего в очереди.
 */
export async function declineReserveOffer(eventType, eventId, userId) {
  const cfg = COMMUNITY_EVENT_MAP[eventType];
  if (!cfg) return false;

  const { rowCount } = await pool.query(`
    UPDATE "public"."${cfg.att}"
    SET slot_status = 'expired', offer_expires_at = NULL, offer_for_user_id = NULL
    WHERE ${cfg.fk} = $1 AND user_id = $2 AND slot_status = 'offered'
  `, [eventId, userId]);

  return rowCount > 0;
}

/**
 * Возврат в очередь после упущенного предложения.
 * queued_at обновляется — человек встаёт в конец, а не на прежнее место.
 */
export async function requeueAfterExpiry(eventType, eventId, userId) {
  const cfg = COMMUNITY_EVENT_MAP[eventType];
  if (!cfg) return false;

  const { rowCount } = await pool.query(`
    UPDATE "public"."${cfg.att}"
    SET slot_status = 'reserve', queued_at = NOW(), offer_expires_at = NULL, offer_for_user_id = NULL
    WHERE ${cfg.fk} = $1 AND user_id = $2 AND slot_status = 'expired'
  `, [eventId, userId]);

  return rowCount > 0;
}

// ── Крон резервной очереди ──────────────────────────────────────────────────
// Крутится из server.js раз в минуту рядом с очередью push-уведомлений. Минуты
// точности хватает: самый короткий таймер в лесенке по умолчанию — час.
//
// Порядок шагов важен: сначала закрываем всё, что уже не имеет смысла, потом
// снимаем просроченное, и только затем раздаём освободившиеся места. Иначе
// просроченное предложение в этом же проходе не успело бы уйти следующему.
//
// @returns {Array} выданные предложения — на них вызывающая сторона шлёт push
export async function rotateReserveOffers() {
  const issued = [];

  for (const [eventType, cfg] of Object.entries(COMMUNITY_EVENT_MAP)) {
    // Шаг 1: событие началось или его стоимость зафиксирована — очередь заморожена,
    // висящие предложения закрываем. Подтверждать место задним числом нельзя:
    // доли участников уже разложены в final_fee.
    await pool.query(`
      UPDATE "public"."${cfg.att}" a
      SET slot_status = 'expired', offer_expires_at = NULL
      FROM "public"."${cfg.table}" e
      WHERE a.${cfg.fk} = e.id AND a.slot_status = 'offered'
        AND (e.${cfg.dateCol} <= NOW() OR e.cost_locked_at IS NOT NULL)
    `);

    // Шаг 2: истёкшие предложения. Место, которое человек не подтвердил, освобождается
    // и на шаге 3 уходит следующему; сам он выбывает из автоматической очереди, но
    // строку сохраняет — в карточке это статус «упустил место».
    await pool.query(`
      UPDATE "public"."${cfg.att}"
      SET slot_status = 'expired', offer_expires_at = NULL
      WHERE slot_status = 'offered' AND offer_expires_at <= NOW()
    `);

    // Шаг 3: события, где есть кому предложить место
    const { rows: events } = await pool.query(`
      SELECT e.id, e.community_id, e.${cfg.dateCol} AS event_date, e.title,
             e.max_skaters, e.max_goalies,
             c.reserve_ladder
      FROM "public"."${cfg.table}" e
      JOIN "public"."communities" c ON c.id = e.community_id
      WHERE e.${cfg.dateCol} > NOW()
        AND e.cost_locked_at IS NULL
        AND (e.max_skaters IS NOT NULL OR e.max_goalies IS NOT NULL)
        AND EXISTS (
          SELECT 1 FROM "public"."${cfg.att}" a
          WHERE a.${cfg.fk} = e.id AND a.slot_status = 'reserve'
        )
      LIMIT 200
    `);

    for (const event of events) {
      const minutesUntil = Math.floor((new Date(event.event_date).getTime() - Date.now()) / 60000);
      const confirmMinutes = resolveConfirmMinutes(event.reserve_ladder, minutesUntil);
      if (!confirmMinutes) continue;

      // Предложение не должно пережить начало события
      const expiresAt = new Date(Math.min(
        Date.now() + confirmMinutes * 60000,
        new Date(event.event_date).getTime()
      ));

      for (const lane of ['skater', 'goalie']) {
        const limit = laneLimit(event, lane);
        if (limit === null || limit === undefined) continue;

        const { occupied, offered } = await laneUsage(pool, cfg, event, lane);
        let freeSlots = Number(limit) - occupied - offered;
        if (freeSlots <= 0) continue;

        // Чьи места освободились — предложение несёт ссылку на слившегося, чтобы
        // при подтверждении снять с него оплату, а при просрочке передать тот же
        // слот дальше по очереди
        const { rows: vacated } = await pool.query(`
          SELECT a.user_id FROM "public"."${cfg.att}" a
          WHERE a.${cfg.fk} = $1
            AND a.withdrawn_at IS NOT NULL
            AND a.replaced_by_user_id IS NULL
            AND a.slot_status = 'main'
            AND ${laneExpr('a', '$2')} = $3
          ORDER BY a.withdrawn_at
        `, [event.id, event.community_id, lane]);

        const { rows: waiting } = await pool.query(`
          SELECT a.id, a.user_id FROM "public"."${cfg.att}" a
          WHERE a.${cfg.fk} = $1 AND a.slot_status = 'reserve'
            AND ${laneExpr('a', '$2')} = $3
          ORDER BY a.queued_at
          LIMIT $4
        `, [event.id, event.community_id, lane, freeSlots]);

        for (let i = 0; i < waiting.length; i++) {
          const candidate = waiting[i];
          const forUserId = vacated[i]?.user_id || null;

          await pool.query(`
            UPDATE "public"."${cfg.att}"
            SET slot_status = 'offered', offer_expires_at = $2, offer_for_user_id = $3
            WHERE id = $1 AND slot_status = 'reserve'
          `, [candidate.id, expiresAt, forUserId]);

          issued.push({
            eventType,
            eventId: event.id,
            communityId: event.community_id,
            userId: candidate.user_id,
            title: event.title,
            eventDate: event.event_date,
            offerExpiresAt: expiresAt,
          });
        }
      }
    }
  }

  return issued;
}
