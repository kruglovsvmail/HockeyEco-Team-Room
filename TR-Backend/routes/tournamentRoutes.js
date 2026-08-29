import { Router } from 'express';
import tournamentController from '../controllers/tournamentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Справочник лиг для информационного раздела «Турниры / Лиги».
// verifyToken нужен не для ограничения доступа — смотреть можно всё, — а чтобы знать,
// какие дивизионы отметить как «мои» и какие неопубликованные показать их участникам.
router.get('/leagues', verifyToken, tournamentController.getLeagues);
router.get('/leagues/:leagueId/structure', verifyToken, tournamentController.getLeagueStructure);

// Получение всех одобренных турниров конкретной команды
router.get('/team/:teamId', tournamentController.getTeamTournaments);

// Получение всех матчей конкретного дивизиона (календарь)
router.get('/division/:divisionId/games', tournamentController.getDivisionGames);

// Получение актуальной турнирной таблицы регулярного чемпионата
router.get('/division/:divisionId/standings', tournamentController.getDivisionStandings);

// Получение структуры сеток, раундов и матчей плей-офф
router.get('/division/:divisionId/playoffs', tournamentController.getDivisionPlayoffs);

// Получение динамической статистики полевых игроков и вратарей по этапам
router.get('/division/:divisionId/stats', tournamentController.getDivisionStats);

// Получение командной статистики по дивизиону для конкретной команды
router.get('/division/:divisionId/team-stats', tournamentController.getDivisionTeamStats);

export default router;