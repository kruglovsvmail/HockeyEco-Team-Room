// TR-Backend/routes/CardGameRoutes.js
import express from 'express';
import { getEventCards, toggleGameAttendance } from '../controllers/CardGameController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Получить все карточки матчей для календаря
router.get('/', verifyToken, getEventCards);

// Переключить статус присутствия на матче (тумблер)
router.post('/:gameId/attendance', verifyToken, toggleGameAttendance);

export default router;