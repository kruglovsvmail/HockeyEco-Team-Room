import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getPlayerProfile } from '../controllers/playerController.js';

const router = Router();

// Профиль игрока (сезоны/статистика/история матчей) — для правой панели
// PlayerProfilePanel в мобильном приложении. Доступен любому залогиненному
// пользователю, без привязки к конкретной команде (те же данные, что и
// в открытой турнирной статистике).
router.get('/:playerId/profile', verifyToken, getPlayerProfile);

export default router;
