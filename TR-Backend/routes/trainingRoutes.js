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
  deleteTraining,
} from '../controllers/TrainingController.js';
import { getTrainingLines, saveTrainingLines } from '../controllers/TrainingLinesController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';

const router = express.Router();

// ==========================================
// 👥 ЯВКА НА ТРЕНИРОВКУ
// ==========================================

// Получить список отметившихся на тренировку (team_training / club_training)
router.get('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getTrainingAttendance);

// Получить доступный состав для шторки добавления участников
// team_training → состав команды, club_training → состав всех команд клуба (без дублей)
router.get('/:eventId/roster', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getTrainingRoster);

// Переключить статус присутствия на тренировке (self-attendance или TRAINING_ATTENDANCE_MANAGE)
router.post('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), toggleTrainingAttendance);

// Изменить финансовую пометку участника (₽) на тренировке
router.put('/:eventId/attendance-tag', verifyToken, requireTeamPermission('TRAINING_ATTENDANCE_MANAGE'), toggleTrainingAttendanceTag);

// ==========================================
// ⚙️ РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ ТРЕНИРОВКИ
// ==========================================

// Обновить расписание тренировки (дата, время, локация/арена)
router.put('/:eventId/schedule', verifyToken, requireTeamPermission('TRAINING_EDIT_SCHEDULE'), updateTrainingSchedule);

// Обновить стоимость участия (взнос с игрока)
router.put('/:eventId/finances', verifyToken, requireTeamPermission('TRAINING_EDIT_FINANCES'), updateTrainingFinances);

// Полное физическое удаление тренировки из календаря
router.delete('/:eventId', verifyToken, requireTeamPermission('TRAINING_DELETE'), deleteTraining);

// ==========================================
// 🏒 РАССТАНОВКА ИГРОКОВ НА ТРЕНИРОВКУ (TODO)
// ==========================================

router.get('/:eventId/lines', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getTrainingLines);
router.post('/:eventId/lines', verifyToken, requireTeamPermission('TRAINING_LINES_MANAGE'), saveTrainingLines);

export default router;