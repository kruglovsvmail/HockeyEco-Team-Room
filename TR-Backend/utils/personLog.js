/**
 * Журнал изменений по человеку в заявке (tournament_person_log) — запись со стороны команды.
 *
 * Таблица общая с LMS: одна запись — одно действие над человеком в конкретной заявке,
 * ключ — пара «заявка + человек» (как у документов и допуска представителя). Отсюда
 * уходят события с source = 'team_room': кто из команды что поменял. Читает журнал
 * только лига в LMS — колонка «Обновлено» и окно истории в составе дивизиона; команде
 * он не показывается. Полный список кодов действий и состав details описан в
 * LMS-Backend/utils/personLog.js — здесь тот же формат.
 *
 * Пишется той же транзакцией, что и само изменение (db — pool или client), поэтому
 * откатывается вместе с ним.
 */

const INSERT_SQL = `
    INSERT INTO tournament_person_log (tournament_team_id, user_id, action, details, actor_id, source)
    SELECT x.tournament_team_id, x.user_id, x.action, x.details, x.actor_id, x.source
      FROM jsonb_to_recordset($1::jsonb)
        AS x(tournament_team_id int, user_id int, action text, details jsonb, actor_id int, source text)
`;

export const logPersonEvents = async (db, events) => {
  const rows = (events || [])
    .filter(e => e && e.appId && e.userId && e.action)
    .map(e => ({
      tournament_team_id: Number(e.appId),
      user_id: Number(e.userId),
      action: e.action,
      details: e.details ?? null,
      actor_id: e.actorId ?? null,
      source: e.source || 'team_room',
    }));
  if (rows.length === 0) return;
  await db.query(INSERT_SQL, [JSON.stringify(rows)]);
};

export const logPersonEvent = (db, event) => logPersonEvents(db, [event]);

// Поля карточки игрока, изменения которых попадают в событие card
export const CARD_FIELDS = ['position', 'jersey_number', 'is_captain', 'is_assistant'];

/**
 * Разница карточки «было → стало» по полям CARD_FIELDS. null — ничего не изменилось.
 * Поле, которого в after нет (undefined), не присылали — оно не менялось. Значения
 * приводятся к одному виду, иначе '17' и 17 или '' и null считались бы разными.
 */
export const cardDiff = (before, after) => {
  const norm = (field, value) => {
    if (value === undefined || value === null || value === '') return null;
    if (field === 'jersey_number') return Number(value);
    if (field === 'is_captain' || field === 'is_assistant') return !!value;
    return value;
  };
  const diff = {};
  for (const field of CARD_FIELDS) {
    if (after?.[field] === undefined) continue;
    const prev = norm(field, before?.[field]);
    const next = norm(field, after[field]);
    if (prev !== next) diff[field] = [prev, next];
  }
  return Object.keys(diff).length > 0 ? diff : null;
};
