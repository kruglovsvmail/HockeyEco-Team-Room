import { randomUUID } from 'crypto';

const API_BASE = 'https://api.yookassa.ru/v3';

const authHeader = () => {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
};

// Создаёт платёж в ЮKassa и возвращает объект платежа (с confirmation.confirmation_url)
export async function createPayment({ amount, description, returnUrl, metadata }) {
  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader(),
      'Idempotence-Key': randomUUID(),
    },
    body: JSON.stringify({
      amount: { value: Number(amount).toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description,
      metadata,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.description || 'Ошибка создания платежа в ЮKassa');
  }
  return data;
}

// Запрашивает у ЮKassa актуальный статус платежа напрямую (не доверяем телу вебхука по рекомендации ЮKassa)
export async function getPayment(paymentId) {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    headers: { 'Authorization': authHeader() },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.description || 'Ошибка получения статуса платежа в ЮKassa');
  }
  return data;
}
