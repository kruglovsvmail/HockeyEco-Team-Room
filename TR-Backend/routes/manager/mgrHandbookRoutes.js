import express from 'express';
import { getTeamHandbooks } from '../../controllers/manager/MgrHandbookController.js';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';

const router = express.Router();

// Доступ к реестрам и справочникам команды
router.get('/:teamId', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getTeamHandbooks);

export default router;