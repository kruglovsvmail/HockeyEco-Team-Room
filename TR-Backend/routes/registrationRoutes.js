import { Router } from 'express';
import registrationController from '../controllers/registrationController.js';

const router = Router();

// Самостоятельная регистрация. Все эндпоинты анонимные по своей природе — ими
// пользуются те, кто ещё не вошёл, — поэтому verifyToken здесь нет и быть не может.
// Защиту дают: подписанный билет между шагами, секретный код руководителя, подтверждение
// номера звонком и лимиты в самих обработчиках.
router.post('/api/auth/reg/start', registrationController.start);
router.post('/api/auth/reg/claim', registrationController.claim);
router.post('/api/auth/reg/phone/request', registrationController.requestPhone);
router.post('/api/auth/reg/phone/status', registrationController.phoneStatus);

export default router;
