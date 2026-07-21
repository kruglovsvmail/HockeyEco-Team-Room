import pool from '../config/db.js';
import { createPayment, getPayment } from '../services/yookassaService.js';

class SubscriptionController {

  // Список активных тарифов для экрана выбора подписки
  async getPlans(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, code, name, duration_months, price
         FROM subscription_plans
         WHERE is_active = true
         ORDER BY sort_order ASC`
      );
      res.json({ success: true, plans: result.rows });
    } catch (err) {
      console.error('Ошибка получения тарифов подписки:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }

  // Создаёт заказ (pending), затем платёж в ЮKassa и возвращает токен для встроенного виджета оплаты.
  async createOrder(req, res) {
    try {
      const userId = req.user.id;
      const { planId } = req.body;

      const planResult = await pool.query(
        `SELECT id, name, price FROM subscription_plans WHERE id = $1 AND is_active = true`,
        [planId]
      );
      if (planResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Тариф не найден' });
      }
      const plan = planResult.rows[0];

      const orderResult = await pool.query(
        `INSERT INTO subscription_orders (user_id, plan_id, amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [userId, plan.id, plan.price]
      );
      const orderId = orderResult.rows[0].id;

      const payment = await createPayment({
        amount: plan.price,
        description: `Подписка HockeyEco — ${plan.name}`,
        metadata: { order_id: String(orderId), user_id: String(userId) },
      });

      await pool.query(
        `UPDATE subscription_orders SET provider = 'yookassa', provider_payment_id = $1 WHERE id = $2`,
        [payment.id, orderId]
      );

      res.json({ success: true, confirmationToken: payment.confirmation?.confirmation_token });
    } catch (err) {
      console.error('Ошибка создания заказа подписки:', err);
      res.status(500).json({ success: false, error: 'Не удалось создать платёж. Попробуйте ещё раз.' });
    }
  }

  // Приём уведомлений от ЮKassa. Тело уведомления НЕ считаем источником истины
  // (по рекомендации ЮKassa) — по id платежа отдельно запрашиваем актуальный статус.
  async webhook(req, res) {
    // Отвечаем 200 сразу после валидации структуры, чтобы ЮKassa не долбила ретраями
    // при внутренних сбоях — сама ошибка всё равно уходит в лог для разбора.
    const paymentId = req.body?.object?.id;
    if (!paymentId) {
      return res.status(200).json({ success: true });
    }

    try {
      const payment = await getPayment(paymentId);
      const orderId = payment.metadata?.order_id;
      if (!orderId) {
        return res.status(200).json({ success: true });
      }

      const orderResult = await pool.query(
        `SELECT so.id, so.status, so.user_id, sp.duration_months
         FROM subscription_orders so
         JOIN subscription_plans sp ON sp.id = so.plan_id
         WHERE so.id = $1`,
        [orderId]
      );
      if (orderResult.rows.length === 0) {
        return res.status(200).json({ success: true });
      }
      const order = orderResult.rows[0];

      // Идемпотентность: заказ уже обработан (ЮKassa может слать уведомление повторно)
      if (order.status === 'paid' || order.status === 'failed' || order.status === 'cancelled') {
        return res.status(200).json({ success: true });
      }

      if (payment.status === 'succeeded') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE subscription_orders SET status = 'paid', paid_at = NOW() WHERE id = $1`,
            [order.id]
          );
          // Месяцы продления прибавляются к максимуму из текущей даты окончания и «сейчас» —
          // если подписка уже истекла, продление считается от текущего момента, а не от прошлой даты.
          // interval 'N months' — календарная арифметика Postgres, сама корректно учитывает
          // длину конкретного месяца и високосный год.
          await client.query(
            `UPDATE users
             SET subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, NOW()), NOW())
                                            + ($1 || ' months')::interval
             WHERE id = $2`,
            [order.duration_months, order.user_id]
          );
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          throw txErr;
        } finally {
          client.release();
        }
      } else if (payment.status === 'canceled') {
        await pool.query(`UPDATE subscription_orders SET status = 'cancelled' WHERE id = $1`, [order.id]);
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Ошибка обработки вебхука ЮKassa:', err);
      res.status(200).json({ success: true });
    }
  }
}

export default new SubscriptionController();
