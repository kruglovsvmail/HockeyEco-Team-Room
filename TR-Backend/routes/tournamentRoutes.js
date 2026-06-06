import { Router } from 'express';
import tournamentController from '../controllers/tournamentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Маршрут для получения турниров конкретной команды
router.get('/team/:teamId', verifyToken, tournamentController.getTeamTournaments);

// Новое: Получение расписания/календаря всех матчей выбранного дивизиона
router.get('/division/:divisionId/games', verifyToken, tournamentController.getDivisionGames);

export default router;