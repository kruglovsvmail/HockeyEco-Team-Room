/**
 * Номер игрока в заявке на дивизион — проверка со стороны команды.
 *
 * Правило одно для всех путей: у действующих игроков заявки (не отзаявленных) номера не
 * повторяются — какой бы у них ни был допуск. Сама база ловит повтор только среди
 * допущенных (idx_tournament_rosters_uniq_number: period_end IS NULL и application_status =
 * 'approved'), поэтому игрок, которого команда вносила «на проверку», вставал в заявку с
 * чужим номером без единой ошибки, а падал уже допуск в лиге. Теперь номер проверяется
 * здесь, в момент внесения. Правку номера у игрока заявки проверяет updateRosterEntry.
 * Зеркало для LMS — LMS-Backend/utils/jerseyNumbers.js.
 */

const personName = (row) => `${row.last_name || ''} ${row.first_name || ''}`.trim();

const jerseyError = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

/**
 * entries — кого вносят или возвращают в заявку: [{ player_id, jersey_number }].
 * Номер не должен повторяться между ними и не должен быть у другого действующего игрока
 * заявки. Свои нынешние строки этих игроков не в счёт — они как раз и меняются.
 * db — pool или клиент транзакции.
 */
export const assertJerseyNumbersFree = async (db, appId, entries) => {
  // Один человек, пришедший дважды, — это не «несколько игроков»: берём последнюю запись
  const byPlayer = new Map(entries.map(e => [Number(e.player_id), e.jersey_number]));
  const byNumber = new Map();
  for (const [playerId, raw] of byPlayer) {
    if (raw === null || raw === undefined || raw === '') continue;
    const number = Number(raw);
    if (byNumber.has(number)) throw jerseyError(`Номер ${number} назначен нескольким игрокам`);
    byNumber.set(number, playerId);
  }
  if (byNumber.size === 0) return;

  const { rows } = await db.query(`
    SELECT tr.jersey_number, u.last_name, u.first_name
      FROM tournament_rosters tr
      JOIN users u ON u.id = tr.player_id
     WHERE tr.tournament_team_id = $1
       AND tr.period_end IS NULL
       AND tr.jersey_number = ANY($2::int[])
       AND NOT (tr.player_id = ANY($3::int[]))
     ORDER BY tr.jersey_number
     LIMIT 1
  `, [appId, [...byNumber.keys()], [...byPlayer.keys()]]);
  if (rows.length > 0) {
    throw jerseyError(`Номер ${rows[0].jersey_number} в заявке уже у игрока ${personName(rows[0])}. Смените номер одному из них.`);
  }
};
