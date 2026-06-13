import express from 'express';
import { getEvents } from '../controllers/CalendarController.js';
import { 
  toggleEventAttendance, 
  getEventAttendance, 
  getAvailableRoster, 
  toggleEventAttendanceTag,
  confirmFriendlyMatch,
  cancelFriendlyMatch 
} from '../controllers/EventAttendanceController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';

const router = express.Router();

// Получить все события для календаря (матчи + тренировки + собрания)
router.get('/', verifyToken, getEvents);

// Получить список отметившихся на конкретное событие
router.get('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getEventAttendance);

// Получить умный список доступных игроков с учетом регламентов и дисквалификаций
router.get('/:eventId/available-roster', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getAvailableRoster);

// Переключить статус присутствия на событии
router.post('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), toggleEventAttendance);

// Изменить финансовую пометку игрока (₽)
router.put('/:eventId/attendance-tag', verifyToken, requireTeamPermission('ATTENDANCE_MANAGE'), toggleEventAttendanceTag);

// Подтвердить товарищеский матч friendly_pwa вызываемой стороной
router.post('/:eventId/confirm', verifyToken, confirmFriendlyMatch);

// Отменить вызов или отклонить товарищеский матч friendly_pwa
router.post('/:eventId/cancel', verifyToken, cancelFriendlyMatch);

export default router;