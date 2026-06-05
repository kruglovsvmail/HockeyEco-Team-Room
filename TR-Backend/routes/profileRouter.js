import { Router } from 'express';
import profileController from '../controllers/profileController.js';
import { verifyToken } from '../middleware/auth.js'; 
import multer from 'multer';

// Режим хранения буфера изображений в оперативной памяти RAM
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Ограничение: 5 Мегабайт
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только файлы изображений (JPG, PNG, WEBP)!'), false);
    }
  }
});

const router = Router();

// Защищенные роуты персонального кабинета игрока HockeyEco
router.get('/api/profile', verifyToken, profileController.getProfile);
router.put('/api/profile', verifyToken, profileController.updateProfile);

// Безопасный перехватчик ошибок multer (размер, формат)
router.post('/api/profile/avatar', verifyToken, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      console.error('Ошибка предварительной загрузки Multer:', err);
      return res.status(400).json({ 
        success: false, 
        error: err.code === 'LIMIT_FILE_SIZE' 
          ? 'Размер фотографии превышает лимит 5 МБ.' 
          : err.message 
      });
    }
    next();
  });
}, profileController.updateAvatar);

// Эндпоинты удаления аватара, смены паролей и пин-кодов
router.delete('/api/profile/avatar', verifyToken, profileController.deleteAvatar);
router.put('/api/profile/password', verifyToken, profileController.changePassword);
router.put('/api/profile/pin', verifyToken, profileController.setSignPin);

export default router;