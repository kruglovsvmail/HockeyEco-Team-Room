import express from 'express';
import { 
  getMyTeams, 
  getTeamDetails, 
  updateTeamProfile, 
  excludeFromRoster, 
  excludeFromMembership,
  searchUserByPhone,
  addOrRestoreTeamMember,
  addTeamMemberToRoster
} from '../controllers/TeamController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.get('/my', verifyToken, getMyTeams);
router.get('/:id/details', verifyToken, getTeamDetails);

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

// Исключение из ростера
router.post(
  '/:teamId/roster/:memberId/exclude',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  excludeFromRoster
);

// Исключение из членства команды
router.post(
  '/:teamId/members/:memberId/exclude',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  excludeFromMembership
);

// Поиск пользователя по телефону для добавления в команду
router.get(
  '/:teamId/users/search',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  searchUserByPhone
);

// Создание или восстановление членства в команде
router.post(
  '/:teamId/members',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  addOrRestoreTeamMember
);

// Включение члена команды в игровой ростер турнира
router.post(
  '/:teamId/roster',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  addTeamMemberToRoster
);

export default router;