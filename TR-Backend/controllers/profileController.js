import bcrypt from 'bcrypt';
import pool from '../config/db.js'; // Используем единый pool подключения из вашего конфига
import s3 from '../config/s3.js';   // Используем ваш рабочий конфигурированный клиент S3

/**
 * Вспомогательный метод загрузки в S3-хранилище, полностью скопированный из TeamController.js
 */
const uploadBufferToS3 = async (file, bucketKey) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
    Key: bucketKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  if (s3 && typeof s3.send === 'function') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    return s3.send(new PutObjectCommand(params));
  }
  if (s3 && typeof s3.putObject === 'function') {
    const request = s3.putObject(params);
    return typeof request.promise === 'function' ? request.promise() : request;
  }
  throw new Error('S3 Client не настроен на сервере');
};

class ProfileController {
  
  // Получение актуальных данных текущего пользователя
  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const query = `
        SELECT id, email, first_name, last_name, middle_name, 
               birth_date, phone, gender, height, weight, grip, avatar_url
        FROM users
        WHERE id = $1 LIMIT 1
      `;
      const { rows } = await pool.query(query, [userId]);

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }

      return res.json({ success: true, user: rows[0] });
    } catch (err) {
      console.error('Ошибка в ProfileController.getProfile:', err);
      return res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
    }
  }

  // Обновление текстовых полей и антропометрии (С поддержкой РОСТА, ВЕСА и ХВАТА)
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      
      // ИСПРАВЛЕНО: Добавлено извлечение поля height
      const { email, phone, first_name, last_name, middle_name, birth_date, height, weight, grip } = req.body;

      if (email) {
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, userId]);
        if (emailCheck.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'Этот Email-адрес уже занят другим аккаунтом' });
        }
      }

      // ИСПРАВЛЕНО: В тело запроса и массив аргументов добавлен рост (height)
      const query = `
        UPDATE users
        SET email = COALESCE($1, email),
            phone = COALESCE($2, phone),
            first_name = COALESCE($3, first_name),
            last_name = COALESCE($4, last_name),
            middle_name = COALESCE($5, middle_name),
            birth_date = $6,
            height = $7,
            weight = $8,
            grip = COALESCE($9, grip),
            updated_at = NOW()
        WHERE id = $10
      `;

      await pool.query(query, [
        email, 
        phone, 
        first_name, 
        last_name, 
        middle_name, 
        birth_date, 
        height, // $7
        weight, // $8
        grip,   // $9
        userId  // $10
      ]);

      return res.json({ success: true, message: 'Профиль успешно обновлен' });
    } catch (err) {
      console.error('Ошибка в ProfileController.updateProfile:', err);
      return res.status(500).json({ success: false, error: 'Не удалось сохранить изменения' });
    }
  }

  // Загрузка аватарки напрямую в облачное S3-хранилище через проверенный метод из TeamController
  async updateAvatar(req, res) {
    try {
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Файл изображения не передан' });
      }

      const s3Key = `uploads/users_${userId}_avatar.webp`;
      const dbPath = `/uploads/users_${userId}_avatar.webp`;

      await uploadBufferToS3(req.file, s3Key);

      await pool.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [dbPath, userId]);

      return res.json({ success: true, avatar_url: dbPath });
    } catch (err) {
      console.error('Ошибка в ProfileController.updateAvatar:', err);
      return res.status(500).json({ success: false, error: 'Ошибка сохранения файла в облачном хранилище S3' });
    }
  }

  // Удаление аватарки из S3 и обнуление поля в PostgreSQL
  async deleteAvatar(req, res) {
    try {
      const userId = req.user.id;
      const s3Key = `uploads/users_${userId}_avatar.webp`;

      try {
        if (s3 && typeof s3.send === 'function') {
          const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
            Key: s3Key
          }));
        } else if (s3 && typeof s3.deleteObject === 'function') {
          await s3.deleteObject({
            Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
            Key: s3Key
          }).promise();
        }
      } catch (s3Err) {
        console.warn('Объект уже отсутствовал в S3 корзине:', s3Err.message);
      }

      await pool.query('UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1', [userId]);
      return res.json({ success: true, message: 'Аватар успешно удален' });
    } catch (err) {
      console.error('Ошибка в ProfileController.deleteAvatar:', err);
      return res.status(500).json({ success: false, error: 'Ошибка удаления файла' });
    }
  }

  // Безопасное изменение пароля через сверку старого хеша
  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { oldPassword, newPassword } = req.body;

      const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Аккаунт не найден' });
      }

      const currentHash = userRes.rows[0].password_hash;

      const isMatch = await bcrypt.compare(oldPassword, currentHash);
      if (!isMatch) {
        return res.status(400).json({ success: false, error: 'Старый пароль введен неверно' });
      }

      const salt = await bcrypt.genSalt(12);
      const newHash = await bcrypt.hash(newPassword, salt);

      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

      return res.json({ success: true, message: 'Пароль успешно изменен' });
    } catch (err) {
      console.error('Ошибка в ProfileController.changePassword:', err);
      return res.status(500).json({ success: false, error: 'Ошибка при изменении пароля' });
    }
  }

  // Установка судейского и капитанского ПИН-кода подписи
  async setSignPin(req, res) {
    try {
      const userId = req.user.id;
      const { pinCode } = req.body;

      if (!pinCode || pinCode.length !== 4) {
        return res.status(400).json({ success: false, error: 'Неверный формат ПИН-кода' });
      }

      const salt = await bcrypt.genSalt(10);
      const pinHash = await bcrypt.hash(pinCode, salt);

      await pool.query('UPDATE users SET sign_pin_hash = $1, updated_at = NOW() WHERE id = $2', [pinHash, userId]);

      return res.json({ success: true, message: 'ПИН-код подписи успешно активирован' });
    } catch (err) {
      console.error('Ошибка в ProfileController.setSignPin:', err);
      return res.status(500).json({ success: false, error: 'Критическая ошибка сохранения ПИН-кода' });
    }
  }
}

export default new ProfileController();