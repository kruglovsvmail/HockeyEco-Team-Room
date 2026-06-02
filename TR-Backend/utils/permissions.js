// Справочник ролей внутри Команды / Клуба
export const ROLES = {
  GLOBAL_ADMIN: 'admin',           // Глобальный администратор системы (Разработчик/Владелец)
  OWNER: 'owner',                  // Юридический владелец конкретной команды (teams.owner_id)
  CLUB_TOP_MANAGER: 'top_manager', // Владелец / Руководитель клуба
  CLUB_ADMIN: 'club_admin',        // Администратор клуба
  TEAM_MANAGER: 'team_manager',    // Менеджер (Руководитель) конкретной команды
  TEAM_ADMIN: 'team_admin',        // Администратор конкретной команды
  HEAD_COACH: 'head_coach',        // Главный тренер
  COACH: 'coach',                  // Тренер (помощник)
  PLAYER: 'player',                // Игрок (участник состава)
};

// Системные лимиты времени (в минутах до начала матча)
export const DEADLINES = {
  MIDDLE_EDIT_MINUTES: 16,  
  ROSTER_SUBMIT_MINUTES: 10 
};

/**
 * Декларативный справочник доступов и ограничений подписки.
 * Каждое право строго привязано к ОДНОМУ конкретному файлу и его внутреннему контексту.
 * * ФОРМАТ ПОЛЯ requiresSubscription:
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
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Редактирование игрового профиля (Блок "Игровой профиль" - номер, амплуа, хват)
  EDIT_USER_BLOCK_HOCKEY: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование базового блока (Блок ФИО, контакты, аватарка пользователя)
  EDIT_USER_BLOCK_BASE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Просмотр конфиденциального виртуального кода игрока
  VIEW_VIRTUAL_CODE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // ==========================================
  // 📄 Файл: MyTeamPage.jsx (Разделение по вкладкам)
  // ==========================================

  // Вкладка "Состав": Добавление участников и их удаление (перевод в архив)
  TEAM_MANAGE_TAB_ALL: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Вкладка "Ростер": Добавление игроков в заявочный лист турнира и исключение из него
  // Клубный топ-менеджер и Владелец работают БЕЗ подписки, а руководители и админы — ПО подписке.
  TEAM_MANAGE_TAB_ROSTER: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Вкладка "Представители": Управление списком административного и тренерского штаба
  TEAM_MANAGE_TAB_STAFF: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 📄 Файл: Header.jsx
  // ==========================================
  
  // Управление визуальным профилем команды (Кнопка-карандашик изменения логотипа, названия, цветов)
  TEAM_EDIT_PROFILE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
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
  // 📄 Файл: EventDashboard.jsx
  // ==========================================

  // Просмотр внутренней детальной информации (Вход в карточку события и доступ к его вкладкам)
  // Тренеры (HEAD_COACH, COACH) и Owner беспрепятственно проходят без подписки
  INTERNAL_VIEW: {
    allowedRoles: [
      ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
      ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, 
      ROLES.HEAD_COACH, ROLES.COACH, ROLES.PLAYER
    ],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.PLAYER]
  },

  // Создание, изменение параметров и удаление самого события (матча, тренировки, собрания)
  EVENTS_MANAGE: {
    allowedRoles: [
      ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
      ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, 
      ROLES.HEAD_COACH, ROLES.COACH
    ],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.HEAD_COACH, ROLES.COACH]
  },

  // ==========================================
  // 📄 Файл: MatchAttendance.jsx
  // ==========================================

  // Управление ручными отметками присутствия игроков и финансовых пометками (₽) менеджером
  ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 📄 Файл: MatchLines.jsx
  // ==========================================

  // Сохранение черновика пятерок на матч и расстановка игроков по слотам (Чистая тактика тренера)
  LINES_MANAGE: {
    allowedRoles: [ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: false
  },

  // Редактирование параметров игрока внутри звеньев (Клик по аватарке -> нижняя шторка номера, Капитана (C) и Ассистента (A))
  LINES_EDIT_PLAYER_PARAMS: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Отправка официальной электронной заявки состава в лигу (Кнопка отправки)
  ROSTER_SUBMIT: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 📄 Файл: Sidebar.jsx
  // ==========================================
  
  // Доступ к выпадающему списку команд для создания событий (Добавить событие)
  MGR_CREATE_EVENT: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Доступ к разделу заявочных кампаний в турниры (Заявки)
  MGR_SEASON_ROSTERS: {
    allowedRoles: [],
    requiresSubscription: []
  },

  // Доступ к разделу финансового контроля (Финансы)
  MGR_FINANCES: {
    allowedRoles: [],
    requiresSubscription: []
  },

  // Доступ к разделу внутрикомандных реестров (Справочники)
  MGR_HANDBOOKS: {
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  }
};