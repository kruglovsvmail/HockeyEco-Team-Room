import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { getImageUrl, isOwnTeam, COMMUNITY_CATEGORY_LABELS } from '../utils/helpers';
import { ROLES } from '../utils/permissions';
import { buildEventTargets } from '../utils/eventTargets';
import { getSubscriptionStatus } from '../utils/subscription';
import clsx from 'clsx';

// Раскладываем команды по клубам: клуб-шапка + вложенные составы, а команды без клуба
// (или клуба, в котором пользователь не состоит) — отдельной группой внизу.
// Именно эта группировка заменяет отдельный пункт «Мои клубы».
const buildGroups = (teams, clubs) => {
  const clubById = new Map(clubs.map(c => [c.id, c]));
  const teamsByClub = new Map();
  const standalone = [];

  teams.forEach(team => {
    if (team.club_id && clubById.has(team.club_id)) {
      if (!teamsByClub.has(team.club_id)) teamsByClub.set(team.club_id, []);
      teamsByClub.get(team.club_id).push(team);
    } else {
      standalone.push(team);
    }
  });

  const groups = clubs.map(club => ({ club, teams: teamsByClub.get(club.id) || [] }));
  if (standalone.length > 0) groups.push({ club: null, teams: standalone });

  return groups;
};

export function Sidebar({
  user,
  teams = [],
  clubs = [],
  selectedTeam,
  selectedClub,
  communities = [],
  selectedCommunity,
  onTeamChange,
  onClubChange,
  onCommunityChange,
  onClose,
}) {
  // Храним ID единственного открытого в данный момент меню (string или null)
  // Для списка команд будем использовать условный ID 'TEAMS'
  const [expandedMenuId, setExpandedMenuId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Вспомогательная функция безопасного извлечения ролей с учетом динамической роли Владельца
  const getRolesForTeam = (team) => {
    const roles = [];
    if (team?.owner_id === user?.id) {
      roles.push(ROLES.OWNER);
    }
    if (team?.user_role && typeof team.user_role === 'string') {
      roles.push(...team.user_role.split(',').map(r => r.trim()).filter(Boolean));
    }
    if (roles.length === 0 && team) {
      roles.push(ROLES.PLAYER);
    }
    return roles;
  };

  const getRolesForClub = (club) => {
    const roles = [];
    if (club?.owner_id === user?.id) roles.push(ROLES.CLUB_OWNER);
    if (Array.isArray(club?.user_roles)) roles.push(...club.user_roles);
    else if (club?.user_role) roles.push(...club.user_role.split(',').map(r => r.trim()).filter(Boolean));
    return roles;
  };

  // Проверка глобального администратора
  const isGlobalAdmin = user?.globalRole === 'admin' || user?.global_role === 'admin';

  // Тренерская — раздел вне команд и клубов, поэтому и признак доступа считается
  // не по выбранной команде, а по всем сразу: тренер хотя бы где-то — значит, у него
  // есть библиотека упражнений. Владельцы идут вместе с тренерами, как и во всей
  // матрице прав. Бэкенд проверяет то же самое (isCoachAnywhere).
  const isCoachAnywhere = useMemo(() => {
    if (isGlobalAdmin) return true;

    const hasTeamCoachRole = teams.some(team =>
      getRolesForTeam(team).some(role => ['coach', 'head_coach', ROLES.OWNER].includes(role))
    );
    if (hasTeamCoachRole) return true;

    const hasClubCoachRole = clubs.some(club =>
      getRolesForClub(club).some(role => [ROLES.CLUB_COACH, ROLES.CLUB_OWNER].includes(role))
    );
    if (hasClubCoachRole) return true;

    // Штаб сообщества-тренировки: план тренировки там собирается из той же личной
    // библиотеки упражнений, что и командный. Солянки не в счёт — плана у них нет.
    return (user?.communities || []).some(community =>
      community.category === 'skating' && (community.user_roles || []).some(role => [
        ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN,
      ].includes(role))
    );
  }, [teams, clubs, isGlobalAdmin, user?.id, user?.communities]);

  // Статус личной подписки пользователя для бейджа над профилем
  const subscriptionStatus = getSubscriptionStatus(user?.subscriptionExpiresAt || user?.subscription_expires_at);

  // Есть ли вообще кому ставить события. «Заявки», «Финансы» и «Вне платформы» уехали
  // в шторку «⋯» на странице команды, а выбор владельца события — на саму страницу
  // создания: сайдбару остался один плоский пункт и один вопрос — показывать ли его.
  const canCreateEvent = useMemo(
    () => buildEventTargets(teams, clubs, communities, user).length > 0,
    [teams, clubs, communities, user]
  );

  // Единый переключатель для всех аккордеонов
  const toggleMenu = (menuId) => {
    setExpandedMenuId(prevId => prevId === menuId ? null : menuId);
  };

  const isTeamsExpanded = expandedMenuId === 'TEAMS';
  const isTournamentsExpanded = expandedMenuId === 'TOURNAMENTS';
  const isMyCommunitiesExpanded = expandedMenuId === 'MY_COMMUNITIES';

  // ОПТИМИЗАЦИЯ СДВИГА: Плавный отложенный переход для разгрузки мобильного процессора
  const handleSafeNavigate = (path, callbackBeforeNavigate) => {
    if (callbackBeforeNavigate) callbackBeforeNavigate();
    onClose(); // Мгновенно запускаем закрытие сайдбара на GPU

    // 200мс — идеальный тайминг, сайдбар улетает на 80% траектории, и монтирование страницы не вызывает микро-фризов
    setTimeout(() => {
      navigate(path);
    }, 200);
  };

  // Строка клуба в раскрытом списке: кликабельна сама по себе (ведёт на страницу клуба
  // или в создание клубного события), а под ней с отступом идут его команды.
  const ClubRow = ({ club, isActive, hasSubAccess = true, onClick }) => (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-[14px] font-bold uppercase tracking-wider justify-between",
        isActive
          ? "bg-brand-opacity text-brand"
          : "text-content-main hover:bg-surface-level2"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-6 h-6 rounded-md bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
          <img src={getImageUrl(club.logo_url)} alt={club.name} className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className={clsx("truncate", !hasSubAccess && "opacity-70")}>{club.name}</span>
          <span className="text-[10px] font-bold tracking-widest text-content-subtle normal-case">Клуб</span>
        </div>
      </div>
      {!hasSubAccess && <Icon name="lock" className="w-3 h-3 text-content-muted/60 shrink-0 ml-1" />}
    </button>
  );

  // Строка сообщества. Под названием — категория: тренировки и солянки живут
  // в одном списке, а ведут себя по-разному, и человек должен видеть, куда идёт.
  const CommunityRow = ({ community, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-[14px] font-bold uppercase tracking-wider",
        isActive
          ? "bg-brand-opacity text-brand"
          : "text-content-main hover:bg-surface-level2"
      )}
    >
      <div className="w-6 h-6 rounded-md bg-surface-level1 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
        {community.logo_url
          ? <img src={getImageUrl(community.logo_url)} alt={community.name} className="w-full h-full object-contain rounded-md" />
          : <Icon name="handshake" className="w-4 h-4 text-content-muted" />}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="truncate">{community.name}</span>
        <span className="text-[10px] font-bold tracking-widest text-content-subtle normal-case">
          {COMMUNITY_CATEGORY_LABELS[community.category] || 'Сообщество'}
        </span>
      </div>
    </button>
  );

  const TeamRow = ({ team, isActive, hasSubAccess = true, onClick }) => (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all text-left outline-none text-[14px] font-bold uppercase tracking-wider justify-between",
        isActive
          ? "bg-brand-opacity text-brand"
          : "text-content-muted hover:text-content-main hover:bg-surface-level2"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-5 h-5 rounded bg-surface-level1 p-0.5 flex items-center justify-center shrink-0">
          <img src={getImageUrl(team.logo_url)} alt={team.name} className="w-full h-full object-contain" />
        </div>
        <span className={clsx("truncate flex-1", !hasSubAccess && "opacity-70")}>{team.name}</span>
      </div>
      {!hasSubAccess && <Icon name="lock" className="w-3 h-3 text-content-muted/60 shrink-0 ml-1" />}
    </button>
  );

  // Настройка «Все команды клуба» (Настройки → Внешний вид). Выключенная оставляет
  // в меню только те составы клуба, где человек реально числится: игроку большого
  // клуба не нужны в списке пять чужих команд. Сам клуб остаётся на месте — через
  // его страницу все составы по-прежнему доступны.
  const [showAllClubTeams, setShowAllClubTeams] = useState(
    () => localStorage.getItem('tr_sidebar_all_club_teams') !== 'false'
  );

  useEffect(() => {
    const sync = () => setShowAllClubTeams(localStorage.getItem('tr_sidebar_all_club_teams') !== 'false');
    window.addEventListener('tr_sidebar_club_teams_changed', sync);
    return () => window.removeEventListener('tr_sidebar_club_teams_changed', sync);
  }, []);

  // Команды вне клуба настройка не трогает: они попали в список не через клуб,
  // и прятать их было бы неожиданно.
  const visibleTeams = useMemo(() => {
    if (showAllClubTeams) return teams;
    const clubIds = new Set(clubs.map(c => c.id));
    return teams.filter(t => !(t.club_id && clubIds.has(t.club_id)) || isOwnTeam(t, user?.id));
  }, [teams, clubs, showAllClubTeams, user?.id]);

  // Группы для раздела «Мои команды»
  const allGroups = buildGroups(visibleTeams, clubs);

  // Сколько всего «точек входа» — от этого зависит, нужен ли аккордеон вообще
  const entityCount = visibleTeams.length + clubs.length;

  return (
    <div className="flex flex-col h-full bg-surface-level1 overflow-hidden">

      <style>
        {`
          .grid-expand-transition {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.25s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out;
            opacity: 0;
            pointer-events: none;
          }
          .grid-expand-transition.expanded {
            grid-template-rows: 1fr;
            opacity: 1;
            pointer-events: auto;
          }
          .grid-expand-inner {
            min-height: 0;
            overflow: hidden;
          }
        `}
      </style>

      {/* Логотип платформы */}
      <div className="shrink-0 px-7 py-4 border-b border-surface-border">
        <h1 className="text-[18px] font-black uppercase tracking-widest text-content-main">
          HOCKEY<span className="text-brand">ECO</span>
        </h1>
        <p className="text-content-muted text-[10px] tracking-[0.3em] uppercase font-bold">
          КОМАНДА
        </p>
      </div>

      {/* Навигация */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 pt-4">
        <nav className="flex flex-col gap-1">

          {/* Пункт 1: Календарь */}
          <button
            onClick={() => handleSafeNavigate('/')}
            className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
              location.pathname === '/'
                ? 'bg-brand-opacity text-brand font-bold'
                : 'text-content-main hover:text-brand'
            )}
          >
            <Icon name="calendar" className="w-5 h-5" />
            <span className="text-[14px] tracking-wider">Календарь</span>
          </button>

          {/* Пункт 2: Умное управление командами и клубами.
              Одна команда без клуба — прямая кнопка, во всех остальных случаях
              раскрывающийся список, сгруппированный по клубам. */}
          {entityCount <= 1 ? (
            visibleTeams.length === 1 ? (
              <button
                onClick={() => handleSafeNavigate('/my-team', () => {
                  if (selectedTeam?.id !== visibleTeams[0].id) {
                    onTeamChange(visibleTeams[0]);
                  }
                })}
                className={clsx(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                  location.pathname === '/my-team'
                    ? 'bg-brand-opacity text-brand font-bold'
                    : 'text-content-main hover:text-brand'
                )}
              >
                <Icon name="users" className="w-5 h-5" />
                <span className="text-[14px] tracking-wider">Моя команда</span>
              </button>
            ) : clubs.length === 1 ? (
              <button
                onClick={() => handleSafeNavigate('/club', () => {
                  if (selectedClub?.id !== clubs[0].id) onClubChange(clubs[0]);
                })}
                className={clsx(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                  location.pathname === '/club'
                    ? 'bg-brand-opacity text-brand font-bold'
                    : 'text-content-main hover:text-brand'
                )}
              >
                <Icon name="users" className="w-5 h-5" />
                <span className="text-[14px] tracking-wider">Мой клуб</span>
              </button>
            ) : (
              // Ни команд, ни клубов — так выглядит любой, кто зарегистрировался сам.
              // Пункт всё равно показываем: на странице его ждёт объяснение, что делать
              // дальше. Раньше здесь было null, и человек оставался с одним «Календарём»,
              // без единой подсказки о том, почему приложение пустое.
              <button
                onClick={() => handleSafeNavigate('/my-team')}
                className={clsx(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                  location.pathname === '/my-team'
                    ? 'bg-brand-opacity text-brand font-bold'
                    : 'text-content-main hover:text-brand'
                )}
              >
                <Icon name="users" className="w-5 h-5" />
                <span className="text-[14px] tracking-wider">Моя команда</span>
              </button>
            )
          ) : (
            <div className="flex flex-col w-full">
              <button
                onClick={() => toggleMenu('TEAMS')}
                className={clsx(
                  "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-bold",
                  ((location.pathname === '/my-team' || location.pathname === '/club') && !isTeamsExpanded) && "bg-brand-opacity text-brand font-bold"
                )}
              >
                <div className="flex items-center gap-4">
                  <Icon name="users" className="w-5 h-5" />
                  <span className="text-[14px] tracking-wider">Мои команды</span>
                </div>
                <div className={clsx("transition-transform duration-200", isTeamsExpanded && "rotate-180")}>
                  <Icon name="chevron" className="w-5 h-5" />
                </div>
              </button>

              {/* Раскрывающийся список: клуб-шапка и вложенные под ней составы */}
              <div className={clsx("grid-expand-transition", isTeamsExpanded && "expanded")}>
                <div className="grid-expand-inner">
                  <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 ml-2">
                    {allGroups.map((group, groupIndex) => (
                      <div key={group.club ? `club-${group.club.id}` : 'standalone'} className={clsx("flex flex-col gap-1", groupIndex > 0 && "mt-2")}>
                        {group.club && (
                          <ClubRow
                            club={group.club}
                            isActive={selectedClub?.id === group.club.id && location.pathname === '/club'}
                            onClick={() => handleSafeNavigate('/club', () => onClubChange(group.club))}
                          />
                        )}

                        {/* Команды клуба — под своей вертикальной линией: она соединяет
                            составы одного клуба и отделяет их от команд вне клуба */}
                        {group.club ? (
                          <div className="flex flex-col gap-1 ml-4 pl-2 border-l border-surface-border">
                            {group.teams.map(team => (
                              <TeamRow
                                key={team.id}
                                team={team}
                                isActive={selectedTeam?.id === team.id && location.pathname === '/my-team'}
                                onClick={() => handleSafeNavigate('/my-team', () => onTeamChange(team))}
                              />
                            ))}
                          </div>
                        ) : group.teams.map(team => (
                          <TeamRow
                            key={team.id}
                            team={team}
                            isActive={selectedTeam?.id === team.id && location.pathname === '/my-team'}
                            onClick={() => handleSafeNavigate('/my-team', () => onTeamChange(team))}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* «Мои сообщества» — быстрый вход в своё, в отличие от каталога ниже.
              Пункта нет вовсе, пока человек никуда не вступил и нигде не в штабе:
              список из контекста как раз и содержит только такие сообщества.
              Одно сообщество — прямая кнопка, несколько — раскрывающийся список. */}
          {communities.length === 1 ? (
            <button
              onClick={() => handleSafeNavigate('/community', () => onCommunityChange?.(communities[0]))}
              className={clsx(
                "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                location.pathname === '/community'
                  ? 'bg-brand-opacity text-brand font-bold'
                  : 'text-content-main hover:text-brand'
              )}
            >
              <Icon name="handshake" className="w-5 h-5" />
              <span className="text-[14px] tracking-wider">Моё сообщество</span>
            </button>
          ) : communities.length > 1 ? (
            <div className="flex flex-col w-full">
              <button
                onClick={() => toggleMenu('MY_COMMUNITIES')}
                className={clsx(
                  "flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all outline-none text-content-main hover:text-brand font-bold",
                  (location.pathname === '/community' && !isMyCommunitiesExpanded) && "bg-brand-opacity text-brand font-bold"
                )}
              >
                <div className="flex items-center gap-4">
                  <Icon name="handshake" className="w-5 h-5" />
                  <span className="text-[14px] tracking-wider">Мои сообщества</span>
                </div>
                <div className={clsx("transition-transform duration-200", isMyCommunitiesExpanded && "rotate-180")}>
                  <Icon name="chevron" className="w-5 h-5" />
                </div>
              </button>

              <div className={clsx("grid-expand-transition", isMyCommunitiesExpanded && "expanded")}>
                <div className="grid-expand-inner">
                  <div className="flex flex-col gap-1 pl-3 pr-1 py-1 mt-1 ml-2">
                    {communities.map(community => (
                      <CommunityRow
                        key={community.id}
                        community={community}
                        isActive={selectedCommunity?.id === community.id && location.pathname === '/community'}
                        onClick={() => handleSafeNavigate('/community', () => onCommunityChange?.(community))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="h-px bg-surface-border my-2 mx-2" />

          {/* НОВЫЙ РАЗДЕЛ: Турниры / Лиги с умным раскрытием под команды.
              Клуб здесь не появляется: турниры играют составы, а не организация. */}
          {/* Пункт 3: Турниры и лиги — информационный раздел.
              Раньше это был список команд: раздел показывал турниры выбранной команды.
              Теперь он ни к какой команде не привязан — сюда заходят посмотреть чужую
              турнирную таблицу, статистику игрока или расписание любой лиги. Поэтому
              пункт плоский и виден всем, включая тех, у кого команды ещё нет. */}
          <button
            onClick={() => handleSafeNavigate('/tournaments')}
            className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
              location.pathname === '/tournaments'
                ? 'bg-brand-opacity text-brand font-bold'
                : 'text-content-main hover:text-brand'
            )}
          >
            <Icon name="trophy" className="w-5 h-5" />
            <span className="text-[14px] tracking-wider">Турниры / Лиги</span>
          </button>

          {/* Каталог сообществ — плоская кнопка, а не аккордеон: своё и чужое
              ищут в одном и том же списке.
              Подсвечивается строго на /communities: маршрут /community принадлежит
              пункту «Мои сообщества» выше, и подсветка обоих сразу читалась бы
              как два активных раздела. */}
          <button
            onClick={() => handleSafeNavigate('/communities')}
            className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
              location.pathname === '/communities'
                ? 'bg-brand-opacity text-brand font-bold'
                : 'text-content-main hover:text-brand'
            )}
          >
            <Icon name="handshake" className="w-5 h-5" />
            <span className="text-[14px] tracking-wider">Сообщества</span>
          </button>

          <div className="h-px bg-surface-border my-2 mx-2" />

          {/* «Добавить событие» — плоская кнопка. Раньше здесь раскрывался список команд
              и клубов: выбор в нём менял глобально выбранную команду и дописывал в адрес
              ?scope=club. Теперь владельца события выбирают на самой странице создания
              и там же запоминают, поэтому сайдбару достаточно знать, есть ли вообще
              кому ставить события. */}
          {canCreateEvent && (
            <button
              onClick={() => handleSafeNavigate('/manager/create-event')}
              className={clsx(
                "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                location.pathname === '/manager/create-event'
                  ? 'bg-brand-opacity text-brand font-bold'
                  : 'text-content-main hover:text-brand'
              )}
            >
              <Icon name="plus" className="w-5 h-5" />
              <span className="text-[14px] tracking-wider">Добавить событие</span>
            </button>
          )}

          {/* Тренерская — отделена линией и стоит ниже остальных пунктов.
              Всё меню выше работает в контексте выбранной команды или клуба, а этот
              раздел личный: библиотека упражнений одна на все команды тренера. */}
          {isCoachAnywhere && (
            <button
              onClick={() => handleSafeNavigate('/coach')}
              className={clsx(
                "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold",
                location.pathname === '/coach'
                  ? 'bg-brand-opacity text-brand font-bold'
                  : 'text-content-main hover:text-brand'
              )}
            >
              <Icon name="training_tactics" className="w-5 h-5" />
              <span className="text-[14px] tracking-wider">Тренерская</span>
            </button>
          )}

          {/* Пункт 4: Настройки приложения */}
          <button
            onClick={() => handleSafeNavigate('/settings')}
            className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl transition-all outline-none text-left w-full font-bold mt-1",
              location.pathname === '/settings'
                ? 'bg-brand-opacity text-brand font-bold'
                : 'text-content-main hover:text-brand'
            )}
          >
            <Icon name="settings" className="w-5 h-5" />
            <span className="text-[14px] tracking-wider">Настройки</span>
          </button>

        </nav>
      </div>

      {/* Бейдж-индикатор статуса личной подписки, ведёт на страницу оформления подписки */}
      <button
        onClick={() => handleSafeNavigate('/subscription')}
        className={clsx(
          "shrink-0 mx-3 mb-2 px-3 py-2 rounded-xl border flex items-start gap-2 text-left transition-all outline-none active:scale-[0.98]",
          subscriptionStatus.tone === 'danger' && "border-danger-muted text-danger",
          subscriptionStatus.tone === 'warning' && "border-amber-500/10 text-amber-500",
          subscriptionStatus.tone === 'default' && "border-success-muted text-success"
        )}
      >

        <span className="flex flex-col min-w-0">
          <span className="text-[12px] font-semibold tracking-wider leading-tight">
            {subscriptionStatus.badgeTitle}
          </span>
          {subscriptionStatus.badgeSubtitle && (
            <span className="text-[12px] font-semibold tracking-wider leading-tight">
              {subscriptionStatus.badgeSubtitle}
            </span>
          )}
        </span>
      </button>

      {/* Профиль игрока */}
      <button
        onClick={() => handleSafeNavigate('/profile')}
        className="shrink-0 p-4 border-t border-surface-border w-full flex items-center gap-4 bg-surface-level1 hover:bg-surface-level2 transition-colors type-button text-left outline-none cursor-pointer"
      >
        <Avatar
          photoUrl={user?.avatarUrl}
          firstName={user?.firstName}
          lastName={user?.lastName}
          className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border shadow-inner"
        />

        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-bold text-content-main leading-tight truncate">
            {user?.lastName}
          </span>
          <span className="text-[14px] font-bold text-content-muted leading-tight truncate mt-0.5">
            {user?.firstName}
          </span>
        </div>
      </button>

    </div>
  );
}
