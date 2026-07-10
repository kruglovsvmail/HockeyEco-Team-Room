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
  getMemberTeamStats,
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

// Статистика участника внутри команды (посещаемость тренировок и т.п. — панель "Статистика в команде")
router.get(
  '/:teamId/members/:userId/team-stats',
  verifyToken,
  requireTeamPermission('INTERNAL_VIEW'),
  getMemberTeamStats
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
  requireTeamPermission('EDIT_USER_BLOCK_BASE'),
  upload.single('photo'),
  updateMemberPhoto
);

// Удаление переопределенной фотографии участника из состава команды
router.delete(
  '/:teamId/members/:memberId/photo',
  verifyToken,
  requireTeamPermission('EDIT_USER_BLOCK_BASE'),
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

// Исключение игрока из активного игрового ростера на турнир (Вкладка "Ростер")
router.post(
  '/:teamId/roster/:memberId/exclude',
  verifyToken,
  requireTeamPermission('TEAM_MANAGE_TAB_ROSTER'),
  excludeFromRoster
);

// Полное удаление пользователя из членства команды и ростера (Вкладка "Состав")
router.post(
  '/:teamId/members/:memberId/exclude',
  verifyToken,
  requireTeamPermission('TEAM_MANAGE_TAB_ALL'),
  excludeFromMembership
);

// Поиск пользователя по номеру телефона для добавления в команду
router.get(
  '/:teamId/users/search',
  verifyToken,
  requireTeamPermission('TEAM_MANAGE_TAB_ALL'),
  searchUserByPhone
);

// Создание нового членства или восстановление заархивированного участника
router.post(
  '/:teamId/members',
  verifyToken,
  requireTeamPermission('TEAM_MANAGE_TAB_ALL'),
  addOrRestoreTeamMember
);

// Включение члена команды в игровой ростер турнира с фиксацией амплуа и номера
router.post(
  '/:teamId/roster',
  verifyToken,
  requireTeamPermission('TEAM_MANAGE_TAB_ROSTER'),
  addTeamMemberToRoster
);

export default router;