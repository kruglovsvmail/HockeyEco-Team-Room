/********** ФАЙЛ: TR-Backend\routes\eventRoutes.js **********/

import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { 
    getWeeklyEvents, 
    toggleGameAttendance, 
    toggleEventAttendance 
} from '../controllers/eventController.js';

const router = express.Router();

// Получение расписания
router.post('/weekly', verifyToken, getWeeklyEvents);

// Отметки на матчи
router.post('/games/attendance', verifyToken, toggleGameAttendance);
router.delete('/games/attendance', verifyToken, toggleGameAttendance);

// Отметки на тренировки и собрания
router.post('/internal/attendance', verifyToken, toggleEventAttendance);
router.delete('/internal/attendance', verifyToken, toggleEventAttendance);

export default router;