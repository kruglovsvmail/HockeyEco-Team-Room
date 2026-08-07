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
import { verifyToken, requireEventPermission } from '../middleware/auth.js';

const router = express.Router();

// Все ручки ниже обслуживают оба типа собраний. requireEventPermission смотрит на
// eventType: team_meeting проверяется по команде, club_meeting — по клубу.

// ==========================================
// 👥 ЯВКА НА СОБРАНИЕ
// ==========================================

// Получить список отметившихся на собрание (team_meeting / club_meeting)
router.get('/:eventId/attendance', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), getMeetingAttendance);

// Получить доступный состав для шторки добавления участников
router.get('/:eventId/roster', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), getMeetingRoster);

// Переключить статус присутствия на собрании (внутри контроллера разделены self-attendance и meeting_attendance_manage)
router.post('/:eventId/attendance', verifyToken, requireEventPermission('INTERNAL_VIEW', 'INTERNAL_VIEW'), toggleMeetingAttendance);

// Изменить финансовую пометку участника (₽) на собрании
router.put('/:eventId/attendance-tag', verifyToken, requireEventPermission('MEETING_ATTENDANCE_MANAGE', 'CLUB_EVENT_ATTENDANCE_MANAGE'), toggleMeetingAttendanceTag);

// ==========================================
// ⚙️ РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ СОБРАНИЯ
// ==========================================

// Обновить расписание собрания (дата, время, локация/арена)
router.put('/:eventId/schedule', verifyToken, requireEventPermission('MEETING_EDIT_SCHEDULE', 'CLUB_MANAGE_EVENTS'), updateMeetingSchedule);

// Обновить стоимость участия (взнос)
router.put('/:eventId/finances', verifyToken, requireEventPermission('MEETING_EDIT_FINANCES', 'CLUB_MANAGE_EVENTS'), updateMeetingFinances);

// Полное физическое удаление собрания из календаря
router.delete('/:eventId', verifyToken, requireEventPermission('MEETING_DELETE', 'CLUB_MANAGE_EVENTS'), deleteMeeting);

export default router;
