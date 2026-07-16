import { Router } from 'express';
import policyController from '../controllers/PolicyController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Публичный эндпоинт — текст политики доступен без авторизации (страница /privacy)
router.get('/current', policyController.getCurrent);

// Статус и фиксация согласия текущего пользователя
router.get('/status', verifyToken, policyController.getStatus);
router.post('/accept', verifyToken, policyController.accept);

export default router;
