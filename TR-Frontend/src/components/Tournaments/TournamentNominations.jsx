// TournamentNominations.jsx
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import clsx from 'clsx';
import { getImageUrl, pluralRu } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';

// Подписи правила под названием номинации — те же, что на сайте ТФХ
const STAGE_LABEL = { regular: 'регулярка', playoff: 'плей-офф', all: 'регулярка + плей-офф' };

const typeLabel = (n) => {
  if (n.playerType === 'goalie') return 'вратари';
  if (n.playerType === 'all') return 'все игроки';
  if (n.positionFilter === 'forward') return 'нападающие';
  if (n.positionFilter === 'defense') return 'защитники';
  return 'полевые';
};

const formatValue = (value, format) => {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return `${(Number(value) * 100).toFixed(1)}%`;
  return Number(value);
};

// Подпись под показателем: число матчей, а когда места нет (не играл, не набрал
// минимум) — пояснение от сервера
const gamesLabel = (player) => (
  player.note || `${player.gamesPlayed} ${pluralRu(player.gamesPlayed, 'игра', 'игры', 'игр')}`
);

// Сколько точек под каруселью ещё читается; дальше — счётчик «3 / 14»
const MAX_DOTS = 10;

// Пауза после последнего события прокрутки, после которой лента считается остановленной
const SCROLL_IDLE_MS = 140;

const TeamBadge = ({ logo, className }) => (
  logo ? (
    <img
      src={getImageUrl(logo)}
      alt=""
      className={clsx("absolute -bottom-1 -left-1 rounded-full bg-surface-base object-contain", className)}
    />
  ) : null
);

// Первое место — крупно. Фамилия занимает всю первую строку, ниже слева имя и матчи,
// а справа от них показатель высотой в эти две строки: так длинная фамилия и длинный
// процент вратаря не делят одну строку и не обрезают друг друга.
function LeaderRow({ player, format, onClick }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "h-24 flex items-center gap-3 px-3 border-b border-surface-border last:border-0",
        player.isMe && "bg-brand-opacity",
        onClick && "cursor-pointer active:opacity-70 transition-opacity"
      )}
    >
      <div className="w-6 shrink-0 text-center font-mono text-[18px] font-black text-brand">
        {player.rank ?? '—'}
      </div>

      <div className="relative shrink-0 w-16 h-16">
        <Avatar
          photoUrl={player.photoUrl}
          firstName={player.firstName}
          lastName={player.lastName}
          className="w-16 h-16 rounded-xl bg-surface-level2"
        />
        <TeamBadge logo={player.teamLogo} className="w-6 h-6" />
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 leading-tight">
        <span className="col-span-2 row-start-1 text-[16px] font-bold text-content-main truncate">
          {player.lastName}
        </span>
        <span className="col-start-1 row-start-2 text-[14px] font-normal text-content-muted truncate">
          {player.firstName}
        </span>
        <span className="col-start-1 row-start-3 text-[10px] font-semibold uppercase tracking-wide text-content-muted truncate">
          {gamesLabel(player)}
        </span>
        <span className="col-start-2 row-start-2 row-span-2 self-end text-[32px] leading-none font-black tabular-nums text-brand">
          {formatValue(player.value, format)}
        </span>
      </div>
    </div>
  );
}

function NominationRow({ player, format, onClick }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "h-14 flex items-center gap-3 px-3 border-b border-surface-border last:border-0",
        player.isMe && "bg-brand-opacity",
        onClick && "cursor-pointer active:opacity-70 transition-opacity"
      )}
    >
      <div className="w-6 shrink-0 text-center font-mono text-[12px] text-content-muted">
        {player.rank ?? '—'}
      </div>

      <div className="relative shrink-0 w-9 h-9">
        <Avatar
          photoUrl={player.photoUrl}
          firstName={player.firstName}
          lastName={player.lastName}
          className="w-9 h-9 rounded-lg bg-surface-level2"
        />
        <TeamBadge logo={player.teamLogo} className="w-4 h-4" />
      </div>

      <div className="flex flex-col min-w-0 flex-1 leading-tight gap-0.5">
        <span className={clsx("text-[14px] text-content-main truncate", player.isMe ? "font-bold" : "font-normal")}>
          {player.lastName}
        </span>
        <span className="text-[12px] text-content-muted font-normal truncate">
          {player.firstName}
        </span>
      </div>

      <div className="shrink-0 flex flex-col items-end leading-tight gap-0.5">
        <span className="text-[16px] font-black tabular-nums text-content-main">
          {formatValue(player.value, format)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
          {gamesLabel(player)}
        </span>
      </div>
    </div>
  );
}

function NominationCard({ nomination, onPlayerClick }) {
  const subtitle = [
    nomination.metricLabel,
    typeLabel(nomination),
    STAGE_LABEL[nomination.stageType],
    nomination.scope === 'team' ? 'лучший в команде' : null,
    // «от 1 матча», «от 21 матча», но «от 3 матчей»
    nomination.minGames > 0
      ? `от ${nomination.minGames} ${pluralRu(nomination.minGames, 'матча', 'матчей', 'матчей')}`
      : null,
  ].filter(Boolean).join(' · ');

  const players = nomination.players || [];
  const me = nomination.me;
  // Разрыв «···» нужен, только если между топом и своей строкой кто-то есть
  const lastTopRank = players.length ? players[players.length - 1].rank : 0;
  const hasGapBeforeMe = !!me && (me.rank == null || me.rank > lastTopRank + 1);

  return (
    <div className="bg-surface-level1 rounded-2xl shadow-md overflow-hidden flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-surface-border">
        {/* Под название тоже всегда две строки (2 × leading-tight = 2.5em) — по той же
            причине, что и под пояснение ниже */}
        <div className="min-h-[2.5em] text-[14px] font-black uppercase tracking-widest text-content-main leading-tight line-clamp-2">
          {nomination.name}
        </div>
        {/* Под пояснение всегда две строки (2 × leading-snug = 2.75em), даже если оно
            короткое: иначе списки в соседних карточках начинаются на разной высоте */}
        <div className="mt-1 min-h-[2.75em] text-[12px] font-normal text-content-muted leading-snug line-clamp-2">
          {subtitle}
        </div>
      </div>

      <div className="flex flex-col">
        {players.length === 0 ? (
          <div className="h-28 flex items-center justify-center px-4 text-center text-[12px] font-bold uppercase tracking-widest text-content-subtle border-b border-surface-border last:border-0">
            Пока никто не набрал результата
          </div>
        ) : (
          players.map((p, idx) => {
            const Row = idx === 0 ? LeaderRow : NominationRow;
            return (
              <Row
                key={`${p.playerId}-${p.teamId}`}
                player={p}
                format={nomination.metricFormat}
                onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
              />
            );
          })
        )}

        {/* Своё место за пределами топа — отдельной строкой в конце. Показываем и
            без результата: человек видит, где он, а не теряется в списке */}
        {me && (
          <>
            {hasGapBeforeMe && players.length > 0 && (
              <div className="h-6 flex items-center justify-center text-[12px] leading-none tracking-[0.3em] text-content-subtle border-b border-surface-border">
                ···
              </div>
            )}
            <NominationRow
              player={me}
              format={nomination.metricFormat}
              onClick={onPlayerClick ? () => onPlayerClick(me) : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Карусель номинаций дивизиона: карточка на номинацию, листается свайпом.
 *
 * Карточка уже экрана, и соседние торчат по краям — так видно, что лента листается.
 * Лента бесконечная: номинации выложены трижды подряд, человек всегда в средней копии,
 * а когда он долистал до крайней, ленту без анимации переносим на ту же карточку
 * в середине. Переносим только после остановки прокрутки — на ходу прыжок сбил бы
 * инерцию пальца.
 */
export function TournamentNominations({ nominations, openRightPanel }) {
  const trackRef = useRef(null);
  const idleTimerRef = useRef(null);

  const count = nominations.length;
  const isLoop = count > 1;
  const slides = isLoop ? [...nominations, ...nominations, ...nominations] : nominations;

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);

  // Шаг ленты — расстояние между соседними карточками (ширина + промежуток)
  const getStride = (el) => (el.children.length > 1 ? el.children[1].offsetLeft - el.children[0].offsetLeft : el.clientWidth);

  // Где должна стоять лента, чтобы карточка slideIdx была по центру
  const getCenteredLeft = (el, slideIdx) => {
    const slide = el.children[slideIdx];
    if (!slide) return 0;
    return slide.offsetLeft + slide.offsetWidth / 2 - el.clientWidth / 2;
  };

  // Номер карточки, ближайшей к центру
  const getCenteredSlide = (el) => {
    const first = el.children[0];
    if (!first) return 0;
    const firstCenter = first.offsetLeft + first.offsetWidth / 2;
    return Math.round((el.scrollLeft + el.clientWidth / 2 - firstCenter) / getStride(el));
  };

  const jumpTo = useCallback((slideIdx) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = getCenteredLeft(el, slideIdx);
  }, []);

  // Старт — первая номинация в средней копии. Ключ — состав номинаций: сменили турнир —
  // начинаем с начала
  const nominationsKey = nominations.map(n => n.id).join(',');
  useLayoutEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    if (isLoop) jumpTo(count);
    else if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [nominationsKey, isLoop, count, jumpTo]);

  // Поменялась ширина (поворот экрана, масштаб шрифта) — шаг ленты другой,
  // возвращаем текущую карточку в центр
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !isLoop || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => jumpTo(count + activeIndexRef.current));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoop, count, jumpTo]);

  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el || !isLoop) return;

    const slideIdx = getCenteredSlide(el);
    const realIdx = ((slideIdx % count) + count) % count;
    if (realIdx !== activeIndexRef.current) {
      activeIndexRef.current = realIdx;
      setActiveIndex(realIdx);
    }

    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      const current = getCenteredSlide(el);
      // Крайние копии — переносим на ту же карточку в середине, сдвигом на целый набор:
      // позиция остаётся точкой привязки, и браузеру нечего доводить
      if (current < count || current >= count * 2) {
        const setWidth = getStride(el) * count;
        el.scrollLeft += current < count ? setWidth : -setWidth;
      }
    }, SCROLL_IDLE_MS);
  };

  const scrollToNomination = (realIdx) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: getCenteredLeft(el, count + realIdx), behavior: 'smooth' });
  };

  const handlePlayerClick = openRightPanel
    ? (p) => p?.playerId && openRightPanel('playerProfile', { playerId: p.playerId }, 'Профиль игрока')
    : null;

  if (count === 0) return null;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Лента выходит за поля страницы до краёв экрана — иначе соседние
          карточки обрезались бы по полю и не торчали */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className={clsx(
          "relative -mx-3 flex items-start gap-3 overflow-x-auto scrollbar-hide",
          isLoop ? "snap-x snap-mandatory" : "px-3"
        )}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {slides.map((nomination, idx) => (
          <div
            key={`${nomination.id}-${idx}`}
            className={clsx(
              "shrink-0",
              isLoop ? "w-[calc(100%-64px)] max-w-[420px] snap-center snap-always" : "w-full"
            )}
          >
            <NominationCard nomination={nomination} onPlayerClick={handlePlayerClick} />
          </div>
        ))}
      </div>

      {isLoop && (
        count <= MAX_DOTS ? (
          <div className="flex items-center justify-center gap-1.5">
            {nominations.map((n, idx) => (
              <button
                key={n.id}
                type="button"
                onClick={() => scrollToNomination(idx)}
                aria-label={n.name}
                // Неактивные точки — цветом текста, а не поверхности: серый
                // поверхности сливался с фоном страницы, и видна была одна активная
                className={clsx(
                  "h-2 rounded-full transition-all duration-300 outline-none",
                  idx === activeIndex ? "w-5 bg-brand" : "w-2 bg-content-subtle"
                )}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-[12px] font-bold uppercase tracking-widest text-content-muted tabular-nums">
            {activeIndex + 1} / {count}
          </div>
        )
      )}
    </div>
  );
}
