import pool from '../config/db.js';
import { checkCommunityPermissionInternal } from '../utils/checkPermission.js';
import {
  COMMUNITY_EVENT_MAP,
  resolveLane,
  resolveSlotOnMark,
  linkReplacement,
  confirmReserveOffer,
  declineReserveOffer,
  requeueAfterExpiry,
} from '../utils/communityReserve.js';
import { resolvePayRole, getFeeContext, isAfterWithdrawDeadline, describeSplitFee } from '../utils/eventFees.js';
import { sendPushToCommunityExcept, getCommunityEventInfo, getUserName } from '../services/pushService.js';

const cfgFor = (eventType) => COMMUNITY_EVENT_MAP[eventType] || null;

// Событие вместе с лимитами — нужно и для выбора дорожки, и для расчёта занятости
const loadEvent = async (client, cfg, eventId, forUpdate = false) => {
  const { rows } = await client.query(`
    SELECT id, community_id, ${cfg.dateCol} AS event_date,
           max_skaters, max_goalies, cost_locked_at
    FROM "public"."${cfg.table}" WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}
  `, [eventId]);
  return rows[0] || null;
};

// Занятые места — люди без аккаунта в системе. Штаб набирает состав солянки
// не только из участников сообщества: привели знакомого, он играет и платит
// наравне со всеми, но заводить ему учётную запись ради одного вечера незачем.
// Такая отметка живёт без user_id, а имя и амплуа лежат прямо в ней.
const GUEST_EVENT_TYPE = 'community_game';

// Пустое имя — законный ввод: место занимают и не зная, кто придёт. В списке
// такой гость показывается как «Гость», имя дописывается позже.
const cleanGuestName = (value) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 100) : null;
};

const guestLabel = (row) =>
  [row.guest_last_name, row.guest_first_name].filter(Boolean).join(' ') || 'Гость';

// Снятие занятого места. Отдельный путь от обычной отметки потому, что
// адресоваться к гостю можно только по строке отметки: user_id у него нет,
// и targetUserId для него не существует.
const toggleGuestAttendance = async (req, res) => {
  const client = await pool.connect();
  try {
    const { eventId } = req.params;
    const { eventType, communityId, attendanceId, isAttending, purge } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }

    // Занятое место — право штаба целиком: и поставить, и снять
    const hasAccess = await checkCommunityPermissionInternal(
      req.user.id, Number(communityId), 'COMMUNITY_EVENT_ATTENDANCE_MANAGE'
    );
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    await client.query('BEGIN');

    const event = await loadEvent(client, cfg, eventId, true);
    if (!event || Number(event.community_id) !== Number(communityId)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }
    if (event.cost_locked_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Событие уже прошло, состав закрыт' });
    }

    const { rows } = await client.query(`
      SELECT * FROM "public"."${cfg.att}"
      WHERE id = $1 AND ${cfg.fk} = $2 AND user_id IS NULL
      FOR UPDATE
    `, [Number(attendanceId), eventId]);
    const existing = rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Занятое место не найдено' });
    }

    let slotStatus = existing.slot_status;

    if (isAttending) {
      // Возврат снятого места — как у участника: в конец очереди, если состав полон
      slotStatus = await resolveSlotOnMark(client, cfg, event, existing.guest_position || 'skater');
      await client.query(`
        UPDATE "public"."${cfg.att}"
        SET slot_status = $2, withdrawn_at = NULL, queued_at = NOW(),
            offer_expires_at = NULL, offer_for_user_id = NULL, replaced_by_user_id = NULL,
            replaced_by_attendance_id = NULL
        WHERE id = $1
      `, [existing.id, slotStatus]);
    } else {
      const feeCtx = await getFeeContext(eventType, eventId);
      const wasOnIce = existing.slot_status === 'main' && !existing.withdrawn_at;

      if (purge === true || !wasOnIce || !isAfterWithdrawDeadline(feeCtx)) {
        await client.query(`DELETE FROM "public"."${cfg.att}" WHERE id = $1`, [existing.id]);
      } else {
        // После дедлайна место остаётся в расчёте стоимости — ровно как у людей
        await client.query(`UPDATE "public"."${cfg.att}" SET withdrawn_at = NOW() WHERE id = $1`, [existing.id]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, slotStatus });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка изменения занятого места:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ОТМЕТКА НА СОБЫТИЕ СООБЩЕСТВА
//
// Главное отличие от команд и клубов: отметка не гарантирует лёд. Если лимит
// состава набран, человек становится в резерв и ждёт предложения от крона.
// Снятие отметки резервистом — всегда простое удаление строки: он на лёд не
// выходил и плательщиком никогда не был, штамп withdrawn_at ему не нужен.
// =============================================================================
export const toggleCommunityAttendance = async (req, res) => {
  // Занятое место адресуется строкой отметки, а не человеком, и живёт по своим
  // правилам — уводим его сразу, чтобы не размазывать два случая по одному телу
  if (req.body.attendanceId) return toggleGuestAttendance(req, res);

  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { isAttending, eventType, communityId, targetUserId, purge } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }
    if (!communityId) {
      return res.status(400).json({ success: false, error: 'communityId обязателен' });
    }

    const targetId = Number(targetUserId) || initiatorId;
    const isPurge = purge === true;

    // Самоотметка идёт по своему ключу, всё остальное — по управляющему.
    // purge (полное удаление строки, в том числе снятой после дедлайна) даже на
    // себя проходит через управление: это право штаба, а не участника.
    const permissionKey = (targetId === initiatorId && !isPurge)
      ? 'COMMUNITY_SELF_ATTENDANCE'
      : 'COMMUNITY_EVENT_ATTENDANCE_MANAGE';

    const hasAccess = await checkCommunityPermissionInternal(initiatorId, Number(communityId), permissionKey);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: permissionKey === 'COMMUNITY_SELF_ATTENDANCE'
          ? 'Отмечаться на события сообщества могут только вступившие участники'
          : 'Недостаточно прав доступа'
      });
    }

    await client.query('BEGIN');

    const event = await loadEvent(client, cfg, eventId, true);
    if (!event || Number(event.community_id) !== Number(communityId)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }
    // Стоимость зафиксирована — состав больше не меняется, иначе доли поедут
    if (event.cost_locked_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Событие уже прошло, состав закрыт' });
    }

    // Тренировка может быть адресована конкретным группам. Фронт такому человеку
    // тумблер и не покажет, но проверка обязана быть на сервере: иначе адресация
    // держалась бы на честности интерфейса. Штаба это не касается — он отмечает
    // кого считает нужным, в том числе из чужой группы.
    if (isAttending && eventType === 'community_training' && targetId === initiatorId) {
      const { rows: allowedRows } = await client.query(`
        SELECT (CASE
          WHEN cm.group_id IS NULL THEN $3::boolean
          ELSE (
            NOT EXISTS (SELECT 1 FROM community_training_groups tg WHERE tg.community_training_id = $2)
            OR EXISTS (SELECT 1 FROM community_training_groups tg
                       WHERE tg.community_training_id = $2 AND tg.group_id = cm.group_id)
          )
        END) AS allowed
        FROM community_members cm
        WHERE cm.community_id = $1 AND cm.user_id = $4 AND cm.left_at IS NULL
      `, [event.community_id, eventId, event.include_ungrouped, targetId]);

      if (!allowedRows[0]?.allowed) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: 'Эта тренировка адресована другим группам',
        });
      }
    }

    const lane = await resolveLane(client, event.community_id, targetId);
    const feeCtx = await getFeeContext(eventType, eventId);
    const afterDeadline = isAfterWithdrawDeadline(feeCtx);

    const { rows: existingRows } = await client.query(
      `SELECT * FROM "public"."${cfg.att}" WHERE ${cfg.fk} = $1 AND user_id = $2 FOR UPDATE`,
      [eventId, targetId]
    );
    const existing = existingRows[0] || null;

    let slotStatus = null;
    let lateWithdraw = false;

    if (isAttending) {
      // Вратари на событие с max_goalies = 0 не допускаются вовсе: это не резерв,
      // а «вратари здесь не нужны» — например на дриблинге
      if (lane === 'goalie' && Number(event.max_goalies) === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'На это событие вратари не набираются' });
      }

      slotStatus = await resolveSlotOnMark(client, cfg, event, lane);
      let attendanceRowId = existing?.id || null;

      if (existing) {
        // Возврат после снятия или после упущенного предложения. queued_at
        // обновляем: в очередь человек встаёт заново, в конец. pay_role не трогаем —
        // ручное освобождение (free) от штаба повторная отметка перетирать не должна.
        await client.query(`
          UPDATE "public"."${cfg.att}"
          SET slot_status = $2, withdrawn_at = NULL, queued_at = NOW(),
              offer_expires_at = NULL, offer_for_user_id = NULL, replaced_by_user_id = NULL,
              replaced_by_attendance_id = NULL
          WHERE id = $1
        `, [existing.id, slotStatus]);
      } else {
        const payRole = await resolvePayRole(targetId, eventType, { communityId: event.community_id });
        const inserted = await client.query(`
          INSERT INTO "public"."${cfg.att}" (${cfg.fk}, user_id, pay_role, slot_status)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [eventId, targetId, payRole, slotStatus]);
        attendanceRowId = inserted.rows[0].id;
      }

      // Занял освободившееся место после дедлайна — значит кого-то из слившихся
      // от оплаты освобождаем. Работает и без резерва: правило одно на оба пути.
      if (slotStatus === 'main' && afterDeadline) {
        await linkReplacement(client, cfg, event, lane, targetId, null, attendanceRowId);
      }
    } else if (existing) {
      const wasOnIce = existing.slot_status === 'main' && !existing.withdrawn_at;

      if (isPurge || !wasOnIce || !afterDeadline) {
        // До дедлайна, из резерва или принудительно штабом — строки просто нет.
        // Резервист ничего не должен: на лёд он не выходил.
        await client.query(`DELETE FROM "public"."${cfg.att}" WHERE id = $1`, [existing.id]);
      } else {
        // После дедлайна из основы — остаётся плательщиком, пока место не займут
        await client.query(`
          UPDATE "public"."${cfg.att}" SET withdrawn_at = NOW() WHERE id = $1
        `, [existing.id]);
        lateWithdraw = true;
      }
    }

    await client.query('COMMIT');

    (async () => {
      const [name, info, feeText] = await Promise.all([
        getUserName(targetId),
        getCommunityEventInfo(eventId, eventType),
        lateWithdraw ? Promise.resolve('') : describeSplitFee(eventType, eventId),
      ]);
      const route = eventType === 'community_game' ? 'community-game' : 'community-training';
      const what = eventType === 'community_game' ? 'солянку' : 'тренировку';

      await sendPushToCommunityExcept(Number(communityId), targetId, 'schedule', {
        title: isAttending ? 'Новая отметка' : 'Снятие отметки',
        body: isAttending
          ? `${name} ${slotStatus === 'reserve' ? 'встал в резерв на' : 'отметился на'} ${what}: ${info.text}${feeText}`
          : `${name} снял отметку с ${what}: ${info.text}${feeText}`,
        url: `/event/${route}/${eventId}`,
        tag: `attend-${eventType}-${eventId}-${targetId}`,
      });
    })().catch(() => {});

    res.json({ success: true, slotStatus, withdrawnLate: lateWithdraw });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка отметки на событие сообщества:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ОТМЕТКА ПАЧКОЙ (ТОЛЬКО СОЛЯНКА)
//
// На солянку состав собирает штаб, и делает это разом: набрать двадцать человек
// по одному — двадцать запросов, двадцать пересчётов стоимости и двадцать
// уведомлений всему сообществу. Поэтому здесь одна транзакция на всех и одно
// сводное уведомление.
//
// В одной пачке едут участники сообщества (userIds) и занятые места для людей
// без аккаунта (guests). Порядок обработки — тот же, что при поштучной отметке:
// каждый следующий заново спрашивает у resolveSlotOnMark, есть ли ещё место,
// так что при упоре в лимит остаток пачки честно уходит в резерв.
//
// Тренировки сообщества сюда не ходят: там отмечают по одному, и занятых мест
// нет вовсе — так решили при вводе гостей.
// =============================================================================
export const bulkMarkCommunityAttendance = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { eventType, communityId, userIds = [], guests = [] } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }
    if (eventType !== GUEST_EVENT_TYPE) {
      return res.status(400).json({ success: false, error: 'Отмечать пачкой можно только на солянке' });
    }
    if (!communityId) {
      return res.status(400).json({ success: false, error: 'communityId обязателен' });
    }

    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter(Boolean))];
    const guestRows = (Array.isArray(guests) ? guests : []).slice(0, 50).map(g => ({
      lastName: cleanGuestName(g?.lastName),
      firstName: cleanGuestName(g?.firstName),
      position: g?.position === 'goalie' ? 'goalie' : 'skater',
    }));

    if (ids.length === 0 && guestRows.length === 0) {
      return res.status(400).json({ success: false, error: 'Некого отмечать' });
    }

    const hasAccess = await checkCommunityPermissionInternal(
      initiatorId, Number(communityId), 'COMMUNITY_EVENT_ATTENDANCE_MANAGE'
    );
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    await client.query('BEGIN');

    const event = await loadEvent(client, cfg, eventId, true);
    if (!event || Number(event.community_id) !== Number(communityId)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }
    if (event.cost_locked_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Событие уже прошло, состав закрыт' });
    }

    const feeCtx = await getFeeContext(eventType, eventId);
    const afterDeadline = isAfterWithdrawDeadline(feeCtx);
    const noGoalies = Number(event.max_goalies) === 0;

    // Имена для сводного уведомления — одним запросом на всю пачку,
    // а не по запросу на каждого отмеченного
    const nameById = new Map();
    if (ids.length > 0) {
      const { rows: userRows } = await client.query(
        'SELECT id, last_name, first_name FROM users WHERE id = ANY($1::int[])', [ids]
      );
      userRows.forEach(u => nameById.set(
        Number(u.id),
        [u.last_name, u.first_name].filter(Boolean).join(' ') || 'Участник'
      ));
    }

    const names = [];
    let reserved = 0;

    // Общий хвост для обоих видов строк: занять место в дорожке и, если оно
    // освободилось после дедлайна, снять оплату со слившегося
    const placeRow = async (lane, rowId, userId) => {
      if (afterDeadline) {
        await linkReplacement(client, cfg, event, lane, userId, null, rowId);
      }
    };

    for (const targetId of ids) {
      const lane = await resolveLane(client, event.community_id, targetId);
      // На событие без вратарей их не берут вовсе — молча пропускаем,
      // рвать всю пачку из-за одного человека незачем
      if (lane === 'goalie' && noGoalies) continue;

      const slotStatus = await resolveSlotOnMark(client, cfg, event, lane);
      const { rows: existingRows } = await client.query(
        `SELECT id FROM "public"."${cfg.att}" WHERE ${cfg.fk} = $1 AND user_id = $2 FOR UPDATE`,
        [eventId, targetId]
      );

      let rowId;
      if (existingRows[0]) {
        rowId = existingRows[0].id;
        await client.query(`
          UPDATE "public"."${cfg.att}"
          SET slot_status = $2, withdrawn_at = NULL, queued_at = NOW(),
              offer_expires_at = NULL, offer_for_user_id = NULL, replaced_by_user_id = NULL,
              replaced_by_attendance_id = NULL
          WHERE id = $1
        `, [rowId, slotStatus]);
      } else {
        const payRole = await resolvePayRole(targetId, eventType, { communityId: event.community_id });
        const inserted = await client.query(`
          INSERT INTO "public"."${cfg.att}" (${cfg.fk}, user_id, pay_role, slot_status)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [eventId, targetId, payRole, slotStatus]);
        rowId = inserted.rows[0].id;
      }

      if (slotStatus === 'main') await placeRow(lane, rowId, targetId);
      else reserved += 1;

      names.push(nameById.get(targetId) || 'Участник');
    }

    for (const guest of guestRows) {
      if (guest.position === 'goalie' && noGoalies) continue;

      const slotStatus = await resolveSlotOnMark(client, cfg, event, guest.position);
      // pay_role у гостя — снимок амплуа, как и у людей: от него зависит,
      // попадёт ли он под бесплатных вратарей при расчёте взноса
      const inserted = await client.query(`
        INSERT INTO "public"."${cfg.att}"
          (${cfg.fk}, user_id, pay_role, slot_status, guest_last_name, guest_first_name, guest_position)
        VALUES ($1, NULL, $2, $3, $4, $5, $6)
        RETURNING id
      `, [eventId, guest.position, slotStatus, guest.lastName, guest.firstName, guest.position]);

      if (slotStatus === 'main') await placeRow(guest.position, inserted.rows[0].id, null);
      else reserved += 1;

      names.push(guestLabel({ guest_last_name: guest.lastName, guest_first_name: guest.firstName }));
    }

    await client.query('COMMIT');

    if (names.length > 0) {
      (async () => {
        const [info, feeText] = await Promise.all([
          getCommunityEventInfo(eventId, eventType),
          describeSplitFee(eventType, eventId),
        ]);
        // Перечислять двадцать фамилий в уведомлении бессмысленно: первые три
        // дают понять, о ком речь, остальные — числом
        const shown = names.slice(0, 3).join(', ');
        const rest = names.length - 3;
        const who = rest > 0 ? `${shown} и ещё ${rest}` : shown;

        await sendPushToCommunityExcept(Number(communityId), initiatorId, 'schedule', {
          title: 'Новые отметки',
          body: `${who} ${names.length === 1 ? 'отмечен' : 'отмечены'} на солянку: ${info.text}${feeText}`,
          url: `/event/community-game/${eventId}`,
          tag: `attend-bulk-${eventType}-${eventId}`,
        });
      })().catch(() => {});
    }

    res.json({ success: true, added: names.length, reserved });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка отметки пачкой на событие сообщества:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// ИМЯ ГОСТЯ
//
// Место занимают и до того, как известно, кто его займёт, поэтому фамилию с
// именем можно дописать или поправить позже — прямо из карточки занятого места.
// =============================================================================
export const updateCommunityGuest = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventType, communityId, attendanceId, lastName, firstName } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg || !attendanceId) {
      return res.status(400).json({ success: false, error: 'eventType и attendanceId обязательны' });
    }

    const hasAccess = await checkCommunityPermissionInternal(
      req.user.id, Number(communityId), 'COMMUNITY_EVENT_ATTENDANCE_MANAGE'
    );
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    const { rowCount } = await pool.query(`
      UPDATE "public"."${cfg.att}"
      SET guest_last_name = $1, guest_first_name = $2
      WHERE id = $3 AND ${cfg.fk} = $4 AND user_id IS NULL
    `, [cleanGuestName(lastName), cleanGuestName(firstName), Number(attendanceId), eventId]);

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Занятое место не найдено' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения имени гостя:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ПОДТВЕРЖДЕНИЕ ПРЕДЛОЖЕННОГО МЕСТА
//
// Между нажатием кнопки и приходом запроса таймер мог истечь, а крон — передать
// место следующему. Поэтому ответ различает «поздно» и «ошибка».
// =============================================================================
export const confirmCommunityOffer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const { eventType, communityId } = req.body;

    if (!cfgFor(eventType)) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }

    const hasAccess = await checkCommunityPermissionInternal(userId, Number(communityId), 'COMMUNITY_SELF_ATTENDANCE');
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Подтверждать место могут только участники сообщества' });
    }

    const ok = await confirmReserveOffer(eventType, Number(eventId), userId);
    if (!ok) {
      return res.status(409).json({
        success: false,
        error: 'Время на подтверждение истекло — место уже предложено следующему в очереди'
      });
    }

    (async () => {
      const [name, info] = await Promise.all([
        getUserName(userId),
        getCommunityEventInfo(eventId, eventType),
      ]);
      const route = eventType === 'community_game' ? 'community-game' : 'community-training';
      await sendPushToCommunityExcept(Number(communityId), userId, 'schedule', {
        title: 'Место занято',
        body: `${name} вышел из резерва: ${info.text}`,
        url: `/event/${route}/${eventId}`,
        tag: `reserve-confirm-${eventType}-${eventId}-${userId}`,
      });
    })().catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка подтверждения места из резерва:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// Отказ от предложенного места. Место освобождается сразу, не дожидаясь таймера.
export const declineCommunityOffer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const { eventType, communityId } = req.body;

    if (!cfgFor(eventType)) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }

    const hasAccess = await checkCommunityPermissionInternal(userId, Number(communityId), 'COMMUNITY_SELF_ATTENDANCE');
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    const ok = await declineReserveOffer(eventType, Number(eventId), userId);
    res.json({ success: ok });
  } catch (err) {
    console.error('Ошибка отказа от места из резерва:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// Возврат в очередь после упущенного предложения — в конец, а не на прежнее место
export const requeueCommunityReserve = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const { eventType, communityId } = req.body;

    if (!cfgFor(eventType)) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }

    const hasAccess = await checkCommunityPermissionInternal(userId, Number(communityId), 'COMMUNITY_SELF_ATTENDANCE');
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    const ok = await requeueAfterExpiry(eventType, Number(eventId), userId);
    res.json({ success: ok });
  } catch (err) {
    console.error('Ошибка возврата в резервную очередь:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// РУЧНОЙ ПЕРЕВОД ИЗ РЕЗЕРВА В ОСНОВУ
//
// Право штаба и обход очереди: организатор знает, кого позвать, и ждать таймера
// не обязан. Лимит при этом не проверяем — решение человека выше лимита.
// =============================================================================
export const promoteFromCommunityReserve = async (req, res) => {
  const client = await pool.connect();
  try {
    const { eventId } = req.params;
    const { eventType, communityId, targetUserId, attendanceId } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg || (!targetUserId && !attendanceId)) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязательны' });
    }

    const hasAccess = await checkCommunityPermissionInternal(
      req.user.id, Number(communityId), 'COMMUNITY_EVENT_ATTENDANCE_MANAGE'
    );
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    await client.query('BEGIN');

    const event = await loadEvent(client, cfg, eventId, true);
    if (!event || Number(event.community_id) !== Number(communityId)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }

    // Гостя в резерве ищем по строке отметки: человека за ней нет
    const { rows } = await client.query(`
      UPDATE "public"."${cfg.att}"
      SET slot_status = 'main', offer_expires_at = NULL, withdrawn_at = NULL
      WHERE ${cfg.fk} = $1
        AND ($2::int IS NULL OR user_id = $2)
        AND ($3::int IS NULL OR id = $3)
        AND slot_status IN ('reserve', 'offered', 'expired')
      RETURNING id, user_id, offer_for_user_id, guest_position
    `, [eventId, targetUserId || null, attendanceId || null]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Человек не найден в резерве' });
    }

    const row = rows[0];
    const lane = row.user_id
      ? await resolveLane(client, event.community_id, Number(row.user_id))
      : (row.guest_position || 'skater');
    await linkReplacement(client, cfg, event, lane, row.user_id, row.offer_for_user_id, row.id);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка перевода из резерва:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};

// =============================================================================
// СПИСОК ОТМЕТИВШИХСЯ
//
// Отдаём одним списком с slot_status — фронт рисует из него три блока: основной
// состав, резерв (в порядке очереди) и упустившие место. Основу сортируем по
// фамилии, резерв — строго по queued_at: там порядок и есть смысл.
//
// В списке бывают и гости — занятые места для людей без аккаунта. У такой строки
// нет user_id, поэтому users присоединяется LEFT JOIN, а имя и амплуа берутся
// из самой отметки. Обращаться к гостю можно только по attendance_id: id у него
// null, и он один на всех гостей события.
// =============================================================================
export const getCommunityAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventType } = req.query;

    const cfg = cfgFor(eventType);
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'Неизвестный тип события сообщества' });
    }

    const { rows } = await pool.query(`
      SELECT
        a.id AS attendance_id,
        (a.user_id IS NULL) AS is_guest,
        u.id,
        COALESCE(u.first_name, a.guest_first_name) AS first_name,
        COALESCE(u.last_name, a.guest_last_name) AS last_name,
        u.avatar_url,
        u.avatar_url AS team_photo,
        COALESCE(a.guest_position, cm.position, 'skater') AS position,
        cm.group_id, g.name AS group_name,
        a.has_pay_tag, a.pay_role, a.withdrawn_at, a.final_fee,
        a.slot_status, a.queued_at, a.offer_expires_at,
        a.offer_for_user_id, a.replaced_by_user_id
      FROM "public"."${cfg.att}" a
      LEFT JOIN users u ON u.id = a.user_id
      JOIN "public"."${cfg.table}" e ON e.id = a.${cfg.fk}
      LEFT JOIN community_members cm ON cm.community_id = e.community_id
        AND cm.user_id = a.user_id AND cm.left_at IS NULL
      LEFT JOIN community_groups g ON g.id = cm.group_id
      WHERE a.${cfg.fk} = $1
      ORDER BY
        CASE a.slot_status
          WHEN 'main' THEN 0 WHEN 'offered' THEN 1
          WHEN 'reserve' THEN 2 ELSE 3
        END,
        CASE WHEN a.slot_status = 'main' THEN NULL ELSE a.queued_at END,
        COALESCE(u.last_name, a.guest_last_name),
        COALESCE(u.first_name, a.guest_first_name)
    `, [eventId]);

    res.json({ success: true, attendees: rows });
  } catch (err) {
    console.error('Ошибка получения списка отметившихся на событие сообщества:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// =============================================================================
// ФИНАНСОВАЯ ПОМЕТКА УЧАСТНИКА (₽)
// =============================================================================
export const toggleCommunityAttendanceTag = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventType, communityId, targetUserId, attendanceId, hasPayTag } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg || (!targetUserId && !attendanceId)) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязательны' });
    }

    const hasAccess = await checkCommunityPermissionInternal(
      req.user.id, Number(communityId), 'COMMUNITY_EVENT_FEE_MARK'
    );
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    // Занятое место тоже платит, и пометка ₽ ему нужна ровно так же —
    // адресуется оно строкой отметки, а не человеком
    await pool.query(`
      UPDATE "public"."${cfg.att}" SET has_pay_tag = $1
      WHERE ${cfg.fk} = $2
        AND ($3::int IS NULL OR user_id = $3)
        AND ($4::int IS NULL OR id = $4)
    `, [hasPayTag === true || hasPayTag === 'true', eventId, targetUserId || null, attendanceId || null]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения финансовой пометки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
