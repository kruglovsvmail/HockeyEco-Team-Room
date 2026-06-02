import express from 'express';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';
import { 
  getArenas, 
  getPwaTeams, 
  getExternalOpponents, 
  createExternalOpponent, 
  getExternalTournaments, 
  getExternalTournamentOpponents 
} from '../../controllers/manager/MgrHandbookController.js';

const router = express.Router();

// Все эндпоинты справочников аппаратно закрыты токеном авторизации и ключом создания событий команды
router.get('/arenas', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getArenas);
router.get('/pwa-teams', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getPwaTeams);

router.get('/external-opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalOpponents);
router.post('/external-opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), createExternalOpponent);

router.get('/external-tournaments', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalTournaments);
router.get('/external-tournaments/:tournamentId/opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalTournamentOpponents);

export default router;