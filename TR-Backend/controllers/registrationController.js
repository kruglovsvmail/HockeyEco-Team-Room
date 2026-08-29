import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import transporter from '../config/mail.js';
import { normalizePhone, isVirtualPhone } from '../utils/phone.js';
import { startPhoneCheck, getPhoneCheckStatus } from '../services/callService.js';
import { generateTempPassword } from '../utils/password.js';
import { scoreCandidate, MIN_CANDIDATE_SCORE } from '../utils/nameMatch.js';
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures, getRequestIp } from '../utils/loginGuard.js';

// Самостоятельная регистрация в Team Room.
//
// Главная задача этого файла — НЕ ДОПУСТИТЬ ДУБЛЬ. Человек в базе почти наверняка уже
// есть: его завёл руководитель как виртуальную карточку. Дубликат ломает саму суть
// системы — статистика, составы и история остаются на старой карточке, а человек сидит
// в пустом новом аккаунте. Поэтому прежде чем создавать кого-то нового, мы обязаны
// показать ему всё похожее, что нашли, и спросить «это вы?».
//
// Шаги. Состояние между ними переносится подписанным билетом (ticket), а не серверной
// сессией: эндпоинты анонимные, и хранить состояние негде.
//   1. start   — ФИО, дата рождения, почта → список похожих карточек
//   2. claim   — выбрал себя → вводит секретный код руководителя
//   3. requestPhone — вводит свой номер → заказ звонка для подтверждения
//   4. phoneStatus  — опрос звонка; как только он засчитан, аккаунт создаётся или активируется
//
// Шаг 2 пропускают те, кто нажал «меня нет в списке»: для них шаг 4 создаёт нового
// пользователя, а не активирует существующего.

const TICKET_TTL = '30m';          // Столько живёт незавершённая регистрация
const TRIAL_PERIOD_DAYS = 30;      // Пробный период — тот же, что при активации в authController
const CHECK_TTL_MINUTES = 5;       // Окно на звонок — ограничение SMS.RU
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CALLS_PER_PHONE_PER_DAY = 5;
const MAX_CANDIDATES = 10;         // Сколько карточек показываем: это список выбора, а не отчёт

const getTicketSecret = () => process.env.JWT_SECRET || 'hockeyeco_pwa_secret_key';

const issueTicket = (payload) => {
  // Каждый следующий шаг пересобирает билет из разобранного предыдущего, а в разобранном
  // лежат служебные поля JWT — iat, exp и прочие. Подписать payload, в котором уже есть
  // exp, вместе с опцией expiresIn библиотека отказывается, поэтому служебные поля
  // отбрасываем перед каждой новой подписью. Побочный эффект полезный: отсчёт 30 минут
  // начинается заново на каждом шаге, и человек не упирается в истёкший билет на середине.
  const { iat, exp, nbf, aud, iss, sub, jti, ...data } = payload;

  return jwt.sign(
    { ...data, scope: 'registration' },
    getTicketSecret(),
    { expiresIn: TICKET_TTL }
  );
};

const readTicket = (raw) => {
  try {
    const data = jwt.verify(String(raw || ''), getTicketSecret());
    // Проверка scope обязательна: без неё обычный токен доступа сошёл бы за билет
    return data.scope === 'registration' ? data : null;
  } catch {
    return null;
  }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Команды карточки — то, по чему человек и узнаёт себя в списке. Однофамильцы одного
// года рождения в детском хоккее встречаются постоянно, и различает их именно команда,
// а не отчество: у виртуальных карточек отчества часто нет вовсе.
const CANDIDATE_QUERY = `
  SELECT u.id, u.first_name, u.last_name, u.middle_name, u.birth_date, u.email,
         u.virtual_code IS NOT NULL AS is_virtual,
         COALESCE((
           SELECT json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url) ORDER BY t.name)
           FROM team_members tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = u.id AND tm.left_at IS NULL
         ), '[]') AS teams
  FROM users u
  WHERE u.status = 'active'
    AND (
      -- Год рождения ±1: ловит опечатки в фамилии, потому что год почти всегда верен
      (u.birth_date IS NOT NULL AND EXTRACT(YEAR FROM u.birth_date) BETWEEN $1::int - 1 AND $1::int + 1)
      -- Точная фамилия: ловит обратный случай, когда неверна как раз дата рождения
      OR LOWER(u.last_name) = LOWER($2)
      -- Точная почта: ловит смену фамилии, при которой не совпадут ни имя, ни дата
      OR LOWER(u.email) = LOWER($3)
    )
  LIMIT 500
`;

const toPublicCandidate = (row) => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  middleName: row.middle_name,
  // Наружу отдаём только ГОД рождения и никаких контактов: эндпоинт анонимный,
  // и превращать его в справочник персональных данных нельзя.
  birthYear: row.birth_date ? new Date(row.birth_date).getUTCFullYear() : null,
  teams: row.teams || [],
  // virtual — карточку можно активировать секретным кодом;
  // activated — человек уже заходил, ему нужен вход или восстановление пароля
  state: row.is_virtual ? 'virtual' : 'activated'
});

// Фиксация согласия на обработку персональных данных.
//
// Галочку человек ставит на первом шаге, но записать её можно только в самом конце —
// раньше учётной записи, к которой согласие привязывается, ещё не существует. Пишем в
// той же транзакции, что и создание аккаунта: согласие и аккаунт должны появляться
// вместе либо не появляться вовсе.
//
// Без этой записи блокирующая модалка потребует согласие ещё раз при первом же входе —
// человек будет справедливо недоумевать, ведь галочку он уже ставил.
const recordConsent = async (client, userId, req) => {
  const versionRes = await client.query(
    `SELECT id FROM policy_versions WHERE is_published = true ORDER BY published_at DESC LIMIT 1`
  );
  // Политика ещё не опубликована — фиксировать нечего, регистрацию из-за этого не рвём
  if (versionRes.rows.length === 0) return;

  await client.query(
    `INSERT INTO user_consents (user_id, policy_version_id, ip, user_agent, source)
     VALUES ($1, $2, $3, $4, 'registration')
     ON CONFLICT (user_id, policy_version_id) DO NOTHING`,
    [
      userId,
      versionRes.rows[0].id,
      getRequestIp(req),
      (req.headers['user-agent'] || '').slice(0, 255)
    ]
  );
};

// Активная заявка на подтверждение номера в рамках регистрации.
// Ключ — сам номер: пользователя в базе может ещё не существовать.
const findPendingVerification = async (phone) => {
  const { rows } = await pool.query(`
    SELECT id, phone, check_id, call_phone, expires_at
    FROM phone_verifications
    WHERE phone = $1 AND purpose = 'registration'
      AND confirmed_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `, [phone]);

  return rows[0] || null;
};

// Письмо с паролем. Вёрстка повторяет письмо восстановления пароля из authController,
// чтобы человек получал узнаваемое оформление, а не два разных письма от одного сервиса.
const sendPasswordEmail = async (email, firstName, password, isActivation) => {
  const title = isActivation ? 'Аккаунт активирован' : 'Аккаунт создан';

  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #F8F9FA; padding: 40px 20px; color: #2C2C2E;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; padding: 40px 30px; border: 1px solid #E5E5EA; text-align: center;">
        <h2 style="margin-top: 0; font-size: 26px; color: #2C2C2E;">HockeyEco <span style="color: #FF7A00;">Team</span></h2>
        <p style="text-align: left; margin-top: 30px;">Здравствуйте, <strong>${firstName}</strong>!</p>
        <p style="text-align: left;">${title}. Ваш пароль для входа:</p>
        <div style="margin: 30px 0; background-color: #FFF5EB; color: #FF7A00; font-size: 32px; font-weight: 800; padding: 15px; border-radius: 12px; border: 2px dashed #FF7A00; letter-spacing: 5px;">
          ${password}
        </div>
        <p style="text-align: left; font-size: 13px; color: #8E8E93;">Входить в приложение нужно по номеру телефона, который вы подтвердили звонком. Пароль можно сменить в разделе «Мой профиль».</p>
        <p style="font-size: 12px; color: #8E8E93; margin-top: 30px;">С уважением, команда HockeyEco</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: '"HockeyEco Team" <kruglov.svmail@yandex.ru>',
    to: email,
    subject: `${title} | HockeyEco Team`,
    html
  });
};

class RegistrationController {

  // Шаг 1: приняли анкету, вернули похожие карточки
  async start(req, res) {
    try {
      const requestIp = getRequestIp(req);
      const searchKey = `reg-search:${requestIp || 'local'}`;

      // Поиск анонимный и отдаёт чужие имена с командами. Без лимита он превратился бы
      // в инструмент выгрузки базы по годам рождения.
      const guard = await checkLoginAllowed(searchKey, requestIp);
      if (!guard.allowed) {
        return res.status(429).json({ success: false, error: 'Слишком много запросов. Попробуйте позже.' });
      }
      await recordLoginFailure(searchKey, requestIp, 'tr');

      const lastName = String(req.body.lastName || '').trim();
      const firstName = String(req.body.firstName || '').trim();
      const middleName = String(req.body.middleName || '').trim();
      const birthDate = String(req.body.birthDate || '').trim();
      const email = String(req.body.email || '').trim();

      if (!lastName || !firstName) {
        return res.status(400).json({ success: false, error: 'Укажите фамилию и имя' });
      }
      if (!birthDate || isNaN(new Date(birthDate))) {
        return res.status(400).json({ success: false, error: 'Укажите дату рождения' });
      }
      if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ success: false, error: 'Укажите корректный адрес электронной почты' });
      }

      // Почта уникальна в users. Если она принадлежит аккаунту, в который человек хотя бы
      // раз входил, регистрация ему не нужна — нужен вход. Говорим об этом сразу, а не
      // после того, как он пройдёт все шаги и мы оплатим звонок.
      const emailOwner = await pool.query(
        `SELECT virtual_code IS NULL AS activated FROM users WHERE LOWER(email) = LOWER($1) AND status = 'active'`,
        [email]
      );
      if (emailOwner.rows.length > 0 && emailOwner.rows[0].activated) {
        return res.status(400).json({
          success: false,
          error: 'Эта почта уже привязана к активированному аккаунту. Войдите в него или восстановите пароль.'
        });
      }

      const birthYear = new Date(birthDate).getUTCFullYear();
      const { rows } = await pool.query(CANDIDATE_QUERY, [birthYear, lastName, email]);

      const input = { lastName, firstName, middleName, birthDate, email };
      const candidates = rows
        .map(row => ({ row, score: scoreCandidate(input, row).score }))
        .filter(item => item.score >= MIN_CANDIDATE_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_CANDIDATES)
        .map(item => toPublicCandidate(item.row));

      return res.json({
        success: true,
        ticket: issueTicket({ lastName, firstName, middleName, birthDate, email }),
        candidates
      });
    } catch (err) {
      console.error('Ошибка в RegistrationController.start:', err);
      return res.status(500).json({ success: false, error: 'Не удалось выполнить поиск' });
    }
  }

  // Шаг 2: человек выбрал себя и вводит секретный код руководителя.
  //
  // Связка здесь «карточка + код»: ищем по первичному ключу, а код только подтверждает
  // право на неё. Поэтому уникальность virtual_code не требуется — даже совпавшие коды
  // принадлежат разным id, и перепутать карточки невозможно.
  async claim(req, res) {
    try {
      const ticket = readTicket(req.body.ticket);
      if (!ticket) {
        return res.status(400).json({ success: false, error: 'Время регистрации истекло, начните заново' });
      }

      const userId = Number(req.body.userId);
      const code = String(req.body.code || '').trim().toUpperCase();
      if (!userId || !code) {
        return res.status(400).json({ success: false, error: 'Введите секретный код' });
      }

      const requestIp = getRequestIp(req);
      const guardKey = `claim:${userId}`;
      const guard = await checkLoginAllowed(guardKey, requestIp);
      if (!guard.allowed) {
        return res.status(429).json({ success: false, error: 'Слишком много попыток. Повторите через 15 минут.' });
      }

      const { rows } = await pool.query(
        `SELECT id, virtual_code FROM users WHERE id = $1 AND status = 'active'`,
        [userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Карточка не найдена' });
      }
      if (!rows[0].virtual_code) {
        return res.status(400).json({
          success: false,
          error: 'Этот аккаунт уже активирован. Войдите в него или восстановите пароль.'
        });
      }

      if (String(rows[0].virtual_code).trim().toUpperCase() !== code) {
        await recordLoginFailure(guardKey, requestIp, 'tr');
        return res.status(400).json({ success: false, error: 'Секретный код не подходит' });
      }

      await clearLoginFailures(guardKey);

      return res.json({
        success: true,
        ticket: issueTicket({ ...ticket, claimUserId: userId })
      });
    } catch (err) {
      console.error('Ошибка в RegistrationController.claim:', err);
      return res.status(500).json({ success: false, error: 'Не удалось проверить код' });
    }
  }

  // Шаг 3: заказ звонка на номер, который человек указал как свой
  async requestPhone(req, res) {
    try {
      const ticket = readTicket(req.body.ticket);
      if (!ticket) {
        return res.status(400).json({ success: false, error: 'Время регистрации истекло, начните заново' });
      }

      const phone = normalizePhone(req.body.phone);
      if (!phone) {
        return res.status(400).json({ success: false, error: 'Введите корректный номер телефона' });
      }
      if (isVirtualPhone(phone)) {
        return res.status(400).json({ success: false, error: 'Этот номер служебный и не может быть привязан к аккаунту' });
      }

      // Номер — это логин, он уникален. Занятость проверяем ДО звонка, иначе заплатим
      // за подтверждение и всё равно упрёмся в users_phone_unique при записи.
      // Исключение — карточка, которую человек только что подтвердил кодом: если номер
      // уже стоит в ней, это не конфликт, а тот же самый человек.
      const busy = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (busy.rows.length > 0 && busy.rows[0].id !== ticket.claimUserId) {
        return res.status(400).json({
          success: false,
          error: 'Этот номер уже используется другим аккаунтом. Войдите в него или восстановите пароль.'
        });
      }

      const limits = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(secs => $2)) AS in_cooldown,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')          AS calls_today
        FROM phone_verifications
        WHERE phone = $1 AND purpose = 'registration'
      `, [phone, RESEND_COOLDOWN_SECONDS]);

      if (Number(limits.rows[0].in_cooldown) > 0) {
        return res.status(429).json({ success: false, error: 'Повторить попытку можно через минуту' });
      }
      if (Number(limits.rows[0].calls_today) >= MAX_CALLS_PER_PHONE_PER_DAY) {
        return res.status(429).json({ success: false, error: 'Исчерпан суточный лимит подтверждений для этого номера' });
      }

      let check;
      try {
        check = await startPhoneCheck(phone);
      } catch (checkErr) {
        return res.status(502).json({ success: false, error: checkErr.message });
      }

      // Активной заявкой на номер должна быть ровно одна
      await pool.query(`
        UPDATE phone_verifications SET expires_at = NOW()
        WHERE phone = $1 AND purpose = 'registration' AND confirmed_at IS NULL AND expires_at > NOW()
      `, [phone]);

      const inserted = await pool.query(`
        INSERT INTO phone_verifications (phone, purpose, user_id, check_id, call_phone, request_ip, expires_at)
        VALUES ($1, 'registration', $2, $3, $4, $5, NOW() + make_interval(mins => $6))
        RETURNING expires_at
      `, [phone, ticket.claimUserId || null, check.checkId, check.callPhone, getRequestIp(req), CHECK_TTL_MINUTES]);

      return res.json({
        success: true,
        ticket: issueTicket({ ...ticket, phone }),
        phone,
        callPhone: check.callPhone,
        callPhonePretty: check.callPhonePretty,
        expiresAt: inserted.rows[0].expires_at
      });
    } catch (err) {
      console.error('Ошибка в RegistrationController.requestPhone:', err);
      return res.status(500).json({ success: false, error: 'Не удалось начать подтверждение номера' });
    }
  }

  // Шаг 4: опрос статуса звонка. Как только он засчитан — сразу создаём или активируем
  // аккаунт: отдельного шага «завершить» нет, чтобы не возникало состояния, когда номер
  // подтверждён, а учётной записи всё ещё не существует.
  async phoneStatus(req, res) {
    try {
      const ticket = readTicket(req.body.ticket);
      if (!ticket || !ticket.phone) {
        return res.status(400).json({ success: false, error: 'Время регистрации истекло, начните заново' });
      }

      const pending = await findPendingVerification(ticket.phone);
      if (!pending) {
        return res.json({ success: true, confirmed: false, active: false });
      }

      let check;
      try {
        check = await getPhoneCheckStatus(pending.check_id);
      } catch (checkErr) {
        return res.status(502).json({ success: false, error: checkErr.message });
      }

      if (!check.confirmed) {
        return res.json({ success: true, confirmed: false, active: check.pending });
      }

      const password = generateTempPassword();
      const passwordHash = await bcrypt.hash(password, 10);
      const client = await pool.connect();
      let isActivation = false;

      try {
        await client.query('BEGIN');

        // Между заказом звонка и его поступлением номер мог занять кто-то другой
        const busy = await client.query('SELECT id FROM users WHERE phone = $1', [ticket.phone]);
        if (busy.rows.length > 0 && busy.rows[0].id !== ticket.claimUserId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: 'Этот номер уже используется другим аккаунтом' });
        }

        if (ticket.claimUserId) {
          // Активация существующей карточки. Заглушечный номер заменяется подтверждённым,
          // технический адрес вида temp_...@users.lms — настоящей почтой человека.
          // virtual_code намеренно НЕ гасим: он остаётся рабочим до первого успешного
          // входа, чтобы опечатка в почте не заперла человека без пароля.
          const claimed = await client.query(`
            UPDATE users
            SET email = $1, first_name = $2, last_name = $3, middle_name = $4, birth_date = $5,
                password_hash = $6, phone = $7, phone_verified_at = NOW(),
                subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, NOW()), NOW() + make_interval(days => $9)),
                updated_at = NOW()
            WHERE id = $8 AND virtual_code IS NOT NULL
            RETURNING id
          `, [
            ticket.email, ticket.firstName, ticket.lastName, ticket.middleName || null,
            ticket.birthDate, passwordHash, ticket.phone, ticket.claimUserId, TRIAL_PERIOD_DAYS
          ]);

          if (claimed.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              error: 'Этот аккаунт уже активирован. Войдите в него или восстановите пароль.'
            });
          }
          isActivation = true;
          await recordConsent(client, ticket.claimUserId, req);
        } else {
          const created = await client.query(`
            INSERT INTO users (phone, email, first_name, last_name, middle_name, birth_date,
                               password_hash, status, phone_verified_at, subscription_expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW() + make_interval(days => $8))
            RETURNING id
          `, [
            ticket.phone, ticket.email, ticket.firstName, ticket.lastName,
            ticket.middleName || null, ticket.birthDate, passwordHash, TRIAL_PERIOD_DAYS
          ]);

          await recordConsent(client, created.rows[0].id, req);
        }

        await client.query('UPDATE phone_verifications SET confirmed_at = NOW() WHERE id = $1', [pending.id]);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');

        // Уникальные индексы — последний рубеж против дубля по номеру и почте
        if (txErr.code === '23505') {
          const field = String(txErr.constraint || '').includes('email') ? 'почта' : 'номер телефона';
          return res.status(400).json({ success: false, error: `Этот ${field} уже используется другим аккаунтом` });
        }
        throw txErr;
      } finally {
        client.release();
      }

      // Письмо отправляем ПОСЛЕ фиксации: если почтовый сервер недоступен, аккаунт всё
      // равно создан, и человек попадёт в него через восстановление пароля. Обратный
      // порядок оставил бы нас с отправленным паролем и несозданной учётной записью.
      try {
        await sendPasswordEmail(ticket.email, ticket.firstName, password, isActivation);
      } catch (mailErr) {
        console.error('Не удалось отправить письмо с паролем:', mailErr.message);
        return res.json({
          success: true,
          confirmed: true,
          emailSent: false,
          phone: ticket.phone,
          email: ticket.email
        });
      }

      return res.json({
        success: true,
        confirmed: true,
        emailSent: true,
        isActivation,
        phone: ticket.phone,
        email: ticket.email
      });
    } catch (err) {
      console.error('Ошибка в RegistrationController.phoneStatus:', err);
      return res.status(500).json({ success: false, error: 'Не удалось завершить регистрацию' });
    }
  }
}

export default new RegistrationController();
