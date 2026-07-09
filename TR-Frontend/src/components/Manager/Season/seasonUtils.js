import { getAuthHeaders } from '../../../utils/helpers';

// revision намеренно на фиксированном синем, а не на bg-brand/text-brand — статус заявки
// не должен подстраиваться под цвет команды, даже если включено цветовое кодирование.
export const STATUS_META = {
  draft:    { label: 'Формируется',    dot: 'bg-content-muted',               text: 'text-content-muted' },
  revision: { label: 'На исправлении', dot: 'bg-blue-500 animate-pulse',      text: 'text-blue-500' },
  pending:  { label: 'На проверке',    dot: 'bg-content-muted animate-pulse', text: 'text-content-muted' },
  approved: { label: 'Допущена',       dot: 'bg-success',                     text: 'text-success' },
  rejected: { label: 'Отклонена',      dot: 'bg-danger',                      text: 'text-danger' },
};

export const ROLE_OPTIONS = [
  { value: 'head_coach', label: 'Главный тренер' },
  { value: 'coach', label: 'Тренер' },
  { value: 'team_manager', label: 'Менеджер' },
  { value: 'team_admin', label: 'Администратор' },
];
export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(o => [o.value, o.label]));

export const POSITION_OPTIONS_SHORT = [
  { value: 'goalie', label: 'Вр' },
  { value: 'defense', label: 'Защ' },
  { value: 'forward', label: 'Нап' },
];
export const POSITION_LABELS_SHORT = Object.fromEntries(POSITION_OPTIONS_SHORT.map(o => [o.value, o.label]));

// Используется в шторке редактирования игрока — там показываем содержательный статус целиком.
// В таблице состава (см. SeasonRosterDetails.jsx) применяется упрощённая бинарная пилюля Допущен/Не допущен.
export const ROSTER_VERDICT_META = {
  draft:    { label: 'Не допущен', className: 'text-danger' },
  pending:  { label: 'Не допущен', className: 'text-danger' },
  approved: { label: 'Допущен',         className: 'text-success' },
  declined: { label: 'Отклонён',        className: 'text-danger' },
};

export function getDocsSummary(player, division) {
  const required = [
    division.req_med_cert && 'medical',
    division.req_insurance && 'insurance',
    division.req_consent && 'consent',
  ].filter(Boolean);

  if (required.length === 0) return null;

  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let filled = 0;
  let hasExpired = false;
  let hasExpiring = false;

  required.forEach(key => {
    const url = player[`${key}_url`];
    const expiresAt = player[`${key}_expires_at`];
    if (url) {
      filled += 1;
      if (expiresAt) {
        const exp = new Date(expiresAt);
        if (exp < now) hasExpired = true;
        else if (exp < soon) hasExpiring = true;
      }
    }
  });

  if (hasExpired) return { label: 'Просрочен', dot: 'bg-danger', className: 'bg-danger/10 text-danger' };
  if (hasExpiring) return { label: 'Истекает', dot: 'bg-danger', className: 'bg-danger/10 text-danger' };
  if (filled === required.length) return { label: `${filled}/${required.length}`, dot: 'bg-success', className: 'bg-success text-white' };
  return { label: `${filled}/${required.length}`, dot: 'bg-content-muted', className: 'bg-surface-level2 text-content-muted' };
}

// Дивизион считается прошедшим, если у него уже наступила дата окончания турнира
export function isDivisionPast(app) {
  return !!app.division_end_date && new Date(app.division_end_date) < new Date();
}

export async function apiCall(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...getAuthHeaders(), ...(options.headers || {}) }
  });
  return res.json();
}
