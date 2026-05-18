import express from 'express';
import { getEvents } from '../controllers/EventInfoController.js';
import { toggleEventAttendance } from '../controllers/EventAttendanceController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Получить все события для календаря
router.get('/', verifyToken, getEvents);

// Переключить статус присутствия на событии (тумблер)
router.post('/:eventId/attendance', verifyToken, toggleEventAttendance);

export default router;