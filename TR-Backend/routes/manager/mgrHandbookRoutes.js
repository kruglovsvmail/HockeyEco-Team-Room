import express from 'express';
import multer from 'multer';
import { verifyToken, requireTeamPermission, requireEventPermission } from '../../middleware/auth.js';
import {
  getArenas,
  getPwaTeams,
  getExternalOpponents,
  createExternalOpponent,
  getExternalTournaments,
  getExternalTournamentOpponents,
  getOpponentsExtended,
  updateExternalOpponent,
  deleteExternalOpponent,
  getTournamentsExtended,
  createExternalTournament,
  updateExternalTournament,
  deleteExternalTournament,
  getTournamentRosterMap,
  saveTournamentRoster,
  uploadExternalOpponentLogo,
  uploadExternalTournamentLogo
} from '../../controllers/manager/MgrHandbookController.js';

const router = express.Router();

// Логотипы справочника: только картинки, до 10 МБ — дальше всё равно ужимается до 400×400.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('INVALID_FILE_TYPE'), false);
  },
});
// multer кидает ошибку до контроллера — без перехватчика клиент получил бы голый 500
const withLogoFile = (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Файл слишком большой (максимум 10 МБ)'
      : 'Допустимы только изображения JPG, PNG или WebP';
    return res.status(400).json({ success: false, error: message });
  });
};

// ==========================================
// 🎯 Контур планирования событий (MGR_CREATE_EVENT)
// ==========================================
// Список арен доступен и при создании события, и при редактировании расписания любого
// события — включая клубные: там контекст приходит как clubId, и проверка уходит в клуб.
router.get('/arenas', verifyToken, requireEventPermission([
  'MGR_CREATE_EVENT',
  'MATCH_EDIT_SCHEDULE',
  'TRAINING_EDIT_SCHEDULE',
  'MEETING_EDIT_SCHEDULE',
], 'CLUB_MANAGE_EVENTS', 'COMMUNITY_MANAGE_EVENTS'), getArenas);
router.get('/pwa-teams', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getPwaTeams);

router.get('/external-opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalOpponents);
router.post('/external-opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), createExternalOpponent);

router.get('/external-tournaments', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalTournaments);
router.get('/external-tournaments/:tournamentId/opponents', verifyToken, requireTeamPermission('MGR_CREATE_EVENT'), getExternalTournamentOpponents);

// ==========================================
// 📂 Контур администрирования справочников (MGR_HANDBOOKS)
// ==========================================

// Управление внешними соперниками (Блок Вкладки А)
router.get('/opponents-extended', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getOpponentsExtended);
router.put('/external-opponents/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), updateExternalOpponent);
router.delete('/external-opponents/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), deleteExternalOpponent);
// Логотип соперника: multipart (поле logo) с teamId в query — multer разбирает тело
// уже после проверки прав, поэтому teamId для middleware берётся из адреса.
// Удаления нет — логотип только заменяется новым. Права те же, что у создания
// соперника: его заводят и из справочника (MGR_HANDBOOKS), и на лету из формы
// матча (MGR_CREATE_EVENT) — и там логотип грузится сразу после создания.
router.post('/external-opponents/:id/logo', verifyToken, requireTeamPermission(['MGR_HANDBOOKS', 'MGR_CREATE_EVENT']), withLogoFile, uploadExternalOpponentLogo);

// Управление внешними турнирами (Блок Вкладки Б)
router.get('/tournaments-extended', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getTournamentsExtended);
router.post('/external-tournaments', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), createExternalTournament);
router.put('/external-tournaments/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), updateExternalTournament);
router.delete('/external-tournaments/:id', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), deleteExternalTournament);
router.post('/external-tournaments/:id/logo', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), withLogoFile, uploadExternalTournamentLogo);

// Распределение ростера участников лиги (Блок Шторки В)
router.get('/external-tournaments/:tournamentId/roster-map', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), getTournamentRosterMap);
router.post('/external-tournaments/:tournamentId/roster-save', verifyToken, requireTeamPermission('MGR_HANDBOOKS'), saveTournamentRoster);

export default router;