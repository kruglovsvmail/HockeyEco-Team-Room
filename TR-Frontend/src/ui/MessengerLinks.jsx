import React from 'react';
import { TelegramLogo } from './MessengerLogos';

// =============================================================================
// НАПИСАТЬ В МЕССЕНДЖЕР
//
// Телефон в карточке человека нужен ровно для одного — связаться. Набирать его
// руками, переключаясь в другое приложение, лишняя работа: ссылка открывает
// переписку сразу.
//
// Пока здесь только Telegram, и это ограничение не наше: он умеет искать
// собеседника по номеру телефона (t.me/+7…), а MAX адресует людей внутренним
// идентификатором профиля (web.max.ru/153059578). Собрать такую ссылку из
// номера нельзя — для MAX пришлось бы хранить идентификатор у каждого
// пользователя отдельным полем, и кнопка появлялась бы только у тех, кто его
// заполнил. Появится поле — добавится и вторая ссылка.
// =============================================================================

// Формат ссылки держим отдельной константой: схемы у мессенджеров меняются,
// и искать их потом по разметке карточек было бы неоткуда.
const TELEGRAM_LINK = (digits) => `https://t.me/+${digits}`;

// Номер к виду, который понимает ссылка: только цифры, российская восьмёрка
// приводится к семёрке.
const toDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  return digits;
};

/**
 * Кнопка «написать» под контактами в карточке человека.
 * Ничего не рисует, если номера нет или он скрыт настройкой приватности.
 */
export function MessengerLinks({ phone, className = '' }) {
  const digits = toDigits(phone);
  if (!digits) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a
        href={TELEGRAM_LINK(digits)}
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Написать в Telegram"
        title="Написать в Telegram"
        onClick={(e) => e.stopPropagation()}
        className="w-9 h-9 rounded-xl overflow-hidden shadow-sm border border-surface-border shrink-0 outline-none active:scale-90 transition-transform"
      >
        <TelegramLogo className="w-full h-full" />
      </a>
    </div>
  );
}
