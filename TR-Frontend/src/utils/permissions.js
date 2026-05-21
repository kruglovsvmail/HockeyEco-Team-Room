// Справочник ролей внутри Команды / Клуба
export const ROLES = {
  GLOBAL_ADMIN: 'admin',           // Глобальный администратор системы (Разработчик/Владелец)
  CLUB_TOP_MANAGER: 'top_manager', // Владелец / Руководитель клуба
  CLUB_ADMIN: 'club_admin',        // Администратор клуба
  TEAM_MANAGER: 'team_manager',    // Менеджер конкретной команды
  TEAM_ADMIN: 'team_admin',        // Админ конкретной команды
  HEAD_COACH: 'head_coach',        // Главный тренер
  COACH: 'coach',                  // Тренер (помощник)
  PLAYER: 'player',                // Игрок (участник состава)
};

// Системные лимиты времени (в минутах до начала матча)
export const DEADLINES = {
  LINES_EDIT_MINUTES: 9,   // За сколько минут тренеру блокируется изменение расстановки
  ROSTER_SUBMIT_MINUTES: 8 // За сколько минут админу блокируется отправка официальной заявки в лигу
};

// Справочник доступов: Ключ = Действие, Значение = Массив разрешенных ролей
export const PERMISSIONS = {
  // Управление базовым составом команды (глобальные ростеры на турнир)
  ROSTER_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, ROLES.TEAM_MANAGER
  ],
  
  // Управление профилем и визуальным стилем команды в PWA
  TEAM_EDIT_PROFILE: [
    ROLES.TEAM_MANAGER
  ],
  
  // Управление тренировками, собраниями и товарняками
  EVENTS_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN, 
    ROLES.HEAD_COACH, ROLES.COACH
  ],

  // Управление ручными отметками присутствия игроков (плюсики/минусики)
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

  // Сохранение ЧЕРНОВИКА пятерок на матч (внутренняя доска команды)
  LINES_MANAGE: [
    ROLES.HEAD_COACH, ROLES.COACH
  ],

  // ОТПРАВКА ОФИЦИАЛЬНОЙ ЗАЯВКИ в лигу (Тренеры исключены, это зона ответственности админов)
  ROSTER_SUBMIT: [
    ROLES.CLUB_TOP_MANAGER, ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, ROLES.TEAM_ADMIN
  ]
};