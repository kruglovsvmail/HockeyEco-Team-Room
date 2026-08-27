import bcrypt from 'bcrypt';
import pool from '../config/db.js'; // Используем единый pool подключения из вашего конфига
import s3 from '../config/s3.js';   // Используем ваш рабочий конфигурированный клиент S3
import { processAvatar } from '../utils/imageProcessor.js';
import { normalizePhone, isVirtualPhone } from '../utils/phone.js';
import { requestVerificationCall } from '../services/callService.js';

// Параметры подтверждения телефона звонком.
//
// Лимиты живут в базе, а не в памяти процесса: каждый звонок стоит 0.40 ₽, а контейнер
// на Timeweb перезапускается — счётчики в оперативке обнулились бы вместе с ним и
// перестали защищать баланс.
const CODE_TTL_MINUTES = 10;        // Сколько живёт код — согласовано с текстом в интерфейсе
const RESEND_COOLDOWN_SECONDS = 60; // Пауза между заказами звонка
const MAX_CALLS_PER_DAY = 5;        // Суточный потолок заказов на одного пользователя
const MAX_CODE_ATTEMPTS = 5;        // Попыток ввода кода до сгорания заявки (перебор 10 000 комбинаций)

// Локальные и внутрисетевые адреса, которые нельзя отдавать в SMS.RU: при разработке
// с домашней машины req.ip будет вида 192.168.x.x, а такой адрес сервису ни о чём не
// говорит. У их API для этого случая есть штатное значение -1, которое подставит
// callService, получив от нас null.
const PRIVATE_IP_PATTERN = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i;

// Express отдаёт IPv4 в IPv6-обёртке (::ffff:1.2.3.4), а SMS.RU ждёт обычный адрес.
// Осмысленное значение приходит сюда только при включённом trust proxy в server.js —
// иначе это был бы адрес прокси Timeweb, одинаковый для всех пользователей.
const getClientIp = (req) => {
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  if (!ip || PRIVATE_IP_PATTERN.test(ip)) return null;
  return ip;
};

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
      
      // ВАЖНО: phone здесь намеренно не принимается. Телефон — это логин, и меняется он
      // только через пару requestPhoneChange/confirmPhoneChange с подтверждением звонком.
      // Если писать его отсюда, опечатка в номере навсегда отрезает человека от аккаунта:
      // ни вход, ни восстановление пароля (оно тоже идёт по телефону) больше не сработают.
      const { email, first_name, last_name, middle_name, birth_date, height, weight, grip } = req.body;

      if (email) {
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, userId]);
        if (emailCheck.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'Этот Email-адрес уже занят другим аккаунтом' });
        }
      }

      // Все поля обёрнуты в COALESCE — блок, не передающий поле, не затирает его NULL-ом
      const query = `
        UPDATE users
        SET email       = COALESCE($1, email),
            first_name  = COALESCE($2, first_name),
            last_name   = COALESCE($3, last_name),
            middle_name = COALESCE($4, middle_name),
            birth_date  = COALESCE($5, birth_date),
            height      = COALESCE($6, height),
            weight      = COALESCE($7, weight),
            grip        = COALESCE($8, grip),
            updated_at  = NOW()
        WHERE id = $9
      `;

      await pool.query(query, [
        email       ?? null,
        first_name  ?? null,
        last_name   ?? null,
        middle_name ?? null,
        birth_date  ?? null,
        height      ?? null,
        weight      ?? null,
        grip        ?? null,
        userId
      ]);

      return res.json({ success: true, message: 'Профиль успешно обновлен' });
    } catch (err) {
      console.error('Ошибка в ProfileController.updateProfile:', err);
      return res.status(500).json({ success: false, error: 'Не удалось сохранить изменения' });
    }
  }

  // Шаг 1 смены телефона: заказ звонка с кодом на НОВЫЙ номер.
  // Сам номер в users на этом шаге не пишется — он ждёт подтверждения в phone_verifications.
  async requestPhoneChange(req, res) {
    try {
      const userId = req.user.id;
      const phone = normalizePhone(req.body.phone);

      if (!phone) {
        return res.status(400).json({ success: false, error: 'Введите корректный номер телефона' });
      }
      if (isVirtualPhone(phone)) {
        return res.status(400).json({ success: false, error: 'Этот номер служебный и не может быть привязан к аккаунту' });
      }

      const currentRes = await pool.query('SELECT phone FROM users WHERE id = $1', [userId]);
      if (currentRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      if (normalizePhone(currentRes.rows[0].phone) === phone) {
        return res.status(400).json({ success: false, error: 'Это ваш текущий номер телефона' });
      }

      // Занятость проверяем ДО звонка: иначе заплатим за подтверждение и всё равно
      // упрёмся в уникальный индекс users_phone_unique на записи номера.
      const busy = await pool.query('SELECT id FROM users WHERE phone = $1 AND id <> $2', [phone, userId]);
      if (busy.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Этот номер уже привязан к другому аккаунту' });
      }

      // Обе защиты считаем одним запросом: пауза между звонками и суточный потолок
      const limits = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(secs => $2)) AS in_cooldown,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')          AS calls_today
        FROM phone_verifications
        WHERE user_id = $1 AND purpose = 'profile_change'
      `, [userId, RESEND_COOLDOWN_SECONDS]);

      if (Number(limits.rows[0].in_cooldown) > 0) {
        return res.status(429).json({ success: false, error: 'Повторный звонок можно заказать через минуту' });
      }
      if (Number(limits.rows[0].calls_today) >= MAX_CALLS_PER_DAY) {
        return res.status(429).json({ success: false, error: 'Исчерпан суточный лимит подтверждений. Попробуйте завтра.' });
      }

      // Код придумывает не сервер: SMS.RU возвращает последние 4 цифры номера,
      // с которого совершит звонок, — именно они и есть код подтверждения.
      let call;
      try {
        call = await requestVerificationCall(phone, getClientIp(req));
      } catch (callErr) {
        return res.status(502).json({ success: false, error: callErr.message });
      }

      const codeHash = await bcrypt.hash(call.code, 10);

      // Гасим прошлые незакрытые заявки: активной у пользователя должна быть ровно одна,
      // иначе старый код от предыдущего номера остался бы рабочим.
      await pool.query(`
        UPDATE phone_verifications SET expires_at = NOW()
        WHERE user_id = $1 AND purpose = 'profile_change' AND confirmed_at IS NULL AND expires_at > NOW()
      `, [userId]);

      const inserted = await pool.query(`
        INSERT INTO phone_verifications (phone, purpose, user_id, code_hash, call_id, request_ip, expires_at)
        VALUES ($1, 'profile_change', $2, $3, $4, $5, NOW() + make_interval(mins => $6))
        RETURNING expires_at
      `, [phone, userId, codeHash, call.callId, getClientIp(req), CODE_TTL_MINUTES]);

      return res.json({
        success: true,
        phone,
        expiresAt: inserted.rows[0].expires_at,
        message: 'Ожидайте входящий звонок'
      });
    } catch (err) {
      console.error('Ошибка в ProfileController.requestPhoneChange:', err);
      return res.status(500).json({ success: false, error: 'Не удалось заказать звонок' });
    }
  }

  // Шаг 2 смены телефона: сверка кода и перенос номера в users.
  async confirmPhoneChange(req, res) {
    try {
      const userId = req.user.id;
      const code = String(req.body.code || '').replace(/\D/g, '');

      if (code.length !== 4) {
        return res.status(400).json({ success: false, error: 'Код состоит из четырёх цифр' });
      }

      const pending = await pool.query(`
        SELECT id, phone, code_hash, attempts
        FROM phone_verifications
        WHERE user_id = $1 AND purpose = 'profile_change'
          AND confirmed_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId]);

      if (pending.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Срок действия кода истёк. Закажите звонок заново.' });
      }

      const request = pending.rows[0];

      if (request.attempts >= MAX_CODE_ATTEMPTS) {
        await pool.query('UPDATE phone_verifications SET expires_at = NOW() WHERE id = $1', [request.id]);
        return res.status(400).json({ success: false, error: 'Исчерпаны попытки ввода. Закажите звонок заново.' });
      }

      const isMatch = await bcrypt.compare(code, request.code_hash);
      if (!isMatch) {
        const updated = await pool.query(
          'UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
          [request.id]
        );
        const attemptsLeft = MAX_CODE_ATTEMPTS - updated.rows[0].attempts;
        return res.status(400).json({
          success: false,
          error: attemptsLeft > 0
            ? `Неверный код. Осталось попыток: ${attemptsLeft}`
            : 'Исчерпаны попытки ввода. Закажите звонок заново.'
        });
      }

      // Между заказом звонка и вводом кода номер мог занять кто-то другой,
      // поэтому уникальность перепроверяем в одной транзакции с записью.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const busy = await client.query('SELECT id FROM users WHERE phone = $1 AND id <> $2', [request.phone, userId]);
        if (busy.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: 'Этот номер уже привязан к другому аккаунту' });
        }

        await client.query(
          'UPDATE users SET phone = $1, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $2',
          [request.phone, userId]
        );
        await client.query('UPDATE phone_verifications SET confirmed_at = NOW() WHERE id = $1', [request.id]);

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      return res.json({ success: true, phone: request.phone, message: 'Номер телефона подтверждён' });
    } catch (err) {
      console.error('Ошибка в ProfileController.confirmPhoneChange:', err);
      return res.status(500).json({ success: false, error: 'Не удалось подтвердить номер' });
    }
  }

  // Загрузка аватарки напрямую в облачное S3-хранилище через проверенный метод из TeamController
  async updateAvatar(req, res) {
    try {
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Файл изображения не передан' });
      }

      // Дата в ключе — чтобы при замене аватарки URL менялся и браузер не показывал
      // старую картинку из кэша (старый детерминированный ключ этим страдал).
      const s3Key = `uploads/users_${userId}_avatar_${Date.now()}.webp`;
      const dbPath = `/${s3Key}`;

      // Ресайз до 400×400 + конвертация в WebP перед заливкой
      const processedBuffer = await processAvatar(req.file.buffer);
      await uploadBufferToS3({ buffer: processedBuffer, mimetype: 'image/webp' }, s3Key);

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

      // Ключ теперь содержит таймстамп загрузки, поэтому его нельзя пересобрать
      // по userId — берём актуальный путь из БД.
      const userRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
      const avatarUrl = userRes.rows[0]?.avatar_url;
      const s3Key = avatarUrl ? avatarUrl.replace(/^\//, '') : null;

      try {
        if (!s3Key) throw new Error('Аватар не найден');
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