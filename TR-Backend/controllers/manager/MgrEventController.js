import pool from '../../config/db.js';
import { PERMISSIONS } from '../../utils/permissions.js';

/**
 * Внутренняя изолированная функция для проверки гранулярных прав доступа руководителя и подписки
 */
async function checkPermissionInternal(userId, teamId, permissionKey, client = pool) {
  if (!userId) return false;

  const userRes = await client.query(
    'SELECT global_role, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return false;
  const { global_role, subscription_expires_at } = userRes.rows[0];

  // Суперпользователь (Главный админ платформы HockeyEco) обходит любые заслоны
  if (global_role === 'admin') return true;

  const permission = PERMISSIONS[permissionKey];
  if (!permission) return false;

  const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();
  let userRoles = [];

  if (teamId) {
    // 1. Проверка на создателя / владельца команды
    const teamOwnerRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
      userRoles.push('owner');
    }

    // 2. Сбор активных должностей из штатного расписания представителей
    const trRes = await client.query(`
      SELECT tr.role FROM team_roles tr 
      JOIN team_members tm ON tr.member_id = tm.id 
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
    `, [userId, teamId]);
    
    trRes.rows.forEach(r => userRoles.push(r.role));
  }

  // Полное соответствие структуре allowedRoles и requiresSubscription из permissions.js
  return permission.allowedRoles.some(role => {
    if (!userRoles.includes(role)) return false;

    let roleRequiresSub = false;
    if (permission.requiresSubscription === true) {
      roleRequiresSub = true;
    } else if (Array.isArray(permission.requiresSubscription)) {
      roleRequiresSub = permission.requiresSubscription.includes(role);
    }

    if (roleRequiresSub && !hasSubscription) {
      return false;
    }

    return true;
  });
}

/**
 * Вспомогательный конвертер строк формата PWA (дд.мм.гггг + чч:мм) в ISO Timestamp для PostgreSQL
 */
const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [d, m, y] = dateStr.split('.');
  return `${y}-${m}-${d}T${timeStr}:00`;
};

/**
 * Единая точка сохранения новых хоккейных событий
 */
export const createEvent = async (req, res) => {
  const userId = req.user.id;
  const {
    teamId,
    eventType,
    matchType,
    eventDate,
    eventTime,
    selectedArena,
    feeAmount,
    isFree,
    eventTitle,
    videoYtUrl,
    videoVkUrl,
    myJerseyType,
    selectedOpponent,
    deadlineDate,
    deadlineTime,
    selectedExtTournament,
    selectedExtOpponent,
    stageType,
    seriesNumber,
    regularRound,
    selectedPlayoffOption,
    customStageLabel
  } = req.body;

  // Жесткий заслон валидации на бэкенде
  if (!teamId || !eventType || !eventDate || !eventTime || !selectedArena) {
    return res.status(400).json({ success: false, error: 'Не все обязательные поля заполнены' });
  }

  try {
    // Аппаратная проверка прав менеджера по ролевой матрице экосистемы
    const hasAccess = await checkPermissionInternal(userId, teamId, 'MGR_CREATE_EVENT');
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для планирования событий данной команды' });
    }

    const eventTimestamp = parseDateTime(eventDate, eventTime);
    const cost = isFree ? 0 : parseInt(feeAmount) || 0;

    // Разделение контекста локации (Системная ледовая арена ИЛИ Кастомный зал/ОФП/кафе)
    const isManualArena = selectedArena.isManual === true;
    const arenaId = isManualArena ? null : selectedArena.id;
    const locationName = isManualArena ? selectedArena.name : null;
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: База данных констрейнтом (location_check) требует, чтобы при отсутствии arena_id 
    // поля location и location_url СТРОГО были NOT NULL. Поэтому при пустой ссылке передаем пустую строку '', обходя ошибку 23514.
    const locationUrl = isManualArena ? (selectedArena.location_url || '') : null;

    // ==========================================
    // СЦЕНАРИЙ 1: СОЗДАНИЕ ТРЕНИРОВКИ
    // ==========================================
    if (eventType === 'training') {
      const insertQuery = `
        INSERT INTO "public"."team_training" (team_id, training_date, arena_id, location, location_url, title, cost)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;
      const result = await pool.query(insertQuery, [
        teamId, eventTimestamp, arenaId, locationName, locationUrl, eventTitle || 'Командная тренировка', cost
      ]);
      return res.json({ success: true, message: 'Тренировка успешно добавлена в календарь', eventId: result.rows[0].id });
    }

    // ==========================================
    // СЦЕНАРИЙ 2: СОЗДАНИЕ СОБРАНИЯ
    // ==========================================
    if (eventType === 'meeting') {
      const insertQuery = `
        INSERT INTO "public"."team_meeting" (team_id, meeting_date, arena_id, location, location_url, title, cost)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;
      const result = await pool.query(insertQuery, [
        teamId, eventTimestamp, arenaId, locationName, locationUrl, eventTitle || 'Командное собрание', cost
      ]);
      return res.json({ success: true, message: 'Собрание успешно запланировано', eventId: result.rows[0].id });
    }

    // ==========================================
    // СЦЕНАРИЙ 3: СОЗДАНИЕ ИГРЫ (МАТЧА)
    // ==========================================
    if (eventType === 'match') {
      let gameType = '';
      let status = 'scheduled';
      let awayTeamId = null;
      let awayExternalId = null;
      let externalTournamentId = null;
      let confirmDeadline = null;
      let stageLabel = null;

      // Подветка А: Товарищеские встречи
      if (matchType === 'friendly') {
        if (!selectedOpponent) {
          return res.status(400).json({ success: false, error: 'Команда соперника обязательна для проведения игры' });
        }

        if (selectedOpponent.isPwa) {
          gameType = 'friendly_pwa';
          status = 'pending';
          awayTeamId = selectedOpponent.id;
          confirmDeadline = parseDateTime(deadlineDate, deadlineTime);
        } else {
          gameType = 'friendly_ext';
          awayExternalId = selectedOpponent.id;
          status = 'scheduled';
        }
        stageLabel = 'Товарищеский матч';
      } 
      // Подветка Б: Сторонние кубки и турниры (Новая архитектура без дивизионов)
      else if (matchType === 'tournament_ext') {
        if (!selectedExtTournament || !selectedExtOpponent) {
          return res.status(400).json({ success: false, error: 'Необходимо указать сторонний турнир и соперника по сетке' });
        }

        gameType = 'tournament_ext';
        status = 'scheduled';
        externalTournamentId = selectedExtTournament.id;
        awayExternalId = selectedExtOpponent.id;

        if (stageType === 'regular') {
          stageLabel = regularRound ? `${regularRound}-й круг` : 'Регулярный чемпионат';
        } else if (stageType === 'playoff') {
          stageLabel = selectedPlayoffOption === 'Другое' ? customStageLabel : selectedPlayoffOption;
        }
      }

      const insertGameQuery = `
        INSERT INTO "public"."games" (
          game_type, home_team_id, away_team_id, away_external_id, 
          external_tournament_id, game_date, arena_id, status, 
          confirm_deadline, home_jersey_type, away_jersey_type, 
          home_player_fee, video_yt_url, video_vk_url, 
          stage_type, stage_label, series_number, initiator_team_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id;
      `;

      const complementaryJersey = myJerseyType === 'dark' ? 'light' : 'dark';

      const result = await pool.query(insertGameQuery, [
        gameType,
        teamId, 
        awayTeamId,
        awayExternalId,
        externalTournamentId,
        eventTimestamp,
        arenaId,
        status,
        confirmDeadline,
        myJerseyType,
        complementaryJersey,
        cost, 
        videoYtUrl || null,
        videoVkUrl || null,
        stageType || 'friendly',
        stageLabel,
        seriesNumber ? parseInt(seriesNumber) : null,
        gameType === 'friendly_pwa' ? teamId : null
      ]);

      // ИНИЦИАЛИЗАЦИЯ ТАЙМЕРА МАТЧА
      try {
        await pool.query(`
          INSERT INTO "public"."game_timers" (game_id, time_seconds, is_running, period, shootout_status)
          VALUES ($1, 0, false, '1', 'pending')
          ON CONFLICT (game_id) DO NOTHING;
        `, [result.rows[0].id]);
      } catch (timerErr) {
        console.error('[Warning]: Не удалось инициализировать таймер для новой игры:', timerErr);
      }

      return res.json({ 
        success: true, 
        message: gameType === 'friendly_pwa' ? 'Вызов сопернику успешно отправлен' : 'Матч успешно добавлен в расписание', 
        gameId: result.rows[0].id 
      });
    }

    return res.status(400).json({ success: false, error: 'Указан неизвестный тип спортивного события' });

  } catch (err) {
    console.error('[Create Event Controller Error]:', err);
    return res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера при записи события в базу данных' });
  }
};