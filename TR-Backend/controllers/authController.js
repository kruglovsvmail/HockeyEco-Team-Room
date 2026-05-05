import pool from '../config/db.js';
import transporter from '../config/mail.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

/**
 * Middleware для проверки JWT токена
 */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Отсутствует токен доступа' });
  }

  const secret = process.env.JWT_SECRET || 'hockeyeco_pwa_secret_key';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Недействительный или просроченный токен' });
    }
    req.user = decoded;
    next();
  });
};

/**
 * Вспомогательная функция для получения полного профиля и списка команд с вычислением РОЛЕЙ
 */
const fetchPwaUserProfile = async (userId) => {
  const userResult = await pool.query(
    `SELECT id, first_name, last_name, middle_name, email, phone, avatar_url, birth_date, sign_pin_hash 
     FROM users WHERE id = $1 AND status = 'active'`,
    [userId]
  );
  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  const teamsResult = await pool.query(`
    SELECT t.id, t.name, t.short_name, t.logo_url,
      (
        SELECT string_agg(DISTINCT role, ',') FROM (
          SELECT cr.role FROM club_roles cr WHERE cr.club_id = t.club_id AND cr.user_id = $1
          UNION
          SELECT tr.role FROM team_roles tr JOIN team_members tm ON tr.member_id = tm.id WHERE tm.team_id = t.id AND tm.user_id = $1 AND tr.left_at IS NULL
          UNION
          SELECT ttr.tournament_role as role FROM tournament_team_roles ttr JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id WHERE tt.team_id = t.id AND ttr.user_id = $1 AND ttr.left_at IS NULL
          UNION
          SELECT 'player' as role FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1 AND tm.left_at IS NULL
        ) AS roles
      ) as user_role
    FROM teams t
    WHERE EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1 AND tm.left_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM club_roles cr WHERE cr.club_id = t.club_id AND cr.user_id = $1
    )
    OR EXISTS (
      SELECT 1 FROM tournament_team_roles ttr JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id WHERE tt.team_id = t.id AND ttr.user_id = $1 AND ttr.left_at IS NULL
    )
  `, [user.id]);

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    middleName: user.middle_name || '',
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    birthDate: user.birth_date,
    hasSignPin: !!user.sign_pin_hash,
    teams: teamsResult.rows
  };
};

/**
 * Проверка номера телефона для приветствия пользователя
 */
export const checkPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Номер телефона не передан' });
    }

    const result = await pool.query(
      `SELECT first_name FROM users WHERE phone = $1 AND status = 'active'`,
      [phone]
    );

    if (result.rows.length > 0) {
      return res.json({ success: true, firstName: result.rows[0].first_name });
    }

    return res.json({ success: false });
  } catch (err) {
    console.error('Check phone error:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

/**
 * Авторизация: Проверка телефона, пароля и наличия в командах
 */
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, error: 'Введите телефон и пароль' });
    }

    const result = await pool.query(`
      SELECT u.id, u.password_hash, u.virtual_code,
      (
        EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id AND tm.left_at IS NULL)
        OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.user_id = u.id AND cm.left_at IS NULL)
        OR EXISTS (SELECT 1 FROM tournament_team_roles ttr WHERE ttr.user_id = u.id AND ttr.left_at IS NULL)
        OR EXISTS (SELECT 1 FROM club_roles cr WHERE cr.user_id = u.id)
      ) as has_membership
      FROM users u
      WHERE u.phone = $1 AND u.status = 'active'
    `, [phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден или заблокирован' });
    }

    const user = result.rows[0];

    // --- ПЕРЕХВАТ Hard Reset (Перевод в виртуальные) ---
    if (!user.password_hash && user.virtual_code) {
      return res.status(403).json({ 
        success: false, 
        error: 'ACCOUNT_RESET',
        message: 'Ваш аккаунт был создан как виртуальный или был переведен в виртуальный. Для разблокировки перейдите в «Создать аккаунт» и возьмите у руководителя команды или клуба актуальный секретный код от этого аккаунта.' 
      });
    }

    if (!user.has_membership) {
      return res.status(403).json({ 
        success: false, 
        error: 'Доступ запрещен. Вы не явлеетесь членом, хотя бы одной команды или клуба. Если вы уверены в обратном, то обратитесь пожалуйста к руководителю команды или клуба, для уточнения информации.' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash || '');
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Неверный пароль' });
    }

    // Снятие статуса "Виртуальный", если пользователь впервые логинится после claim profile
    await pool.query(`UPDATE users SET virtual_code = NULL WHERE id = $1 AND virtual_code IS NOT NULL`, [user.id]);

    const userData = await fetchPwaUserProfile(user.id);
    const secret = process.env.JWT_SECRET || 'hockeyeco_pwa_secret_key';
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: '30d' });

    res.json({ success: true, user: userData, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

/**
 * Получение данных текущего пользователя
 */
export const getMe = async (req, res) => {
  try {
    const userData = await fetchPwaUserProfile(req.user.id);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
    res.json({ success: true, user: userData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Обновление профиля
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, phone, password, avatarUrl, signPin } = req.body;

    await pool.query(
      'UPDATE users SET email = $1, phone = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4',
      [email, phone, avatarUrl, userId]
    );

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);
    }

    if (signPin) {
      const hashedPin = await bcrypt.hash(signPin, 10);
      await pool.query('UPDATE users SET sign_pin_hash = $1 WHERE id = $2', [hashedPin, userId]);
    }

    res.json({ success: true, message: 'Профиль успешно обновлен' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Сброс пароля
 */
export const resetPassword = async (req, res) => {
  try {
    const { phone, email } = req.body;

    // --- ПЕРЕХВАТ Hard Reset ---
    const checkVirtual = await pool.query(`SELECT virtual_code, password_hash FROM users WHERE phone = $1 AND status = 'active'`, [phone]);
    if (checkVirtual.rows.length > 0) {
       const userCheck = checkVirtual.rows[0];
       if (!userCheck.password_hash && userCheck.virtual_code) {
          return res.status(403).json({ 
             success: false, 
             error: 'ACCOUNT_RESET',
             message: 'Восстановление недоступно. Ваш аккаунт был создан как виртуальный или был переведен в виртуальный. Для разблокировки перейдите в «Создать аккаунт» и возьмите у руководителя команды или клуба актуальный секретный код от этого аккаунта.' 
          });
       }
    }

    const result = await pool.query(
      'SELECT id, first_name FROM users WHERE phone = $1 AND email = $2', 
      [phone, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Пользователь с такими данными не найден' });
    }

    const user = result.rows[0];
    const newPassword = Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #F8F9FA; padding: 40px 20px; color: #2C2C2E;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; padding: 40px 30px; border: 1px solid #E5E5EA; text-align: center;">
          <h2 style="margin-top: 0; font-size: 26px; color: #2C2C2E;">HockeyEco <span style="color: #FF7A00;">LMS</span></h2>
          <p style="text-align: left; margin-top: 30px;">Здравствуйте, <strong>${user.first_name}</strong>!</p>
          <p style="text-align: left;">Ваш новый код для входа:</p>
          <div style="margin: 30px 0; background-color: #FFF5EB; color: #FF7A00; font-size: 32px; font-weight: 800; padding: 15px; border-radius: 12px; border: 2px dashed #FF7A00; letter-spacing: 5px;">
            ${newPassword}
          </div>
          <p style="font-size: 12px; color: #8E8E93; margin-top: 30px;">С уважением, команда HockeyEco</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"HockeyEco Team" <kruglov.svmail@yandex.ru>',
      to: email,
      subject: 'Новый пароль | HockeyEco Team PWA',
      html: htmlTemplate
    });

    res.json({ success: true, message: 'Новый пароль отправлен на вашу почту' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Ошибка при отправке письма' });
  }
};

// ==========================================
// МЕТОДЫ ДЛЯ РЕГИСТРАЦИИ И CLAIM PROFILE
// ==========================================

export const regCheckPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Телефон обязателен' });

    const result = await pool.query(`SELECT id, virtual_code FROM users WHERE phone = $1`, [phone]);
    
    if (result.rows.length === 0) {
      return res.json({ success: true, status: 'new' });
    }
    
    const user = result.rows[0];
    if (user.virtual_code) {
      return res.json({ success: true, status: 'virtual' });
    } else {
      return res.json({ success: true, status: 'exists' });
    }
  } catch (err) {
    console.error('regCheckPhone error:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const regVerifyCode = async (req, res) => {
  try {
    const { phone, code } = req.body;
    const result = await pool.query(
      `SELECT first_name, last_name, middle_name, birth_date FROM users WHERE phone = $1 AND virtual_code = $2 AND status = 'active'`,
      [phone, code]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Неверный секретный код' });
    }
    
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('regVerifyCode error:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const register = async (req, res) => {
  const client = await pool.connect();
  try {
    const { phone, virtualCode, email, firstName, lastName, middleName, birthDate } = req.body;
    const newPassword = Math.floor(1000 + Math.random() * 9000).toString();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const finalBirthDate = birthDate ? birthDate : null;

    await client.query('BEGIN');

    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Этот Email уже привязан к другому аккаунту' });
    }

    if (virtualCode) {
       const check = await client.query('SELECT id FROM users WHERE phone = $1 AND virtual_code = $2', [phone, virtualCode]);
       if (check.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: 'Неверный код или профиль не найден' });
       }
       await client.query(`
         UPDATE users
         SET email = $1, first_name = $2, last_name = $3, middle_name = $4, birth_date = $5, password_hash = $6, updated_at = NOW()
         WHERE phone = $7 AND virtual_code = $8
       `, [email, firstName, lastName, middleName, finalBirthDate, passwordHash, phone, virtualCode]);
    } else {
       await client.query(`
         INSERT INTO users (phone, email, first_name, last_name, middle_name, birth_date, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       `, [phone, email, firstName, lastName, middleName, finalBirthDate, passwordHash]);
    }

    await client.query('COMMIT');

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #F8F9FA; padding: 40px 20px; color: #2C2C2E;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; padding: 40px 30px; border: 1px solid #E5E5EA; text-align: center;">
          <h2 style="margin-top: 0; font-size: 26px; color: #2C2C2E;">HockeyEco <span style="color: #FF7A00;">LMS</span></h2>
          <p style="text-align: left; margin-top: 30px;">Здравствуйте, <strong>${firstName}</strong>!</p>
          <p style="text-align: left;">Ваш аккаунт успешно ${virtualCode ? 'подтвержден' : 'создан'}!</p>
          <p style="text-align: left;">Ваш сгенерированный пароль для входа в приложение:</p>
          <div style="margin: 30px 0; background-color: #FFF5EB; color: #FF7A00; font-size: 32px; font-weight: 800; padding: 15px; border-radius: 12px; border: 2px dashed #FF7A00; letter-spacing: 5px;">
            ${newPassword}
          </div>
          <p style="font-size: 12px; color: #8E8E93; margin-top: 30px;">С уважением, команда HockeyEco</p>
        </div>
      </div>
    `;
    await transporter.sendMail({
      from: '"HockeyEco Team" <kruglov.svmail@yandex.ru>',
      to: email,
      subject: 'Регистрация | HockeyEco Team PWA',
      html: htmlTemplate
    });

    res.json({ success: true, message: 'Пароль отправлен на почту' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'users_email_key') {
       return res.status(400).json({ success: false, error: 'Этот Email уже привязан к другому аккаунту' });
    }
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
  } finally {
    client.release();
  }
};