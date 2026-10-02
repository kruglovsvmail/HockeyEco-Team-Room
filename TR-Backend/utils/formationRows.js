// Строки расстановки — одни и те же для экрана «Состав» и для картинки состава.
// Картинку собирает сервер (services/formationImageService.js), и она обязана
// показывать ровно то, что видит команда: тех же игроков, те же фото, те же нашивки.
// Поэтому запросы живут здесь, а не копией в каждом месте.

// Расстановка у солянки та же, что у тренировки: те же звенья, те же позиции,
// та же сетка. Отличаются только таблицы, поэтому имена собираем здесь, а не
// разводим два почти одинаковых контроллера.
export const COMMUNITY_FORMATION = {
  community_training: {
    formation: 'community_formation_training',
    fk: 'community_training_id',
  },
  community_game: {
    formation: 'community_formation_game',
    fk: 'community_game_id',
    // На солянке в составе бывают гости — люди без аккаунта, за которых штаб
    // занял место. У них нет player_id, поэтому в расстановке они хранятся
    // ссылкой на строку отметки (guest_attendance_id), а наружу отдаются
    // идентификатором вида «g12»: фронт различает своих и гостей по нему же.
    guests: true,
    attendance: 'community_game_attendance',
  },
};

// Расстановка команды на матч
export const loadMatchLineRows = async (client, { eventId, teamId, gameType, divisionId }) => {
  // Если матч товарищеский (pwa/ext) или кастомный внешний (tournament_ext)
  if (gameType !== 'official') {
    const { rows } = await client.query(`
      SELECT
        tfg.player_id,
        tfg.line_number,
        tfg.position_in_line,
        COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
        COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
        COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant,
        u.first_name,
        u.last_name,
        COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
      FROM team_formation_game tfg
      JOIN users u ON u.id = tfg.player_id
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
      LEFT JOIN team_rosters tr ON tr.member_id = tm.id AND tr.left_at IS NULL
      WHERE tfg.game_id = $1 AND tfg.team_id = $2
    `, [eventId, teamId]);
    return rows;
  }

  // Исключительно для официальных внутренних матчей лиги платформы
  const { rows } = await client.query(`
    SELECT
      tfg.player_id,
      tfg.line_number,
      tfg.position_in_line,
      COALESCE(tfg.jersey_number, tr.jersey_number) AS jersey_number,
      COALESCE(tfg.is_captain, tr.is_captain, false) AS is_captain,
      COALESCE(tfg.is_assistant, tr.is_assistant, false) AS is_assistant,
      u.first_name,
      u.last_name,
      -- Официальный матч — лиговый контекст: показываем фото из заявки (снимок на момент
      -- допуска), чтобы состав на матч совпадал с тем, кого лига допустила
      COALESCE(tr.photo_snapshot_url, tm.photo_url, u.avatar_url) AS avatar_url
    FROM team_formation_game tfg
    JOIN users u ON u.id = tfg.player_id
    LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
    LEFT JOIN tournament_teams tt ON tt.team_id = $2 AND tt.division_id = $3
    LEFT JOIN tournament_rosters tr ON tr.player_id = u.id AND tr.tournament_team_id = tt.id AND tr.period_end IS NULL AND tr.application_status = 'approved'
    WHERE tfg.game_id = $1 AND tfg.team_id = $2
  `, [eventId, teamId, divisionId]);
  return rows;
};

// Расстановка на тренировке команды, клуба или сообщества и на солянке.
// scope — из getEventScope: какой контекст и чей он. Принадлежность события
// контексту проверяет вызывающий.
export const loadTrainingLineRows = async (client, eventId, { teamId, clubId, communityId, eventType }) => {
  const communityCfg = COMMUNITY_FORMATION[eventType] || null;

  // Тренировка: на общий лёд приходят люди без команды, фото берём из профиля —
  // как и на клубной тренировке.
  if (communityCfg) {
    // Расстановка солянки держит и гостей, поэтому users присоединяется
    // LEFT JOIN, а имя берётся из отметки, если человека за строкой нет.
    const { rows } = communityCfg.guests
      ? await client.query(`
          SELECT
            COALESCE(cf.player_id::text, 'g' || cf.guest_attendance_id) AS player_id,
            cf.line_number,
            cf.position_in_line,
            cf.jersey_color,
            COALESCE(u.first_name, ga.guest_first_name) AS first_name,
            COALESCE(u.last_name, ga.guest_last_name) AS last_name,
            u.avatar_url
          FROM "${communityCfg.formation}" cf
          LEFT JOIN users u ON u.id = cf.player_id
          LEFT JOIN "${communityCfg.attendance}" ga ON ga.id = cf.guest_attendance_id
          WHERE cf."${communityCfg.fk}" = $1 AND cf.community_id = $2
        `, [eventId, communityId])
      : await client.query(`
          SELECT
            cf.player_id,
            cf.line_number,
            cf.position_in_line,
            cf.jersey_color,
            u.first_name,
            u.last_name,
            u.avatar_url
          FROM "${communityCfg.formation}" cf
          JOIN users u ON u.id = cf.player_id
          WHERE cf."${communityCfg.fk}" = $1 AND cf.community_id = $2
        `, [eventId, communityId]);
    return rows;
  }

  // Клубная расстановка живёт в своей таблице: у неё нет команды, а фото человека
  // берётся из личного профиля — на общий лёд приходят игроки разных составов.
  if (eventType === 'club_training') {
    const { rows } = await client.query(`
      SELECT
        cft.player_id,
        cft.line_number,
        cft.position_in_line,
        cft.jersey_color,
        u.first_name,
        u.last_name,
        u.avatar_url
      FROM club_formation_training cft
      JOIN users u ON u.id = cft.player_id
      WHERE cft.club_training_id = $1 AND cft.club_id = $2
    `, [eventId, clubId]);
    return rows;
  }

  const { rows } = await client.query(`
    SELECT
      tft.player_id,
      tft.line_number,
      tft.position_in_line,
      tft.jersey_color,
      u.first_name,
      u.last_name,
      COALESCE(tm.photo_url, u.avatar_url) AS avatar_url
    FROM team_formation_training tft
    JOIN users u ON u.id = tft.player_id
    LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
    WHERE tft.team_training_id = $1 AND tft.team_id = $2
  `, [eventId, teamId]);
  return rows;
};
