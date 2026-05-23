import express from 'express';
import { 
  getMyTeams, 
  getTeamDetails, 
  updateTeamProfile, 
  excludeFromRoster, 
  excludeFromMembership,
  searchUserByPhone,
  addOrRestoreTeamMember,
  addTeamMemberToRoster,
  getTeamMemberDetails,
  updateMemberDetails,
  updateMemberPhoto,
  deleteMemberPhoto
} from '../controllers/TeamController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Получение списка моих команд (где пользователь игрок или представитель)
router.get('/my', verifyToken, getMyTeams);

// Получение списков составов, ростеров и штаба конкретной команды
router.get('/:id/details', verifyToken, getTeamDetails);

// Получение развернутого профиля участника команды с автоматической маскировкой virtual_code
router.get(
  '/:teamId/members/:userId',
  verifyToken,
  requireTeamPermission('INTERNAL_VIEW'),
  getTeamMemberDetails
);

// Обновление административного статуса и игрового профиля участника команды (внутри гранулярная проверка)
router.put(
  '/:teamId/members/:memberId/details',
  verifyToken,
  requireTeamPermission('INTERNAL_VIEW'),
  updateMemberDetails
);

// Загрузка или обновление фотографии участника команды менеджером
router.put(
  '/:teamId/members/:memberId/photo',
  verifyToken,
  requireTeamPermission('EDIT_MEMBER_HEADER'),
  upload.single('photo'),
  updateMemberPhoto
);

// Удаление переопределенной фотографии участника из состава команды
router.delete(
  '/:teamId/members/:memberId/photo',
  verifyToken,
  requireTeamPermission('EDIT_MEMBER_HEADER'),
  deleteMemberPhoto
);

// Обновление визуального профиля, логотипов и цветов команды в PWA
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

// Исключение игрока из активного игрового ростера на турнир
router.post(
  '/:teamId/roster/:memberId/exclude',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  excludeFromRoster
);

// Полное удаление пользователя из членства команды и ростера
router.post(
  '/:teamId/members/:memberId/exclude',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  excludeFromMembership
);

// Поиск пользователя по номеру телефона для добавления в команду
router.get(
  '/:teamId/users/search',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  searchUserByPhone
);

// Создание нового членства или восстановление заархивированного участника
router.post(
  '/:teamId/members',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  addOrRestoreTeamMember
);

// Включение члена команды в игровой ростер турнира с фиксацией амплуа и номера
router.post(
  '/:teamId/roster',
  verifyToken,
  requireTeamPermission('ROSTER_MANAGE'),
  addTeamMemberToRoster
);

export default router;