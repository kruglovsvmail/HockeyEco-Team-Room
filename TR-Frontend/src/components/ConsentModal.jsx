import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import { ButtonLP } from '../ui/Button-LP';
import { PolicySheet } from '../ui/PolicySheet';
import { getAuthHeaders, getPortalRoot } from '../utils/helpers';

/**
 * Блокирующее модальное окно согласия с Политикой обработки персональных данных.
 * Показывается пользователям, не принявшим актуальную версию политики.
 * Закрывается только кнопкой «Принять» — ссылка на полный текст открывает
 * PolicySheet поверх модалки (z-400 > z-350), не закрывая её.
 */
export function ConsentModal({ isOpen, onAccepted }) {
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/policy/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ source: 'modal' }),
      });
      const json = await res.json();
      if (json.success) {
        onAccepted();
      } else {
        setError(json.error || 'Не удалось сохранить согласие');
      }
    } catch (err) {
      console.error(err);
      setError('Ошибка соединения с сервером');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="absolute inset-0 z-[350] flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
        {/* Оверлей без onClick — окно закрывается только кнопкой «Принять» */}
        <div className="absolute inset-0 bg-overlay backdrop-blur-md" />

        <div className="bg-surface-level1 border border-surface-border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 flex flex-col gap-5 animate-scale-in text-left">

          <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <Icon name="shield_alert" className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-[14px] font-black text-content-main uppercase tracking-wider leading-none">
                Обновление условий
              </h3>
              <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-1 block">
                Персональные данные
              </span>
            </div>
          </div>

          <p className="text-[14px] text-content-main font-medium leading-relaxed">
            Мы опубликовали Политику обработки персональных данных. Продолжая использовать HockeyEco,
            вы подтверждаете, что ознакомились с ней и даёте согласие на обработку ваших персональных
            данных в целях работы сервиса.
          </p>

          <button
            type="button"
            onClick={() => setIsPolicyOpen(true)}
            className="text-[14px] text-brand hover:text-brand-hover font-medium text-left underline underline-offset-4 outline-none cursor-pointer"
          >
            Ознакомиться с Политикой
          </button>

          {error && (
            <p className="text-[12px] text-danger font-medium">{error}</p>
          )}

          <div className="flex gap-3 w-full pt-4 border-t border-surface-level2">
            <ButtonLP
              variant="primary"
              onClick={handleAccept}
              isLoading={isSubmitting}
              className="flex-1 !h-11 !text-[10px] !font-black !uppercase !tracking-widest shadow-md"
            >
              Принять и продолжить
            </ButtonLP>
          </div>

        </div>
      </div>

      {/* Шторка с полным текстом — поверх модалки, её закрытие модалку не трогает */}
      <PolicySheet isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
    </>,
    getPortalRoot()
  );
}
