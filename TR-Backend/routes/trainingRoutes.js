import express from 'express';
import {
  toggleTrainingAttendance,
  getTrainingAttendance,
  toggleTrainingAttendanceTag,
  getTrainingRoster,
} from '../controllers/TrainingAttendanceController.js';
import {
  updateTrainingSchedule,
  updateTrainingFinances,
  updateTrainingType,
  deleteTraining,
} from '../controllers/TrainingController.js';
import { getTrainingLines, saveTrainingLines } from '../controllers/TrainingLinesController.js';
import { uploadTrainingFormationImage } from '../controllers/FormationImageController.js';
import upload from '../config/upload.js';
import { verifyToken, requireEventPermission } from '../middleware/auth.js';

const router = express.Router();

// Все ручки ниже обслуживают оба типа тренировок. requireEventPermission смотрит на
// eventType: team_training проверяется по команде, club_training — по клубу.

// ==========================================
// 👥 ЯВКА НА ТРЕНИРОВКУ
// ==========================================

// Получить список отметившихся на тренировку (team_training / club_training)
router.get('/:eventId/attendance', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), getTrainingAttendance);

// Получить доступный состав для шторки добавления участников
// team_training → состав команды, club_training → общая база клуба
router.get('/:eventId/roster', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), getTrainingRoster);

// Переключить статус присутствия на тренировке (self-attendance или управление руководителем)
router.post('/:eventId/attendance', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), toggleTrainingAttendance);

// Изменить финансовую пометку участника (₽) на тренировке
router.put('/:eventId/attendance-tag', verifyToken, requireEventPermission('TRAINING_ATTENDANCE_MANAGE', 'CLUB_EVENT_ATTENDANCE_MANAGE'), toggleTrainingAttendanceTag);

// ==========================================
// ⚙️ РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ ТРЕНИРОВКИ
// ==========================================

// Обновить расписание тренировки (дата, время, локация/арена)
router.put('/:eventId/schedule', verifyToken, requireEventPermission('TRAINING_EDIT_SCHEDULE', 'CLUB_MANAGE_EVENTS'), updateTrainingSchedule);

// Обновить стоимость участия (взнос с игрока)
router.put('/:eventId/finances', verifyToken, requireEventPermission('TRAINING_EDIT_FINANCES', 'CLUB_MANAGE_EVENTS'), updateTrainingFinances);

// Обновить тип тренировки (Бросковая, ОФП, Катание...). Право то же, что у расписания:
// тип — такой же атрибут самой тренировки, отдельного разрешения под него не заводим.
router.put('/:eventId/type', verifyToken, requireEventPermission('TRAINING_EDIT_SCHEDULE', 'CLUB_MANAGE_EVENTS'), updateTrainingType);

// Полное физическое удаление тренировки из календаря
router.delete('/:eventId', verifyToken, requireEventPermission('TRAINING_DELETE', 'CLUB_MANAGE_EVENTS'), deleteTraining);

// ==========================================
// 🏒 РАССТАНОВКА ИГРОКОВ НА ТРЕНИРОВКУ
// На клубной тренировке расстановку ставит только тренер клуба
// ==========================================

router.get('/:eventId/lines', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), getTrainingLines);
router.post('/:eventId/lines', verifyToken, requireEventPermission('TRAINING_LINES_MANAGE', 'CLUB_TRAINING_LINES_MANAGE'), saveTrainingLines);

// Загрузить/перезаписать картинку расстановки в S3 (генерируется на клиенте после сохранения).
// eventType и контекст приходят в query — тело здесь multipart и до multer недоступно.
router.post('/:eventId/lines/formation-image', verifyToken, requireEventPermission('TRAINING_LINES_MANAGE', 'CLUB_TRAINING_LINES_MANAGE'), upload.single('image'), uploadTrainingFormationImage);

export default router;
