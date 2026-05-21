import express from 'express';
import { getEvents } from '../controllers/EventInfoController.js';
import { toggleEventAttendance, getEventAttendance, getAvailableRoster, toggleEventAttendanceTag } from '../controllers/EventAttendanceController.js';
import { getMatchLines, saveMatchLines, submitMatchRoster, updateLinePlayer } from '../controllers/EventLinesController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Получить все события для календаря
router.get('/', verifyToken, getEvents);

// Получить список отметившихся на конкретное событие
router.get('/:eventId/attendance', verifyToken, getEventAttendance);

// Получить умный список доступных игроков команды с учетом регламентов и дисквалификаций
router.get('/:eventId/available-roster', verifyToken, getAvailableRoster);

// Переключить статус присутствия на событии (тумблер)
router.post('/:eventId/attendance', verifyToken, toggleEventAttendance);

// Изменить финансовую пометку игрока (₽) без удаления его из списка
router.put('/:eventId/attendance-tag', verifyToken, toggleEventAttendanceTag);

// Получить опубликованные пятерки на матч (черновик)
router.get('/:eventId/lines', verifyToken, getMatchLines);

// Сохранить черновик пятерок на матч
router.post('/:eventId/lines', verifyToken, saveMatchLines);

// Обновить параметры конкретного игрока в черновике (номер, C, A) — доступно только админу/менеджеру
router.put('/:eventId/line-player', verifyToken, updateLinePlayer);

// Отправить официальную заявку в лигу
router.post('/:eventId/submit-roster', verifyToken, submitMatchRoster);

export default router;