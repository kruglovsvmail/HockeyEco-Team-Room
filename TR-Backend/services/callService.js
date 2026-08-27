// Интеграция с SMS.RU — подтверждение номера телефона звонком ОТ пользователя
// (методы /callcheck/add и /callcheck/status).
//
// ПОЧЕМУ НЕ «МЫ ЗВОНИМ ВАМ». У SMS.RU есть метод /code/call, где кодом служат последние
// 4 цифры номера, с которого поступает вызов. Схема привычнее для пользователя, но с
// марта 2025 операторы целенаправленно блокируют такие вызовы, защищая выручку от SMS.
// Проверка на живом аккаунте это подтвердила: запрос принят, деньги списаны, звонок до
// адресата не дошёл. Поэтому рабочей осталась только обратная схема.
//
// КАК РАБОТАЕТ. Мы регистрируем ожидание звонка с конкретного номера и получаем телефон
// SMS.RU, на который пользователь должен позвонить. Он звонит с подтверждаемой SIM,
// сервис опознаёт входящий по АОН и сбрасывает вызов — брать трубку никто не должен.
// Для пользователя звонок бесплатный. Опознание идёт по номеру звонящего, поэтому
// звонить нужно именно с той SIM-карты, которую подтверждаем, и с открытым АОН.

const CALLCHECK_ADD_URL = 'https://sms.ru/callcheck/add';
const CALLCHECK_STATUS_URL = 'https://sms.ru/callcheck/status';

// Таймаут на поход к SMS.RU: пользователь ждёт ответа в интерфейсе, зависать нельзя
const REQUEST_TIMEOUT_MS = 15000;

// Значения поля check_status в ответе /callcheck/status
const CHECK_STATUS_PENDING = 400;   // Ждём звонка от пользователя
const CHECK_STATUS_CONFIRMED = 401; // Номер подтверждён
// Всё остальное (402 и прочее) означает, что проверка больше не активна

// Расшифровки кодов ответа SMS.RU. Список неполный намеренно: всё, чего здесь нет,
// показываем пользователю обобщённо, а точный status_text уводим в лог сервера.
const ERROR_MESSAGES = {
  200: 'Сервис подтверждения отклонил ключ доступа',
  201: 'На балансе сервиса подтверждения закончились средства',
  202: 'Некорректный номер телефона',
  206: 'Исчерпан дневной лимит подтверждений',
  207: 'Для этого номера подтверждение недоступно',
  209: 'Номер находится в стоп-листе сервиса',
  220: 'Сервис подтверждения временно недоступен, попробуйте позже',
  230: 'Превышен лимит подтверждений на этот номер, попробуйте позже'
};

/**
 * Общая часть обоих запросов: подстановка ключа, разбор ответа, перевод кода ошибки
 * в понятный пользователю текст.
 */
const requestSmsRu = async (url, extraParams) => {
  const apiId = process.env.SMSRU_API_ID;
  if (!apiId) {
    console.error('SMS.RU: переменная окружения SMSRU_API_ID не задана');
    throw new Error('Сервис подтверждения не настроен на сервере');
  }

  const params = new URLSearchParams({ ...extraParams, api_id: apiId, json: '1' });

  let payload;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    payload = await response.json();
  } catch (err) {
    console.error('SMS.RU: запрос не выполнен или ответ не разобран:', url, err.message);
    throw new Error('Сервис подтверждения не отвечает. Попробуйте позже.');
  }

  if (payload.status !== 'OK') {
    const statusCode = Number(payload.status_code);
    console.error('SMS.RU отклонил запрос:', url, statusCode, payload.status_text);
    throw new Error(ERROR_MESSAGES[statusCode] || 'Не удалось начать подтверждение. Попробуйте позже.');
  }

  return payload;
};

/**
 * Регистрирует ожидание звонка с указанного номера.
 * Возвращает телефон, на который пользователь должен позвонить, и идентификатор проверки.
 */
export const startPhoneCheck = async (phone) => {
  const payload = await requestSmsRu(CALLCHECK_ADD_URL, {
    phone: String(phone).replace(/\D/g, '')
  });

  return {
    checkId: String(payload.check_id),
    callPhone: String(payload.call_phone),
    callPhonePretty: payload.call_phone_pretty ? String(payload.call_phone_pretty) : String(payload.call_phone)
  };
};

/**
 * Спрашивает у SMS.RU, поступил ли звонок.
 *
 * Подтверждением считается ТОЛЬКО check_status = 401. Любой неизвестный статус трактуется
 * как «не подтверждено»: ошибиться в эту сторону безопасно, в обратную — значит отдать
 * человеку чужой номер в качестве логина.
 */
export const getPhoneCheckStatus = async (checkId) => {
  const payload = await requestSmsRu(CALLCHECK_STATUS_URL, { check_id: String(checkId) });
  const checkStatus = Number(payload.check_status);

  if (checkStatus !== CHECK_STATUS_PENDING && checkStatus !== CHECK_STATUS_CONFIRMED) {
    console.warn('SMS.RU: проверка звонком неактивна, статус', checkStatus, payload.check_status_text);
  }

  return {
    confirmed: checkStatus === CHECK_STATUS_CONFIRMED,
    pending: checkStatus === CHECK_STATUS_PENDING
  };
};
