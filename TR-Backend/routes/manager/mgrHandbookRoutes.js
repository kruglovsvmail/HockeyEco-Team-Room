import express from 'express';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';
import { 
  getArenas, 
  getPwaTeams, 
  getExternalOpponents, 
  createExternalOpponent, 
  getExternalTournaments, 
  getExternalTournamentOpponents,
  getOpponentsExtended,
  updateExternalOpponent,
  deleteExternalOpponent,
  getTournamentsExtended,
  createExternalTournament,
  updateExternalTournament,
  deleteExternalTournament,
  getTournamentRosterMap,
  saveTournamentRoster
} from '../../controllers/manager/MgrHandbookController.js';

const router = express.Router();

// ==========================================
// 🎯 Контур планирования событий (MGR_CREATE_EVENT)
// ==========================================
router.get('/arenas', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getArenas);
router.get('/pwa-teams', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getPwaTeams);

router.get('/external-opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalOpponents);
router.post('/external-opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), createExternalOpponent);

router.get('/external-tournaments', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalTournaments);
router.get('/external-tournaments/:tournamentId/opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalTournamentOpponents);

// ==========================================
// 📂 Контур администрирования справочников (MGR_HANDBOOKS)
// ==========================================

// Управление внешними соперниками (Блок Вкладки А)
router.get('/opponents-extended', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getOpponentsExtended);
router.put('/external-opponents/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), updateExternalOpponent);
router.delete('/external-opponents/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), deleteExternalOpponent);

// Управление внешними турнирами (Блок Вкладки Б)
router.get('/tournaments-extended', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getTournamentsExtended);
router.post('/external-tournaments', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), createExternalTournament);
router.put('/external-tournaments/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), updateExternalTournament);
router.delete('/external-tournaments/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), deleteExternalTournament);

// Распределение ростера участников лиги (Блок Шторки В)
router.get('/external-tournaments/:tournamentId/roster-map', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getTournamentRosterMap);
router.post('/external-tournaments/:tournamentId/roster-save', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), saveTournamentRoster);

export default router;