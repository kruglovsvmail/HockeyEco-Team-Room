// Картинка состава на матч и расстановки на тренировку — собирает сервер.
//
// Как устроено:
//  1. Из базы собирается «модель» карточки: шапка (соперник, дата, арена, форма),
//     игроки по слотам, пути их фото. Запросы расстановки — те же, что у экрана
//     «Состав» (utils/formationRows.js), поэтому картинка совпадает с экраном.
//  2. От модели считается отпечаток. Готовый JPEG лежит в S3 (roster-formation/…jpg),
//     отпечаток — в его метаданных. Совпал — отдаём из S3, не совпал — собираем заново.
//     Так картинка сама догоняет любые правки: состав, капитана, время матча, фото
//     игрока, цвет команды — без отдельного «перегенерируй» в каждом месте.
//  3. После сохранения расстановки контроллер запускает сборку сразу, в фоне, чтобы
//     к приходу приложения за картинкой она уже была готова или почти готова.
//
// Одновременные сборки одной картинки не плодятся: пока идёт сборка, новые
// запросы ждут её, а правка во время сборки ставит ещё один проход следом.
import crypto from 'crypto';
import sharp from 'sharp';
import {
  GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import pool from '../config/db.js';
import { loadMatchLineRows, loadTrainingLineRows } from '../utils/formationRows.js';
import { getPhotoCropBox } from '../utils/photoCrop.js';
import {
  renderFormationJpeg, pickAccent, PHOTO_PX, TEMPLATE_VERSION, MATCH_WIDTH, TRAINING_WIDTH,
} from './formationImageTemplate.js';

const BUCKET = process.env.S3_BUCKET || 'hockeyeco-uploads';
const HASH_META = 'src-hash';

// ── Фото игроков ────────────────────────────────────────────────────────────
// Фото ужимается под слот один раз и живёт в памяти: имена файлов в S3 уникальны
// (в них время загрузки), поэтому по пути фото не может смениться.
const PHOTO_TIMEOUT_MS = 5000;
const PHOTO_ATTEMPTS = 2;
const PHOTO_CACHE_LIMIT = 500;
const photoCache = new Map(); // путь → data URI; порядок вставки Map = простейший LRU

const readPhotoBytes = async (src) => {
  if (src.startsWith('data:')) return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { name: res.status === 404 ? 'NotFound' : 'HttpError' });
    return Buffer.from(await res.arrayBuffer());
  }
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: src.replace(/^\/+/, '') }),
    { abortSignal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) },
  );
  return Buffer.from(await obj.Body.transformToByteArray());
};

const isNotFound = (err) => err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;

const remember = (src, uri) => {
  photoCache.set(src, uri);
  if (photoCache.size > PHOTO_CACHE_LIMIT) photoCache.delete(photoCache.keys().next().value);
};

// { uri } — фото готово; { uri: null } — фото нет (файла не существует или он
// не картинка): в слоте будут инициалы, и это окончательно; { uri: null, transient }
// — не дотянулись (сеть, S3 не ответил): инициалы только в этой сборке.
const loadPhoto = async (src) => {
  if (photoCache.has(src)) {
    const uri = photoCache.get(src);
    photoCache.delete(src);
    photoCache.set(src, uri);
    return { uri };
  }
  for (let attempt = 1; attempt <= PHOTO_ATTEMPTS; attempt++) {
    let bytes;
    try {
      bytes = await readPhotoBytes(src);
    } catch (err) {
      if (isNotFound(err)) {
        // Файла нет и не появится: имена в S3 с отметкой времени, путь не переиспользуется
        console.warn(`[Formation Image] фото нет в хранилище (${src}) — будут инициалы`);
        remember(src, null);
        return { uri: null };
      }
      if (attempt === PHOTO_ATTEMPTS) {
        console.warn(`[Formation Image] фото не загрузилось (${src}): ${err.message}`);
        return { uri: null, transient: true };
      }
      continue;
    }
    try {
      // Квадрат — по тем же правилам, что у браузера в приложении (utils/photoCrop.js):
      // портрет подрезается сверху меньше, чем снизу, чтобы не срезать макушку.
      // Стороны — уже после поворота по EXIF (ориентации 5–8 меняют их местами).
      const meta = await sharp(bytes).metadata();
      const turned = (meta.orientation || 1) >= 5;
      const width = turned ? meta.height : meta.width;
      const height = turned ? meta.width : meta.height;
      const box = getPhotoCropBox(width, height);
      const jpeg = await sharp(bytes)
        .rotate()
        .extract({ left: box.left, top: box.top, width: box.size, height: box.size })
        .resize(PHOTO_PX, PHOTO_PX)
        .flatten({ background: '#e7e7e7' })
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
        .toBuffer();
      const uri = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      remember(src, uri);
      return { uri };
    } catch (err) {
      console.warn(`[Formation Image] файл фото не читается как картинка (${src}): ${err.message}`);
      remember(src, null);
      return { uri: null };
    }
  }
  return { uri: null, transient: true };
};

// photos — путь → data URI или null; transient — были ли временные сбои
const loadPhotos = async (model) => {
  const paths = new Set();
  model.blocks.forEach(b => b.rows.forEach(r => r.slots.forEach(s => { if (s.player?.photo) paths.add(s.player.photo); })));
  const photos = new Map();
  let transient = false;
  await Promise.all([...paths].map(async (p) => {
    const result = await loadPhoto(p);
    photos.set(p, result.uri);
    if (result.transient) transient = true;
  }));
  return { photos, transient };
};

// ── Дата и время по часам арены ─────────────────────────────────────────────
// «22 сентября, ВТ» и «19:30» — как в шапке экрана события
const formatWhen = (date, timeZone) => {
  if (!date) return { date: '', time: '' };
  const d = new Date(date);
  const fmt = (opts) => new Intl.DateTimeFormat('ru-RU', { timeZone, ...opts }).format(d);
  try {
    return {
      date: `${fmt({ day: 'numeric', month: 'long' })}, ${fmt({ weekday: 'short' }).replace('.', '').toUpperCase()}`,
      time: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
  } catch {
    // Пояс в базе битый — показываем по Москве, как остальное приложение
    return formatWhen(date, 'Europe/Moscow');
  }
};

// ── Модели карточек ─────────────────────────────────────────────────────────
const toPlayer = (row, { letters = false } = {}) => (row ? {
  last: row.last_name || '',
  first: row.first_name || '',
  photo: row.avatar_url || null,
  letter: letters ? (row.is_captain ? 'К' : row.is_assistant ? 'А' : null) : null,
} : null);

const FORWARDS = [['LW', 'ЛН'], ['C', 'ЦН'], ['RW', 'ПН']];
const DEFENSE = [['LD', 'ЛЗ'], ['RD', 'ПЗ']];

// Звено: тройка нападения, под ней пара защиты
const lineRows = (find, opts) => [
  { gap: 12, slots: FORWARDS.map(([pos, label]) => ({ label, player: toPlayer(find(pos), opts) })) },
  { gap: 28, marginTop: 20, slots: DEFENSE.map(([pos, label]) => ({ label, player: toPlayer(find(pos), opts) })) },
];

// Матч команды. null — матча у команды нет или расстановка пустая.
async function buildMatchModel(gameId, teamId) {
  const { rows: [game] } = await pool.query(`
    SELECT g.game_type, g.division_id, g.home_team_id,
           g.game_date::timestamptz AS game_date,
           g.home_jersey_type, g.away_jersey_type,
           COALESCE(a.name, g.location, 'Арена не назначена') AS arena_name,
           COALESCE(a.timezone, g.custom_timezone, 'Europe/Moscow') AS tz,
           -- Соперник в матче лиги — по слепку его заявки, как в календаре
           COALESCE(tt_opp.snap_name, opp.name, ext_opp.name) AS opponent_name,
           COALESCE(my.ui_color, my.color_home_1) AS team_color
      FROM games g
      LEFT JOIN arenas a ON a.id = g.arena_id
      LEFT JOIN teams my ON my.id = $2
      LEFT JOIN teams opp ON opp.id = CASE WHEN g.home_team_id = $2 THEN g.away_team_id ELSE g.home_team_id END
      LEFT JOIN external_opponents ext_opp ON ext_opp.id = g.away_external_id
      LEFT JOIN tournament_teams tt_opp ON tt_opp.division_id = g.division_id
            AND tt_opp.team_id = CASE WHEN g.home_team_id = $2 THEN g.away_team_id ELSE g.home_team_id END
     WHERE g.id = $1 AND $2::int IN (g.home_team_id, g.away_team_id)
  `, [gameId, teamId]);
  if (!game) return null;

  const lines = await loadMatchLineRows(pool, {
    eventId: gameId, teamId, gameType: game.game_type, divisionId: game.division_id,
  });
  if (lines.length === 0) return null;

  const at = (ln, pos) => lines.find(l => Number(l.line_number) === ln && l.position_in_line === pos) || null;
  const when = formatWhen(game.game_date, game.tz);
  const isHome = Number(game.home_team_id) === Number(teamId);
  const jersey = isHome ? (game.home_jersey_type || 'light') : (game.away_jersey_type || 'dark');

  // Звенья — только те, где есть хоть один полевой; вратари — всегда
  const blocks = [1, 2, 3, 4]
    .filter(n => lines.some(l => Number(l.line_number) === n && l.position_in_line !== 'G'))
    .map(n => ({ title: `Звено #${n}`, rows: lineRows(pos => at(n, pos), { letters: true }) }));
  blocks.push({
    title: 'Вратари',
    rows: [{ gap: 12, slots: [[5, 'Осн'], [6, 'Зап'], [7, 'Рез']].map(([ln, label]) => ({ label, player: toPlayer(at(ln, 'G'), { letters: true }) })) }],
  });

  return {
    width: MATCH_WIDTH,
    stretchRows: true,
    accent: pickAccent(game.team_color),
    title: 'Матч',
    subtitle: game.opponent_name ? `против ${game.opponent_name}` : null,
    date: when.date,
    time: when.time,
    arena: game.arena_name,
    jersey: jersey === 'dark' ? 'Тёмные' : 'Светлые',
    blocks,
  };
}

// Цвета формы блоков на тренировке — как в селекторе TrainingLines.jsx
const JERSEY_COLORS = {
  White: { hex: '#ffffff', plural: 'Белые' },
  Black: { hex: '#1a1a1a', plural: 'Чёрные' },
  Cardinal: { hex: '#dc2626', plural: 'Красные' },
  Yellow: { hex: '#eab308', plural: 'Жёлтые' },
  Green: { hex: '#16a34a', plural: 'Зелёные' },
  Blue: { hex: '#2563eb', plural: 'Синие' },
};
const GROUP_POSITIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'];
const GOALIE_LINE_START = 100;

// Таблица события, колонка даты, владелец и откуда его цвет
const TRAINING_SOURCES = {
  team_training: { table: 'team_training', dateCol: 'training_date', owner: 'team_id', scopeKey: 'teamId', color: 'SELECT COALESCE(ui_color, color_home_1) FROM teams WHERE id = e.team_id' },
  club_training: { table: 'club_training', dateCol: 'training_date', owner: 'club_id', scopeKey: 'clubId', color: 'SELECT color_1 FROM clubs WHERE id = e.club_id' },
  community_training: { table: 'community_training', dateCol: 'training_date', owner: 'community_id', scopeKey: 'communityId', color: 'SELECT color_1 FROM communities WHERE id = e.community_id' },
  community_game: { table: 'community_game', dateCol: 'game_date', owner: 'community_id', scopeKey: 'communityId', color: 'SELECT color_1 FROM communities WHERE id = e.community_id' },
};

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

// Тренировка (командная, клубная, сообщества) или солянка. null — события у этого
// владельца нет или расстановка пустая.
async function buildTrainingModel(eventId, scope) {
  const src = TRAINING_SOURCES[scope.eventType] || TRAINING_SOURCES.team_training;
  const ownerId = scope[src.scopeKey];
  if (!ownerId) return null;

  const { rows: [event] } = await pool.query(`
    SELECT e.${src.dateCol}::timestamptz AS event_date,
           COALESCE(a.name, e.location, 'Локация не указана') AS arena_name,
           COALESCE(a.timezone, e.custom_timezone, 'Europe/Moscow') AS tz,
           (${src.color}) AS color
      FROM "${src.table}" e
      LEFT JOIN arenas a ON a.id = e.arena_id
     WHERE e.id = $1 AND e.${src.owner} = $2
  `, [eventId, ownerId]);
  if (!event) return null;

  const lines = await loadTrainingLineRows(pool, eventId, scope);
  if (lines.length === 0) return null;

  const skaters = lines.filter(l => l.position_in_line !== 'G');
  const goalies = lines.filter(l => l.position_in_line === 'G');
  const isGroups = skaters.some(l => String(l.position_in_line).startsWith('S'));
  const lineNums = [...new Set(skaters.map(l => Number(l.line_number)))].sort((a, b) => a - b);

  const blocks = lineNums.map((n) => {
    const players = skaters.filter(l => Number(l.line_number) === n);
    const jersey = JERSEY_COLORS[players.find(p => p.jersey_color)?.jersey_color] || null;
    if (isGroups) {
      // Группы свободные — только заполненные места, по порядку, по три в ряд
      const ordered = [...players].sort((a, b) => GROUP_POSITIONS.indexOf(a.position_in_line) - GROUP_POSITIONS.indexOf(b.position_in_line));
      const slots = ordered.map((p, i) => ({ label: `${i + 1}`, player: toPlayer(p) }));
      return { title: `Группа #${n}`, jersey, rows: chunk(slots, 3).map(row => ({ gap: 12, slots: row })) };
    }
    return { title: `Звено #${n}`, jersey, rows: lineRows(pos => players.find(p => p.position_in_line === pos) || null) };
  });

  if (goalies.length > 0) {
    const labels = isGroups ? ['G1', 'G2', 'G3', 'G4'] : ['Осн', 'Зап', 'Рез'];
    const slots = labels.map((label, i) => ({
      label,
      player: toPlayer(goalies.find(g => Number(g.line_number) === GOALIE_LINE_START + i) || null),
    }));
    blocks.push({
      title: 'Вратари',
      rows: isGroups
        ? chunk(slots, 2).map(row => ({ gap: 32, slots: row }))
        : [{ gap: 16, slots }],
    });
  }

  const when = formatWhen(event.event_date, event.tz);
  return {
    width: TRAINING_WIDTH,
    stretchRows: false,
    accent: pickAccent(event.color),
    title: scope.eventType === 'community_game' ? 'Солянка' : 'Тренировка',
    subtitle: null,
    date: when.date,
    time: when.time,
    arena: event.arena_name,
    jersey: null,
    blocks,
  };
}

// ── Хранение в S3 ───────────────────────────────────────────────────────────
const hashModel = (model) => crypto.createHash('sha1')
  .update(`${TEMPLATE_VERSION}|${JSON.stringify(model)}`)
  .digest('hex');

// Сохранённая картинка — только если она собрана ровно из этих данных
async function readStored(key, hash) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    if (head.Metadata?.[HASH_META] !== hash) return null;
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return Buffer.from(await obj.Body.transformToByteArray());
  } catch (err) {
    if (!isNotFound(err)) console.error(`[Formation Image] не прочитать ${key} из S3:`, err.message);
    return null;
  }
}

// Собрать и положить в S3. Если какое-то фото не дотянулось из-за сбоя, картинку
// отдаём, но в S3 не кладём: иначе случайный сбой сети закрепил бы инициалы вместо
// фото до следующей правки состава. Следующий запрос просто соберёт её ещё раз.
async function produce(target) {
  const model = await target.buildModel();
  if (!model) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: target.key })).catch(() => {});
    return null;
  }
  const hash = hashModel(model);
  const { photos, transient } = await loadPhotos(model);
  const buffer = await renderFormationJpeg(model, photos);

  if (!transient) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: target.key,
        Body: buffer,
        ContentType: 'image/jpeg',
        // Файл перезаписывается по тому же ключу — без кэширования где-либо по пути
        CacheControl: 'no-cache, max-age=0',
        Metadata: { [HASH_META]: hash },
      }));
    } catch (err) {
      console.error(`[Formation Image] не сохранить ${target.key} в S3:`, err.message);
    }
  }
  return { hash, buffer };
}

// ── Очередь сборок ──────────────────────────────────────────────────────────
const jobs = new Map(); // ключ S3 → { promise, again }

// Сборка по ключу идёт одна. Попросили ещё раз во время сборки (новая правка) —
// после текущего прохода будет ещё один, уже по свежим данным; все ждущие
// получают результат последнего прохода.
function runJob(target) {
  const running = jobs.get(target.key);
  if (running) {
    running.again = true;
    return running.promise;
  }
  const job = { again: false };
  job.promise = (async () => {
    try {
      let result;
      do {
        job.again = false;
        result = await produce(target);
      } while (job.again);
      return result;
    } finally {
      jobs.delete(target.key);
    }
  })();
  jobs.set(target.key, job);
  return job.promise;
}

/**
 * Актуальная картинка.
 * knownHash — отпечаток картинки, что уже есть у приложения (из If-None-Match):
 * совпал — отвечаем { notModified }, не трогая ни S3, ни сборку.
 * Возвращает { hash, buffer } | { hash, notModified: true } | null (расстановки нет).
 */
async function resolveImage(target, knownHash) {
  const model = await target.buildModel();
  if (!model) return null;
  const hash = hashModel(model);
  if (knownHash && knownHash === hash) return { hash, notModified: true };

  // Идёт сборка (например, сразу после сохранения) — дожидаемся её
  const running = jobs.get(target.key);
  if (running) {
    const result = await running.promise.catch(() => null);
    if (result?.hash === hash) return result;
  }

  const stored = await readStored(target.key, hash);
  if (stored) return { hash, buffer: stored };

  return runJob(target);
}

const positiveId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Имена файлов — по владельцу расстановки и событию. Тренировки сообществ и
// солянки раньше картинки не имели вовсе: их загрузка отвечала 400.
const matchTarget = (gameId, teamId) => {
  const g = positiveId(gameId);
  const t = positiveId(teamId);
  if (!g || !t) return null;
  return {
    key: `roster-formation/team-${t}-formation_game-${g}.jpg`,
    buildModel: () => buildMatchModel(g, t),
  };
};

const TRAINING_KEYS = {
  team_training: (s) => `team-${s.teamId}-formation_training`,
  club_training: (s) => `club-${s.clubId}-formation_training`,
  community_training: (s) => `community-${s.communityId}-formation_training`,
  community_game: (s) => `community-${s.communityId}-formation_game`,
};

const trainingTarget = (eventId, scope) => {
  const id = positiveId(eventId);
  const eventType = TRAINING_KEYS[scope?.eventType] ? scope.eventType : 'team_training';
  const ownerKey = TRAINING_SOURCES[eventType].scopeKey;
  if (!id || !positiveId(scope?.[ownerKey])) return null;
  const s = { ...scope, eventType };
  return {
    key: `roster-formation/${TRAINING_KEYS[eventType](s)}-${id}.jpg`,
    buildModel: () => buildTrainingModel(id, s),
  };
};

// ── Наружу ──────────────────────────────────────────────────────────────────

// После сохранения расстановки: собрать в фоне, ответ на сохранение не ждёт
const refreshInBackground = (target) => {
  if (!target) return;
  runJob(target).catch(err => console.error(`[Formation Image] сборка ${target.key} не удалась:`, err));
};

export const refreshMatchFormationImage = (gameId, teamId) =>
  refreshInBackground(matchTarget(gameId, teamId));

export const refreshTrainingFormationImage = (eventId, scope) =>
  refreshInBackground(trainingTarget(eventId, scope));

export const getMatchFormationImage = async (gameId, teamId, knownHash) => {
  const target = matchTarget(gameId, teamId);
  return target ? resolveImage(target, knownHash) : null;
};

export const getTrainingFormationImage = async (eventId, scope, knownHash) => {
  const target = trainingTarget(eventId, scope);
  return target ? resolveImage(target, knownHash) : null;
};
