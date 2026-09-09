import pool from '../config/db.js';

/**
 * Владельцы команды живут отдельной таблицей team_owners, а не колонкой teams.owner_id:
 * их может быть двое, и оба равны в правах. Назначает и снимает владельцев только
 * глобальный администратор из LMS — ни владелец, ни кто-либо в Team-Room этого не может.
 *
 * Владелец не обязан состоять в команде: строка в team_owners — самостоятельное основание
 * для роли OWNER и доступа к команде, даже без записи в team_members.
 */
export const MAX_TEAM_OWNERS = 2;

// Сравнение делает Postgres, а не JS: id прилетают то числом из токена, то строкой
// из req.params, и строгое равенство на них уже спотыкалось.
export const isTeamOwner = async (client, teamId, userId) => {
  if (!teamId || !userId) return false;
  const { rowCount } = await (client || pool).query(
    'SELECT 1 FROM team_owners WHERE team_id = $1 AND user_id = $2 LIMIT 1',
    [teamId, userId]
  );
  return rowCount > 0;
};

// Владельцы команды с карточками пользователей — в порядке назначения.
export const getTeamOwners = async (client, teamId) => {
  const { rows } = await (client || pool).query(`
    SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url,
           (u.password_hash IS NULL) AS is_virtual, tow.added_at
      FROM team_owners tow
      JOIN users u ON u.id = tow.user_id
     WHERE tow.team_id = $1
     ORDER BY tow.added_at ASC, tow.id ASC
  `, [teamId]);
  return rows;
};
