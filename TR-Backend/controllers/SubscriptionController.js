import pool from '../config/db.js';

class SubscriptionController {

  // Список активных тарифов для экрана выбора подписки
  async getPlans(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, code, name, duration_days, price
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

  // Заготовка оформления заказа: фиксирует выбранный тариф и сумму, статус — pending.
  // Реальный редирект на платёжный шлюз подключим, когда выберем провайдера.
  async createOrder(req, res) {
    try {
      const userId = req.user.id;
      const { planId } = req.body;

      const planResult = await pool.query(
        `SELECT id, price FROM subscription_plans WHERE id = $1 AND is_active = true`,
        [planId]
      );
      if (planResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Тариф не найден' });
      }
      const plan = planResult.rows[0];

      const orderResult = await pool.query(
        `INSERT INTO subscription_orders (user_id, plan_id, amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, status`,
        [userId, plan.id, plan.price]
      );

      res.json({ success: true, order: orderResult.rows[0] });
    } catch (err) {
      console.error('Ошибка создания заказа подписки:', err);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  }
}

export default new SubscriptionController();
