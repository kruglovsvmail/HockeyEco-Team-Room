import express from 'express';
import { getMyTeams, getTeamDetails } from '../controllers/TeamController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Используем verifyToken для проверки авторизации
router.get('/my', verifyToken, getMyTeams);
router.get('/:id/details', verifyToken, getTeamDetails);

export default router;