import express from 'express';
import { createEvent } from '../../controllers/manager/MgrEventController.js';
import { verifyToken, requireEventPermission } from '../../middleware/auth.js';

const router = express.Router();

/**
 * Маршрут для создания нового события (Тренировка, Матч, Собрание)
 * Контекст передаётся в теле запроса: teamId — командное событие, clubId — клубное
 * (клубная тренировка или клубное собрание). Middleware сам выбирает нужную проверку.
 */
router.post('/create', verifyToken, requireEventPermission('MGR_CREATE_EVENT', 'CLUB_MANAGE_EVENTS'), createEvent);

export default router;