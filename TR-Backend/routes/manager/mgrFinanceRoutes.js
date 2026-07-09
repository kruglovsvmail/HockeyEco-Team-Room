import express from 'express';
import { getTeamFinanceSummary } from '../../controllers/manager/MgrFinanceController.js';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';

const router = express.Router();

// Финансовый отчет по команде
router.get('/:teamId/summary', verifyToken, requireTeamPermission('MGR_FINANCES'), getTeamFinanceSummary);

export default router;