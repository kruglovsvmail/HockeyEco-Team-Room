// Справочник ролей внутри Команды / Клуба
export const ROLES = {
  GLOBAL_ADMIN: 'admin',           // Глобальный администратор системы (Разработчик/Владелец)
  OWNER: 'owner',                  // Юридический владелец конкретной команды (teams.owner_id)
  CLUB_TOP_MANAGER: 'top_manager', // Руководитель клуба
  CLUB_ADMIN: 'club_admin',        // Администратор клуба
  TEAM_MANAGER: 'team_manager',    // Менеджер (Руководитель) конкретной команды
  TEAM_ADMIN: 'team_admin',        // Администратор конкретной команды
  HEAD_COACH: 'head_coach',        // Главный тренер
  COACH: 'coach',                  // Тренер (помощник)
  PLAYER: 'player',                // Игрок (участник состава)

  // ── Клубные роли с собственными строками ────────────────────────────────
  // В БД владелец клуба живёт в clubs.owner_id, а тренер клуба — строкой 'coach'
  // в club_roles, то есть на уровне базы он неотличим от тренера команды.
  // Чтобы правами клуба можно было управлять отдельно от командных, проверка прав
  // в клубном контексте переименовывает их на входе: owner → club_owner,
  // coach → club_coach. Схему БД это не меняет — только имена ролей в матрице.
  CLUB_OWNER: 'club_owner',        // Владелец клуба (clubs.owner_id)
  CLUB_COACH: 'club_coach',        // Тренер клуба (club_roles.role = 'coach')

  // ── Роли сообществ (Тренировки и Солянки) ─────────────────────────────────
  // Категория сообщества (skating / open_game) на роли не влияет: она говорит,
  // какие события внутри можно проводить, а не кто чем распоряжается. Разница
  // в правах между категориями, если понадобится, разводится ключами матрицы,
  // как это уже сделано у матчей, тренировок и собраний.
  COMMUNITY_OWNER: 'community_owner',     // Владелец сообщества (communities.owner_id)
  COMMUNITY_MANAGER: 'community_manager', // Руководитель сообщества
  COMMUNITY_ADMIN: 'community_admin',     // Администратор сообщества
  // Вступивший участник. Намеренно НЕ переиспользуем PLAYER: участник сообщества
  // пришёл с улицы и не должен добирать доступы по командным ключам, где эта роль
  // перечислена (INTERNAL_VIEW, EVENT_SELF_ATTENDANCE и прочие).
  COMMUNITY_MEMBER: 'community_member',
};

// Системные лимиты времени (в минутах до начала матча)
export const DEADLINES = {
  MIDDLE_EDIT_MINUTES: 1,  
  ROSTER_SUBMIT_MINUTES: 1 
};

/**
 * Декларативный справочник доступов и ограничений подписки.
 *
 * ФОРМАТ ПОЛЯ requiresSubscription:
 * - true: подписка обязательна для всех ролей из allowedRoles
 * - false: подписка не требуется никому
 * - [ROLES.X, ROLES.Y]: подписка проверяется СТРОГО у этих ролей, остальные роли из allowedRoles имеют допуск БЕЗ подписки
 */
export const PERMISSIONS = {

  // ==========================================
  // 📄 Файл: UserDetails.jsx
  // ==========================================
  
  // Редактирование административных статусов (Блок "Роли в команде" - изменение team_roles)
  EDIT_USER_BLOCK_ROLES: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Редактирование игрового профиля (Блок "Игровой профиль" - номер, амплуа, хват)
  EDIT_USER_BLOCK_HOCKEY: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER], 
    requiresSubscription: [ROLES.TEAM_MANAGER]   
  },

  // Редактирование базового блока (Блок ФИО, контакты, аватарка пользователя)
  EDIT_USER_BLOCK_BASE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Просмотр конфиденциального виртуального кода игрока
  VIEW_VIRTUAL_CODE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // ==========================================
  // 📄 Файл: MyTeamPage.jsx (Разделение по вкладкам)
  // ==========================================

  // Вкладка "Состав": Добавление участников и их удаление (перевод в архив)
  TEAM_MANAGE_TAB_ALL: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER]
  },

  // Вкладка "Ростер": Добавление игроков в заявочный лист турнира и исключение из него
  TEAM_MANAGE_TAB_ROSTER: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // ==========================================
  // 📄 Файл: Header.jsx
  // ==========================================
  
  // Управление визуальным профилем команды (Кнопка-карандашик изменения логотипа, названия, цветов)
  TEAM_EDIT_PROFILE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // ==========================================
  // 📄 Файл: EventCard.jsx
  // ==========================================

  // Возможность игрока самостоятельно отметить явку на событие через тумблер
  EVENT_SELF_ATTENDANCE: {
    allowedRoles: [ROLES.PLAYER],
    requiresSubscription: [ROLES.PLAYER]
  },

  // ==========================================
  // 📄 Файл: Sidebar.jsx
  // ==========================================
  
  // Доступ к выпадающему списку команд для создания событий (Добавить событие)
  // CLUB_TOP_MANAGER — создание клубных тренировок и собраний (клубные события)
  MGR_CREATE_EVENT: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Доступ к разделу заявочных кампаний в турниры (Заявки)
  MGR_SEASON_ROSTERS: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Доступ к разделу финансового контроля (Финансы)
  MGR_FINANCES: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER],
    requiresSubscription: []
  },

  // Доступ к разделу внутрикомандных реестров (Справочники)
  MGR_HANDBOOKS: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // ==========================================
  // 📌 СОБЫТИЯ (общие ключи для всех типов событий)
  // ==========================================

  // Просмотр внутренней детальной информации (Вход в карточку события и доступ к его вкладкам)
  // Тренеры (HEAD_COACH, COACH) и Owner беспрепятственно проходят без подписки
  INTERNAL_VIEW: {
    allowedRoles: [
      ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN,
      ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN,
      ROLES.HEAD_COACH, ROLES.COACH, ROLES.CLUB_COACH, ROLES.PLAYER
    ],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.PLAYER]
  },

  // ==========================================
  // 🏒 МАТЧИ
  // ==========================================

  // Управление ручными отметками присутствия игроков и финансовых пометками (₽) менеджером
  MATCH_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Подтверждение или отмена вызова на товарищеский матч (friendly_pwa)
  MATCH_CONFIRM_CANCEL: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Сохранение черновика пятерок на матч и расстановка игроков по слотам (Чистая тактика тренера)
  MATCH_LINES_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: false
  },

  // Шеринг текущего состава звеньев через системное окно «Поделиться» (Web Share API)
  MATCH_LINES_SHARE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование параметров игрока внутри звеньев (Клик по аватарке -> нижняя шторка номера, Капитана (C) и Ассистента (A))
  MATCH_LINES_EDIT_PLAYER_PARAMS: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Отправка официальной электронной заявки состава в лигу (Кнопка отправки)
  MATCH_ROSTER_SUBMIT: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Заполнение результатов неофициального матча после game_date (голы, штрафы, +/-, журнал вратарей, броски).
  // Доступ имеет только команда-инициатор (games.home_team_id).
  MATCH_FILL_RESULTS: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Заполнение результатов официального матча (+/-, броски по своему вратарю), если лига
  // сама эту статистику не ведёт (см. divisions.reg_track_plus_minus/reg_track_shots).
  // Доступ строго team-scoped — только своя команда, только своя часть данных.
  MATCH_FILL_RESULTS_OFFICIAL: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование медиа-ссылок трансляций матча (Блок 1 - YouTube, VK Видео)
  MATCH_EDIT_MEDIA: {
    allowedRoles: [
      ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование расписания (Блок 2 - Дата, время, выбор Арены из справочника)
  MATCH_EDIT_SCHEDULE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование игровой формы и взноса с игрока за участие (Блок 3 - Цвет джерси, стоимость)
  MATCH_EDIT_FINANCES: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Полное физическое удаление карточки матча из календаря (Кнопка внизу экрана)
  MATCH_DELETE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 🏋️ ТРЕНИРОВКИ
  // ==========================================

  // Управление ручными отметками присутствия игроков и финансовых пометками (₽) менеджером на тренировках
  TRAINING_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Сохранение черновика расстановки игроков на тренировку (тактика тренера)
  TRAINING_LINES_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: false
  },

  // Составление плана тренировки: добавление упражнений из личной библиотеки,
  // порядок блоков и публикация плана игрокам. Право то же, что у расстановки —
  // это работа тренера, подписка не требуется.
  TRAINING_PLAN_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: false
  },

  // Шеринг расстановки тренировки через системное окно «Поделиться» (Web Share API)
  TRAINING_LINES_SHARE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование расписания тренировки (Дата, время, выбор Арены/локации)
  TRAINING_EDIT_SCHEDULE: {
     allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование стоимости тренировки для игрока (Взнос за участие)
  TRAINING_EDIT_FINANCES: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Полное физическое удаление карточки тренировки из календаря
  TRAINING_DELETE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 📋 СОБРАНИЯ
  // ==========================================

  // Управление ручными отметками присутствия участников и финансовых пометками (₽) менеджером на собраниях
  MEETING_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Редактирование расписания собрания (Дата, время, выбор локации)
  MEETING_EDIT_SCHEDULE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование стоимости собрания для участника (Взнос за участие)
  MEETING_EDIT_FINANCES: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Полное физическое удаление карточки собрания из календаря
  MEETING_DELETE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 🏛️ КЛУБ
  //
  // Ключи клубного контекста: проверяются не по команде, а по клубу
  // (club_roles + активное членство в club_members).
  // Пока во всех ключах только Руководитель клуба — остальные роли добавим позже.
  // ==========================================

  // Редактирование профиля клуба (название, логотип, город, описание, цвета)
  CLUB_EDIT_PROFILE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.CLUB_TOP_MANAGER],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER]
  },

  // Добавление людей в состав клуба и исключение из него
  // (исключение каскадом закрывает членство в командах этого клуба)
  CLUB_MANAGE_MEMBERS: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.CLUB_TOP_MANAGER],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER]
  },

  // Назначение и снятие клубных ролей (Руководитель клуба, Админ клуба, Тренер клуба)
  CLUB_MANAGE_ROLES: {
    allowedRoles: [ROLES.CLUB_OWNER],
    requiresSubscription: []
  },

  // Создание и редактирование клубных событий (клубные тренировки и собрания)
  CLUB_MANAGE_EVENTS: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.CLUB_TOP_MANAGER],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER]
  },

  // Расстановка игроков на клубной тренировке (club_formation_training).
  // Строго тренер клуба. Подписка не требуется — как и у тренеров команды.
  CLUB_TRAINING_LINES_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.CLUB_COACH],
    requiresSubscription: false
  },

  // План клубной тренировки. Зеркало TRAINING_PLAN_MANAGE в клубном контексте:
  // строго тренер клуба, подписка не требуется.
  CLUB_TRAINING_PLAN_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.CLUB_COACH],
    requiresSubscription: false
  },

  // Ручные отметки присутствия на клубном событии: добавление и удаление участника
  // в списке отметившихся + финансовая пометка (₽). Тренировки и собрания клуба.
  CLUB_EVENT_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.CLUB_OWNER, ROLES.CLUB_TOP_MANAGER],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER]
  },

  // ==========================================
  // 🧑‍🤝‍🧑 СООБЩЕСТВА (Тренировки и Солянки)
  //
  // Ключи проверяются не по команде и не по клубу, а по сообществу
  // (communities.owner_id + community_roles). Отличие от клуба: роль штаба
  // засчитывается БЕЗ членства в community_members — руководитель сообщества
  // может не кататься сам и в участниках не числиться.
  //
  // Подписка нигде не требуется: сообщества задуманы как вход в приложение для
  // людей с улицы, и платный барьер на вступлении и отметке убил бы воронку.
  // Если сообщества станут платными для организатора, включение делается точечно —
  // requiresSubscription: [ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN].
  // ==========================================

  // Профиль сообщества: название, логотип, город, описание, цвета
  COMMUNITY_EDIT_PROFILE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER],
    requiresSubscription: false
  },

  // Порядок информационных блоков во вкладке «Инфо». Сами блоки заводит
  // владелец в профиле сообщества, а переставлять их может и руководитель:
  // это не изменение содержания, а раскладка того, что уже написано.
  COMMUNITY_INFO_REORDER: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER],
    requiresSubscription: false
  },

  // Настройки сообщества: лесенка дедлайнов резерва (reserve_ladder),
  // видимость чужих групп в календаре участника (calendar_scope)
  COMMUNITY_MANAGE_SETTINGS: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER],
    requiresSubscription: false
  },

  // Штаб: назначение и снятие ролей, ручные подписи должностей.
  // Строго владелец — как CLUB_MANAGE_ROLES у клуба.
  COMMUNITY_MANAGE_ROLES: {
    allowedRoles: [ROLES.COMMUNITY_OWNER],
    requiresSubscription: false
  },

  // Полное удаление сообщества вместе с событиями, отметками и группами.
  // Строго владелец: у остального штаба нет способа его вернуть.
  COMMUNITY_DELETE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER],
    requiresSubscription: false
  },

  // Вкладка «Участники»: исключение из сообщества, амплуа (полевой/вратарь),
  // назначение тренировочной группы
  COMMUNITY_MANAGE_MEMBERS: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER],
    requiresSubscription: false
  },

  // Создание и редактирование тренировочных групп (только категория skating)
  COMMUNITY_MANAGE_GROUPS: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER],
    requiresSubscription: false
  },

  // Создание событий сообщества (тренировки и солянки)
  COMMUNITY_MANAGE_EVENTS: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Просмотр внутренней части события сообщества и карточки участника.
  // Аналог INTERNAL_VIEW в командном контексте.
  COMMUNITY_INTERNAL_VIEW: {
    allowedRoles: [
      ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER,
      ROLES.COMMUNITY_ADMIN, ROLES.COMMUNITY_MEMBER
    ],
    requiresSubscription: false
  },

  // Расписание события: дата, время, выбор арены или ручной локации
  COMMUNITY_EVENT_EDIT_SCHEDULE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Взнос за участие: режим (per_person/split), суммы, бесплатные вратари, порог показа
  COMMUNITY_EVENT_EDIT_FINANCES: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Лимиты и адресация события: max_skaters, max_goalies, допущенные группы,
  // флаг «и те, кто без группы» (include_ungrouped)
  COMMUNITY_EVENT_EDIT_LIMITS: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Полное удаление карточки события сообщества из календаря. Администратор
  // событие создаёт и ведёт, но снести его вместе с отметками не может:
  // это необратимо и остаётся за владельцем с руководителем.
  COMMUNITY_EVENT_DELETE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER],
    requiresSubscription: false
  },

  // Публикация события: показать его участникам раньше срока или вручную,
  // если публикация была отложена. Кто событие ведёт, тот его и открывает.
  COMMUNITY_EVENT_PUBLISH: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Ручные отметки на событии: добавление и удаление участника в списке
  // отметившихся, ручной перевод из резерва в основу
  COMMUNITY_EVENT_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Финансовая пометка участника (₽) и перевод в 'free'. Отделено от остальных
  // отметок: собрать состав — работа администратора, а кто заплатил — деньги,
  // и отвечают за них владелец с руководителем.
  COMMUNITY_EVENT_FEE_MARK: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER],
    requiresSubscription: false
  },

  // План тренировки: упражнения из личной библиотеки, порядок блоков, публикация.
  // Тренерской роли у сообществ нет — «Тренер» это ручная подпись в штабе,
  // а не роль, поэтому право отдано управленческим ролям.
  COMMUNITY_TRAINING_PLAN_MANAGE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Расстановка на тренировке и деление на составы на солянке
  COMMUNITY_LINES_MANAGE: {
    allowedRoles: [ROLES.COMMUNITY_OWNER, ROLES.COMMUNITY_MANAGER, ROLES.COMMUNITY_ADMIN],
    requiresSubscription: false
  },

  // Самоотметка участника на событие сообщества, постановка в резерв и
  // подтверждение освободившегося места
  COMMUNITY_SELF_ATTENDANCE: {
    allowedRoles: [ROLES.COMMUNITY_MEMBER],
    requiresSubscription: false
  },
};