import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';
import { getPortalRoot } from '../../utils/helpers';

const WIDGET_SCRIPT_SRC = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';
const WIDGET_CONTAINER_ID = 'yookassa-widget-container';

let widgetScriptPromise = null;

// Скрипт виджета грузим один раз за всю жизнь вкладки и переиспользуем промис,
// чтобы повторные открытия шторки не вставляли тег заново
function loadWidgetScript() {
  if (window.YooMoneyCheckoutWidget) return Promise.resolve();
  if (widgetScriptPromise) return widgetScriptPromise;

  widgetScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { widgetScriptPromise = null; reject(new Error('Не удалось загрузить виджет оплаты')); };
    document.head.appendChild(script);
  });
  return widgetScriptPromise;
}

// ЮKassa принимает только 6-значный HEX — CSS-переменные темы иногда заданы
// 8-значным (с альфа-каналом), поэтому альфу обрезаем
const toHex6 = (value, fallback) => {
  const hex = value?.trim().replace('#', '').slice(0, 6);
  return hex && hex.length === 6 ? `#${hex}` : fallback;
};

// Читаем цвета из ЖИВЫХ CSS-переменных темы в момент открытия — так виджет автоматически
// подстраивается и под светлую/тёмную тему, и под цвет активной команды (--color-brand
// переопределяется в TeamLayout при выбранном командном цвете)
function getWidgetColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => toHex6(styles.getPropertyValue(name), fallback);

  return {
    control_primary: read('--color-brand', '#1794dd'),
    background: read('--color-surface-level1', '#ffffff'),
    text: read('--color-content-main', '#1f2937'),
    border: read('--color-surface-border', '#e2e4e7'),
    control_secondary: read('--color-surface-level2', '#e5e7eb'),
  };
}

/**
 * Шторка со встроенным виджетом оплаты ЮKassa. Форма оплаты рендерится прямо здесь —
 * пользователь не покидает PWA. Успех/неудача попытки оплаты обрабатываются виджетом
 * ВНУТРИ себя (страница успеха, либо сообщение об ошибке с повтором выбора способа) —
 * никаких JS-событий success/fail у виджета нет. После успешной оплаты виджет сам
 * переходит на return_url — туда же, куда возвращают и внешние способы (СБП/T-Pay),
 * и именно там (SubscriptionPage, ?payment=return) уже реализован опрос статуса.
 * onError здесь — только про технические сбои самого виджета (не о неудачном платеже).
 *
 * @param {boolean} isOpen
 * @param {string} confirmationToken - токен подтверждения из ответа /api/subscription/orders
 * @param {function} onClose - закрытие без результата (пользователь передумал)
 * @param {function} onError - технический сбой виджета (невалидный токен, обрыв сети)
 */
export function PaymentWidgetSheet({ isOpen, confirmationToken, onClose, onError }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const widgetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !confirmationToken) return;

    let cancelled = false;
    setStatus('loading');

    loadWidgetScript()
      .then(() => {
        if (cancelled) return;

        const widget = new window.YooMoneyCheckoutWidget({
          confirmation_token: confirmationToken,
          return_url: `${window.location.origin}/subscription?payment=return`,
          customization: { colors: getWidgetColors() },
          error_callback: (err) => {
            console.error('Ошибка виджета ЮKassa:', err);
            if (!cancelled) onError();
          },
        });
        widgetRef.current = widget;
        widget.render(WIDGET_CONTAINER_ID);
      })
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((err) => {
        console.error('Ошибка инициализации виджета ЮKassa:', err);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      if (widgetRef.current) {
        widgetRef.current.destroy();
        widgetRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, confirmationToken]);

  return createPortal(
    <div
      className={clsx(
        "absolute inset-0 z-[450] flex flex-col w-full h-full bg-surface-base transition-transform duration-500",
        "ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform overscroll-none",
        isOpen ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
      )}
    >
      <header className="flex items-center justify-between px-4 h-[60px] border-b border-surface-border shrink-0 bg-surface-level1/60 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 text-content-muted hover:text-brand active:scale-95 transition-all outline-none cursor-pointer flex items-center justify-center rounded-full"
        >
          <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">
          Оплата подписки
        </span>
        <div className="w-7 h-7 opacity-0 pointer-events-none" />
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <PageLoader />
            <p className="text-[12px] text-content-muted text-center px-6 -mt-6 leading-relaxed">
              Форма оплаты загружается дольше обычного. Если включён VPN — попробуйте
              отключить его или сменить сервер, обычно это ускоряет загрузку.
            </p>
          </div>
        )}
        {status === 'error' && (
          <p className="text-[14px] text-danger font-medium text-center py-20">
            Не удалось загрузить форму оплаты. Проверьте соединение и попробуйте ещё раз.
          </p>
        )}
        {/* Контейнер виджета существует всегда (нужен виджету для рендера), просто скрыт до готовности */}
        <div id={WIDGET_CONTAINER_ID} className={status === 'ready' ? 'block' : 'hidden'} />
      </div>
    </div>,
    getPortalRoot()
  );
}
