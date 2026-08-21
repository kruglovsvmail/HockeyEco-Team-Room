import express from 'express';
import {
  getMyDrills,
  getMyDrillTags,
  getDrill,
  createDrill,
  updateDrill,
  deleteDrill,
  searchCoachByPhone,
  shareDrill,
} from '../controllers/DrillController.js';
import { verifyToken, requireCoach } from '../middleware/auth.js';

const router = express.Router();

// Тренерская. Раздел личный: ни teamId, ни clubId сюда не передаются, контекст —
// сам пользователь. Поэтому вместо матрицы прав стоит requireCoach: тренерская роль
// хотя бы в одном месте системы. Владельца строки дополнительно сторожит каждый
// запрос в контроллере (author_user_id = req.user.id).
router.use(verifyToken, requireCoach);

// Поиск получателя при «поделиться». Объявлен до /:drillId, иначе express примет
// «coaches» за идентификатор упражнения.
router.get('/coaches/search', searchCoachByPhone);

// Свои теги для автоподсказки в форме упражнения
router.get('/tags', getMyDrillTags);

// Библиотека: список карточек (без сцены доски) и полное упражнение
router.get('/', getMyDrills);
router.get('/:drillId', getDrill);

router.post('/', createDrill);
router.put('/:drillId', updateDrill);
router.delete('/:drillId', deleteDrill);

// Подарить копию упражнения другому тренеру
router.post('/:drillId/share', shareDrill);

export default router;
