import pool from '../config/db.js';

/**
 * Связь состава команды и общей базы клуба.
 *
 * Правило: если команда принадлежит клубу, то каждый её участник обязан быть и
 * в базе клуба. Движение сверху вниз (исключение из клуба) каскадное — оно
 * закрывает и команды клуба. Движение снизу вверх (уход из команды) базу клуба
 * не трогает: человек остаётся резервом клуба, пока его не убрали явно.
 *
 * Жёстких удалений здесь нет нигде — всё закрывается датой в left_at.
 */

/**
 * Человек попал в состав команды: если у команды есть клуб, подтягиваем его
 * в базу клуба. Ранее ушедшего из клуба возвращаем — иначе он оказался бы
 * в команде клуба, но вне самого клуба. Клубные роли при возврате НЕ
 * восстанавливаются: их назначают заново.
 *
 * @returns {number|null} id клуба, если синхронизация выполнялась
 */
export async function syncClubMembershipOnTeamJoin(teamId, userId, client = pool) {
  const { rows } = await client.query('SELECT club_id FROM teams WHERE id = $1', [teamId]);
  const clubId = rows[0]?.club_id;
  if (!clubId) return null;

  await client.query(`
    INSERT INTO club_members (club_id, user_id, joined_at)
    VALUES ($1, $2, CURRENT_DATE)
    ON CONFLICT (club_id, user_id)
    DO UPDATE SET left_at = NULL, joined_at = CURRENT_DATE
    WHERE club_members.left_at IS NOT NULL
  `, [clubId, userId]);

  return clubId;
}

/**
 * Условие, при котором при исключении из команды имеет смысл предлагать галочку
 * «убрать и из клуба»: эта команда — единственная ниточка человека к клубу.
 *
 * Не предлагаем, если он активен ещё в какой-то команде клуба, имеет клубные
 * полномочия или владеет клубом — такой человек должен остаться в базе.
 *
 * ВАЖНО: то же условие продублировано SQL-ом в getTeamMembers/getTeamDetails,
 * чтобы отдать флаг сразу со списком состава. При правке менять оба места.
 */
export const CLUB_EXCLUSION_OFFER_PREDICATE = `
  t.club_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM club_members cmx
    WHERE cmx.club_id = t.club_id AND cmx.user_id = %USER% AND cmx.left_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM club_roles crx
    WHERE crx.club_id = t.club_id AND crx.user_id = %USER% AND crx.left_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM clubs cx WHERE cx.id = t.club_id AND cx.owner_id = %USER%
  )
  AND NOT EXISTS (
    SELECT 1 FROM team_members tmx
    JOIN teams tx ON tx.id = tmx.team_id
    WHERE tmx.user_id = %USER% AND tmx.left_at IS NULL
      AND tx.club_id = t.club_id AND tx.id <> t.id
  )
`;

export async function canOfferClubExclusion(teamId, userId, client = pool) {
  const { rows } = await client.query(`
    SELECT (${CLUB_EXCLUSION_OFFER_PREDICATE.replaceAll('%USER%', '$2')}) AS ok
    FROM teams t WHERE t.id = $1
  `, [teamId, userId]);

  return rows[0]?.ok === true;
}

/**
 * Убрать человека только из клуба, не трогая команды: закрываем членство
 * и клубные полномочия датой. Используется галочкой при исключении из команды —
 * саму команду в этот момент закрывает вызывающий код.
 */
export async function removeFromClubOnly(clubId, userId, client = pool) {
  await client.query(
    'UPDATE club_members SET left_at = CURRENT_DATE WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
    [clubId, userId]
  );
  await client.query(
    'UPDATE club_roles SET left_at = CURRENT_DATE WHERE club_id = $1 AND user_id = $2 AND left_at IS NULL',
    [clubId, userId]
  );
}
