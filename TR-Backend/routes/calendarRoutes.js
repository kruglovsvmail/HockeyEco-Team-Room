import express from 'express';
import { getEvents } from '../controllers/CalendarController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Получить все события для календаря (матчи, тренировки, собрания — UNION ALL)
// Внутри контроллера зашито автоматическое скрытие тумблеров по подписке
router.get('/', verifyToken, getEvents);

export default router;