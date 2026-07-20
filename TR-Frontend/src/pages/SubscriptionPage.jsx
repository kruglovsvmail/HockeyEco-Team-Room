import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders } from '../utils/helpers';
import { getSubscriptionStatus } from '../utils/subscription';
import { FadeIn, StaggerContainer } from '../ui/FadeIn';
import { ButtonLP } from '../ui/Button-LP';
import { Icon } from '../ui/Icon';
import { Toast } from '../ui/Toast';

// Форматирует цену в рублях без копеек: "1 800 ₽"
const formatPrice = (price) => `${Math.round(Number(price)).toLocaleString('ru-RU')} ₽`;

// Онлайн-оплата подключена (ЮKassa) — карточки тарифов активны.
const PLANS_ENABLED = true;

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 2500;

/**
 * Полноценный раздел оформления подписки.
 * Название раздела выводится в системной шапке (Header), статус — под заголовком страницы.
 * Оплата проходит на стороне ЮKassa: «Оформить» создаёт заказ и уводит на её страницу оплаты,
 * после чего ЮKassa возвращает пользователя сюда с ?payment=return.
 */
export function SubscriptionPage() {
  const { user } = useOutletContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  const status = getSubscriptionStatus(user?.subscriptionExpiresAt || user?.subscription_expires_at);

  const triggerToast = (message, type = 'success') => setToast({ isOpen: true, message, type });

  // Запоминаем дату окончания подписки на момент открытия страницы —
  // с ней сравниваем ответ /api/auth/me при опросе после возврата с оплаты
  const baselineExpiresAtRef = useRef(user?.subscriptionExpiresAt || user?.subscription_expires_at || null);

  // После редиректа обратно из ЮKassa (?payment=return) опрашиваем сервер,
  // пока вебхук не продлит подписку — статус страницы обновится сам, без перезахода.
  useEffect(() => {
    if (searchParams.get('payment') !== 'return') return;

    // Убираем query-параметр сразу, чтобы повторный заход/обновление страницы не запускал опрос заново
    navigate(location.pathname, { replace: true });

    let attempt = 0;
    let cancelled = false;
    setIsCheckingPayment(true);

    const poll = async () => {
      attempt += 1;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (cancelled) return;

        if (json.success && json.user) {
          const freshExpiresAt = json.user.subscriptionExpiresAt;
          if (freshExpiresAt && freshExpiresAt !== baselineExpiresAtRef.current) {
            // Синхронизируем локальный кэш и остальные компоненты (сайдбар и т.д.) — тот же паттерн,
            // что и в глобальном 403-интерцепторе (utils/helpers.js)
            localStorage.setItem('teampwa_cached_user', JSON.stringify(json.user));
            localStorage.setItem('teampwa_user', JSON.stringify(json.user));
            window.dispatchEvent(new CustomEvent('pwa_auth_matrix_refresh', { detail: json.user }));
            setIsCheckingPayment(false);
            triggerToast('Оплата прошла успешно, подписка продлена!', 'success');
            return;
          }
        }
      } catch (err) {
        console.error('Ошибка проверки статуса оплаты:', err);
      }

      if (!cancelled && attempt < POLL_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL_MS);
      } else if (!cancelled) {
        setIsCheckingPayment(false);
        triggerToast('Платёж обрабатывается. Обновите страницу через минуту.', 'danger');
      }
    };

    poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/subscription/plans`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (json.success) setPlans(json.plans || []);
    } catch (err) {
      console.error('Ошибка загрузки тарифов подписки:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Пока планы скрыты — тарифы с сервера не запрашиваем
  useEffect(() => {
    if (PLANS_ENABLED) loadPlans();
    else setLoading(false);
  }, [loadPlans]);

  // Цена базового месячного тарифа — для расчета выгоды на длинных тарифах
  const basePlan = plans.find(p => p.duration_days <= 31) || plans[0];
  const basePricePerDay = basePlan ? Number(basePlan.price) / basePlan.duration_days : null;

  const handleSubscribe = async (planId) => {
    if (submittingId) return;
    setSubmittingId(planId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/subscription/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ planId }),
      });
      const json = await res.json();
      if (json.success && json.confirmationUrl) {
        // Уводим пользователя на страницу оплаты ЮKassa. Не сбрасываем submittingId —
        // кнопка должна оставаться в состоянии загрузки до фактического ухода со страницы.
        window.location.href = json.confirmationUrl;
        return;
      } else {
        triggerToast(json.error || 'Не удалось создать заказ', 'danger');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка соединения с сервером', 'danger');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <FadeIn className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pt-2 pb-24 bg-surface-base transition-colors duration-300">

        {/* Индикатор ожидания подтверждения платежа после возврата с оплаты ЮKassa */}
        {isCheckingPayment && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-brand/10 border border-brand/20 mb-3">
            <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-[12px] font-bold text-brand">Проверяем статус оплаты…</span>
          </div>
        )}

        {/* Блок текущего статуса подписки — в каноничном стиле блоков Профиля/Настроек */}
        <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mb-3 text-left transition-colors duration-300">
          <div className="flex items-center justify-between border-b border-surface-border pb-1.5 mb-2">
            <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
              Статус подписки
            </span>
            {/* Световой индикатор состояния */}
            <span className={clsx(
              "w-2 h-2 rounded-full shrink-0",
              status.tone === 'danger' && "bg-danger animate-pulse",
              status.tone === 'warning' && "bg-amber-500 animate-pulse",
              status.tone === 'default' && "bg-success"
            )} />
          </div>
          <span className={clsx(
            "text-[16px] font-bold leading-tight pt-1",
            status.tone === 'danger' && "text-danger",
            status.tone === 'warning' && "text-amber-500",
            status.tone === 'default' && "text-success"
          )}>
            {status.shortLabel}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <StaggerContainer>

            {PLANS_ENABLED ? (
            <>
            {/* Карточки тарифов */}
            <div className="flex flex-col gap-3">
              {plans.map(plan => {
                const pricePerDay = Number(plan.price) / plan.duration_days;
                const discountPct = basePricePerDay && pricePerDay < basePricePerDay
                  ? Math.round((1 - pricePerDay / basePricePerDay) * 100)
                  : 0;
                const months = Math.round(plan.duration_days / 30);
                const pricePerMonth = months > 1 ? Math.round(Number(plan.price) / months) : null;

                return (
                  <div
                    key={plan.id}
                    className="flex flex-col p-4 rounded-2xl border border-surface-border bg-surface-level1 shadow-md text-left transition-colors duration-300"
                  >
                    {/* Шапка карточки — как у блоков Профиля/Настроек */}
                    <div className="flex items-center gap-2 border-b border-surface-border pb-1.5 mb-3">
                      <Icon name="calendar" className="w-3.5 h-3.5 text-brand" />
                      <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
                        {plan.name}
                      </span>
                    </div>

                    {/* Цена и выгода */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[24px] font-black text-content-main leading-none">
                        {formatPrice(plan.price)}
                      </span>
                      {discountPct > 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-brand/15 text-brand shrink-0">
                          Выгода {discountPct}%
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] font-medium text-content-muted mb-4">
                      {pricePerMonth
                        ? `≈ ${formatPrice(pricePerMonth)} в месяц · доступ на ${plan.duration_days} дней`
                        : `Доступ на ${plan.duration_days} дней`}
                    </span>

                    <ButtonLP
                      variant="outline"
                      className="!py-3 text-[13px] !text-content-main"
                      onClick={() => handleSubscribe(plan.id)}
                      isLoading={submittingId === plan.id}
                      disabled={!!submittingId && submittingId !== plan.id}
                    >
                      Оформить
                    </ButtonLP>
                  </div>
                );
              })}
            </div>

            {/* Дисклеймер о механике продления и стороннем платёжном сервисе */}
            <p className="text-[11px] font-medium text-content-muted leading-relaxed mt-5 px-1 opacity-70 text-left">
              Оплата производится через защищённый сторонний платёжный сервис.
              При продлении оплаченные дни добавляются к текущей дате окончания подписки — ни один день не сгорает.
            </p>
            </>
            ) : (
              /* Заглушка на время подключения платёжного провайдера */
              <div className="flex flex-col p-4 rounded-2xl border border-surface-border bg-surface-level1 shadow-md text-left transition-colors duration-300">
                <div className="flex items-center gap-2 border-b border-surface-border pb-1.5 mb-3">
                  <Icon name="clock" className="w-3.5 h-3.5 text-brand" />
                  <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
                    Онлайн-оплата
                  </span>
                </div>
                <p className="text-[14px] font-medium text-content-main leading-relaxed">
                  Онлайн-оплата подписки скоро будет доступна прямо в приложении.
                  По вопросам оформления и продления подписки напишите нам:{' '}
                  <a href="mailto:support@hockeyeco.ru" className="text-brand font-bold underline underline-offset-4">
                    support@hockeyeco.ru
                  </a>
                </p>
              </div>
            )}

          </StaggerContainer>
        )}

      </div>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />
    </FadeIn>
  );
}
