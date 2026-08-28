import pool from '../config/db.js';
import transporter from '../config/mail.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ROLES } from '../utils/permissions.js';
import { toClubRoleName } from '../utils/checkPermission.js';
import { generateTempPassword } from '../utils/password.js';
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures, getRequestIp } from '../utils/loginGuard.js';

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
    `SELECT id, first_name, last_name, middle_name, email, phone, avatar_url, birth_date, sign_pin_hash, subscription_expires_at 
     FROM users WHERE id = $1 AND status = 'active'`,
    [userId]
  );
  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  // Рассчитываем глобальный статус подписки пользователя
  const hasSubscription = user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date();

  // Извлекаем все команды, к которым пользователь имеет прямое или косвенное отношение.
  //
  // ВАЖНО: user_role (и собираемый из него accessMatrix) намеренно НЕ включает роли из
  // tournament_team_roles. Роль в турнирной заявке — информативная: она нужна для подписи
  // протокола матча и отображения в нём, но прав в Team Room не даёт. Тот же принцип
  // соблюдают checkPermissionInternal (utils/checkPermission.js) и getMyTeams
  // (TeamController.js) — если подмешать турнирные роли здесь, фронт начнёт рисовать
  // кнопки, которые сервер потом отклонит.
  //
  // Ниже в WHERE обращения к tournament_team_roles и club_members остаются: и заявленный
  // на турнир человек, и рядовой член клуба должны видеть команду в списке, просто с
  // пустым набором ролей.
  const teamsResult = await pool.query(`
    SELECT t.id, t.name, t.short_name, t.logo_url, t.owner_id, t.club_id,
      (
        SELECT string_agg(DISTINCT role, ',') FROM (
          SELECT (CASE WHEN cr.role = 'coach' THEN 'club_coach' ELSE cr.role END) AS role FROM club_roles cr 
          JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
          WHERE cr.club_id = t.club_id AND cr.user_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
          
          UNION
          
          SELECT tr.role FROM team_roles tr 
          JOIN team_members tm ON tr.member_id = tm.id 
          WHERE tm.team_id = t.id AND tm.user_id = $1 AND tr.left_at IS NULL AND tm.left_at IS NULL

          UNION

          SELECT 'player' as role FROM team_members tm
          WHERE tm.team_id = t.id AND tm.user_id = $1 AND tm.left_at IS NULL

          UNION

          SELECT 'owner' as role FROM teams WHERE id = t.id AND owner_id = $1

          UNION

          -- Владелец клуба стоит над владельцем команды: получает свою роль
          -- во всех командах клуба, членства в клубе для этого не требуется
          SELECT 'club_owner' as role FROM clubs c WHERE c.id = t.club_id AND c.owner_id = $1
        ) AS roles
      ) as user_role
    FROM teams t
    WHERE t.owner_id = $1
    OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1 AND tm.left_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM club_roles cr
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.club_id = t.club_id AND cr.user_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL
    )
    OR EXISTS (
      -- Членство в общей базе клуба даёт видимость всех его составов, но не права:
      -- ролей у чужой команды не появится, и user_role придёт пустым. Именно на этот
      -- список опирается настройка «Все команды клуба» в сайдбаре — выключенная,
      -- она оставляет только те составы, где человек реально числится.
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = t.club_id AND cm.user_id = $1 AND cm.left_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM clubs c WHERE c.id = t.club_id AND c.owner_id = $1
    )
    OR EXISTS (
      SELECT 1 FROM tournament_team_roles ttr
      JOIN tournament_teams tt ON ttr.tournament_team_id = tt.id 
      WHERE tt.team_id = t.id AND ttr.user_id = $1 AND ttr.left_at IS NULL
    )
  `, [user.id]);

  // Клубы пользователя: он либо владелец клуба, либо состоит в его общей базе (club_members).
  // Роли здесь клубные (top_manager, club_admin, coach) плюс player за само членство —
  // ровно тот же набор, что проверяет getClubRoles на бэкенде, иначе фронт нарисует
  // кнопки, которые сервер потом отклонит.
  const clubsResult = await pool.query(`
    SELECT c.id, c.name, c.logo_url, c.city, c.description, c.color_1, c.color_2, c.owner_id,
      (
        SELECT string_agg(DISTINCT role, ',') FROM (
          SELECT cr.role FROM club_roles cr
          JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
          WHERE cr.club_id = c.id AND cr.user_id = $1 AND cr.left_at IS NULL AND cm.left_at IS NULL

          UNION

          SELECT 'player' AS role FROM club_members cm
          WHERE cm.club_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL

          UNION

          SELECT 'owner' AS role FROM clubs WHERE id = c.id AND owner_id = $1
        ) AS roles
      ) AS user_role
    FROM clubs c
    WHERE c.owner_id = $1
    OR EXISTS (
      SELECT 1 FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
    )
    ORDER BY c.name
  `, [user.id]);

  // Сборка оперативной In-Memory матрицы доступов для фронтенда
  const accessMatrix = {};
  teamsResult.rows.forEach(row => {
    const roles = row.user_role ? row.user_role.split(',') : [];
    const isOwner = row.owner_id === user.id;

    if (isOwner && !roles.includes('owner')) {
      roles.push('owner');
    }

    accessMatrix[row.id] = {
      is_owner: isOwner,
      has_subscription: hasSubscription,
      roles: roles
    };
  });

  // Клубная матрица держится отдельно от командной: идентификаторы у команд и клубов
  // свои собственные, и склеивать их в один объект нельзя — id совпадут и права потекут.
  const clubAccessMatrix = {};
  const clubs = clubsResult.rows.map(row => {
    // Имена ролей приводим к клубным (coach → club_coach, владелец → club_owner):
    // фронт сверяет их с теми же ключами permissions.js, что и бэкенд.
    const roles = row.user_role ? row.user_role.split(',').map(toClubRoleName) : [];
    const isOwner = row.owner_id === user.id;

    if (isOwner && !roles.includes(ROLES.CLUB_OWNER)) {
      roles.push(ROLES.CLUB_OWNER);
    }

    clubAccessMatrix[row.id] = {
      is_owner: isOwner,
      has_subscription: hasSubscription,
      roles: roles
    };

    return {
      ...row,
      user_roles: roles,
      is_owner: isOwner,
      has_subscription: hasSubscription,
    };
  });

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
    subscriptionExpiresAt: user.subscription_expires_at,
    hasSubscription: hasSubscription,
    teams: teamsResult.rows,
    clubs: clubs,
    accessMatrix: accessMatrix,
    clubAccessMatrix: clubAccessMatrix
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

    // Лимит проверяем ДО обращения к базе и bcrypt: смысл ограничения не только в том,
    // чтобы не дать подобрать пароль, но и в том, чтобы перебор не съедал процессор
    // контейнера на хешировании.
    const requestIp = getRequestIp(req);
    const guard = await checkLoginAllowed(phone, requestIp);
    if (!guard.allowed) {
      return res.status(429).json({ success: false, error: guard.error });
    }

    // Проверки членства в командах здесь больше нет. Раньше вход отклонялся, если человек
    // не состоял ни в одной команде или клубе, — с появлением самостоятельной регистрации
    // это стало тупиком: человек заводит аккаунт, подтверждает номер и упирается в отказ
    // ещё до того, как руководитель успел добавить его в состав. Теперь такой пользователь
    // входит и видит в «Моей команде» объяснение, что делать дальше. Прав это ему не даёт:
    // все эндпоинты проверяют доступ по конкретной команде, а её у него просто нет.
    const result = await pool.query(`
      SELECT u.id, u.password_hash, u.virtual_code
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
        message: 'Ваш аккаунт был создан как виртуальный или был переведен в виртуальный. Для разблокировки перейдите in «Создать аккаунт» и возьмите у руководителя команды или клуба актуальный секретный код от этого аккаунта.' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash || '');
    if (!isMatch) {
      await recordLoginFailure(phone, requestIp, 'tr');
      return res.status(401).json({ success: false, error: 'Неверный пароль' });
    }

    // Пароль вспомнили — счётчик неудач по этому номеру обнуляем, чтобы пара опечаток
    // не оставляла человека с висящей блокировкой на четверть часа.
    await clearLoginFailures(phone);

    // Снятие статуса "Виртуальный", если пользователь впервые логинится после claim profile.
    // Код гасится ровно один раз, поэтому rowCount = 1 и есть признак самого первого входа
    // после активации — по нему фронт показывает приветственное окно с пробным периодом.
    const claimRes = await pool.query(`UPDATE users SET virtual_code = NULL WHERE id = $1 AND virtual_code IS NOT NULL`, [user.id]);
    const isFirstLogin = claimRes.rowCount === 1;

    const userData = await fetchPwaUserProfile(user.id);
    const secret = process.env.JWT_SECRET || 'hockeyeco_pwa_secret_key';
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: '30d' });

    res.json({ success: true, user: userData, token, isFirstLogin });
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
    const newPassword = generateTempPassword();
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

// Регистрация и активация аккаунта живут в registrationController.js.
// Здесь их больше нет: прежний /register по паре телефон+код переписывал почту и пароль
// без подтверждения номера звонком и обходил новую защиту от дублей.
