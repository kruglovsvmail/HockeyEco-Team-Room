/**
 * Реестр показателей для конструктора номинаций дивизиона.
 *
 * Копия LMS-Backend/utils/nominationMetrics.js (третья, после TFH-Backend): TR —
 * отдельный деплой на той же общей базе, и вкладке «Номинации» нужны те же
 * выражения и подписи. Добавили показатель в конструкторе LMS — продублируйте
 * здесь, иначе номинация с ним в приложении команд не посчитается.
 *
 * Зачем реестр в коде, а не таблица в БД: ключ метрики приходит из формы и
 * подставляется в SQL как выражение. Белый список — единственное, что отделяет
 * конструктор в админке от инъекции. Ничего, кроме expr отсюда, в запрос
 * попадать не должно.
 *
 * expr — агрегат поверх алиаса s (player_game_statistics). Дроби защищены
 * NULLIF: игрок без бросков не должен ронять запрос делением на ноль.
 *
 * format — как показывать значение на витрине: 'percent' для долей (приходят
 * из Postgres строкой вроде "0.9655"), по умолчанию целое число.
 *
 * requires — от какого флага учёта в дивизионе зависит показатель:
 *   null           — фиксируется в протоколе всегда (голы, передачи, штрафы);
 *   'plus_minus'   — reg_track_plus_minus / playoff_track_plus_minus;
 *   'shots'        — reg_track_shots / playoff_track_shots.
 * Пропущенные шайбы от 'shots' не зависят: голы считаются и при выключенных
 * бросках, отваливаются только сейвы и процент отражённых.
 *
 * Коэффициент надёжности (КН/GAA) сознательно отсутствует — в любительском
 * хоккее он не считается, как и в playerGameStatsCalculator.js.
 */

export const METRIC_DEFS = {
    // ── Полевые ──────────────────────────────────────────────────────────
    goals:            { label: 'Заброшенные шайбы',       appliesTo: 'skater', order: 'desc', requires: null,         expr: 'SUM(s.goals)' },
    // Шайбы без передач партнёров: в протоколе у гола нет ни одной передачи.
    // Только шайбы из игры — реализованный штрафной бросок сюда не входит.
    goals_unassisted: { label: 'Заброшенные шайбы индивидуально', appliesTo: 'skater', order: 'desc', requires: null, expr: 'SUM(s.goals_unassisted)' },
    // Передачи — общий показатель: вратарь тоже отдаёт результативные, и во вратарских
    // номинациях они нужны как критерий при равенстве. Место в списке оставлено прежним:
    // для полевых это ходовой показатель, и уводить его вниз, в блок общих, незачем.
    assists:          { label: 'Передачи',                appliesTo: 'both',   order: 'desc', requires: null,         expr: 'SUM(s.assists)' },
    points:           { label: 'Очки (гол + пас)',        appliesTo: 'skater', order: 'desc', requires: null,         expr: 'SUM(s.points)' },
    goals_pp:         { label: 'Голы в большинстве',      appliesTo: 'skater', order: 'desc', requires: null,         expr: 'SUM(s.goals_pp)' },
    goals_sh:         { label: 'Голы в меньшинстве',      appliesTo: 'skater', order: 'desc', requires: null,         expr: 'SUM(s.goals_sh)' },
    goals_gw:         { label: 'Победные голы',           appliesTo: 'skater', order: 'desc', requires: null,         expr: 'SUM(s.goals_gw)' },
    goals_en:         { label: 'Голы в пустые ворота',    appliesTo: 'skater', order: 'desc', requires: null,         expr: 'SUM(s.goals_en)' },
    // Два разных буллита, и путать их нельзя:
    //   goals_ps — назначенный штрафной бросок по ходу матча, это обычная шайба в счёте;
    //   so_goals — попытка в послематчевой серии, в счёт матча она не идёт.
    goals_ps:         { label: 'Реализованные штрафные броски',      appliesTo: 'skater', order: 'desc', requires: null, expr: 'SUM(s.goals_ps)' },
    ps_attempts:      { label: 'Назначенные штрафные броски',        appliesTo: 'skater', order: 'desc', requires: null, expr: 'SUM(s.ps_attempts)' },
    ps_pct:           { label: '% реализации штрафных бросков',      appliesTo: 'skater', order: 'desc', requires: null, format: 'percent', expr: 'SUM(s.goals_ps)::numeric / NULLIF(SUM(s.ps_attempts), 0)' },
    so_goals:         { label: 'Реализованные послематчевые буллиты', appliesTo: 'skater', order: 'desc', requires: null, expr: 'SUM(s.so_goals)' },
    plus_minus:       { label: 'Показатель полезности',   appliesTo: 'skater', order: 'desc', requires: 'plus_minus', expr: 'SUM(s.plus_minus)' },

    // ── Вратари ──────────────────────────────────────────────────────────
    // Все вратарские показатели считаются только по матчам с выходом на лёд.
    goalie_saves:         { label: 'Отражённые броски',    appliesTo: 'goalie', order: 'desc', requires: 'shots', expr: 'SUM(s.goalie_saves)' },
    goalie_shots_against: { label: 'Броски по воротам',    appliesTo: 'goalie', order: 'desc', requires: 'shots', expr: 'SUM(s.goalie_shots_against)' },
    save_pct:             { label: '% отражённых бросков', appliesTo: 'goalie', order: 'desc', requires: 'shots', format: 'percent', expr: 'SUM(s.goalie_saves)::numeric / NULLIF(SUM(s.goalie_shots_against), 0)' },
    goalie_goals_against: { label: 'Пропущенные шайбы',    appliesTo: 'goalie', order: 'asc',  requires: null,    expr: 'SUM(s.goalie_goals_against)' },
    goalie_shutouts:      { label: 'Сухие матчи',          appliesTo: 'goalie', order: 'desc', requires: null,    expr: 'COUNT(*) FILTER (WHERE s.goalie_shutout)' },
    goalie_wins:          { label: 'Победы вратаря',       appliesTo: 'goalie', order: 'desc', requires: null,    expr: `COUNT(*) FILTER (WHERE s.goalie_decision IN ('win', 'ot_win'))` },
    goalie_so_saves:      { label: 'Отражённые послематчевые буллиты', appliesTo: 'goalie', order: 'desc', requires: null, expr: 'SUM(s.goalie_so_saves)' },
    // ОШБ — штрафные броски, назначенные ПО ХОДУ матча. От послематчевых буллитов
    // отличаются всем: реализованный идёт в счёт матча, пробивается по ходу игры,
    // и вратарю он записывается в пропущенные. Не зависят от учёта бросков в
    // дивизионе: назначенный буллит фиксируется в протоколе всегда.
    goalie_ps_saves:      { label: 'Отражённые штрафные броски (ОШБ)', appliesTo: 'goalie', order: 'desc', requires: null, expr: 'SUM(s.goalie_ps_saves)' },
    goalie_ps_against:    { label: 'Штрафные броски по воротам',       appliesTo: 'goalie', order: 'desc', requires: null, expr: 'SUM(s.goalie_ps_against)' },
    goalie_ps_pct:        { label: '% отражённых штрафных бросков',    appliesTo: 'goalie', order: 'desc', requires: null, format: 'percent', expr: 'SUM(s.goalie_ps_saves)::numeric / NULLIF(SUM(s.goalie_ps_against), 0)' },

    // ── Общие ────────────────────────────────────────────────────────────
    penalty_minutes:  { label: 'Штрафные минуты',         appliesTo: 'both', order: 'desc', requires: null, expr: 'SUM(s.penalty_minutes)' },
    penalties_count:  { label: 'Количество удалений',     appliesTo: 'both', order: 'desc', requires: null, expr: 'SUM(s.penalties_count)' },
    games_played:     { label: 'Сыграно матчей',          appliesTo: 'both', order: 'desc', requires: null, expr: 'COUNT(*)' },
};

export const METRIC_KEYS = Object.keys(METRIC_DEFS);

/**
 * Подходит ли показатель под выбранный тип игрока.
 * player_type='all' — общий зачёт без разделения, там доступен весь список:
 * и вратарские показатели, и полевые, и общие.
 */
export function metricFitsPlayerType(metricKey, playerType) {
    const def = METRIC_DEFS[metricKey];
    if (!def) return false;
    if (playerType === 'all') return true;
    if (def.appliesTo === 'both') return true;
    return def.appliesTo === playerType;
}

/**
 * Ведёт ли дивизион учёт, нужный показателю, на выбранной стадии.
 * Для stage_type='all' флаг должен быть включён в обеих стадиях: иначе половина
 * выборки окажется пустой, а итог — правдоподобным мусором.
 */
export function metricAvailableInDivision(metricKey, division, stageType) {
    const def = METRIC_DEFS[metricKey];
    if (!def) return false;
    if (!def.requires) return true;

    const flag = def.requires === 'plus_minus'
        ? { regular: 'reg_track_plus_minus', playoff: 'playoff_track_plus_minus' }
        : { regular: 'reg_track_shots', playoff: 'playoff_track_shots' };

    if (stageType === 'all') return !!division[flag.regular] && !!division[flag.playoff];
    return !!division[flag[stageType]];
}

/**
 * Человеческое объяснение отказа — уходит в ответ API и показывается в форме,
 * чтобы «почему нельзя выбрать +/-» не приходилось угадывать.
 */
export function metricUnavailableReason(metricKey, division, stageType) {
    const def = METRIC_DEFS[metricKey];
    if (!def || !def.requires) return null;

    const what = def.requires === 'plus_minus' ? 'показатель полезности (+/-)' : 'броски по воротам';
    const stageLabel = { regular: 'регулярном чемпионате', playoff: 'плей-офф', all: 'регулярном чемпионате и плей-офф' }[stageType];

    return `Дивизион не ведёт ${what} в ${stageLabel}. Включите учёт в разделе «Механика матчей» или выберите другой показатель.`;
}
