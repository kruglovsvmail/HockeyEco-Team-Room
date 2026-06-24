import pool from '../../config/db.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { sendPushToTeamExcept, scheduleNotification, scheduleMatchDeadlines, getTrainingInfo, getMeetingInfo, getMatchInfo } from '../../services/pushService.js';

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

  // Суперпользователь (Главный admin платформы) обходит любые заслоны
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

    // Клубные роли (top_manager, club_admin) — необходимы для проверки MGR_CREATE_EVENT
    const crRes = await client.query(`
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
    `, [userId, teamId]);

    crRes.rows.forEach(r => userRoles.push(r.role));
  }

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
 * Вспомогательный конвертер строк формата PWA в ISO Timestamp для PostgreSQL
 * ИСПРАВЛЕНО: Поддерживает форматы YYYY-MM-DD (с дефисами) и DD.MM.YYYY (с точками)
 */
const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;

  // Если дата уже передана в международном формате YYYY-MM-DD
  if (dateStr.includes('-')) {
    return `${dateStr}T${timeStr}:00`;
  }

  // Если дата передана в старом формате DD.MM.YYYY
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
    
    // Извлекаем таймзону. Теперь проверяем и custom_timezone, пришедшую от устройства
    const arenaTz = selectedArena?.timezone || selectedArena?.arena_timezone || selectedArena?.custom_timezone || 'Europe/Moscow';
    const customTz = selectedArena?.custom_timezone || null;
    
    // isFree=true → 0 (Бесплатно).
    // isFree=false + введена сумма → число.
    // isFree=false + пусто → null (Взнос не указан).
    let cost;
    if (isFree) {
      cost = 0;
    } else if (feeAmount === '' || feeAmount === null || feeAmount === undefined) {
      cost = null;
    } else {
      const parsed = parseInt(feeAmount, 10);
      cost = Number.isNaN(parsed) ? null : parsed;
    }

    // Разделение контекста локации (Системная ледовая арена ИЛИ Кастомный зал/ОФП/кафе)
    const isManualArena = selectedArena.isManual === true;
    const arenaId = isManualArena ? null : selectedArena.id;
    const locationName = isManualArena ? selectedArena.name : null;
    const locationUrl = isManualArena ? (selectedArena.location_url || '') : null;

    // ==========================================
    // СЦЕНАРИЙ 1: СОЗДАНИЕ ТРЕНИРОВКИ
    // ==========================================
    if (eventType === 'training') {
      const insertQuery = `
        INSERT INTO "public"."team_training" (team_id, training_date, arena_id, location, location_url, title, cost, custom_timezone)
        VALUES ($1, $2::timestamp AT TIME ZONE $3, $4, $5, $6, $7, $8, $9)
        RETURNING id;
      `;
      const result = await pool.query(insertQuery, [
        teamId, eventTimestamp, arenaTz, arenaId, locationName, locationUrl, eventTitle || 'Командная тренировка', cost, customTz
      ]);
      const newEventId = result.rows[0].id;

      // Push: новое событие + напоминание за 24ч
      getTrainingInfo(newEventId, 'team_training').then(info => {
        sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
          title: 'Новая тренировка',
          body: info.text,
          url: `/event/team_training/${newEventId}`,
          tag: `new-event-${newEventId}`,
        });
      }).catch(() => {});
      if (eventTimestamp) {
        const sendAt = new Date(new Date(eventTimestamp).getTime() - 24 * 60 * 60 * 1000);
        if (sendAt > new Date()) {
          getTrainingInfo(newEventId, 'team_training').then(info => {
            scheduleNotification({ type: 'event_reminder_24h', teamId, eventId: newEventId, sendAt, payload: { title: 'Тренировка через 24 часа', body: info.text, url: `/event/team_training/${newEventId}`, tag: `reminder-${newEventId}` } });
          }).catch(() => {});
        }
      }

      return res.json({ success: true, message: 'Тренировка успешно добавлена в календарь', eventId: newEventId });
    }

    // ==========================================
    // СЦЕНАРИЙ 2: СОЗДАНИЕ СОБРАНИЯ
    // ==========================================
    if (eventType === 'meeting') {
      const insertQuery = `
        INSERT INTO "public"."team_meeting" (team_id, meeting_date, arena_id, location, location_url, title, cost, custom_timezone)
        VALUES ($1, $2::timestamp AT TIME ZONE $3, $4, $5, $6, $7, $8, $9)
        RETURNING id;
      `;
      const result = await pool.query(insertQuery, [
        teamId, eventTimestamp, arenaTz, arenaId, locationName, locationUrl, eventTitle || 'Командное собрание', cost, customTz
      ]);
      const newMeetingId = result.rows[0].id;

      getMeetingInfo(newMeetingId, 'team_meeting').then(info => {
        sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
          title: 'Новое собрание',
          body: info.text,
          url: `/event/team_meeting/${newMeetingId}`,
          tag: `new-event-${newMeetingId}`,
        });
      }).catch(() => {});
      if (eventTimestamp) {
        const sendAt = new Date(new Date(eventTimestamp).getTime() - 24 * 60 * 60 * 1000);
        if (sendAt > new Date()) {
          getMeetingInfo(newMeetingId, 'team_meeting').then(info => {
            scheduleNotification({ type: 'event_reminder_24h', teamId, eventId: newMeetingId, sendAt, payload: { title: 'Собрание через 24 часа', body: info.text, url: `/event/team_meeting/${newMeetingId}`, tag: `reminder-${newMeetingId}` } });
          }).catch(() => {});
        }
      }

      return res.json({ success: true, message: 'Собрание успешно запланировано', eventId: newMeetingId });
    }

    // ==========================================
    // СЦЕНАРИЙ 3: СОЗДАНИЕ ИГРЫ (МАТЧА) — ИСПРАВЛЕНО СОХРАНЕНИЕ РУЧНОЙ ЛОКАЦИИ
    // ==========================================
    if (eventType === 'match') {
      let gameType = '';
      let status = 'scheduled';
      let awayTeamId = null;
      let awayExternalId = null;
      let externalTournamentId = null;
      let confirmDeadline = null;
      let stageLabel = null;

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

      // Добавлено сохранение полей custom_timezone ($20), location ($21) и location_url ($22) в таблицу games
      const insertGameQuery = `
        INSERT INTO "public"."games" (
          game_type, home_team_id, away_team_id, away_external_id, 
          external_tournament_id, game_date, arena_id, status, 
          confirm_deadline, home_jersey_type, away_jersey_type, 
          home_player_fee, video_yt_url, video_vk_url, 
          stage_type, stage_label, series_number, initiator_team_id,
          custom_timezone, location, location_url
        ) VALUES ($1, $2, $3, $4, $5, $6::timestamp AT TIME ZONE $19, $7, $8, $9::timestamp AT TIME ZONE $19, $10, $11, $12, $13, $14, $15, $16, $17, $18, $20, $21, $22)
        RETURNING id;
      `;

      const complementaryJersey = myJerseyType === 'dark' ? 'light' : 'dark';

      const result = await pool.query(insertGameQuery, [
        gameType,
        teamId, 
        awayTeamId,
        awayExternalId,
        externalTournamentId,
        eventTimestamp, // $6
        arenaId,
        status,
        confirmDeadline, // $9
        myJerseyType,
        complementaryJersey,
        cost, 
        videoYtUrl || null,
        videoVkUrl || null,
        stageType || 'friendly',
        stageLabel,
        seriesNumber ? parseInt(seriesNumber) : null,
        gameType === 'friendly_pwa' ? teamId : null,
        arenaTz, // $19
        customTz, // $20
        locationName, // $21
        locationUrl   // $22
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

      const newGameId = result.rows[0].id;

      // Push: новый матч (расписание) + напоминание за 24ч
      const matchPushTitle = gameType === 'friendly_pwa' ? 'Товарищеский матч' : 'Новый матч';
      getMatchInfo(newGameId, teamId).then(info => {
        sendPushToTeamExcept(teamId, req.user.id, 'schedule', {
          title: matchPushTitle,
          body: info.text,
          url: `/event/match/${newGameId}`,
          tag: `new-event-${newGameId}`,
        });
      }).catch(() => {});
      if (eventTimestamp) {
        const sendAt = new Date(new Date(eventTimestamp).getTime() - 24 * 60 * 60 * 1000);
        if (sendAt > new Date()) {
          getMatchInfo(newGameId, teamId).then(info => {
            scheduleNotification({ type: 'event_reminder_24h', teamId, eventId: newGameId, sendAt, payload: { title: 'Матч через 24 часа', body: info.text, url: `/event/match/${newGameId}`, tag: `reminder-${newGameId}` } });
          }).catch(() => {});
        }
      }
      // Push: если friendly_pwa — уведомить сопернику о вызове
      if (gameType === 'friendly_pwa' && awayTeamId) {
        getMatchInfo(newGameId, awayTeamId).then(info => {
          sendPushToTeamExcept(awayTeamId, req.user.id, 'friendly', {
            title: 'Вызов на товарищеский матч',
            body: info.text,
            url: `/event/match/${newGameId}`,
            tag: `friendly-challenge-${newGameId}`,
          });
        }).catch(() => {});
      }

      // Дедлайны администрирования: заявка (за 2ч), состав (за 2ч), подтверждение товарищеского (за 1ч)
      scheduleMatchDeadlines(newGameId, teamId, eventTimestamp, confirmDeadline).catch(() => {});

      return res.json({
        success: true,
        message: gameType === 'friendly_pwa' ? 'Вызов сопернику успешно отправлен' : 'Матч успешно добавлен в расписание',
        gameId: newGameId
      });
    }

    return res.status(400).json({ success: false, error: 'Указан неизвестный тип спортивного события' });

  } catch (err) {
    console.error('[Create Event Controller Error]:', err);
    return res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера при записи события в базу данных' });
  }
};