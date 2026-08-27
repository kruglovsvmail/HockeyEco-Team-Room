// Интеграция с SMS.RU — подтверждение номера телефона звонком (метод /code/call).
//
// Схема принципиально отличается от SMS: сервис звонит пользователю с временного номера,
// а кодом подтверждения служат ПОСЛЕДНИЕ 4 ЦИФРЫ этого номера. Отвечать на звонок не нужно.
// Код приходит прямо в ответе API, поэтому генерировать его самим и ждать колбэков не требуется.
//
// Канал выбран основным из-за цены: звонок стоит 0.40 ₽ против 5.64 ₽ за SMS, а буквенное
// имя отправителя (регистрация у каждого оператора, документы юрлица, 1–2 недели) для
// звонков не нужно вовсе — отправителем выступает обычный телефонный номер.

const SMSRU_CALL_URL = 'https://sms.ru/code/call';

// Таймаут на поход к SMS.RU: пользователь ждёт ответа в интерфейсе, зависать нельзя.
const REQUEST_TIMEOUT_MS = 15000;

// Расшифровки кодов ответа SMS.RU. Список неполный намеренно: всё, чего здесь нет,
// показываем пользователю обобщённо, а точный status_text уводим в лог сервера —
// так неизвестный код не превращается в непонятную пользователю ошибку.
const ERROR_MESSAGES = {
  200: 'Сервис звонков отклонил ключ доступа',
  201: 'На балансе сервиса звонков закончились средства',
  202: 'Некорректный номер телефона',
  206: 'Исчерпан дневной лимит звонков',
  207: 'На этот номер нельзя совершить звонок',
  209: 'Номер находится в стоп-листе сервиса звонков',
  220: 'Сервис звонков временно недоступен, попробуйте позже',
  230: 'Превышен лимит звонков на этот номер, попробуйте позже'
};

/**
 * Заказывает звонок с кодом подтверждения.
 *
 * @param {string} phone  Номер в любом формате — внутри приводится к 79XXXXXXXXX
 * @param {string} userIp IP КОНЕЧНОГО ПОЛЬЗОВАТЕЛЯ (не сервера). SMS.RU по нему ловит
 *                        накрутку; при недоступности штатно передаётся -1.
 * @returns {Promise<{code: string, callId: string|null, cost: number, balance: number}>}
 */
export const requestVerificationCall = async (phone, userIp) => {
  const apiId = process.env.SMSRU_API_ID;
  if (!apiId) {
    console.error('SMS.RU: переменная окружения SMSRU_API_ID не задана');
    throw new Error('Сервис звонков не настроен на сервере');
  }

  const params = new URLSearchParams({
    phone: String(phone).replace(/\D/g, ''),
    ip: userIp || '-1',
    api_id: apiId,
    json: '1'
  });

  let payload;
  try {
    const response = await fetch(SMSRU_CALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    payload = await response.json();
  } catch (err) {
    console.error('SMS.RU: запрос не выполнен или ответ не разобран:', err.message);
    throw new Error('Сервис звонков не отвечает. Попробуйте позже.');
  }

  if (payload.status !== 'OK') {
    const statusCode = Number(payload.status_code);
    console.error('SMS.RU отклонил звонок:', statusCode, payload.status_text);
    throw new Error(ERROR_MESSAGES[statusCode] || 'Не удалось выполнить звонок. Попробуйте позже.');
  }

  return {
    code: String(payload.code),
    callId: payload.call_id ? String(payload.call_id) : null,
    cost: payload.cost,
    balance: payload.balance
  };
};
