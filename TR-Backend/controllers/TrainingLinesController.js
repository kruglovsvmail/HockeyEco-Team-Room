import pool from '../config/db.js';
import {
  checkPermissionInternal,
  checkClubPermissionInternal,
  checkCommunityPermissionInternal,
  getEventScope,
} from '../utils/checkPermission.js';
import {
  sendPushToEventScopeExcept,
  getTrainingInfo,
  getCommunityEventInfo,
  eventUrl,
} from '../services/pushService.js';
// Таблицы расстановки сообществ и сам запрос расстановки — общие с картинкой состава.
// Таблица самого события — в EVENT_OWNERS.
import { COMMUNITY_FORMATION, loadTrainingLineRows } from '../utils/formationRows.js';
import { refreshTrainingFormationImage } from '../services/formationImageService.js';

// Чьё событие, расстановку которого ставят: таблица и колонка владельца. Строки
// расстановки и так помечены командой, клубом или сообществом, поэтому чужую
// расстановку не перетереть — но без проверки события руководитель команды A
// записывал «свои» звенья к тренировке команды B, и его команде уходил пуш с её
// датой и местом. Законно чужой тренировка не бывает: совместных нет.
const EVENT_OWNERS = {
  team_training: { table: 'team_training', ownerColumn: 'team_id', scopeKey: 'teamId' },
  club_training: { table: 'club_training', ownerColumn: 'club_id', scopeKey: 'clubId' },
  community_training: { table: 'community_training', ownerColumn: 'community_id', scopeKey: 'communityId' },
  community_game: { table: 'community_game', ownerColumn: 'community_id', scopeKey: 'communityId' },
};

// Событие из адреса — только если оно принадлежит контексту запроса (см. EVENT_OWNERS)
const loadEvent = async (eventId, scope, client = pool) => {
  const owner = EVENT_OWNERS[scope.eventType];
  const ownerId = owner && scope[owner.scopeKey];
  if (!ownerId) return null;

  const { rows } = await client.query(
    `SELECT id FROM "${owner.table}" WHERE id = $1 AND ${owner.ownerColumn} = $2`,
    [eventId, ownerId]
  );
  return rows[0] || null;
};

// Ссылка на гостя в расстановке: «g» + id строки отметки. Разбирается обратно
// при сохранении — всё, что не число, ищем среди занятых мест.
const GUEST_REF = /^g(\d+)$/;
const parseGuestRef = (value) => {
  const match = GUEST_REF.exec(String(value ?? ''));
  return match ? Number(match[1]) : null;
};

export const getTrainingLines = async (req, res) => {
  try {
    const { eventId } = req.params;
    const scope = getEventScope(req);
    const { teamId, clubId, communityId } = scope;

    if (!teamId && !clubId && !communityId) {
      return res.status(400).json({ success: false, error: 'teamId, clubId или communityId обязателен' });
    }

    if (!(await loadEvent(eventId, scope))) {
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }

    // Тот же запрос собирает и картинку расстановки — см. utils/formationRows.js
    const lines = await loadTrainingLineRows(pool, eventId, scope);
    res.json({ success: true, lines });
  } catch (err) {
    console.error('Ошибка получения расстановки тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const saveTrainingLines = async (req, res) => {
  const client = await pool.connect();
  try {
    const initiatorId = req.user.id;
    const { eventId } = req.params;
    const { lines } = req.body;
    const scope = getEventScope(req);
    const { teamId, clubId, communityId, eventType } = scope;

    if ((!teamId && !clubId && !communityId) || !Array.isArray(lines)) {
      return res.status(400).json({ success: false, error: 'Некорректные данные' });
    }

    const communityCfg = COMMUNITY_FORMATION[eventType] || null;
    const isCommunity = !!communityCfg;
    const isClub = eventType === 'club_training';

    // Расстановку на клубной тренировке ставит только тренер клуба.
    // В сообществе тренерской роли нет — там это право штаба.
    const hasAccess = isCommunity
      ? await checkCommunityPermissionInternal(initiatorId, communityId, 'COMMUNITY_LINES_MANAGE', client)
      : isClub
        ? await checkClubPermissionInternal(initiatorId, clubId, 'CLUB_TRAINING_LINES_MANAGE', client)
        : await checkPermissionInternal(initiatorId, teamId, 'TRAINING_LINES_MANAGE', client);

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'У вас нет прав для сохранения расстановки' });
    }

    if (!(await loadEvent(eventId, scope, client))) {
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }

    await client.query('BEGIN');

    if (isCommunity) {
      await client.query(
        `DELETE FROM "${communityCfg.formation}" WHERE "${communityCfg.fk}" = $1 AND community_id = $2`,
        [eventId, communityId]
      );

      for (const player of lines) {
        // «g12» — занятое место, обычное число — участник. Гости приходят только
        // с солянки; на тренировке сообщества такой ссылки быть не может, и
        // строку с ней молча пропускаем, а не пишем битую расстановку.
        const guestAttendanceId = parseGuestRef(player.player_id);
        const playerId = guestAttendanceId ? null : Number(player.player_id) || null;
        if (guestAttendanceId && !communityCfg.guests) continue;
        if (!guestAttendanceId && !playerId) continue;

        await client.query(`
          INSERT INTO "${communityCfg.formation}"
            ("${communityCfg.fk}", community_id, player_id, ${communityCfg.guests ? 'guest_attendance_id, ' : ''}line_number, position_in_line, jersey_color)
          VALUES ($1, $2, $3, ${communityCfg.guests ? '$7, ' : ''}$4, $5, $6)
        `, [
          eventId, communityId, playerId,
          player.line_number, player.position_in_line, player.jersey_color || null,
          ...(communityCfg.guests ? [guestAttendanceId] : []),
        ]);
      }
    } else if (isClub) {
      await client.query(
        `DELETE FROM club_formation_training WHERE club_training_id = $1 AND club_id = $2`,
        [eventId, clubId]
      );

      for (const player of lines) {
        await client.query(`
          INSERT INTO club_formation_training (club_training_id, club_id, player_id, line_number, position_in_line, jersey_color)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [eventId, clubId, player.player_id, player.line_number, player.position_in_line, player.jersey_color || null]);
      }
    } else {
      await client.query(
        `DELETE FROM team_formation_training WHERE team_training_id = $1 AND team_id = $2`,
        [eventId, teamId]
      );

      for (const player of lines) {
        await client.query(`
          INSERT INTO team_formation_training (team_training_id, team_id, player_id, line_number, position_in_line, jersey_color)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [eventId, teamId, player.player_id, player.line_number, player.position_in_line, player.jersey_color || null]);
      }
    }

    await client.query('COMMIT');

    // Картинку расстановки сервер пересобирает сам, в фоне: ответ на сохранение её не
    // ждёт, а приложение, перечитав событие, запросит картинку и дождётся этой сборки
    refreshTrainingFormationImage(eventId, scope);

    // У солянки своя дата (game_date) и свой заголовок: getTrainingInfo такую
    // таблицу не знает, поэтому берём общий помощник событий сообщества.
    const infoPromise = eventType === 'community_game'
      ? getCommunityEventInfo(eventId, eventType)
      : getTrainingInfo(eventId, eventType);

    infoPromise.then(info => {
      sendPushToEventScopeExcept({ teamId, clubId, communityId }, req.user.id, 'lines', {
        title: eventType === 'community_game' ? 'Составы на солянку обновлены' : 'Состав на тренировку обновлён',
        body: info.text,
        url: eventUrl(eventType, eventId),
        tag: `lines-${eventId}`,
      });
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка сохранения расстановки тренировки:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
};
