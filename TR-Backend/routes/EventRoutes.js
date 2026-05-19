import express from 'express';
import { getEvents } from '../controllers/EventInfoController.js';
import { toggleEventAttendance, getEventAttendance } from '../controllers/EventAttendanceController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Получить все события для календаря
router.get('/', verifyToken, getEvents);

// Получить список отметившихся на конкретное событие
router.get('/:eventId/attendance', verifyToken, getEventAttendance);

// Переключить статус присутствия на событии (тумблер)
router.post('/:eventId/attendance', verifyToken, toggleEventAttendance);

export default router;