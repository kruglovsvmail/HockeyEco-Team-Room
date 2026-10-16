/**
 * Резервные вратари лиги в списке дивизиона.
 *
 * Вратарь принадлежит лиге (league_reserve_goalies), а дивизионы, где он может
 * играть, лига отмечает галочками (league_reserve_goalie_divisions). В списке:
 *  • только включённые тумблером «Активен» — выключенных нет вовсе;
 *  • docs_ok — действуют ли на сегодня все документы, которые лига сделала
 *    обязательными (leagues.reserve_goalie_req_*). Без них вратарь в списке остаётся —
 *    иначе он не узнал бы, что ему надо донести, — но телефон его не отдаётся, а вместо
 *    него пишется «вратарь не доступен». Медсправка и полис засчитываются свои
 *    (загружены лигой для резерва) или из заявки его команды в сезоне дивизиона;
 *    согласие — одно на «человек + сезон». Срок включительно, без срока — действует.
 * Секретарь LMS видит таких вратарей серыми с причиной (LMS-Backend/utils/reserveGoalies.js).
 *
 * Тот же запрос живёт в сайте ТФХ (TFH-Backend/utils/reserveGoalies.js) — правите здесь, правьте и там.
 */

// Действует ли медсправка или полис на сегодня: своя или из заявки сезона
const docValidSql = (type) => `(
       (lrg.${type}_url IS NOT NULL AND (lrg.${type}_expires_at IS NULL OR lrg.${type}_expires_at >= CURRENT_DATE))
    OR EXISTS (SELECT 1
                 FROM tournament_person_docs tpd
                 JOIN tournament_teams tt_doc ON tt_doc.id = tpd.tournament_team_id
                 JOIN divisions d_doc ON d_doc.id = tt_doc.division_id
                WHERE tpd.user_id = lrg.player_id
                  AND d_doc.season_id = d_rg.season_id
                  AND tpd.${type}_url IS NOT NULL
                  AND (tpd.${type}_expires_at IS NULL OR tpd.${type}_expires_at >= CURRENT_DATE))
)`;

// Есть ли действующее согласие на сезон дивизиона — или лига его не требует
const consentOkSql = `(NOT l_rg.reserve_goalie_req_consent OR EXISTS (
       SELECT 1 FROM user_season_consents usc
        WHERE usc.user_id = lrg.player_id AND usc.season_id = d_rg.season_id
          AND (usc.consent_expires_at IS NULL OR usc.consent_expires_at >= CURRENT_DATE)))`;

/**
 * Подзапрос: вратари дивизиона divExpr для списка команд.
 * Колонки: player_id, jersey_number, note, photo_url (фото от лиги), league_id,
 * docs_ok — все обязательные документы в порядке, consent_ok — в порядке согласие
 * (его, в отличие от справки и полиса, вратарь может подписать сам на сайте ТФХ);
 * consent_required, consent_present, consent_expires_at — для значка согласия в окне
 * резервных на сайте ТФХ, как у игроков в составе команды.
 * Включена ли механика у лиги, здесь не проверяется — это решает вызывающий код.
 */
export const listedReserveGoaliesSql = (divExpr) => `
    SELECT lrg.player_id, lrg.jersey_number, lrg.note, lrg.photo_url, lrg.league_id,
           (    (NOT l_rg.reserve_goalie_req_med_cert OR ${docValidSql('medical')})
            AND (NOT l_rg.reserve_goalie_req_insurance OR ${docValidSql('insurance')})
            AND ${consentOkSql}
           ) AS docs_ok,
           ${consentOkSql} AS consent_ok,
           l_rg.reserve_goalie_req_consent AS consent_required,
           (usc_rg.user_id IS NOT NULL) AS consent_present,
           to_char(usc_rg.consent_expires_at, 'YYYY-MM-DD') AS consent_expires_at
      FROM league_reserve_goalies lrg
      JOIN league_reserve_goalie_divisions lrgd
        ON lrgd.reserve_goalie_id = lrg.id AND lrgd.division_id = ${divExpr}
      JOIN divisions d_rg ON d_rg.id = lrgd.division_id
      JOIN leagues l_rg ON l_rg.id = lrg.league_id
      LEFT JOIN user_season_consents usc_rg
             ON usc_rg.user_id = lrg.player_id AND usc_rg.season_id = d_rg.season_id
     WHERE lrg.is_active`;
