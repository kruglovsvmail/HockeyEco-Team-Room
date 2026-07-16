// Склонение слова "день" для русского языка (1 день, 2 дня, 5 дней)
const pluralizeDays = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'дня';
  return 'дней';
};

const formatDate = (date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

// Вычисляет отображаемый статус подписки пользователя по дате её окончания.
// badgeTitle/badgeSubtitle — две строки для бейджа в сайдбаре,
// shortLabel — краткая однострочная форма для страницы «Планы оплаты».
// tone используется для цветовой индикации: 'default' | 'warning' | 'danger'
export function getSubscriptionStatus(expiresAt) {
  if (!expiresAt) {
    return { active: false, badgeTitle: 'Подписка не активна', badgeSubtitle: null, shortLabel: 'Не активна', tone: 'danger', daysLeft: null };
  }

  const now = new Date();
  const exp = new Date(expiresAt);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);

  if (daysLeft <= 0) {
    return { active: false, badgeTitle: 'Подписка истекла', badgeSubtitle: null, shortLabel: 'Истекла', tone: 'danger', daysLeft: 0 };
  }

  if (daysLeft <= 7) {
    const tail = `через ${daysLeft} ${pluralizeDays(daysLeft)}`;
    return { active: true, badgeTitle: 'Подписка истекает', badgeSubtitle: tail, shortLabel: `Истекает ${tail}`, tone: 'warning', daysLeft };
  }

  return { active: true, badgeTitle: 'Подписка действительна', badgeSubtitle: `до ${formatDate(exp)}`, shortLabel: `Действует до ${formatDate(exp)}`, tone: 'default', daysLeft };
}
