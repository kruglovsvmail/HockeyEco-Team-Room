import express from 'express';
import { getEvents } from '../controllers/EventInfoController.js';
import { toggleEventAttendance, getEventAttendance, getAvailableRoster } from '../controllers/EventAttendanceController.js';
import { getMatchLines, saveMatchLines } from '../controllers/EventLinesController.js';
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

// Получить опубликованные пятерки на матч
router.get('/:eventId/lines', verifyToken, getMatchLines);

// Сохранить (опубликовать) пятерки на матч
router.post('/:eventId/lines', verifyToken, saveMatchLines);

export default router;