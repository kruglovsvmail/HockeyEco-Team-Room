import React from 'react';

// =============================================================================
// ЛОГОТИПЫ МЕССЕНДЖЕРОВ
//
// Фирменные значки живут отдельно от общего набора Icon: там иконки рисуются
// одним контуром в currentColor, а эти — с собственными цветами и градиентами,
// и перекрашивать их нельзя.
//
// Идентификаторы градиентов уникальны в пределах документа, поэтому у каждого
// логотипа они свои: два одинаковых id на странице — и второй значок возьмёт
// заливку первого.
// =============================================================================

export const TelegramLogo = ({ className }) => (
  <svg viewBox="0 0 240.1 240.1" xmlns="http://www.w3.org/2000/svg" className={className} fill="none">
    <rect width="240.1" height="240.1" fill="url(#tg-logo-bg)" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#ffffff"
      d="M54.3002 118.799C89.3002 103.599 112.6 93.4992 124.3 88.5992C157.6 74.6992 164.6 72.2992 169.1 72.1992C170.1 72.1992 172.3 72.3992 173.8 73.5992C175 74.5992 175.3 75.8992 175.5 76.8992C175.7 77.8992 175.9 79.9992 175.7 81.5992C173.9 100.599 166.1 146.699 162.1 167.899C160.4 176.899 157.1 179.899 153.9 180.199C146.9 180.799 141.6 175.599 134.9 171.199C124.3 164.299 118.4 159.999 108.1 153.199C96.2002 145.399 103.9 141.099 110.7 134.099C112.5 132.299 143.2 104.299 143.8 101.799C143.9 101.499 143.9 100.299 143.2 99.6992C142.5 99.0992 141.5 99.2992 140.7 99.4992C139.6 99.6992 122.8 110.899 90.1002 132.999C85.3002 136.299 81.0002 137.899 77.1002 137.799C72.8002 137.699 64.6002 135.399 58.4002 133.399C50.9002 130.999 44.9002 129.699 45.4002 125.499C45.7002 123.299 48.7002 121.099 54.3002 118.799Z"
    />
    <defs>
      <linearGradient id="tg-logo-bg" x1="119.95" y1="0" x2="119.95" y2="238.201" gradientUnits="userSpaceOnUse">
        <stop stopColor="#424D58" />
        <stop offset="1" stopColor="#272A2F" />
      </linearGradient>
    </defs>
  </svg>
);

export const MaxLogo = ({ className }) => (
  <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" className={className} fill="none">
    <path fill="url(#max-logo-bg)" d="M0 0h500v500H0z" />
    <path fill="url(#max-logo-glow)" d="M0 0h500v500H0z" />
    <path
      fill="#ffffff"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M253.223 398.85c-29.441 0-43.123-4.298-66.905-21.49-15.043 19.341-62.679 34.456-64.756 8.596 0-19.412-4.298-35.816-9.17-53.725C106.59 310.168 100 285.598 100 249.997 100 164.968 169.771 101 252.435 101c82.736 0 147.564 67.12 147.564 149.784.278 81.386-65.391 147.632-146.776 148.066m1.218-224.355c-40.258-2.077-71.633 25.788-78.582 69.484-5.73 36.175 4.442 80.229 13.109 82.522 4.155 1.002 14.613-7.45 21.132-13.969a74.5 74.5 0 0 0 36.39 12.966c41.713 2.006 77.356-29.75 80.157-71.418 1.63-41.756-30.487-77.123-72.206-79.513z"
    />
    <defs>
      <radialGradient
        id="max-logo-glow"
        cx="0" cy="0" r="1"
        gradientTransform="matrix(378.9086 473.90374 -195.26028 156.1199 -11.895 -219.593)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#0000FF" />
        <stop offset="1" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="max-logo-bg" x1="58.923" x2="500" y1="380.268" y2="250" gradientUnits="userSpaceOnUse">
        <stop stopColor="#44CCFF" />
        <stop offset=".662" stopColor="#5533EE" />
        <stop offset="1" stopColor="#9933DD" />
      </linearGradient>
    </defs>
  </svg>
);

export const VkLogo = ({ className }) => (
  <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={className} fill="none">
    <path fill="#0077FF" d="M0 0h32v32H0z" />
    <path
      fill="#ffffff"
      d="M16.8 21.615c-6.15 0-9.656-4.208-9.8-11.22h3.093c.099 5.142 2.364 7.318 4.163 7.767v-7.768h2.904v4.433c1.771-.19 3.641-2.212 4.27-4.442h2.896a8.57 8.57 0 0 1-3.938 5.602A8.87 8.87 0 0 1 25 21.615h-3.192c-.683-2.131-2.391-3.785-4.648-4.01v4.01h-.36"
    />
  </svg>
);

// Где сообщество может держать свой чат. Ключи уходят в базу как есть,
// поэтому менять их нельзя — только дописывать новые.
export const CHAT_MESSENGERS = [
  { id: 'telegram', label: 'Telegram', Logo: TelegramLogo },
  { id: 'max',      label: 'MAX',      Logo: MaxLogo },
  { id: 'vk',       label: 'VK',       Logo: VkLogo },
];

export const getMessenger = (id) => CHAT_MESSENGERS.find(m => m.id === id) || null;

/**
 * Значок-ссылка на чат сообщества. Ничего не рисует, пока чат не заведён:
 * пустой квадрат в шапке хуже, чем его отсутствие.
 */
export function CommunityChatLink({ messenger, url, className = '', size = 'w-9 h-9' }) {
  const entry = getMessenger(messenger);
  if (!entry || !url) return null;

  const { Logo, label } = entry;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Чат сообщества в ${label}`}
      title={`Чат сообщества в ${label}`}
      onClick={(e) => e.stopPropagation()}
      className={`${size} rounded-xl overflow-hidden shadow-sm shrink-0 outline-none active:scale-90 transition-transform ${className}`}
    >
      <Logo className="w-full h-full" />
    </a>
  );
}
