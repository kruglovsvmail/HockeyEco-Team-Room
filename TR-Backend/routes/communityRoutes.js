import express from 'express';
import {
  getCommunityCatalog,
  getMyCommunities,
  createCommunity,
  getCommunityDetails,
  joinCommunity,
  leaveCommunity,
  updateCommunityProfile,
  updateCommunitySettings,
  updateCommunityMember,
  excludeCommunityMember,
  setCommunityStaff,
  removeCommunityStaff,
  searchUserByPhoneForCommunity,
  createCommunityGroup,
  updateCommunityGroup,
  deleteCommunityGroup,
  getCommunityNotificationSettings,
  updateCommunityNotificationSettings,
  deleteCommunity,
  addCommunityMember,
  getCommunityMemberDetails,
  getCommunityMemberStats,
  updateMyCommunityPrivacy,
  createCommunityInfoBlock,
  updateCommunityInfoBlock,
  deleteCommunityInfoBlock,
  reorderCommunityInfoBlocks,
} from '../controllers/CommunityController.js';
import {
  createCommunityEvent,
  updateCommunityEventSchedule,
  updateCommunityEventFinances,
  updateCommunityEventLimits,
  deleteCommunityEvent,
  publishCommunityEventNow,
} from '../controllers/CommunityEventController.js';
import { verifyToken, requireCommunityPermission } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Каталог всех сообществ платформы — раздел «Сообщества» в сайдбаре.
// Открыт любому авторизованному: сюда приходят именно за чужими сообществами.
router.get('/catalog', verifyToken, getCommunityCatalog);

// Сообщества пользователя: где он владелец, в штабе или вступивший участник
router.get('/my', verifyToken, getMyCommunities);

// Создать сообщество может любой пользователь, он же становится владельцем.
// Форма приходит multipart: вместе с полями может лететь логотип.
router.post(
  '/',
  verifyToken,
  upload.fields([{ name: 'logo', maxCount: 1 }]),
  createCommunity
);

// Страница сообщества: участники, штаб, группы, информация.
// Без гранулярной проверки — карточку надо увидеть до вступления,
// ограничения живут на действиях ниже.
router.get('/:communityId/details', verifyToken, getCommunityDetails);

// Вступление и выход — действия самого пользователя, набор не закрывается
router.post('/:communityId/join', verifyToken, joinCommunity);
router.post('/:communityId/leave', verifyToken, leaveCommunity);

// Удаление сообщества целиком — только владелец, каскадом уходит всё содержимое
router.delete(
  '/:communityId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_DELETE'),
  deleteCommunity
);

// Профиль сообщества: название, логотип, город, описание, цвета, подпись владельца
router.put(
  '/:communityId/profile',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EDIT_PROFILE'),
  upload.fields([{ name: 'logo', maxCount: 1 }]),
  updateCommunityProfile
);

// Настройки: лесенка дедлайнов резерва и видимость чужих групп в календаре
router.put(
  '/:communityId/settings',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_SETTINGS'),
  updateCommunitySettings
);

// Добавление участника штабом или возврат ранее ушедшего
router.post(
  '/:communityId/members',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_MEMBERS'),
  addCommunityMember
);

// Карточка человека в сообществе: амплуа, группа, физические и личные данные
router.get(
  '/:communityId/members/:userId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  getCommunityMemberDetails
);

// Посещаемость событий сообщества за время членства
router.get(
  '/:communityId/members/:userId/stats',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INTERNAL_VIEW'),
  getCommunityMemberStats
);

// Своя приватность в этом сообществе. Без проверки прав штаба: человек правит
// исключительно собственную строку, и контроллер это гарантирует.
router.put('/:communityId/members/me/privacy', verifyToken, updateMyCommunityPrivacy);

// Карточка участника: амплуа (полевой/вратарь) и тренировочная группа
router.put(
  '/:communityId/members/:userId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_MEMBERS'),
  updateCommunityMember
);

// Исключение участника из сообщества
router.post(
  '/:communityId/members/:userId/exclude',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_MEMBERS'),
  excludeCommunityMember
);

// Поиск человека по телефону для добавления в штаб
router.get(
  '/:communityId/users/search',
  verifyToken,
  // Одним поиском пользуются два сценария: набор штаба и добавление участников.
  // Права у них разные, поэтому пропускаем по любому из двух ключей.
  requireCommunityPermission(['COMMUNITY_MANAGE_ROLES', 'COMMUNITY_MANAGE_MEMBERS']),
  searchUserByPhoneForCommunity
);

// Штаб: назначение должности с ручной подписью и снятие полномочий.
// Строго владелец — как CLUB_MANAGE_ROLES у клуба.
router.put(
  '/:communityId/staff/:userId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_ROLES'),
  setCommunityStaff
);

router.delete(
  '/:communityId/staff/:userId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_ROLES'),
  removeCommunityStaff
);

// Информационные блоки вкладки «Инфо». Содержание заводит владелец в профиле
// сообщества, а порядок может менять и руководитель — это раскладка, не текст.
router.post(
  '/:communityId/info-blocks',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EDIT_PROFILE'),
  createCommunityInfoBlock
);

router.put(
  '/:communityId/info-blocks/reorder',
  verifyToken,
  requireCommunityPermission('COMMUNITY_INFO_REORDER'),
  reorderCommunityInfoBlocks
);

router.put(
  '/:communityId/info-blocks/:blockId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EDIT_PROFILE'),
  updateCommunityInfoBlock
);

router.delete(
  '/:communityId/info-blocks/:blockId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EDIT_PROFILE'),
  deleteCommunityInfoBlock
);

// Тренировочные группы (только сообщества категории «Тренировки»)
router.post(
  '/:communityId/groups',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_GROUPS'),
  createCommunityGroup
);

router.put(
  '/:communityId/groups/:groupId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_GROUPS'),
  updateCommunityGroup
);

router.delete(
  '/:communityId/groups/:groupId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_GROUPS'),
  deleteCommunityGroup
);

// Личные настройки уведомлений участника по этому сообществу.
// Без проверки прав: человек правит только свою строку.
router.get('/:communityId/notifications', verifyToken, getCommunityNotificationSettings);
router.put('/:communityId/notifications', verifyToken, updateCommunityNotificationSettings);

// ==========================================
// 📅 СОБЫТИЯ СООБЩЕСТВА
//
// Создание и правка живут здесь, потому что контекст сообщества стоит прямо в
// пути. Отметки и резервная очередь вынесены в /api/community-events — там
// контекст приходит в теле запроса, как у командных и клубных событий.
// ==========================================

// Создание тренировки или солянки. Категория сообщества и тип события должны
// совпадать — проверка внутри контроллера.
router.post(
  '/:communityId/events',
  verifyToken,
  requireCommunityPermission('COMMUNITY_MANAGE_EVENTS'),
  createCommunityEvent
);

// Расписание: дата, время, арена или ручная локация, название, тип тренировки
router.put(
  '/:communityId/events/:eventType/:eventId/schedule',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_EDIT_SCHEDULE'),
  updateCommunityEventSchedule
);

// Взнос за участие
router.put(
  '/:communityId/events/:eventType/:eventId/finances',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_EDIT_FINANCES'),
  updateCommunityEventFinances
);

// Лимиты состава и адресация по тренировочным группам
router.put(
  '/:communityId/events/:eventType/:eventId/limits',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_EDIT_LIMITS'),
  updateCommunityEventLimits
);

// Публикация события: показать участникам раньше срока или открыть вручную
router.post(
  '/:communityId/events/:eventType/:eventId/publish',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_PUBLISH'),
  publishCommunityEventNow
);

// Удаление события — отметки, план и составы уходят каскадом
router.delete(
  '/:communityId/events/:eventType/:eventId',
  verifyToken,
  requireCommunityPermission('COMMUNITY_EVENT_DELETE'),
  deleteCommunityEvent
);

export default router;
