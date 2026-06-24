import express from 'express';
import {
  toggleMeetingAttendance,
  getMeetingAttendance,
  toggleMeetingAttendanceTag,
  getMeetingRoster,
} from '../controllers/MeetingAttendanceController.js';
import {
  updateMeetingSchedule,
  updateMeetingFinances,
  deleteMeeting,
} from '../controllers/MeetingController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';

const router = express.Router();

// ==========================================
// 👥 ЯВКА НА СОБРАНИЕ
// ==========================================

// Получить список отметившихся на собрание (team_meeting / club_meeting)
router.get('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMeetingAttendance);

// Получить доступный состав для шторки добавления участников
router.get('/:eventId/roster', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMeetingRoster);

// Переключить статус присутствия на собрании (внутри контроллера разделены self-attendance и meeting_attendance_manage)
router.post('/:eventId/attendance', verifyToken, requireTeamPermission('INTERNAL_VIEW'), toggleMeetingAttendance);

// Изменить финансовую пометку участника (₽) на собрании
router.put('/:eventId/attendance-tag', verifyToken, requireTeamPermission('MEETING_ATTENDANCE_MANAGE'), toggleMeetingAttendanceTag);

// ==========================================
// ⚙️ РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ СОБРАНИЯ
// ==========================================

// Обновить расписание собрания (дата, время, локация/арена)
router.put('/:eventId/schedule', verifyToken, requireTeamPermission('MEETING_EDIT_SCHEDULE'), updateMeetingSchedule);

// Обновить стоимость участия (взнос)
router.put('/:eventId/finances', verifyToken, requireTeamPermission('MEETING_EDIT_FINANCES'), updateMeetingFinances);

// Полное физическое удаление собрания из календаря
router.delete('/:eventId', verifyToken, requireTeamPermission('MEETING_DELETE'), deleteMeeting);

export default router;
