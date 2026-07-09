import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

const BUCKET = process.env.S3_BUCKET || 'hockeyeco-uploads';

// Загрузка/перезапись картинки состава в S3 по детерминированному ключу.
// kind = 'game' (матч) | 'training' (тренировка). Имя файла строится из teamId + eventId,
// поэтому URL вычисляется на клиенте без хранения в БД.
const uploadFormation = async (req, res, kind) => {
  try {
    const { eventId } = req.params;
    // teamId приходит в query (нужен проверке прав ДО multer); body — фолбэк
    const teamId = req.query.teamId || req.body.teamId;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Файл изображения не предоставлен' });
    }
    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Не указан teamId' });
    }

    const key = `roster-formation/team-${teamId}-formation_${kind}-${eventId}.png`;

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
