import pool from '../config/db.js';

// Извлекает реальный IP клиента с учётом прокси
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
};

class PolicyController {

  // Актуальная опубликованная версия политики. Публичный эндпоинт (без авторизации) —
  // используется публичной страницей /privacy и шторкой внутри приложения.
  async getCurrent(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, version, title, content, published_at
         FROM policy_versions
         WHERE is_published = true
         ORDER BY published_at DESC
         LIMIT 1`
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Политика ещё не опубликована' });
      }
      res.json({ success: true, policy: result.rows[0] });
    } catch (err) {
      console.error('Ошибка получения политики:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // Проверка, принял ли текущий пользователь актуальную версию политики.
  // Управляет показом блокирующей модалки согласия при входе в приложение.
  async getStatus(req, res) {
    try {
      const result = await pool.query(
        `SELECT pv.id
         FROM policy_versions pv
         WHERE pv.is_published = true
           AND NOT EXISTS (
             SELECT 1 FROM user_consents uc
             WHERE uc.policy_version_id = pv.id AND uc.user_id = $1
           )
         ORDER BY pv.published_at DESC
         LIMIT 1`,
        [req.user.id]
      );
      res.json({ success: true, needsConsent: result.rows.length > 0 });
    } catch (err) {
      // Если таблицы согласий ещё не созданы — не блокируем работу приложения
      console.error('Ошибка проверки статуса согласия:', err.message);
      res.json({ success: true, needsConsent: false });
    }
  }

  // Фиксация согласия пользователя с актуальной версией политики.
  // source: 'modal' (окно при входе) | 'registration' (чекбокс при активации аккаунта)
  async accept(req, res) {
    try {
      const userId = req.user.id;
      const { source } = req.body;

      const versionRes = await pool.query(
        `SELECT id FROM policy_versions WHERE is_published = true ORDER BY published_at DESC LIMIT 1`
      );
      if (versionRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Политика ещё не опубликована' });
      }

      await pool.query(
        `INSERT INTO user_consents (user_id, policy_version_id, ip, user_agent, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, policy_version_id) DO NOTHING`,
        [
          userId,
          versionRes.rows[0].id,
          getClientIp(req),
          (req.headers['user-agent'] || '').slice(0, 255),
          source === 'registration' ? 'registration' : 'modal'
        ]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Ошибка фиксации согласия:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }
}

export default new PolicyController();
