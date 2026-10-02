import { getTeamIdFromRequest, getEventScope } from '../utils/checkPermission.js';
import { getMatchFormationImage, getTrainingFormationImage } from '../services/formationImageService.js';

// Картинка состава (матч) и расстановки (тренировка, солянка). Раньше её снимал
// телефон сохранившего и заливал сюда же, в S3; теперь собирает сервер
// (services/formationImageService.js), а приложение только забирает готовую.
//
// Отдаём байтами, а не ссылкой на S3: картинка собирается из закрытых данных
// команды и в бакете лежит без публичного доступа. ETag — отпечаток данных
// карточки: браузер переспрашивает с If-None-Match и, пока состав не менялся,
// получает 304 без тела — картинка не гоняется заново при каждом открытии события.

const knownHash = (req) => {
  const header = req.get('if-none-match');
  if (!header) return null;
  return header.replace(/^W\//, '').replace(/"/g, '').trim() || null;
};

const sendFormationImage = (res, result) => {
  // Расстановки нет (или событие не этого владельца) — 204, а не 404: событие без
  // состава — обычное дело, и красная строка в консоли на каждое открытие ни к чему
  if (!result) return res.status(204).end();
  res.set('ETag', `"${result.hash}"`);
  res.set('Cache-Control', 'private, no-cache');
  if (result.notModified) return res.status(304).end();
  return res.type('image/jpeg').send(result.buffer);
};

// Чужой матч (команда из запроса в нём не играет) выходит «не найденным» — это
// проверяет сам сборщик: он ищет матч только среди матчей команды.
export const getMatchFormationImageHandler = async (req, res) => {
  try {
    const result = await getMatchFormationImage(req.params.eventId, getTeamIdFromRequest(req), knownHash(req));
    return sendFormationImage(res, result);
  } catch (err) {
    console.error('[Formation Image] матч:', err);
    return res.status(500).json({ success: false, error: 'Не удалось собрать картинку состава' });
  }
};

// Контекст (команда, клуб, сообщество) — тот же, что проверил гейт; событие
// сборщик ищет только у этого владельца.
export const getTrainingFormationImageHandler = async (req, res) => {
  try {
    const result = await getTrainingFormationImage(req.params.eventId, getEventScope(req), knownHash(req));
    return sendFormationImage(res, result);
  } catch (err) {
    console.error('[Formation Image] тренировка:', err);
    return res.status(500).json({ success: false, error: 'Не удалось собрать картинку расстановки' });
  }
};
