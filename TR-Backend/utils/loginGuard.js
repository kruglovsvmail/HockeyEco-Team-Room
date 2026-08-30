import pool from '../config/db.js';

// Защита входа от перебора пароля.
//
// Счётчики держим в базе, а не в памяти процесса: контейнеры на Timeweb перезапускаются,
// и лимит в оперативке обнулялся бы вместе с ними. Таблица login_attempts общая для
// Team Room и LMS — база у приложений одна, а злоумышленнику безразлично, через какую
// дверь ломиться, поэтому и счёт должен быть общим.
//
// Отдельная причина, по которой лимит обязателен: каждая попытка запускает bcrypt, а он
// намеренно медленный. Без ограничения перебор не только подбирает пароль, но и кладёт
// приложение, съедая процессор единственного ядра контейнера.

const MAX_FAILURES_PER_PHONE = 10;  // Подряд неудачных попыток на один номер
const PHONE_WINDOW_MINUTES = 15;    // Окно, в котором они считаются

const MAX_FAILURES_PER_IP = 60;     // Потолок на один адрес по всем номерам сразу
const IP_WINDOW_MINUTES = 15;       // Ловит перебор по чужим номерам с одной машины

// Потолок по адресу держим примерно вшестеро выше, чем на один номер. За общим Wi-Fi
// (раздевалка, спортшкола) сидит вся команда, и несколько человек, забывших пароль в
// день выдачи, не должны блокировать остальных: лимит проверяется ДО сверки пароля,
// поэтому упёршийся в него получит отказ даже с верным паролем.

/**
 * Можно ли пускать этот номер с этого адреса к проверке пароля.
 * Возвращает { allowed, error } — error уже готов к показу пользователю.
 */
export const checkLoginAllowed = async (phone, ip) => {
  // WHERE обязателен: без него запрос считал бы FILTER по всей таблице целиком,
  // не задействуя индексы. Сначала отсекаем окно и нужные ключи, потом уже считаем.
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE phone = $1 AND created_at > NOW() - make_interval(mins => $3)
      ) AS phone_failures,
      COUNT(*) FILTER (
        WHERE request_ip = $2 AND created_at > NOW() - make_interval(mins => $4)
      ) AS ip_failures
    FROM login_attempts
    WHERE created_at > NOW() - make_interval(mins => GREATEST($3, $4))
      AND (phone = $1 OR ($2 IS NOT NULL AND request_ip = $2))
  `, [phone, ip, PHONE_WINDOW_MINUTES, IP_WINDOW_MINUTES]);

  const { phone_failures, ip_failures } = rows[0];

  if (Number(phone_failures) >= MAX_FAILURES_PER_PHONE) {
    return {
      allowed: false,
      error: `Слишком много неудачных попыток входа. Повторите через ${PHONE_WINDOW_MINUTES} минут или восстановите пароль.`
    };
  }

  if (Number(ip_failures) >= MAX_FAILURES_PER_IP) {
    return {
      allowed: false,
      error: 'Слишком много попыток входа с этого устройства. Повторите позже.'
    };
  }

  return { allowed: true, error: null };
};

/**
 * Фиксация неудачной попытки. Успешные не пишем — вместо этого чистим историю номера,
 * чтобы человек, вспомнивший пароль с третьего раза, не оставался с висящим счётчиком.
 */
export const recordLoginFailure = async (phone, ip, app) => {
  try {
    await pool.query(
      'INSERT INTO login_attempts (phone, request_ip, app) VALUES ($1, $2, $3)',
      [phone, ip, app]
    );

    // Уборка старых записей время от времени. Отдельного планировщика для этого заводить
    // не стоит: таблица растёт только от неудачных попыток, и раз в двадцать промахов
    // подчистить сутки более чем достаточно, чтобы она не разрасталась.
    if (Math.random() < 0.05) {
      await pool.query("DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '1 day'");
    }
  } catch (err) {
    // Журнал попыток не должен ронять вход: если запись не удалась, пишем в лог и живём дальше
    console.error('Не удалось записать неудачную попытку входа:', err.message);
  }
};

/**
 * Сброс счётчика после успешного входа. Чистим только строки этого номера —
 * лимит по адресу при этом сохраняется, иначе злоумышленник обнулял бы его,
 * заходя между попытками в собственный аккаунт.
 */
export const clearLoginFailures = async (phone) => {
  try {
    await pool.query('DELETE FROM login_attempts WHERE phone = $1', [phone]);
  } catch (err) {
    console.error('Не удалось очистить счётчик попыток входа:', err.message);
  }
};

// Приведение req.ip к виду, пригодному для сравнения (Express отдаёт IPv4 в IPv6-обёртке).
// Значимый адрес приходит только при включённом trust proxy — иначе это адрес прокси.
export const getRequestIp = (req) => String(req.ip || '').replace(/^::ffff:/, '') || null;
