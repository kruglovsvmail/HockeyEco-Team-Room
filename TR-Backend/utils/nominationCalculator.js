import pool from '../config/db.js';
import { METRIC_DEFS } from './nominationMetrics.js';

/**
 * Расчёт победителей номинации поверх player_game_statistics.
 *
 * Копия TFH-Backend/utils/nominationCalculator.js (а та — LMS-Backend): TR —
 * отдельный деплой на той же общей базе, и разделу «Турниры / Лиги» нужен тот же
 * расчёт, что у сайта лиги. Взята копия ТФХ, а не LMS: в ней фото игрока берётся
 * из слепка заявки, как во всех турнирных разделах TR. Правки — во все три копии.
 *
 * Считается на лету при каждом запросе: правило хранится, результат — нет.
 * Поправили протокол матча — поменялся и лидер номинации.
 *
 * Джойна к games здесь нет намеренно: playerGameStatsCalculator кладёт в
 * player_game_statistics только зачётные матчи, а незачётные оттуда удаляет,
 * так что фильтровать по статусу второй раз нечего.
 *
 * В SQL подставляются только выражения из METRIC_DEFS и направления,
 * проверенные по белому списку. Ключи метрик приходят из БД, но туда они
 * попадают лишь через валидацию nominationController.
 */

const dir = (order) => (order === 'asc' ? 'ASC' : 'DESC');

export async function calculateNomination(nomination) {
    const {
        division_id, scope, player_type, position_filter,
        stage_type, metric, sort_order, tiebreakers, min_games,
    } = nomination;

    const mainDef = METRIC_DEFS[metric];
    if (!mainDef) return [];

    const params = [division_id];
    const where = ['s.division_id = $1', "s.game_type = 'official'"];

    if (stage_type !== 'all') {
        params.push(stage_type);
        where.push(`s.stage_type = $${params.length}`);
    }

    // Вратарю матч засчитывается только за реальный выход на лёд: иначе игрок,
    // просидевший сезон в запасе, наберёт порог по числу матчей, не сыграв ни минуты.
    if (player_type === 'goalie') {
        where.push('s.is_goalie = true', 's.goalie_seconds > 0');
    } else if (player_type === 'skater') {
        where.push('s.is_goalie = false');
        if (position_filter !== 'all') {
            params.push(position_filter);
            where.push(`r.position = $${params.length}`);
        }
    }

    // Второстепенные критерии: каждый со своим направлением — «меньше штрафа»
    // и «больше штрафа» это разные номинации.
    const validTiebreakers = (Array.isArray(tiebreakers) ? tiebreakers : [])
        .map(t => (typeof t === 'string' ? { metric: t, order: METRIC_DEFS[t]?.order } : t))
        .filter(t => t && METRIC_DEFS[t.metric]);

    const tbSelect = validTiebreakers
        .map((t, i) => `${METRIC_DEFS[t.metric].expr} AS tb_${i}`)
        .join(',\n               ');

    // NULLS LAST везде: у дробных показателей (процент отражённых) игрок без
    // бросков даёт NULL, и он не должен всплывать ни наверх, ни при обратной сортировке.
    const orderParts = [
        `value ${dir(sort_order)} NULLS LAST`,
        ...validTiebreakers.map((t, i) => `tb_${i} ${dir(t.order)} NULLS LAST`),
        // Последний рубеж — алфавит. Без него Postgres вернёт равных игроков в
        // произвольном порядке, и список будет прыгать при каждом обновлении.
        'last_name ASC',
        'first_name ASC',
    ].join(', ');

    params.push(min_games || 0);
    const minGamesParam = `$${params.length}`;

    const isTeamScope = scope === 'team';

    // SUM() и COUNT() возвращают bigint, а node-postgres отдаёт его строкой.
    // Приводим тип здесь, чтобы наружу уходило число: иначе строковое значение
    // рано или поздно попадёт в арифметику и «8» + «5» станет «85».
    // Долю округляем — двадцать знаков после запятой на витрине не нужны.
    const valueCast = mainDef.format === 'percent'
        ? 'ROUND(a.value, 4)::float8'
        : 'a.value::int';

    const aggSelect = `
            s.player_id,
            ${isTeamScope
              ? 's.team_id'
              : '(array_agg(s.team_id ORDER BY s.game_date DESC NULLS LAST))[1] AS team_id'},
            u.first_name,
            u.last_name,
            -- Фото в лиговых разделах: слепок из заявки, пока игрок допущен, иначе живое
            -- фото в команде. Личный аватар тут не показываем.
            COALESCE(r.photo_snapshot_url, tm.photo_url) AS avatar_url,
            COUNT(*)::int AS games_played,
            ${mainDef.expr} AS value${tbSelect ? ',\n               ' + tbSelect : ''}`;

    const groupBy = `s.player_id, u.first_name, u.last_name, COALESCE(r.photo_snapshot_url, tm.photo_url)${isTeamScope ? ', s.team_id' : ''}`;

    // Заявку игрока могут закрыть и переоформить — тогда прямой join к
    // tournament_rosters размножил бы ему всю статистику. Берём ровно одну
    // строку на пару «команда + игрок», предпочитая действующую заявку.
    const sql = `
        WITH roster AS (
            SELECT DISTINCT ON (tt.team_id, tr.player_id)
                   tt.team_id, tr.player_id, tr.position, tr.photo_snapshot_url
            FROM tournament_rosters tr
            JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
            WHERE tt.division_id = $1 AND tr.application_status = 'approved'
            ORDER BY tt.team_id, tr.player_id, tr.period_end NULLS FIRST, tr.id DESC
        ),
        agg AS (
            SELECT ${aggSelect}
            FROM player_game_statistics s
            JOIN roster r ON r.player_id = s.player_id AND r.team_id = s.team_id
            JOIN users u ON u.id = s.player_id
            LEFT JOIN team_members tm ON tm.user_id = s.player_id AND tm.team_id = s.team_id AND tm.left_at IS NULL
            WHERE ${where.join(' AND ')}
            GROUP BY ${groupBy}
            HAVING COUNT(*) >= ${minGamesParam}
        )${isTeamScope ? `,
        ranked AS (
            SELECT agg.*, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY ${orderParts}) AS rn
            FROM agg
        )` : ''}
        SELECT a.player_id, a.first_name, a.last_name, a.avatar_url,
               a.team_id, COALESCE(tt.snap_name, t.name) AS team_name, COALESCE(tt.snap_logo_url, t.logo_url) AS team_logo_url,
               a.games_played, ${valueCast} AS value
        FROM ${isTeamScope ? '(SELECT * FROM ranked WHERE rn = 1) a' : 'agg a'}
        LEFT JOIN teams t ON t.id = a.team_id
        -- Название и лого — по слепку заявки на дивизион ($1), снятому LMS при допуске
        LEFT JOIN tournament_teams tt ON tt.division_id = $1 AND tt.team_id = a.team_id
        ORDER BY ${orderParts}
    `;

    const { rows } = await pool.query(sql, params);
    return rows;
}
