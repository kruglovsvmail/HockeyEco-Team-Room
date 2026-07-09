import express from 'express';
import { registerPageView } from '../controllers/AnalyticsController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/page-view', verifyToken, registerPageView);

export default router;
