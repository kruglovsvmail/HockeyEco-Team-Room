// Справочник ролей внутри Команды / Клуба
export const ROLES = {
  GLOBAL_ADMIN: 'admin',           // Глобальный администратор системы (Разработчик/Владелец)
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

// Справочник доступов: Ключ = Действие, Значение = Массив разрешенных ролей
export const PERMISSIONS = {
  // ==========================================
  // ГРАНУЛЯРНЫЕ ПРАВА РЕДАКТИРОВАНИЯ ПРОФИЛЯ ЮЗЕРА
  // ==========================================

  // Редактирование административных статусов (Изменение ролей сотрудников в team_roles)
  EDIT_MEMBER_ROLES: [
    ROLES.TEAM_MANAGER
  ],

  // Редактирование игрового профиля (Изменение игрового номера и амплуа в team_rosters)
  EDIT_MEMBER_GAME_PROFILE: [
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN
  ],

  // Редактирование блока шапки (Замена/удаление фото, назначение Капитана и Ассистентов)
  EDIT_MEMBER_HEADER: [
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN
  ],

  // Просмотр конфиденциального виртуального кода игрока
  VIEW_VIRTUAL_CODE: [
    ROLES.TEAM_MANAGER
  ],

  // ==========================================
  // ОБЩИЕ КОМАНДНЫЕ ПРАВА ДОСТУПА
  // ==========================================

  // Управление базовым составом команды (глобальное добавление/удаление из состава)
  ROSTER_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER
  ],
  
  // Управление профилем и визуальным стилем команды в PWA
  TEAM_EDIT_PROFILE: [
    ROLES.TEAM_MANAGER
  ],
  
  // Управление тренировками, собраниями и матчами
  EVENTS_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, 
    ROLES.HEAD_COACH, ROLES.COACH
  ],

  // Управление ручными отметками присутствия игроков
  ATTENDANCE_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN
  ],

  // Просмотр внутренней информации (тактика, расписание, контакты)
  INTERNAL_VIEW: [
    ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, 
    ROLES.HEAD_COACH, ROLES.COACH, ROLES.PLAYER
  ],

  // Сохранение ЧЕРНОВИКА пятерок на матч
  LINES_MANAGE: [
    ROLES.HEAD_COACH, ROLES.COACH
  ],

  // Отправка официальной электронной заявки в лигу
  ROSTER_SUBMIT: [
    ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN
  ],

  // ==========================================
  // ГРАНУЛЯРНЫЕ ПРАВА РАЗДЕЛА РУКОВОДСТВА КОМАНДЫ
  // ==========================================
  
  // 1. Доступ к странице создания событий (матчи, тренировки, собрания)
  MGR_CREATE_EVENT: [
    ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER
  ],

  // 2. Доступ к странице заявочных кампаний (заявки на сезон, дозаявки)
  MGR_SEASON_ROSTERS: [
    ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER
  ],

  // 3. Доступ к странице финансового контроля (оргвзносы, абонементы)
  MGR_FINANCES: [
    ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER
  ],

  // 4. Доступ к странице справочников (инвентарь, настройки звеньев, базы арен)
  MGR_HANDBOOKS: [
    ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER
  ]
};