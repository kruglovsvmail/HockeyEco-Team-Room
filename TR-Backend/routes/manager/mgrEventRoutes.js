import express from 'express';
import { createManagerEvent } from '../../controllers/manager/MgrEventController.js';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';

const router = express.Router();

// Создание нового события (параметр teamId передается в теле запроса)
router.post('/create', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), createManagerEvent);

export default router;