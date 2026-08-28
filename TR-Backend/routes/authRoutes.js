import express from 'express';
import { 
  login, 
  getMe, 
  resetPassword, 
  updateProfile, 
  checkPhone
} from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.get('/me', verifyToken, getMe);
router.post('/check-phone', checkPhone);
router.post('/reset-password', resetPassword);

// Регистрация и активация переехали в registrationRoutes.js. Прежние три роута сняты
// намеренно: /register принимал пару телефон+код и переписывал почту с паролем БЕЗ
// подтверждения номера звонком, то есть оставался дверью в обход новой проверки.

export default router;