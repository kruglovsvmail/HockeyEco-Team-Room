import pool from '../config/db.js';
import { checkPermissionInternal, checkClubPermissionInternal, checkCommunityPermissionInternal } from '../utils/checkPermission.js';
import {
  sendPushToEventScopeExcept,
  getTrainingInfo,
  getCommunityEventInfo,
} from '../services/pushService.js';

// Расстановка у солянки та же, что у тренировки: те же звенья, те же позиции,
// та же сетка. Отличаются только таблицы, поэтому имена собираем здесь, а не
// разводим два почти одинаковых контроллера.
const COMMUNITY_FORMATION = {
  community_training: {
    event: 'community_training',
    formation: 'community_formation_training',
    fk: 'community_training_id',
  },
  community_game: {
    event: 'community_game',
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
    const { teamId, clubId, communityId, eventType } = req.query;

    if (!teamId && !clubId && !communityId) {
      return res.status(400).json({ success: false, error: 'teamId, clubId или communityId обязателен' });
    }

    const communityCfg = COMMUNITY_FORMATION[eventType] || null;
    const isCommunity = !!communityCfg;
    const isClub = eventType === 'club_training';
    const table = isCommunity ? communityCfg.event : isClub ? 'club_training' : 'team_training';

    const check = await pool.query(`SELECT id FROM "${table}" WHERE id = $1`, [eventId]);
    if (check.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Событие не найдено' });
    }

    // Тренировка: на общий лёд приходят люди без команды, фото берём из профиля —
    // как и на клубной тренировке.
    if (isCommunity) {
      // Расстановка солянки держит и гостей, поэтому users присоединяется
      // LEFT JOIN, а имя берётся из отметки, если человека за строкой нет.
      const result = communityCfg.guests
        ? await pool.query(`
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
        : await pool.query(`
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

      return res.json({ success: true, lines: result.rows });
    }

    // Клубная расстановка живёт в своей таблице: у неё нет команды, а фото человека
    // берётся из личного профиля — на общий лёд приходят игроки разных составов.
    if (isClub) {
      const result = await pool.query(`
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

      return res.json({ success: true, lines: result.rows });
    }

    const result = await pool.query(`
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

    res.json({ success: true, lines: result.rows });
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
    const { teamId, clubId, communityId, eventType, lines } = req.body;

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

    const table = isCommunity ? communityCfg.event : isClub ? 'club_training' : 'team_training';
    const check = await client.query(`SELECT id FROM "${table}" WHERE id = $1`, [eventId]);
    if (check.rowCount === 0) {
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

    // У солянки своя дата (game_date) и свой заголовок: getTrainingInfo такую
    // таблицу не знает, поэтому берём общий помощник событий сообщества.
    const infoPromise = eventType === 'community_game'
      ? getCommunityEventInfo(eventId, eventType)
      : getTrainingInfo(eventId, eventType);

    infoPromise.then(info => {
      sendPushToEventScopeExcept({ teamId, clubId, communityId }, req.user.id, 'lines', {
        title: eventType === 'community_game' ? 'Составы на солянку обновлены' : 'Состав на тренировку обновлён',
        body: info.text,
        url: `/event/${eventType}/${eventId}`,
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
