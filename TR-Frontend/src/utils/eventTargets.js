import { PERMISSIONS, ROLES } from './permissions';

// Кому пользователь может ставить события: клубы и команды одним плоским списком.
//
// Считается по ролям, а не через checkAccess: тот проверяет одну цель за вызов,
// а здесь нужно отфильтровать сразу все. Подписку список не учитывает намеренно —
// её проверяет уже сама страница создания через checkAccess/checkClubAccess и
// показывает SubscriptionStub. Иначе у человека с истёкшей подпиской пропал бы
// не только доступ, но и объяснение, куда всё делось.
//
// Список нужен в двух местах: сайдбар по нему решает, показывать ли пункт
// «Добавить событие», а страница создания — строить ли кнопку смены цели.

const rolesForTeam = (team, userId) => {
  const roles = [];
  // Роль владельца динамическая, в user_role её нет — она выводится из owner_id
  if (team?.owner_id === userId) roles.push(ROLES.OWNER);
  if (typeof team?.user_role === 'string') {
    roles.push(...team.user_role.split(',').map(r => r.trim()).filter(Boolean));
  }
  return roles;
};

const rolesForClub = (club, userId) => {
  const roles = [];
  if (club?.owner_id === userId) roles.push(ROLES.CLUB_OWNER);
  if (Array.isArray(club?.user_roles)) roles.push(...club.user_roles);
  else if (typeof club?.user_role === 'string') {
    roles.push(...club.user_role.split(',').map(r => r.trim()).filter(Boolean));
  }
  return roles;
};

export function buildEventTargets(teams = [], clubs = [], user = null) {
  const isGlobalAdmin = user?.globalRole === ROLES.GLOBAL_ADMIN || user?.global_role === ROLES.GLOBAL_ADMIN;

  const clubAllowed = PERMISSIONS.CLUB_MANAGE_EVENTS?.allowedRoles || [];
  const teamAllowed = PERMISSIONS.MGR_CREATE_EVENT?.allowedRoles || [];

  // Клубы идут первыми: клубное событие охватывает все составы, и в списке
  // естественно видеть сначала общее, потом частное.
  const clubTargets = clubs
    .filter(club => isGlobalAdmin || rolesForClub(club, user?.id).some(role => clubAllowed.includes(role)))
    .map(club => ({
      key: `club-${club.id}`,
      type: 'club',
      id: club.id,
      name: club.name,
      logoUrl: club.logo_url,
      entity: club,
    }));

  const teamTargets = teams
    .filter(team => isGlobalAdmin || rolesForTeam(team, user?.id).some(role => teamAllowed.includes(role)))
    .map(team => ({
      key: `team-${team.id}`,
      type: 'team',
      id: team.id,
      name: team.name,
      logoUrl: team.logo_url,
      entity: team,
    }));

  return [...clubTargets, ...teamTargets];
}

// Ключ последнего выбора на этом устройстве. Общий на всё приложение, без команды
// в имени: цель события — самостоятельный выбор, а не свойство выбранной команды.
export const EVENT_TARGET_STORAGE_KEY = 'tr_create_event_target';
