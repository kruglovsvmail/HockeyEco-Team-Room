import express from 'express';
import { createEvent } from '../../controllers/manager/MgrEventController.js';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';

const router = express.Router();

/**
 * Маршрут для создания нового события (Тренировка, Матч, Собрание)
 * Параметр teamId передается в теле запроса (req.body), откуда его считывает middleware requireTeamPermission
 */
router.post('/create', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), createEvent);

export default router;