import React from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import clsx from 'clsx';
import { getImageUrl, getStreamPlatformLabel, normalizeExternalUrl } from '../../utils/helpers';
import { HintPopover } from '../../ui/HintPopover';
import { Icon } from '../../ui/Icon';

dayjs.extend(utc);
dayjs.extend(timezone);

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

// Кто выиграл — чтобы приглушить проигравшего. Серию буллитов LMS записывает в счёт
// одной шайбой победителю, так что хватает сравнить счёт; ничья — не выделяем никого.
// Техническое поражение обеим командам («-/-») — тоже никого.
const getWinnerSide = (game, isTech) => {
  if (game.status !== 'finished') return null;
  if (isTech) {
    if (game.is_technical === '-/+') return 'away';
    if (game.is_technical === '-/-') return null;
    return 'home';
  }
  const home = Number(game.home_score);
  const away = Number(game.away_score);
  if (home > away) return 'home';
  if (away > home) return 'away';
  return null;
};

// Ссылки на трансляцию / запись. Поля в базе называются по YouTube и VK, но лига
// вписывает в них что угодно — площадку определяем по самой ссылке. Одинаковые
// ссылки в двух полях — это одна ссылка.
const getStreamLinks = (game) => {
  const seen = new Set();
  return [game.video_yt_url, game.video_vk_url]
    .map(normalizeExternalUrl)
    .filter(url => url && !seen.has(url) && seen.add(url))
    .map(url => ({ url, platform: getStreamPlatformLabel(url) }));
};

// Площадку в подписи не пишем: кнопка говорит только, что это. До конца матча —
// «Трансляция», после — «Запись игры» (лига обычно оставляет ту же ссылку)
const getStreamKind = (isFinished) => (isFinished ? 'Запись игры' : 'Трансляция');

// Кнопки нижней строки: запись слева, протокол справа — одним видом и цветом.
// Строка есть у каждой карточки, чтобы все были одной высоты; чего нет — то бледно-серое
// и не нажимается: так видно, что записи или протокола у матча нет
const ACTION_LINK = 'flex items-center gap-1.5 h-full min-w-0 text-[12px] font-bold text-brand leading-none outline-none active:opacity-60 transition-opacity';
const ACTION_MISSING = 'flex items-center gap-1.5 h-full min-w-0 text-[12px] font-bold text-content-subtle opacity-50 leading-none';

function StreamLink({ link, label }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 h-11 px-3 rounded-xl bg-surface-level2 text-left outline-none active:scale-[0.98] transition-transform"
    >
      <Icon name="live_stream" className="w-5 h-5 text-brand shrink-0" />
      <span className="flex-1 min-w-0 truncate text-[14px] font-bold text-content-main">{label}</span>
      <Icon name="chevron_right" className="w-4 h-4 text-content-muted shrink-0" />
    </a>
  );
}

// Одна ссылка открывается сразу; две — подсказкой с выбором. В подсказке площадку
// назвать нужно, иначе две кнопки не различить; не узнали площадку — «Ссылка 1/2»
function StreamAction({ links, isFinished }) {
  const kind = getStreamKind(isFinished);
  const chip = (
    <>
      <Icon name="live_stream" className="w-4 h-4 shrink-0" />
      {kind}
    </>
  );

  if (links.length === 1) {
    return (
      <a
        href={links[0].url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={ACTION_LINK}
      >
        {chip}
      </a>
    );
  }

  return (
    <HintPopover
      className="h-full"
      customContent={
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-content-muted text-center">
            {kind}
          </span>
          {links.map((link, idx) => (
            <StreamLink
              key={link.url}
              link={link}
              label={link.platform === 'Трансляция' ? `Ссылка ${idx + 1}` : link.platform}
            />
          ))}
        </div>
      }
    >
      <span className={ACTION_LINK}>{chip}</span>
    </HintPopover>
  );
}

function TeamColumn({ name, logo, fallbackName, isLoser }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center text-center gap-1.5">
      <div className="w-10 h-10 flex items-center justify-center shrink-0">
        {logo && <img src={getImageUrl(logo)} alt="" className="w-full h-full object-contain" />}
      </div>
      {/* Полное название, до двух строк. Место под две строки держим всегда —
          иначе карточки с короткими и длинными названиями были бы разной высоты.
          Без flex: он перебивает line-clamp, и обрезка по строкам не работает */}
      <span className={clsx(
        "w-full px-1 text-[12px] font-bold uppercase tracking-tight leading-tight break-words line-clamp-2 min-h-[2.5em]",
        isLoser ? "text-content-muted" : "text-content-main"
      )}>
        {name || fallbackName}
      </span>
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────
// Сверху полоса сведений (дата, время, арена), ниже «хозяева — счёт — гости», внизу —
// запись игры и протокол (бледные, если их нет). У несыгранного матча на месте счёта —
// время начала в капсуле с часами.
export function TournamentCardGame({ game }) {
  const isFinished = game.status === 'finished';
  const isLive = game.status === 'live';
  const isPlayedOrLive = isFinished || isLive;

  // Дата и время — черновик расписания LMS, «часы арены» как их вписал организатор:
  // в «Турнирах» видны и матчи, у которых известна только дата или только время.
  // Матчи без черновика (старые записи) — по точному началу в поясе арены, а не
  // телефона: иначе на выезде в другой город время бы уехало.
  const exactStart = game.game_date ? dayjs.utc(game.game_date).tz(game.arena_timezone || 'Europe/Moscow') : null;
  const dateObj = game.draft_date ? dayjs(game.draft_date) : exactStart;
  const dateLabel = dateObj ? `${WEEKDAYS[dateObj.day()]}, ${dateObj.format('DD.MM')}` : null;
  const timeLabel = game.draft_time || (exactStart ? exactStart.format('HH:mm') : null);

  const isTech = game.end_type === 'tech' || !!game.is_technical;
  const isOvertime = game.end_type === 'ot';
  const isShootout = game.end_type === 'so';

  let homeScoreDisplay = '-';
  let awayScoreDisplay = '-';
  if (isPlayedOrLive) {
    if (isTech) {
      if (game.is_technical === '+/-') { homeScoreDisplay = '+'; awayScoreDisplay = '-'; }
      else if (game.is_technical === '-/+') { homeScoreDisplay = '-'; awayScoreDisplay = '+'; }
      else if (game.is_technical === '-/-') { homeScoreDisplay = '-'; awayScoreDisplay = '-'; }
      else { homeScoreDisplay = '+'; awayScoreDisplay = '-'; }
    } else {
      homeScoreDisplay = game.home_score;
      awayScoreDisplay = game.away_score;
    }
  }

  const winnerSide = getWinnerSide(game, isTech);
  const homeIsLoser = winnerSide === 'away';
  const awayIsLoser = winnerSide === 'home';

  const scoreColorClass = (isLive || (isFinished && isTech)) ? 'text-red-500' : 'text-content-main';

  const streamLinks = getStreamLinks(game);
  // Матч прошёл без внесённого результата — это тоже уже запись, а не трансляция
  const isRecordingTime = isFinished || game.status === 'finished_no_result';

  // Чего лига ещё не назначила — длинный прочерк, без «уточняется»: так строка
  // одинаковой длины и не спорит с тем, что известно.
  // В полосе сверху время нужно только сыгранным: у будущего матча оно в центре
  const stripDateTime = isPlayedOrLive
    ? `${dateLabel || '—'} · ${timeLabel || '—'}`
    : (dateLabel || '—');

  return (
    <div className={clsx(
      'w-full bg-surface-level1 rounded-2xl border flex flex-col shadow-md relative overflow-hidden select-none',
      isLive ? 'border-red-500/30 shadow-red-500/5' : 'border-surface-border'
    )}>

      {/* ── ПОЛОСА СВЕДЕНИЙ: дата, время, арена. Одна строка: длинная арена
          обрезается, а целиком видна по нажатию ── */}
      <div className="flex items-center gap-3 px-4 h-9 border-b border-surface-border text-[12px] font-semibold text-content-muted">
        <span className="shrink-0 tabular-nums">{stripDateTime}</span>

        <div className="flex-1 min-w-0 flex justify-end">
          {(game.arena_city || game.arena_address) ? (
            <HintPopover
              className="min-w-0 max-w-full"
              customContent={
                <div className="flex flex-col gap-1 text-center">
                  <span className="text-[13px] font-bold text-content-main leading-snug">{game.arena_name}</span>
                  {game.arena_city && (
                    <span className="text-[12px] font-semibold text-content-muted leading-snug">{game.arena_city}</span>
                  )}
                  {game.arena_address && (
                    <span className="text-[11px] font-medium text-content-muted leading-snug">{game.arena_address}</span>
                  )}
                </div>
              }
            >
              <span className="block truncate underline decoration-dotted decoration-content-subtle underline-offset-4">{game.arena_name}</span>
            </HintPopover>
          ) : (game.arena_name && game.location_url) ? (
            <a
              href={game.location_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 max-w-full"
            >
              <span className="block truncate underline decoration-dotted decoration-content-subtle underline-offset-4">{game.arena_name}</span>
            </a>
          ) : (
            <span className="truncate">{game.arena_name || '—'}</span>
          )}
        </div>
      </div>

      {/* ── ХОЗЯЕВА — СЧЁТ / ВРЕМЯ — ГОСТИ ── */}
      <div className="flex items-center px-2 pt-3 pb-2.5">
        <TeamColumn
          name={game.home_team_name}
          logo={game.home_team_logo}
          fallbackName="Хозяева"
          isLoser={homeIsLoser}
        />

        <div className="flex flex-col items-center justify-center text-center shrink-0 px-1 min-w-[92px] self-start pt-1.5">
          {isPlayedOrLive ? (
            <div className="flex items-center font-black text-[30px] tracking-tighter justify-center leading-none tabular-nums">
              {/* Счёт обеих команд одного цвета; проигравшего выдаёт только название */}
              <span className={scoreColorClass}>{homeScoreDisplay}</span>
              <span className="text-content-subtle text-[20px] font-bold px-1.5 pb-1">:</span>
              <span className={scoreColorClass}>{awayScoreDisplay}</span>
            </div>
          ) : (
            // Время начала — в капсуле с часами, а не крупными цифрами: «21:30»
            // голыми цифрами читалось как счёт. Не назначено — прочерк в той же капсуле
            <span className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface-level2 text-[15px] font-bold text-content-main tabular-nums leading-none">
              <Icon name="clock" className="w-4 h-4 text-content-muted shrink-0" />
              {timeLabel || '—'}
            </span>
          )}

          {isFinished && (isOvertime || isShootout || isTech) && (
            <span className={clsx(
              'text-[12px] font-bold uppercase tracking-widest mt-2 px-1.5 py-0.5 rounded leading-none',
              isTech ? 'text-red-500 bg-red-500/5' : 'text-brand bg-brand-opacity'
            )}>
              {isOvertime && 'от'}
              {isShootout && 'б'}
              {isTech && 'тех'}
            </span>
          )}

          {isLive && (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full animate-pulse mt-2">
              <span className="w-1 h-1 rounded-full bg-red-500" />
              <span className="text-[10px] font-black text-red-500 uppercase tracking-tight">LIVE</span>
            </div>
          )}
        </div>

        <TeamColumn
          name={game.away_team_name}
          logo={game.away_team_logo}
          fallbackName="Гости"
          isLoser={awayIsLoser}
        />
      </div>

      {/* ── ЗАПИСЬ / ТРАНСЛЯЦИЯ слева и ПРОТОКОЛ справа — у каждой карточки ── */}
      <div className="flex items-center justify-between gap-3 h-10 px-4 border-t border-surface-border">
        {streamLinks.length > 0 ? (
          <StreamAction links={streamLinks} isFinished={isRecordingTime} />
        ) : (
          // Как и у протокола: серая кнопка по нажатию объясняет, почему она серая
          <HintPopover
            className="h-full"
            customContent={
              <p className="text-[12px] font-semibold text-content-main leading-snug text-center">
                {isRecordingTime ? 'Нет записи матча или нет ссылки' : 'Не велась трансляция или нет ссылки'}
              </p>
            }
          >
            <span className={ACTION_MISSING}>
              <Icon name="live_stream" className="w-4 h-4 shrink-0" />
              {getStreamKind(isRecordingTime)}
            </span>
          </HintPopover>
        )}

        {game.protocol_image_url ? (
          <a
            href={game.protocol_image_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={ACTION_LINK}
          >
            <Icon name="file" className="w-4 h-4 shrink-0" />
            Протокол
          </a>
        ) : (
          // Серая кнопка без пояснения выглядит сломанной — по нажатию говорим, в чём дело
          <HintPopover
            className="h-full"
            customContent={
              <p className="text-[12px] font-semibold text-content-main leading-snug text-center">
                Протокол не опубликован
              </p>
            }
          >
            <span className={ACTION_MISSING}>
              <Icon name="file" className="w-4 h-4 shrink-0" />
              Протокол
            </span>
          </HintPopover>
        )}
      </div>
    </div>
  );
}
