import express from 'express';
import {
  toggleCommunityAttendance,
  bulkMarkCommunityAttendance,
  updateCommunityGuest,
  getCommunityAttendance,
  toggleCommunityAttendanceTag,
  confirmCommunityOffer,
  declineCommunityOffer,
  requeueCommunityReserve,
  promoteFromCommunityReserve,
} from '../controllers/CommunityAttendanceController.js';
import { verifyToken, requireCommunityPermission } from '../middleware/auth.js';

const router = express.Router();

// Все ручки ниже обслуживают оба типа событий сообщества — тренировку и солянку.
// Тип приходит в eventType, контекст сообщества — в communityId (в теле запроса
// либо в query у GET), оттуда же его берёт requireCommunityPermission.

// ==========================================
// 👥 ОТМЕТКИ
// ==========================================

// Список отметившихся: основной состав, резерв в порядке очереди и упустившие место
router.get(
  '/:eventId/attendance',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  getCommunityAttendance
);

// Отметка и снятие. Гейт пускает участников и штаб, а самоотметку от управления
// контроллер различает сам — как это сделано у командных тренировок.
router.post(
  '/:eventId/attendance',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  toggleCommunityAttendance
);

// Отметка пачкой — только солянка. Штаб набирает состав разом, поэтому здесь
// одна транзакция и одно сводное уведомление вместо цепочки одиночных отметок.
// В теле едут и участники (userIds), и занятые места для людей без аккаунта (guests).
router.post(
  '/:eventId/attendance-bulk',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_ATTENDANCE_MANAGE'),
  bulkMarkCommunityAttendance
);

// Фамилия и имя гостя: место занимают и не зная, кто придёт, — имя дописывают позже
router.put(
  '/:eventId/attendance-guest',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_ATTENDANCE_MANAGE'),
  updateCommunityGuest
);

// Финансовая пометка участника (₽) — деньги остаются за владельцем
// и руководителем, администратор ведёт только состав
router.put(
  '/:eventId/attendance-tag',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_FEE_MARK'),
  toggleCommunityAttendanceTag
);

// ==========================================
// ⏳ РЕЗЕРВНАЯ ОЧЕРЕДЬ
// ==========================================

// Подтверждение предложенного места. Опоздал — придёт 409: очередь ушла дальше.
router.post(
  '/:eventId/reserve/confirm',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  confirmCommunityOffer
);

// Отказ от предложенного места — освобождает слот сразу, не дожидаясь таймера
router.post(
  '/:eventId/reserve/decline',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  declineCommunityOffer
);

// Возврат в очередь после упущенного предложения — в конец очереди
router.post(
  '/:eventId/reserve/requeue',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  requeueCommunityReserve
);

// Ручной перевод из резерва в основу мимо очереди — право штаба
router.post(
  '/:eventId/reserve/promote',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_ATTENDANCE_MANAGE'),
  promoteFromCommunityReserve
);

export default router;
