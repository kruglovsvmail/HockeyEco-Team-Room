import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from './Icon';
import { PolicyContent } from './PolicyContent';
import { getPortalRoot } from '../utils/helpers';

/**
 * Полноэкранная шторка с текстом Политики обработки персональных данных.
 * Рендерится через портал с высоким z-index — открывается ПОВЕРХ любых
 * модалок и шторок (модалка согласия, BottomSheet регистрации и т.д.),
 * не завися от их состояния и не закрывая их.
 */
export function PolicySheet({ isOpen, onClose }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Текст загружаем при первом открытии, дальше кэшируем в стейте
  useEffect(() => {
    if (!isOpen || policy || loading) return;
    setLoading(true);
    setError('');
    fetch(`${import.meta.env.VITE_API_URL}/api/policy/current`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setPolicy(json.policy);
        else setError(json.error || 'Не удалось загрузить документ');
      })
      .catch(() => setError('Ошибка соединения с сервером'))
      .finally(() => setLoading(false));
  }, [isOpen, policy, loading]);

  return createPortal(
    <div
      className={clsx(
        "absolute inset-0 z-[400] flex flex-col w-full h-full bg-surface-base transition-transform duration-500",
        "ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform overscroll-none",
        isOpen ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
      )}
    >
      {/* Шапка шторки */}
      <header className="flex items-center justify-between px-4 h-[60px] border-b border-surface-border shrink-0 bg-surface-level1/60 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 text-content-muted hover:text-brand active:scale-95 transition-all outline-none cursor-pointer flex items-center justify-center rounded-full"
        >
          <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">
          HockeyEco
        </span>
        <div className="w-7 h-7 opacity-0 pointer-events-none" />
      </header>

      {/* Текст документа */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6">
        <div className="max-w-2xl mx-auto pb-10">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && !loading && (
            <p className="text-[14px] text-danger font-medium text-center py-20">{error}</p>
          )}
          {policy && !loading && (
            <>
              <PolicyContent text={policy.content} />
              <p className="text-[11px] text-content-muted opacity-60 mt-8 text-left">
                Версия {policy.version}
                {policy.published_at && ` · опубликована ${new Date(policy.published_at).toLocaleDateString('ru-RU')}`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    getPortalRoot()
  );
}
