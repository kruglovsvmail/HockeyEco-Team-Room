import { Router } from 'express';
import subscriptionController from '../controllers/SubscriptionController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/plans', verifyToken, subscriptionController.getPlans);
router.post('/orders', verifyToken, subscriptionController.createOrder);

// Публичный эндпоинт — вызывается сервером ЮKassa, без пользовательского JWT
router.post('/webhook', subscriptionController.webhook);

export default router;
