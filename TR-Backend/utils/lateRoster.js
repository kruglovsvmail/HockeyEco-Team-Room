import { checkPermissionInternal } from './checkPermission.js';
import { RESULTS_EDIT_WINDOW_HOURS } from './permissions.js';

// ─── ЗАЯВКА ПОСЛЕ НАЧАЛА МАТЧА ───────────────────────────────────────────────
// До начала матча заявку и расстановку запирает дедлайн (DEADLINES). Но заявку на
// неофициальный матч — внешний турнир, внешний и платформенный товарищеский — нередко
// забывают отправить, а без неё результаты не внести: игроков для голов и штрафов
// ввод результатов берёт только из заявки. Поэтому после начала такого матча заявку
// можно подать и поменять задним числом:
//   • кто — те, кто вносит результаты (MATCH_FILL_RESULTS). Флаг «соперник может
//     редактировать» (opponent_can_edit) тут не важен: заявка касается только своих
//     игроков, а условие ниже гарантирует, что в протоколе их ещё нет;
//   • когда — пока открыт ввод результатов: RESULTS_EDIT_WINDOW_HOURS после начала,
//     у внешних турниров и у глобального админа без срока (как в assertEditable);
//   • при каком условии — в протоколе нет ни одной записи с игроками этой команды.
//     Иначе смена заявки развела бы статистику с протоколом: гол остался бы за
//     игроком, которого в заявке уже нет. Смотрим свою команду, а не весь матч: гости
//     товарищеского матча не могут удалять события (это право инициатора) и иначе
//     зависели бы от хозяев. Команда, не подававшая заявку, таких записей иметь не
//     может — выбрать её игроков было не из кого, — так что забытую заявку подать
//     можно всегда.
// Официальные матчи сюда не относятся: там заявкой управляет лига.

// Матч, у которого вообще бывает заявка: не отменён и не висит неподтверждённым вызовом
const LATE_ROSTER_STATUSES = ['scheduled', 'finished_no_result', 'finished'];

// Тексты отказов для ответа API. Приложение показывает их в тосте, если запрос всё же
// дошёл до сервера; обычно кнопки уже серые с подсказкой из HintPopover.
export const LATE_ROSTER_ERRORS = {
  status: 'Матч отменён или вызов не подтверждён — заявка на него не подаётся',
  not_participant: 'Команда не играет в этом матче',
  window: `Заявку можно поменять, только пока открыт ввод результатов: ${RESULTS_EDIT_WINDOW_HOURS} ч после начала матча`,
  no_rights: 'После начала матча заявку меняют те, кто вносит результаты',
  team_records: 'В протоколе уже есть записи с игроками вашей команды: голы, передачи, штрафы, +/-, смены вратарей или броски. Чтобы изменить заявку, сначала уберите их — иначе статистика игроков разойдётся с протоколом',
};

/**
 * Есть ли в протоколе матча записи с игроками команды: автор гола, передачи,
 * нарушитель или отбывающий штраф, +/-, вратарь в журнале смен, вратарь в чужом
 * событии (буллит серии по нему), броски по вратарю.
 *
 * События команды без игрока (гол без автора, внесённый, пока заявки не было)
 * заявке не мешают: после её отправки автора просто допишут.
 */
export const hasTeamRecordsInProtocol = async (client, { gameId, teamId, isHome }) => {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM game_events ge
       WHERE ge.game_id = $1 AND ge.team_id = $2
         AND (ge.scorer_id IS NOT NULL OR ge.assist1_id IS NOT NULL OR ge.assist2_id IS NOT NULL
              OR ge.penalty_player_id IS NOT NULL OR ge.penalty_served_by_id IS NOT NULL)
      UNION ALL
      SELECT 1 FROM game_events ge
       WHERE ge.game_id = $1 AND ge.team_id IS DISTINCT FROM $2 AND ge.against_goalie_id IS NOT NULL
      UNION ALL
      SELECT 1 FROM game_plus_minus gpm
        JOIN game_events ge ON ge.id = gpm.event_id
       WHERE ge.game_id = $1 AND gpm.team_id = $2
      UNION ALL
      SELECT 1 FROM game_goalie_log gl
       WHERE gl.game_id = $1
         AND (CASE WHEN $3 THEN gl.home_goalie_id ELSE gl.away_goalie_id END) IS NOT NULL
      UNION ALL
      -- team_id у бросков — команда вратаря, а не бросавших
      SELECT 1 FROM game_shots_by_goalie gsb
       WHERE gsb.game_id = $1 AND gsb.team_id = $2
         AND gsb.goalie_id IS NOT NULL AND gsb.shots_count > 0
    ) AS has_records
  `, [gameId, teamId, isHome]);
  return rows[0].has_records;
};

/**
 * Можно ли прямо сейчас менять заявку команды на уже начавшийся матч.
 *
 * null — правило не применяется: матч официальный или ещё не начался, там действуют
 * обычные дедлайны и права. Иначе { allowed, reason, isInitiator }, где reason —
 * почему нельзя (ключ LATE_ROSTER_ERRORS), а isInitiator — команда создала матч и
 * сама может удалить события (от этого зависит подсказка в приложении).
 */
export const getLateRosterState = async (client, { gameId, teamId, userId }) => {
  const { rows } = await client.query(`
    SELECT g.game_type, g.status, g.game_date, g.home_team_id, g.away_team_id,
           g.initiator_team_id, u.global_role
      FROM games g
      LEFT JOIN users u ON u.id = $2
     WHERE g.id = $1
  `, [gameId, userId]);
  if (rows.length === 0) return null;
  const g = rows[0];

  if (g.game_type === 'official') return null;
  if (!g.game_date || new Date(g.game_date) > new Date()) return null;

  const tid = Number(teamId);
  const isInitiator = Number(g.initiator_team_id) === tid;
  const deny = (reason) => ({ allowed: false, reason, isInitiator });

  if (!LATE_ROSTER_STATUSES.includes(g.status)) return deny('status');

  const isHome = Number(g.home_team_id) === tid;
  if (!isHome && Number(g.away_team_id) !== tid) return deny('not_participant');

  if (g.global_role !== 'admin' && g.game_type !== 'tournament_ext') {
    const windowEnd = new Date(g.game_date).getTime() + RESULTS_EDIT_WINDOW_HOURS * 60 * 60 * 1000;
    if (Date.now() > windowEnd) return deny('window');
  }

  if (!(await checkPermissionInternal(userId, tid, 'MATCH_FILL_RESULTS', client))) return deny('no_rights');

  if (await hasTeamRecordsInProtocol(client, { gameId, teamId: tid, isHome })) return deny('team_records');

  return { allowed: true, reason: null, isInitiator };
};
