import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import pool from '../config/db.js';
import { getEventScope } from '../utils/checkPermission.js';

const BUCKET = process.env.S3_BUCKET || 'hockeyeco-uploads';

// Чья картинка перезаписывается. Имя файла строится из владельца расстановки, и этим
// владельцем обязан быть тот, в чьём контексте гейт проверил права, а событие — его
// событием. Раньше владелец брался из teamId/clubId запроса как есть: тренер команды,
// приславший вместе со своим teamId чужой clubId, или штаб сообщества с чужим teamId
// перезаписывали публичную картинку чужой расстановки.
//
// Матч принадлежит обеим своим командам, тренировка — своей команде или клубу. Для
// тренировок сообществ имени файла не заведено — такой запрос, как и раньше, получает 400.
const OWNERS = {
  game: {
    sql: 'SELECT id FROM games WHERE id = $1 AND $2::int IN (home_team_id, away_team_id)',
    scopeKey: 'teamId',
    prefix: 'team',
  },
  team_training: {
    sql: 'SELECT id FROM team_training WHERE id = $1 AND team_id = $2',
    scopeKey: 'teamId',
    prefix: 'team',
  },
  club_training: {
    sql: 'SELECT id FROM club_training WHERE id = $1 AND club_id = $2',
    scopeKey: 'clubId',
    prefix: 'club',
  },
};

// Загрузка/перезапись картинки состава в S3 по детерминированному ключу.
// kind = 'game' (матч) | 'training' (тренировка). Имя файла строится из владельца
// расстановки (команда или клуб) + eventId, поэтому URL вычисляется на клиенте
// без хранения в БД.
const uploadFormation = async (req, res, kind) => {
  try {
    const { eventId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Файл изображения не предоставлен' });
    }

    // Контекст — только из query. Гейт отрабатывает до multer, когда тела ещё нет, и
    // проверял ровно query; поля формы приходят позже, и подложить в них можно что угодно.
    const scope = getEventScope({ query: req.query });
    const owner = OWNERS[kind === 'game' ? 'game' : scope.eventType];
    const ownerId = owner && scope[owner.scopeKey];

    if (!ownerId) {
      return res.status(400).json({ success: false, error: 'Не указан teamId или clubId' });
    }

    const { rows } = await pool.query(owner.sql, [eventId, ownerId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }

    const key = `roster-formation/${owner.prefix}-${ownerId}-formation_${kind}-${rows[0].id}.png`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'image/png',
      ACL: 'public-read',
      // Файл перезаписывается по тому же ключу — запрещаем кэширование, чтобы все видели свежую версию
      CacheControl: 'no-cache, max-age=0',
    }));

    return res.json({ success: true, url: `/${key}` });
  } catch (err) {
    console.error('[Formation Image Upload Error]:', err);
    return res.status(500).json({ success: false, error: 'Не удалось загрузить изображение состава' });
  }
};

export const uploadMatchFormationImage = (req, res) => uploadFormation(req, res, 'game');
export const uploadTrainingFormationImage = (req, res) => uploadFormation(req, res, 'training');
