import express from 'express';
import { subscribe, unsubscribe, getSettings, updateSettings } from '../controllers/PushController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/subscribe', verifyToken, subscribe);
router.post('/unsubscribe', verifyToken, unsubscribe);
router.get('/settings', verifyToken, getSettings);
router.put('/settings', verifyToken, updateSettings);

export default router;
