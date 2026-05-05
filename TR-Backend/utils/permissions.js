// Справочник ролей внутри Команды / Клуба
export const ROLES = {
  GLOBAL_ADMIN: 'admin',           // Глобальный администратор системы
  CLUB_TOP_MANAGER: 'top_manager', // Владелец / Руководитель клуба
  CLUB_ADMIN: 'club_admin',        // Администратор клуба
  TEAM_MANAGER: 'team_manager',    // Менеджер конкретной команды
  TEAM_ADMIN: 'team_admin',        // Админ конкретной команды
  HEAD_COACH: 'head_coach',        // Главный тренер
  COACH: 'coach',                  // Тренер
  PLAYER: 'player',                // Игрок (участник состава)
};

// Справочник доступов: Ключ = Действие, Значение = Массив разрешенных ролей
export const PERMISSIONS = {
  // Управление составом команды (заявки на матчи, ростеры)
  ROSTER_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, 
    ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, 
    ROLES.TEAM_ADMIN, 
    ROLES.HEAD_COACH
  ],
  
  // Управление тренировками и командными событиями
  EVENTS_MANAGE: [
    ROLES.CLUB_TOP_MANAGER, 
    ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, 
    ROLES.TEAM_ADMIN, 
    ROLES.HEAD_COACH, 
    ROLES.COACH
  ],

  // Просмотр внутренней информации (тактика, объявления, контакты)
  INTERNAL_VIEW: [
    ROLES.CLUB_TOP_MANAGER, 
    ROLES.CLUB_ADMIN, 
    ROLES.TEAM_MANAGER, 
    ROLES.TEAM_ADMIN, 
    ROLES.HEAD_COACH, 
    ROLES.COACH, 
    ROLES.PLAYER
  ]
};