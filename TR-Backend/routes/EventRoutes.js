import express from 'express';
import { getEvents } from '../controllers/EventInfoController.js';
import { 
  toggleEventAttendance, 
  getEventAttendance, 
  getAvailableRoster, 
  toggleEventAttendanceTag,
  confirmFriendlyMatch,
  cancelFriendlyMatch 
} from '../controllers/EventAttendanceController.js';
import { getMatchLines, saveMatchLines, submitMatchRoster, updateLinePlayer } from '../controllers/EventLinesController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';

const router = express.Router();

// Получить все события для календаря (внутри контроллера зашито автоматическое скрытие тумблеров по подписке)
router.get('/', verifyToken, getEvents);

// Получить список отметившихся на конкретное событие
router.get('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getEventAttendance);

// Получить умный список доступных игроков команды с учетом регламентов и дисквалификаций
router.get('/:eventId/available-roster', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getAvailableRoster);

// Переключить статус присутствия на событии (внутри контроллера разделены self-attendance и attendance_manage)
router.post('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), toggleEventAttendance);

// Изменить финансовую пометку игрока (₽) без удаления его из списка
router.put('/:eventId/attendance-tag', verifyToken, requireTeamPermission('ATTENDANCE_MANAGE'), toggleEventAttendanceTag);

// Подтвердить товарищеский матч friendly_pwa вызываемой стороной
router.post('/:eventId/confirm', verifyToken, requireTeamPermission('MATCH_CONFIRM_CANCEL'), confirmFriendlyMatch);

// Отменить вызов или отклонить товарищеский матч friendly_pwa
router.post('/:eventId/cancel', verifyToken, requireTeamPermission('MATCH_CONFIRM_CANCEL'), cancelFriendlyMatch);

// Получить опубликованные пятерки на матч (черновик)
router.get('/:eventId/lines', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchLines);

// Сохранить черновик пятерок на матч (чистая тактика тренера, разрешено без подписки)
router.post('/:eventId/lines', verifyToken, requireTeamPermission('LINES_MANAGE'), saveMatchLines);

// Обновить параметры конкретного игрока в черновике (номер, C, A) — доступно руководителям по подписке
router.put('/:eventId/line-player', verifyToken, requireTeamPermission('LINES_EDIT_PLAYER_PARAMS'), updateLinePlayer);

// Отправить официальную электронную заявку состава в лигу
router.post('/:eventId/submit-roster', verifyToken, requireTeamPermission('ROSTER_SUBMIT'), submitMatchRoster);

export default router;