import express from 'express';
import {
  getMyClubs,
  getClubDetails,
  updateClubProfile,
  searchUserByPhoneForClub,
  addOrRestoreClubMember,
  excludeFromClub,
  getClubMemberDetails,
  updateClubMemberRoles,
  getClubMemberStats,
} from '../controllers/ClubController.js';
import { verifyToken, requireClubPermission } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Список клубов пользователя (владелец клуба или человек из общей базы клуба)
router.get('/my', verifyToken, getMyClubs);

// Состав, штаб и команды клуба. Без гранулярной проверки — как и у команды:
// страница клуба открыта всем его членам, ограничения живут на действиях ниже.
router.get('/:clubId/details', verifyToken, getClubDetails);

// Профиль клуба: название, логотип, город, описание, цвета
router.put(
  '/:clubId/profile',
  verifyToken,
  requireClubPermission('CLUB_EDIT_PROFILE'),
  upload.fields([{ name: 'logo', maxCount: 1 }]),
  updateClubProfile
);

// Поиск зарегистрированного пользователя по телефону для добавления в клуб
router.get(
  '/:clubId/users/search',
  verifyToken,
  requireClubPermission('CLUB_MANAGE_MEMBERS'),
  searchUserByPhoneForClub
);

// Добавление в состав клуба или восстановление ранее ушедшего
router.post(
  '/:clubId/members',
  verifyToken,
  requireClubPermission('CLUB_MANAGE_MEMBERS'),
  addOrRestoreClubMember
);

// Исключение из клуба каскадом (клуб + команды клуба + ростеры + полномочия)
router.post(
  '/:clubId/members/:userId/exclude',
  verifyToken,
  requireClubPermission('CLUB_MANAGE_MEMBERS'),
  excludeFromClub
);

// Карточка человека в клубном контексте (без игрового профиля)
router.get(
  '/:clubId/members/:userId',
  verifyToken,
  requireClubPermission('INTERNAL_VIEW'),
  getClubMemberDetails
);

// Статистика человека в клубе: посещаемость клубных тренировок и собраний
router.get(
  '/:clubId/members/:userId/club-stats',
  verifyToken,
  requireClubPermission('INTERNAL_VIEW'),
  getClubMemberStats
);

// Назначение и снятие клубных ролей
router.put(
  '/:clubId/members/:userId/roles',
  verifyToken,
  requireClubPermission('CLUB_MANAGE_ROLES'),
  updateClubMemberRoles
);

export default router;
