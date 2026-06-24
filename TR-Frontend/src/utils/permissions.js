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
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Редактирование игрового профиля (Блок "Игровой профиль" - номер, амплуа, хват)
  EDIT_USER_BLOCK_HOCKEY: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER], 
    requiresSubscription: [ROLES.TEAM_MANAGER]   
  },

  // Редактирование базового блока (Блок ФИО, контакты, аватарка пользователя)
  EDIT_USER_BLOCK_BASE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
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
    allowedRoles: [ROLES.OWNER, ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER]
  },

  // Вкладка "Ростер": Добавление игроков в заявочный лист турнира и исключение из него
  TEAM_MANAGE_TAB_ROSTER: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
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
  // 📄 Файл: Sidebar.jsx
  // ==========================================
  
  // Доступ к выпадающему списку команд для создания событий (Добавить событие)
  MGR_CREATE_EVENT: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Доступ к разделу заявочных кампаний в турниры (Заявки)
  MGR_SEASON_ROSTERS: {
    allowedRoles: [ROLES.OWNER],
    requiresSubscription: []
  },

  // Доступ к разделу финансового контроля (Финансы)
  MGR_FINANCES: {
    allowedRoles: [ROLES.OWNER],
    requiresSubscription: []
  },

  // Доступ к разделу внутрикомандных реестров (Справочники)
  MGR_HANDBOOKS: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 📌 СОБЫТИЯ (общие ключи для всех типов событий)
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

  // ==========================================
  // 🏒 МАТЧИ
  // ==========================================

  // Управление ручными отметками присутствия игроков и финансовых пометками (₽) менеджером
  MATCH_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Подтверждение или отмена вызова на товарищеский матч (friendly_pwa)
  MATCH_CONFIRM_CANCEL: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Сохранение черновика пятерок на матч и расстановка игроков по слотам (Чистая тактика тренера)
  MATCH_LINES_MANAGE: {
    allowedRoles: [ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: false
  },

  // Шеринг текущего состава звеньев через системное окно «Поделиться» (Web Share API)
  MATCH_LINES_SHARE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование параметров игрока внутри звеньев (Клик по аватарке -> нижняя шторка номера, Капитана (C) и Ассистента (A))
  MATCH_LINES_EDIT_PLAYER_PARAMS: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Отправка официальной электронной заявки состава в лигу (Кнопка отправки)
  MATCH_ROSTER_SUBMIT: {
    allowedRoles: [ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Заполнение результатов неофициального матча после game_date (голы, штрафы, +/-, журнал вратарей, броски).
  // Доступ имеет только команда-инициатор (games.home_team_id).
  MATCH_FILL_RESULTS: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование медиа-ссылок трансляций матча (Блок 1 - YouTube, VK Видео)
  MATCH_EDIT_MEDIA: {
    allowedRoles: [
      ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование расписания (Блок 2 - Дата, время, выбор Арены из справочника)
  MATCH_EDIT_SCHEDULE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование игровой формы и взноса с игрока за участие (Блок 3 - Цвет джерси, стоимость)
  MATCH_EDIT_FINANCES: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Полное физическое удаление карточки матча из календаря (Кнопка внизу экрана)
  MATCH_DELETE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // ==========================================
  // 🏋️ ТРЕНИРОВКИ
  // ==========================================

  // Управление ручными отметками присутствия игроков и финансовых пометками (₽) менеджером на тренировках
  TRAINING_ATTENDANCE_MANAGE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Сохранение черновика расстановки игроков на тренировку (тактика тренера)
  TRAINING_LINES_MANAGE: {
    allowedRoles: [ROLES.OWNER, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: false
  },

  // Шеринг расстановки тренировки через системное окно «Поделиться» (Web Share API)
  TRAINING_LINES_SHARE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, ROLES.HEAD_COACH, ROLES.COACH],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование расписания тренировки (Дата, время, выбор Арены/локации)
  TRAINING_EDIT_SCHEDULE: {
     allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование стоимости тренировки для игрока (Взнос за участие)
  TRAINING_EDIT_FINANCES: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
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
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER],
    requiresSubscription: [ROLES.TEAM_MANAGER]
  },

  // Редактирование расписания собрания (Дата, время, выбор локации)
  MEETING_EDIT_SCHEDULE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Редактирование стоимости собрания для участника (Взнос за участие)
  MEETING_EDIT_FINANCES: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },

  // Полное физическое удаление карточки собрания из календаря
  MEETING_DELETE: {
    allowedRoles: [ROLES.OWNER, ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN],
    requiresSubscription: [ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN]
  },
};