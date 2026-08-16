/**
 * Допуск игроков в дивизион по квалификации — в одном месте.
 *
 * Механика: квалификация человека (МАСТЕР, ЛЮБИТЕЛЬ, СПШ...) принадлежит паре
 * «человек + лига» и хранится в user_qualifications, а не в заявке на турнир.
 * Дивизион со своей стороны держит список допущенных квалификаций
 * (division_qualifications).
 *
 * ПУСТОЙ СПИСОК = БЕЗ ОГРАНИЧЕНИЙ. Отдельного тумблера «включить контроль» нет:
 * пока лига ничего не отметила, дивизион принимает любого. Как только отмечен
 * хотя бы один пункт — проходят только отмеченные категории.
 *
 * Один и тот же набор правил нужен в пяти местах: создание заявки, дозаявка
 * игроков, отправка заявки на проверку, одобрение лигой и трансфер. Поэтому все
 * они ходят сюда, а не считают допуск каждый по-своему.
 *
 * ОСОБЫЙ ПУНКТ «БЕЗ КВАЛИФИКАЦИИ». Строка division_qualifications с
 * qualification_id IS NULL — это отдельный пункт списка в настройках дивизиона,
 * разрешающий заявлять тех, кому квалификация в лиге не присвоена. Поэтому
 * сравнение идёт через IS NOT DISTINCT FROM: NULL там совпадает с NULL.
 *
 * ЗАДНИМ ЧИСЛОМ НЕ ПРИМЕНЯЕТСЯ. Правила проверяются в момент попадания игрока в
 * заявку. Если лига сменила человеку квалификацию, когда он уже играет, из
 * турнира его не выкидывает: заявка квалификацию не хранит, а только показывает
 * текущую. Возникшее расхождение видно в составе дивизиона как пометка.
 */

// Настройки дивизиона + расшифровка допущенных квалификаций для текста ошибки.
// Лига берётся по цепочке division -> season, отдельным полем нигде не дублируется.
const DIVISION_RULES_SQL = `
    SELECT d.id                                AS division_id,
           d.name                              AS division_name,
           s.league_id,
           COALESCE((
               SELECT json_agg(json_build_object('id', lq.id, 'name', lq.name, 'short_name', lq.short_name)
                               ORDER BY lq.sort_order, lq.name)
               FROM division_qualifications dq
               JOIN league_qualifications lq ON lq.id = dq.qualification_id
               WHERE dq.division_id = d.id
           ), '[]'::json)                      AS allowed,
           EXISTS (
               SELECT 1 FROM division_qualifications dq
               WHERE dq.division_id = d.id AND dq.qualification_id IS NULL
           )                                   AS allows_none
    FROM divisions d
    JOIN seasons s ON s.id = d.season_id
    WHERE d.id = $1
`;

// Игроки из переданного списка, чья действующая квалификация в лиге не отмечена
// в настройках дивизиона. Возвращает только нарушителей — пустой результат и есть
// «все проходят».
const VIOLATIONS_SQL = `
    SELECT u.id AS player_id,
           u.first_name,
           u.last_name,
           lq.short_name AS qual_short_name
    FROM unnest($1::int[]) AS p(player_id)
    JOIN users u ON u.id = p.player_id
    LEFT JOIN user_qualifications uq
           ON uq.user_id = u.id AND uq.league_id = $2 AND uq.ended_at IS NULL
    LEFT JOIN league_qualifications lq ON lq.id = uq.qualification_id
    WHERE NOT EXISTS (
        SELECT 1 FROM division_qualifications dq
        WHERE dq.division_id = $3
          AND dq.qualification_id IS NOT DISTINCT FROM uq.qualification_id
    )
    ORDER BY u.last_name, u.first_name
`;

// Действующий состав заявки: отзаявленных (period_end) и отклонённых не проверяем —
// в турнире они не участвуют, и требовать по ним допуск не за что.
const APPLICATION_ROSTER_SQL = `
    SELECT tt.division_id,
           COALESCE(array_agg(tr.player_id) FILTER (
               WHERE tr.player_id IS NOT NULL
                 AND tr.period_end IS NULL
                 AND tr.application_status IS DISTINCT FROM 'declined'
           ), '{}') AS player_ids
    FROM tournament_teams tt
    LEFT JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id
    WHERE tt.id = $1
    GROUP BY tt.division_id
`;

const fullName = (row) => `${row.last_name || ''} ${row.first_name || ''}`.trim();

/**
 * Настройки допуска дивизиона.
 *
 * @param {object} db — pool или клиент открытой транзакции
 * @param {number|string} divisionId
 * @returns {Promise<{
 *   enabled: boolean,       — есть ли ограничения (список не пуст)
 *   leagueId: number|null,  — лига дивизиона (в ней ищется квалификация игрока)
 *   divisionName: string,
 *   allowed: object[],      — допущенные квалификации справочника
 *   allowsNone: boolean     — отмечен ли пункт «Без квалификации»
 * }|null>} null, если дивизиона нет
 */
export const loadDivisionQualificationRules = async (db, divisionId) => {
    if (!divisionId) return null;

    const { rows } = await db.query(DIVISION_RULES_SQL, [divisionId]);
    const row = rows[0];
    if (!row) return null;

    const allowed = row.allowed || [];
    const allowsNone = !!row.allows_none;

    return {
        // Ничего не отмечено — лига ограничений не ставила, пропускаем всех
        enabled: allowed.length > 0 || allowsNone,
        leagueId: row.league_id ?? null,
        divisionName: row.division_name || '',
        allowed,
        allowsNone,
    };
};

/**
 * Кто из переданных игроков не проходит по квалификации.
 *
 * @param {object} db
 * @param {number|string} divisionId
 * @param {number[]} playerIds
 * @returns {Promise<object[]>} нарушители с их текущей квалификацией; пусто, если
 *          контроль выключен или все проходят
 */
export const findQualificationViolations = async (db, divisionId, playerIds) => {
    const ids = [...new Set((playerIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return [];

    const rules = await loadDivisionQualificationRules(db, divisionId);
    if (!rules || !rules.enabled) return [];

    const { rows } = await db.query(VIOLATIONS_SQL, [ids, rules.leagueId, divisionId]);
    return rows;
};

/**
 * Текст ошибки для команды: что за дивизион, кого именно не пропустили и что там
 * вообще разрешено. Без последнего человек не понимает, что делать дальше.
 */
export const formatQualificationError = (violations, rules) => {
    const allowedNames = [
        ...rules.allowed.map(q => q.short_name || q.name),
        ...(rules.allowsNone ? ['без квалификации'] : []),
    ];

    const names = violations
        .map(v => `${fullName(v)} (${v.qual_short_name || 'без квалификации'})`)
        .join(', ');

    return `Не проходят по квалификации в ${rules.divisionName ? `«${rules.divisionName}»` : 'дивизионе'}: ${names}.`
        + ` Допущены: ${allowedNames.join(', ')}.`;
};

/**
 * Проверка перед записью игроков в заявку. Бросает ошибку со status 400, если
 * кто-то не проходит, — вызывающий код ловит её своим общим обработчиком.
 *
 * @param {object} db — pool или клиент открытой транзакции
 * @param {number|string} divisionId
 * @param {number[]} playerIds
 */
export const assertPlayersAllowedInDivision = async (db, divisionId, playerIds) => {
    const ids = [...new Set((playerIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return;

    const rules = await loadDivisionQualificationRules(db, divisionId);
    if (!rules || !rules.enabled) return;

    const { rows: violations } = await db.query(VIOLATIONS_SQL, [ids, rules.leagueId, divisionId]);
    if (violations.length === 0) return;

    const err = new Error(formatQualificationError(violations, rules));
    err.status = 400;
    throw err;
};

/**
 * То же самое, но для всей заявки целиком — нужно на отправке заявки на проверку
 * и на одобрении лигой: состав мог быть собран до того, как лига поменяла список
 * допущенных квалификаций или квалификацию самому игроку.
 *
 * @param {object} db
 * @param {number|string} tournamentTeamId
 */
export const assertApplicationRosterAllowed = async (db, tournamentTeamId) => {
    const { rows } = await db.query(APPLICATION_ROSTER_SQL, [tournamentTeamId]);
    const app = rows[0];
    if (!app) return;

    await assertPlayersAllowedInDivision(db, app.division_id, app.player_ids);
};

export default {
    loadDivisionQualificationRules,
    findQualificationViolations,
    formatQualificationError,
    assertPlayersAllowedInDivision,
    assertApplicationRosterAllowed,
};
