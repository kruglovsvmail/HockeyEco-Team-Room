import express from 'express';
import { getSeasonApplications } from '../../controllers/manager/MgrSeasonController.js';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';

const router = express.Router();

// Получение заявок на сезон для конкретной команды
router.get('/:teamId/applications', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), getSeasonApplications);

export default router;