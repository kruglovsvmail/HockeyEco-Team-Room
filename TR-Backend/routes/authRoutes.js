import express from 'express';
import { 
  login, 
  getMe, 
  resetPassword, 
  updateProfile, 
  checkPhone,
  regCheckPhone,
  regVerifyCode,
  register
} from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.get('/me', verifyToken, getMe);
router.post('/check-phone', checkPhone);
router.post('/reset-password', resetPassword);

// НОВЫЕ МАРШРУТЫ РЕГИСТРАЦИИ:
router.post('/reg-check-phone', regCheckPhone);
router.post('/reg-verify-code', regVerifyCode);
router.post('/register', register);

export default router;