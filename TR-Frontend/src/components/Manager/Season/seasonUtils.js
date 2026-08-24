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

// Роли представителя в турнирной заявке — их ровно три. Внутри команды (team_roles) ролей
// четыре: там отдельно живёт главный тренер. В заявке этого деления нет — оба тренера
// подаются как «Тренер команды» (см. toTournamentRole).
export const ROLE_OPTIONS = [
  { value: 'team_manager', label: 'Руководитель команды' },
  { value: 'coach', label: 'Тренер команды' },
  { value: 'team_admin', label: 'Администратор команды' },
];
export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(o => [o.value, o.label]));

// Роль в команде -> роль в заявке. Нужна при автоподстановке роли в пикере штаба:
// человек с ролью «Главный тренер» в команде добавляется в заявку тренером.
export const toTournamentRole = (teamRole) => (teamRole === 'head_coach' ? 'coach' : teamRole);

export const POSITION_OPTIONS_SHORT = [
  { value: 'goalie', label: 'Вр' },
  { value: 'defense', label: 'Защ' },
  { value: 'forward', label: 'Нап' },
];
export const POSITION_LABELS_SHORT = Object.fromEntries(POSITION_OPTIONS_SHORT.map(o => [o.value, o.label]));

// Допуск игрока в заявке. Текстом (label + className) статус показывается в шторке
// редактирования игрока. В таблице состава подписи нет вообще — только красная обводка
// аватара у недопущенных (см. rosterColumns).
//
// Отдельной колонки под допуск в таблице быть не может: её ширину задаёт заголовок, а не
// содержимое, и любой столбец — хоть со значком, хоть с полоской в 2px — отъедал ~45px
// и заставлял таблицу скроллиться вбок. Поэтому признак живёт в ячейке фото, которая в
// строке есть и так, и стоит ноль дополнительной ширины.
//
// Обводка — метка проблемы, а не статуса: она есть, только пока игрок не допущен, и
// пропадает, когда лига его допустила. У допущенного строка выглядит обычно, поэтому
// глазом ищется именно то, с чем надо разбираться.
//
// В черновике («Формируется») вердикта нет вообще — ни обводки, ни подписи в шторке игрока:
// заявка ещё не отправлена, лига её не видела и допускать никого не могла.
export const ROSTER_VERDICT_META = {
  draft:    { label: 'Не допущен', className: 'text-danger' },
  pending:  { label: 'Не допущен', className: 'text-danger' },
  approved: { label: 'Допущен',    className: 'text-success' },
  declined: { label: 'Недопущен',  className: 'text-danger' },
};

// Подпись квалификации игрока: полное название, а не сокращение — «МС» рядом с фамилией
// ни о чём не говорит. Расхождение с допуском дивизиона дописываем в ту же строку.
// Квалификация лиговая, её могли сменить уже после того, как игрока заявили: из турнира
// это никого не выкидывает, но команда должна видеть несоответствие.
export const qualFullLabel = (name, conflict) => {
  const base = name || 'Квалификации нет';
  return conflict ? `${base} — не допускается` : base;
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

  // Подпись всегда одна и та же — сколько документов из требуемых загружено. Срок годности
  // меняет только цвет: истёкший или истекающий на днях документ красит бейдж красным.
  // Слова «Просрочен»/«Истекает» вместо счётчика тут не годятся — в строке заявки на них нет
  // места, и они прятали бы главное: сколько документов вообще собрано.
  const label = `${filled}/${required.length}`;

  if (hasExpired || hasExpiring) return { label, className: 'bg-danger text-white' };
  if (filled === required.length) return { label, className: 'bg-success text-white' };
  return { label, className: 'bg-surface-level2 text-content-muted' };
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
