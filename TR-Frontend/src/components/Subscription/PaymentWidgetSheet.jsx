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

// Форма самой ЮKassa всегда светлая (тёмную тему для неё они по факту не применяют
// корректно — проверено), поэтому и шапку, и тело шторки, и цвета виджета фиксируем
// на светлой палитре напрямую, не завязываясь на CSS-переменные темы приложения
const WIDGET_COLORS = {
  control_primary: '#1794dd',
  control_primary_content: '#ffffff',
  background: '#ffffff',
  text: '#1f2937',
  border: '#e2e4e7',
  control_secondary: '#e5e7eb',
};

/**
 * Шторка со встроенным виджетом оплаты ЮKassa. Форма оплаты рендерится прямо здесь —
 * пользователь не покидает PWA. Результат оплаты ловим событиями виджета (`success`/`fail`),
 * поэтому return_url НЕ передаём — при его наличии ЮKassa эти события не генерирует и вместо
 * этого просто делает редирект, а нам нужна реакция без ухода со страницы.
 * onError — технический сбой самого виджета (невалидный токен, обрыв сети), не о неудачной
 * попытке оплаты (её виджет обычно обрабатывает сам, предлагая повторить другим способом).
 *
 * @param {boolean} isOpen
 * @param {string} confirmationToken - токен подтверждения из ответа /api/subscription/orders
 * @param {function} onClose - закрытие без результата (пользователь передумал)
 * @param {function} onSuccess - платёж подтверждён успешно (событие виджета 'success')
 * @param {function} onFail - платёж не удался/токен истёк (событие виджета 'fail')
 * @param {function} onError - технический сбой виджета
 */
export function PaymentWidgetSheet({ isOpen, confirmationToken, onClose, onSuccess, onFail, onError }) {
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
          customization: { colors: WIDGET_COLORS },
          error_callback: (err) => {
            console.error('Ошибка виджета ЮKassa:', err);
            if (!cancelled) onError();
          },
        });
        widgetRef.current = widget;

        widget.on('success', () => { if (!cancelled) onSuccess(); });
        widget.on('fail', () => { if (!cancelled) onFail(); });

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
        "absolute inset-0 z-[450] flex flex-col w-full h-full bg-white transition-transform duration-500",
        "ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform overscroll-none",
        isOpen ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
      )}
    >
      {/* Шапка всегда светлая — независимо от темы приложения, чтобы не контрастировать
          со всегда-светлой формой ЮKassa под ней */}
      <header className="flex items-center justify-between px-4 h-[60px] border-b border-[#e2e4e7] shrink-0 bg-white/80 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 text-[#6b7280] hover:text-brand active:scale-95 transition-all outline-none cursor-pointer flex items-center justify-center rounded-full"
        >
          <Icon name="chevron_left" className="w-7 h-7 text-[#1f2937]" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280]">
          Оплата подписки
        </span>
        <div className="w-7 h-7 opacity-0 pointer-events-none" />
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <PageLoader />
            <p className="text-[12px] text-[#6b7280] text-center px-6 -mt-6 leading-relaxed">
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
