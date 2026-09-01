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

// =============================================================================
// ОТМЕТКА НА СОБЫТИЕ СООБЩЕСТВА
//
// Главное отличие от команд и клубов: отметка не гарантирует лёд. Если лимит
// состава набран, человек становится в резерв и ждёт предложения от крона.
// Снятие отметки резервистом — всегда простое удаление строки: он на лёд не
// выходил и плательщиком никогда не был, штамп withdrawn_at ему не нужен.
// =============================================================================
export const toggleCommunityAttendance = async (req, res) => {
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

      if (existing) {
        // Возврат после снятия или после упущенного предложения. queued_at
        // обновляем: в очередь человек встаёт заново, в конец. pay_role не трогаем —
        // ручное освобождение (free) от штаба повторная отметка перетирать не должна.
        await client.query(`
          UPDATE "public"."${cfg.att}"
          SET slot_status = $2, withdrawn_at = NULL, queued_at = NOW(),
              offer_expires_at = NULL, offer_for_user_id = NULL, replaced_by_user_id = NULL
          WHERE id = $1
        `, [existing.id, slotStatus]);
      } else {
        const payRole = await resolvePayRole(targetId, eventType, { communityId: event.community_id });
        await client.query(`
          INSERT INTO "public"."${cfg.att}" (${cfg.fk}, user_id, pay_role, slot_status)
          VALUES ($1, $2, $3, $4)
        `, [eventId, targetId, payRole, slotStatus]);
      }

      // Занял освободившееся место после дедлайна — значит кого-то из слившихся
      // от оплаты освобождаем. Работает и без резерва: правило одно на оба пути.
      if (slotStatus === 'main' && afterDeadline) {
        await linkReplacement(client, cfg, event, lane, targetId, null);
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
    const { eventType, communityId, targetUserId } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg || !targetUserId) {
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

    const { rows } = await client.query(`
      UPDATE "public"."${cfg.att}"
      SET slot_status = 'main', offer_expires_at = NULL, withdrawn_at = NULL
      WHERE ${cfg.fk} = $1 AND user_id = $2 AND slot_status IN ('reserve', 'offered', 'expired')
      RETURNING offer_for_user_id
    `, [eventId, targetUserId]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Человек не найден в резерве' });
    }

    const lane = await resolveLane(client, event.community_id, Number(targetUserId));
    await linkReplacement(client, cfg, event, lane, Number(targetUserId), rows[0].offer_for_user_id);

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
        u.id, u.first_name, u.last_name, u.avatar_url,
        u.avatar_url AS team_photo,
        COALESCE(cm.position, 'skater') AS position,
        cm.group_id, g.name AS group_name,
        a.has_pay_tag, a.pay_role, a.withdrawn_at, a.final_fee,
        a.slot_status, a.queued_at, a.offer_expires_at,
        a.offer_for_user_id, a.replaced_by_user_id
      FROM "public"."${cfg.att}" a
      JOIN users u ON u.id = a.user_id
      JOIN "public"."${cfg.table}" e ON e.id = a.${cfg.fk}
      LEFT JOIN community_members cm ON cm.community_id = e.community_id
        AND cm.user_id = u.id AND cm.left_at IS NULL
      LEFT JOIN community_groups g ON g.id = cm.group_id
      WHERE a.${cfg.fk} = $1
      ORDER BY
        CASE a.slot_status
          WHEN 'main' THEN 0 WHEN 'offered' THEN 1
          WHEN 'reserve' THEN 2 ELSE 3
        END,
        CASE WHEN a.slot_status = 'main' THEN NULL ELSE a.queued_at END,
        u.last_name, u.first_name
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
    const { eventType, communityId, targetUserId, hasPayTag } = req.body;

    const cfg = cfgFor(eventType);
    if (!cfg || !targetUserId) {
      return res.status(400).json({ success: false, error: 'eventType и targetUserId обязательны' });
    }

    const hasAccess = await checkCommunityPermissionInternal(
      req.user.id, Number(communityId), 'COMMUNITY_EVENT_FEE_MARK'
    );
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    await pool.query(`
      UPDATE "public"."${cfg.att}" SET has_pay_tag = $1
      WHERE ${cfg.fk} = $2 AND user_id = $3
    `, [hasPayTag === true || hasPayTag === 'true', eventId, targetUserId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения финансовой пометки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
