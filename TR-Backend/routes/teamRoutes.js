import express from 'express';
import { getMyTeams, getTeamDetails, updateTeamProfile } from '../controllers/TeamController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();

// Настраиваем буфер памяти для Multer, чтобы перехватывать файлы до отправки в S3
const upload = multer({ storage: multer.memoryStorage() });

router.get('/my', verifyToken, getMyTeams);
router.get('/:id/details', verifyToken, getTeamDetails);

// Эндпоинт обновления профиля команды руководителем
router.put(
  '/:id/profile',
  verifyToken,
  requireTeamPermission('TEAM_EDIT_PROFILE'),
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'jersey_dark', maxCount: 1 },
    { name: 'jersey_light', maxCount: 1 }
  ]),
  updateTeamProfile
);

export default router;