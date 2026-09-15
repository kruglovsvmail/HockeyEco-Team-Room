import express from 'express';
import { getPendingLeagueNotices, markLeagueNoticeSeen } from '../controllers/LeagueNoticeController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Уведомления команде от лиги: окно при первом заходе после того, как лига
// ввела игрока в команду из LMS
router.get('/pending', verifyToken, getPendingLeagueNotices);
router.post('/:id/seen', verifyToken, markLeagueNoticeSeen);

export default router;
