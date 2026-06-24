import express from 'express';
import { 
  getMatchStaff, 
  getMatchH2H,
  getMatchStats,
  getMatchProtocol,
  updateMatchMedia,
  updateMatchSchedule,
  updateMatchFinances,
  deleteMatch
} from '../controllers/MatchController.js';
import { 
  toggleMatchAttendance, 
  getMatchAttendance, 
  getAvailableRoster, 
  toggleMatchAttendanceTag,
  confirmFriendlyMatch,
  cancelFriendlyMatch 
} from '../controllers/MatchAttendanceController.js';
import { getMatchLines, saveMatchLines, submitMatchRoster, updateLinePlayer } from '../controllers/MatchLinesController.js';
import {
  getMatchRosters,
  addMatchEvent,
  updateMatchEvent,
  deleteMatchEvent,
  getGoalieLog,
  saveGoalieLog,
  getGoalieShots,
  saveGoalieShots,
  saveRegulation,
  publishMatchResults
} from '../controllers/MatchResultsController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';

const router = express.Router();

// ==========================================
// 📋 ИНФОРМАЦИЯ О МАТЧЕ
// ==========================================

// Получить судейскую бригаду конкретного матча (с аватарами из users)
router.get('/:eventId/staff', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchStaff);

// Получить историю очных встреч (Head-to-Head) между командами
router.get('/:eventId/h2h', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchH2H);

// Получить сводную статистику матча (броски, реализация, большинство/меньшинство, штрафы)
router.get('/:eventId/stats', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchStats);

// Получить хронологию событий матча (голы, штрафы, буллиты) по периодам
router.get('/:eventId/protocol', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchProtocol);

// ==========================================
// 👥 ЯВКА НА МАТЧ
// ==========================================

// Получить список отметившихся на конкретный матч
router.get('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchAttendance);

// Получить умный список доступных игроков команды с учетом регламентов и дисквалификаций
router.get('/:eventId/available-roster', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getAvailableRoster);

// Переключить статус присутствия на матче (внутри контроллера разделены self-attendance и match_attendance_manage)
router.post('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), toggleMatchAttendance);

// Изменить финансовую пометку игрока (₽) без удаления его из списка
router.put('/:eventId/attendance-tag', verifyToken, requireTeamPermission('MATCH_ATTENDANCE_MANAGE'), toggleMatchAttendanceTag);

// ==========================================
// 🤝 ТОВАРИЩЕСКИЕ МАТЧИ (FRIENDLY_PWA)
// ==========================================

// Подтвердить товарищеский матч friendly_pwa вызываемой стороной
router.post('/:eventId/confirm', verifyToken, confirmFriendlyMatch);

// Отменить вызов или отклонить товарищеский матч friendly_pwa
router.post('/:eventId/cancel', verifyToken, cancelFriendlyMatch);

// ==========================================
// 🏒 ЗВЕНЬЯ И РАССТАНОВКА (ПЯТЁРКИ)
// ==========================================

// Получить опубликованные пятерки на матч (черновик)
router.get('/:eventId/lines', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchLines);

// Сохранить черновик пятерок на матч (чистая тактика тренера, разрешено без подписки)
router.post('/:eventId/lines', verifyToken, requireTeamPermission('MATCH_LINES_MANAGE'), saveMatchLines);

// Обновить параметры конкретного игрока в черновике (номер, C, A) — доступно руководителям по подписке
router.put('/:eventId/line-player', verifyToken, requireTeamPermission('MATCH_LINES_EDIT_PLAYER_PARAMS'), updateLinePlayer);

// Отправить официальную электронную заявку состава в лигу
router.post('/:eventId/submit-roster', verifyToken, requireTeamPermission('MATCH_ROSTER_SUBMIT'), submitMatchRoster);

// ==========================================
// ⚙️ РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ ДЕТАЛЕЙ МАТЧА
// ==========================================

// Обновить медиа-ссылки трансляций матча (Блок 1 - YouTube, VK Видео)
router.put('/:eventId/media', verifyToken, requireTeamPermission('MATCH_EDIT_MEDIA'), updateMatchMedia);

// Обновить параметры расписания (Блок 2 - Дата, время, локация/арена)
router.put('/:eventId/schedule', verifyToken, requireTeamPermission('MATCH_EDIT_SCHEDULE'), updateMatchSchedule);

// Обновить параметры игровой формы и финансового взноса (Блок 3 - Комплекты джерси, стоимость для игрока)
router.put('/:eventId/finances', verifyToken, requireTeamPermission('MATCH_EDIT_FINANCES'), updateMatchFinances);

// Полное физическое удаление карточки матча из календаря
router.delete('/:eventId', verifyToken, requireTeamPermission('MATCH_DELETE'), deleteMatch);

// ==========================================
// 📊 ЗАПОЛНЕНИЕ РЕЗУЛЬТАТОВ НЕОФИЦИАЛЬНОГО МАТЧА
// (доступно только команде-инициатору после прохода game_date)
// ==========================================

// Заявки на матч (обе команды) для рендера выбора игроков в EditResultMatch / EditGoalieStatMatch
router.get('/:eventId/results/rosters', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchRosters);

// Добавить событие в протокол (гол / штраф / нереализованный буллит) + +/-
router.post('/:eventId/results/events', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), addMatchEvent);

// Обновить существующее событие (полная замена + переписывание +/-)
router.put('/:eventId/results/events/:rowId', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), updateMatchEvent);

// Удалить событие из протокола (game_plus_minus уходит каскадом)
router.delete('/:eventId/results/events/:rowId', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), deleteMatchEvent);

// Журнал смен вратарей: чтение для просмотра, bulk-PUT для редактирования
router.get('/:eventId/results/goalie-log', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getGoalieLog);
router.put('/:eventId/results/goalie-log', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), saveGoalieLog);

// Броски в створ вратарю по периодам: чтение и bulk-PUT.
// shots_count = все броски в створ на этого вратаря (отражённые вычисляются на лету).
router.get('/:eventId/results/goalie-shots', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getGoalieShots);
router.put('/:eventId/results/goalie-shots', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), saveGoalieShots);

// Регламент матча (периоды / длина периода / ОТ) с автопересчётом всех событий
router.put('/:eventId/results/regulation', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), saveRegulation);

// Публикация результатов — статус матча переводится в finished
router.post('/:eventId/results/publish', verifyToken, requireTeamPermission('MATCH_FILL_RESULTS'), publishMatchResults);

export default router;