import { Router } from 'express';
import matchController from '../controllers/MatchController.js';
import { getMatchLines, saveMatchLines, submitMatchRoster, updateLinePlayer } from '../controllers/MatchLinesController.js';
import { verifyToken, requireTeamPermission } from '../middleware/auth.js';

const router = Router();

// ── ДЕТАЛИЗАЦИЯ МАТЧА ────────────────────────────────────────────────────────
// Таймлайн событий + командная статистика + броски по вратарям (универсально для любого типа матча)
router.get('/:eventId/details', verifyToken, matchController.getGameDetails.bind(matchController));

// Судейская бригада матча
router.get('/:eventId/staff', verifyToken, requireTeamPermission('INTERNAL_VIEW'), matchController.getMatchStaff.bind(matchController));

// История очных встреч H2H
router.get('/:eventId/h2h', verifyToken, requireTeamPermission('INTERNAL_VIEW'), matchController.getMatchH2H.bind(matchController));

// ── ПЯТЁРКИ И СОСТАВ ─────────────────────────────────────────────────────────
// Получить опубликованные пятёрки на матч
router.get('/:eventId/lines', verifyToken, requireTeamPermission('INTERNAL_VIEW'), getMatchLines);

// Сохранить черновик пятёрок
router.post('/:eventId/lines', verifyToken, requireTeamPermission('LINES_MANAGE'), saveMatchLines);

// Обновить параметры игрока в черновике (номер, C, A)
router.put('/:eventId/line-player', verifyToken, requireTeamPermission('LINES_EDIT_PLAYER_PARAMS'), updateLinePlayer);

// Отправить официальную заявку состава в лигу
router.post('/:eventId/submit-roster', verifyToken, requireTeamPermission('ROSTER_SUBMIT'), submitMatchRoster);

// ── РЕДАКТИРОВАНИЕ МАТЧА ─────────────────────────────────────────────────────
// Медиа-ссылки (YouTube, VK Видео)
router.put('/:eventId/media', verifyToken, requireTeamPermission('MATCH_EDIT_MEDIA'), matchController.updateMatchMedia.bind(matchController));

// Дата, время, локация / арена
router.put('/:eventId/schedule', verifyToken, requireTeamPermission('MATCH_EDIT_SCHEDULE'), matchController.updateMatchSchedule.bind(matchController));

// Форма и игровой взнос
router.put('/:eventId/finances', verifyToken, requireTeamPermission('MATCH_EDIT_FINANCES'), matchController.updateMatchFinances.bind(matchController));

// Удаление матча
router.delete('/:eventId', verifyToken, requireTeamPermission('MATCH_DELETE'), matchController.deleteMatch.bind(matchController));

export default router;