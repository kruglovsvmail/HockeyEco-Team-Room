// Единая нормализация телефонов для всего Team Room.
//
// Телефон в HockeyEco — это логин, а не контакт, и его уникальность держит индекс
// users_phone_unique. Для базы "+79001234567" и "89001234567" — разные строки, поэтому
// любой номер, приходящий с фронта, обязан пройти через normalizePhone, иначе один
// человек заведёт себе два аккаунта на один телефон и индекс этого не заметит.

// Диапазон служебных номеров LMS (+70000000001–+70000000999) для карточек игроков,
// у которых реального телефона нет. Такие аккаунты полноценно рабочие, но дозвониться
// на них невозможно, поэтому назначить себе номер отсюда через профиль нельзя.
const VIRTUAL_PHONE_PREFIX = '+70000000';

/**
 * Приводит номер к каноническому виду +7XXXXXXXXXX.
 * Возвращает null, если номер не похож на российский мобильный.
 */
export const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  // Отбрасываем код страны в любом из привычных написаний: 8 900…, 7 900…, +7 900…
  let national = digits;
  if (national.length === 11 && (national.startsWith('8') || national.startsWith('7'))) {
    national = national.slice(1);
  }

  if (national.length !== 10) return null;
  return `+7${national}`;
};

/**
 * Служебный ли это номер из диапазона виртуальных карточек LMS.
 */
export const isVirtualPhone = (phone) => String(phone || '').startsWith(VIRTUAL_PHONE_PREFIX);
