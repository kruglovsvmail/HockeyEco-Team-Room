import pool from '../config/db.js';

// Ленивая смена статуса неофициальных матчей после прохода game_date:
//   scheduled → finished_no_result.
// Вызывается из read-контроллеров (календарь, статистика, протокол).
// Не трогает game_type='official' — там свой жизненный цикл (заявки, отчётность).
// Не трогает draft/pending/live/finished/cancelled — только scheduled.
//
// gameId (опционально): если указан — затрагивает только этот матч,
// иначе обходит все подходящие. Для точечных read-эндпоинтов передавайте id.
export const promoteExpiredMatchesToNoResult = async (gameId = null) => {
  if (gameId == null) {
    await pool.query(`
      UPDATE "public"."games"
         SET status = 'finished_no_result'
       WHERE game_type <> 'official'
         AND status = 'scheduled'
         AND game_date < NOW()
    `);
    return;
  }

  await pool.query(`
    UPDATE "public"."games"
       SET status = 'finished_no_result'
     WHERE id = $1
       AND game_type <> 'official'
       AND status = 'scheduled'
       AND game_date < NOW()
  `, [gameId]);
};
