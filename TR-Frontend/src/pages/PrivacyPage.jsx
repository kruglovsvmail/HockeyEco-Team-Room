import React, { useState, useEffect } from 'react';
import { PolicyContent } from '../ui/PolicyContent';

/**
 * Публичная страница Политики обработки персональных данных.
 * Доступна без авторизации по прямой ссылке /privacy — требуется для
 * модерации платёжной системой и как постоянный публичный адрес документа.
 */
export function PrivacyPage() {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/policy/current`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setPolicy(json.policy);
        else setError(json.error || 'Документ не найден');
      })
      .catch(() => setError('Ошибка соединения с сервером'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col w-full h-full bg-surface-base overflow-hidden">

      {/* Минималистичная публичная шапка */}
      <header className="flex items-center justify-center px-4 h-[60px] border-b border-surface-border shrink-0 bg-surface-level1/60 backdrop-blur-md">
        <h1 className="text-[14px] font-black uppercase tracking-widest text-content-main">
          HOCKEY<span className="text-brand">ECO</span>
        </h1>
      </header>

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
    </div>
  );
}
