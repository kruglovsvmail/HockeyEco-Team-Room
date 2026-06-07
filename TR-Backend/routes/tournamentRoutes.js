// tournamentRoutes.js
import { Router } from 'express';
import tournamentController from '../controllers/tournamentController.js';

const router = Router();

// Получение всех одобренных турниров конкретной команды
router.get('/team/:teamId', tournamentController.getTeamTournaments);

// Получение всех матчей конкретного дивизиона (календарь)
router.get('/division/:divisionId/games', tournamentController.getDivisionGames);

// Получение актуальной турнирной таблицы регулярного чемпионата
router.get('/division/:divisionId/standings', tournamentController.getDivisionStandings);

// Получение структуры сеток, раундов и матчей плей-офф
router.get('/division/:divisionId/playoffs', tournamentController.getDivisionPlayoffs);

export default router;