// TournamentMatches.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getPlayoffStageDisplayLabel, uiFixed } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { TopSheet } from '../../ui/TopSheet';
import { TournamentCardGame } from './TournamentCardGame';

dayjs.extend(utc);
dayjs.extend(timezone);

// Матч, который уже не сыграют «впереди»: завершён, отменён или прошёл без результата
const isClosed = (game) => ['finished', 'cancelled', 'finished_no_result'].includes(game.status);

// День матча в часах арены — тот же источник, что у карточки: черновик расписания LMS,
// иначе точное начало в поясе арены
const getGameDay = (game) => {
  if (game.draft_date) return game.draft_date;
  if (!game.game_date) return null;
  return dayjs.utc(game.game_date).tz(game.arena_timezone || 'Europe/Moscow').format('YYYY-MM-DD');
};

/**
 * Матчи дивизиона по «страницам»: тур регулярки или стадия плей-офф. На экране одна
 * страница; соседняя — стрелками и свайпом, любая — из шторки со всеми турами.
 * Внешний вид и поведение переключателя — как у недель в календаре на главной.
 *
 * Порядок: туры по номеру (матчи без тура — «Без тура» в конце регулярки), затем стадии
 * плей-офф по дате первого матча — у матчей плей-офф series_number это номер серии,
 * а не порядок стадий. Если регулярных этапов несколько (группы), к туру приписываем этап.
 */
const buildPages = (games) => {
  const regular = new Map();
  const playoff = new Map();

  games.forEach((game) => {
    const isPlayoff = game.stage_type === 'playoff';
    const stage = getPlayoffStageDisplayLabel(game.stage_label, game.playoff_match_type)
      || (isPlayoff ? 'Плей-офф' : 'Регулярный чемпионат');
    if (isPlayoff) {
      if (!playoff.has(stage)) playoff.set(stage, []);
      playoff.get(stage).push(game);
    } else {
      if (!regular.has(stage)) regular.set(stage, new Map());
      const tours = regular.get(stage);
      const tour = Number(game.series_number) || 0;
      if (!tours.has(tour)) tours.set(tour, []);
      tours.get(tour).push(game);
    }
  });

  const pages = [];
  const severalStages = regular.size > 1;

  regular.forEach((tours, stage) => {
    [...tours.keys()]
      .sort((a, b) => (a || Infinity) - (b || Infinity))
      .forEach((tour) => {
        const label = tour ? `Тур ${tour}` : 'Без тура';
        pages.push({
          key: `r|${stage}|${tour}`,
          // label — в строке над матчами; group и cell — в шторке: группа (этап)
          // и клетка сетки, где тура хватает одного номера
          label: severalStages ? `${stage} · ${label}` : label,
          group: severalStages ? stage : 'Туры',
          cell: tour ? String(tour) : 'Без тура',
          type: 'regular',
          games: tours.get(tour),
        });
      });
  });

  const firstDay = (list) => list.map(getGameDay).filter(Boolean).sort()[0] || '9999-99-99';
  [...playoff.entries()]
    .map(([stage, list], order) => ({ stage, list, order, day: firstDay(list) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order)
    .forEach(({ stage, list }) => {
      pages.push({
        key: `p|${stage}`,
        label: stage,
        group: 'Плей-офф',
        cell: stage,
        type: 'playoff',
        games: list,
      });
    });

  return pages.map(page => ({ ...page, isDone: page.games.every(isClosed) }));
};

/**
 * Где открыть ленту. Идёт матч — его тур. Иначе — тур ближайшего матча с датой от
 * сегодня и дальше: перенесённый без даты матч старого тура не держит ленту на нём.
 * Будущих с датой нет (сезон кончился или расписание не составлено) — последний тур,
 * где уже играли: свежие результаты. Не играли вовсе — первый.
 */
const findCurrent = (pages) => {
  const live = pages.findIndex(page => page.games.some(g => g.status === 'live'));
  if (live >= 0) return { index: live, isNow: true };

  const today = dayjs().format('YYYY-MM-DD');
  let nearest = null;
  pages.forEach((page, idx) => page.games.forEach((game) => {
    if (isClosed(game)) return;
    const day = getGameDay(game);
    if (!day || day < today) return;
    if (!nearest || day < nearest.day) nearest = { day, idx };
  }));
  if (nearest) return { index: nearest.idx, isNow: true };

  // Дальше — запасные варианты, куда открыть ленту. Это уже не «сейчас»: сезон кончился
  // (в том числе когда в последнем туре остались несыгранные матчи с прошедшей датой)
  // или расписание ещё не составлено, и подпись «сейчас» только сбивала бы с толку
  for (let idx = pages.length - 1; idx >= 0; idx -= 1) {
    if (pages[idx].games.some(g => g.status === 'finished')) return { index: idx, isNow: false };
  }
  return { index: 0, isNow: false };
};

// Перелистывание — как у недель в календаре на главной (SchedulePage + CompactWeek):
// та же длительность и кривая, порог свайпа 40px, жест не ловим у самых краёв экрана
// (там системный «назад»), направление фиксируем после первых 6px движения
const SLIDE_MS = 340;
const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SWIPE_THRESHOLD_PX = 40;
const SWIPE_EDGE_PX = 40;
const SWIPE_LOCK_PX = 6;

const MatchCard = ({ game, onClick }) => (
  <div onClick={() => onClick(game)} className="cursor-pointer active:opacity-70 transition-opacity">
    <TournamentCardGame game={game} />
  </div>
);

// Матчи одной страницы: тур — списком, стадия плей-офф — по сериям (серия из одного
// матча без заголовка)
function PageGames({ page, onGameClick }) {
  if (page.type === 'regular') {
    return (
      <div className="flex flex-col gap-3">
        {page.games.map(game => <MatchCard key={game.id} game={game} onClick={onGameClick} />)}
      </div>
    );
  }

  const series = [...page.games.reduce((map, game) => {
    const num = game.series_number || 0;
    if (!map.has(num)) map.set(num, []);
    map.get(num).push(game);
    return map;
  }, new Map()).entries()];

  return (
    <div className="flex flex-col gap-8">
      {series.map(([num, list]) => (
        <div key={num} className="flex flex-col gap-2">
          {list[0]?.wins_needed !== 1 && (
            <div className="text-center text-[14px] font-black uppercase tracking-[0.2em] text-content-muted">
              Серия №{num}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {list.map(game => <MatchCard key={game.id} game={game} onClick={onGameClick} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TournamentMatches({ games, onGameClick, scrollContainerRef, headerOffset }) {
  const pages = useMemo(() => buildPages(games), [games]);
  const { index: currentIndex, isNow } = useMemo(() => findCurrent(pages), [pages]);

  // Выбор человека держим ключом страницы. Пока он ничего не выбрал или выбранной
  // страницы больше нет (сменился дивизион) — открыт текущий тур, без промежуточного кадра
  const [selectedKey, setSelectedKey] = useState(null);
  const pickedIndex = pages.findIndex(page => page.key === selectedKey);
  const selectedIndex = pickedIndex >= 0 ? pickedIndex : currentIndex;
  const page = pages[selectedIndex];

  const anchorRef = useRef(null);
  const [isGridOpen, setIsGridOpen] = useState(false);

  // Лента из трёх слайдов (прошлый, текущий, следующий тур), как у недель календаря:
  // offsetIndex сдвигает её на слайд, по окончании анимации выбор переезжает на соседний
  // тур, а лента без анимации возвращается в середину
  const [offsetIndex, setOffsetIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimer = useRef(null);
  useEffect(() => () => clearTimeout(animationTimer.current), []);

  // Прокрутка, при которой переключатель прилипает под (схлопнутой) шапкой раздела.
  // Через offsetTop, а не getBoundingClientRect: интерфейс масштабируется transform'ом,
  // и экранные координаты разошлись бы с scrollTop
  const getTourStartScrollTop = () => {
    const container = scrollContainerRef?.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return null;
    let anchorTop = 0;
    for (let el = anchor; el && el !== container; el = el.offsetParent) anchorTop += el.offsetTop;
    return anchorTop - (headerOffset || 0);
  };

  // Ушли вниз по длинному туру — новый тур показываем с начала, а не с середины
  const scrollToTourStart = () => {
    const container = scrollContainerRef?.current;
    const startScrollTop = getTourStartScrollTop();
    if (container && startScrollTop != null && container.scrollTop > startScrollTop) {
      container.scrollTo({ top: startScrollTop });
    }
  };

  const slideTo = (direction) => {
    if (isAnimating) return;
    const targetIndex = selectedIndex + (direction === 'next' ? 1 : -1);
    const target = pages[targetIndex];
    if (!target) return;

    scrollToTourStart();
    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    clearTimeout(animationTimer.current);
    animationTimer.current = setTimeout(() => {
      setSelectedKey(target.key);
      setOffsetIndex(0);
      setIsAnimating(false);
    }, SLIDE_MS);
  };

  // Из сетки — сразу на выбранный тур, без перелистывания через все промежуточные
  const jumpTo = (index) => {
    const target = pages[index];
    if (!target) return;
    scrollToTourStart();
    setSelectedKey(target.key);
  };

  // Свайп по матчам — как в календаре
  const touch = useRef({ x: null, y: null, locked: false, horizontal: false });
  const handleTouchStart = (e) => {
    if (isAnimating) return;
    const x = e.touches[0].clientX;
    if (x < SWIPE_EDGE_PX || x > window.innerWidth - SWIPE_EDGE_PX) return;
    touch.current = { x, y: e.touches[0].clientY, locked: false, horizontal: false };
  };
  const handleTouchMove = (e) => {
    const t = touch.current;
    if (t.x === null || isAnimating || t.locked) return;
    const diffX = t.x - e.touches[0].clientX;
    const diffY = t.y - e.touches[0].clientY;
    if (Math.abs(diffX) > SWIPE_LOCK_PX || Math.abs(diffY) > SWIPE_LOCK_PX) {
      t.locked = true;
      if (Math.abs(diffX) > Math.abs(diffY)) t.horizontal = true;
      else t.x = null;
    }
  };
  const handleTouchEnd = (e) => {
    const t = touch.current;
    touch.current = { x: null, y: null, locked: false, horizontal: false };
    if (t.x === null || isAnimating || !t.horizontal) return;
    const diffX = t.x - e.changedTouches[0].clientX;
    if (Math.abs(diffX) > SWIPE_THRESHOLD_PX) slideTo(diffX > 0 ? 'next' : 'prev');
  };

  if (pages.length === 0) {
    return (
      <div className="text-center py-12 text-[14px] font-bold text-content-subtle uppercase tracking-wider">
        В данном дивизионе пока нет запланированных матчей
      </div>
    );
  }

  // Шторка: туры сеткой по группам (этапы регулярки, затем плей-офф)
  const groups = pages.reduce((list, item, idx) => {
    const last = list[list.length - 1];
    if (last && last.name === item.group) last.items.push({ item, idx });
    else list.push({ name: item.group, isPlayoff: item.type === 'playoff', items: [{ item, idx }] });
    return list;
  }, []);

  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < pages.length - 1;
  const neighbours = [pages[selectedIndex - 1], page, pages[selectedIndex + 1]];

  const trackStyle = {
    transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}%))`,
    transition: isAnimating ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : 'none',
    willChange: 'transform',
  };
  // Название едет чуть быстрее ленты — как в календаре
  const titleTrackStyle = {
    ...trackStyle,
    transition: isAnimating ? `transform 250ms ${SLIDE_EASE}` : 'none',
  };

  const titleOf = (item) => {
    if (!item) return null;
    const idx = pages.indexOf(item);
    return (
      <>
        {item.label}
        {isNow && idx === currentIndex && (
          <span className="ml-1.5 text-[11px] font-semibold text-brand">сейчас</span>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col">
      <div ref={anchorRef} />

      {/* ── ПЕРЕКЛЮЧАТЕЛЬ ТУРОВ — как переключатель недель в календаре на главной:
          «таблетка» со стрелками и уезжающим названием и островок с кнопкой сетки.
          Прилипает под шапкой раздела, а карточки уходят под него, растворяясь, —
          тот же шлейф цвета фона, что в календаре (from-surface-border). Пока он стоит
          на месте, шлейф лежит на фоне того же цвета и не виден. Сама обёртка
          прозрачна для нажатий: прозрачный низ шлейфа не должен перекрывать карточки ── */}
      <div
        className="sticky z-20 -mx-3 px-3 pt-2 pb-5 pointer-events-none bg-gradient-to-b from-surface-border from-55% to-transparent"
        style={{ top: headerOffset }}
      >
        <div className="flex items-center gap-2 w-full justify-between select-none pointer-events-auto">
          <div className="flex flex-1 min-w-0 items-center justify-between bg-surface-level1 shadow-lg rounded-3xl px-2 py-2.5">
            <button
              type="button"
              onClick={() => slideTo('prev')}
              aria-label="Предыдущий тур"
              className={clsx(
                "p-1 text-content-main hover:text-brand transition-[color,opacity] outline-none z-10",
                !hasPrev && "opacity-25 pointer-events-none"
              )}
            >
              <Icon name="chevron_left" style={{ width: uiFixed(20), height: uiFixed(20) }} />
            </button>

            <button
              type="button"
              onClick={() => setIsGridOpen(true)}
              className="flex-1 min-w-0 overflow-hidden outline-none"
              aria-label="Все туры"
            >
              <div className="relative overflow-hidden w-full" style={{ height: uiFixed(20) }}>
                <div className="w-[300%] flex items-start h-full absolute left-0 top-0" style={titleTrackStyle}>
                  {neighbours.map((item, idx) => (
                    <div
                      key={item ? item.key : `empty-${idx}`}
                      className="w-1/3 shrink-0 text-center font-bold text-content-main truncate"
                      style={{ fontSize: uiFixed(14) }}
                    >
                      {titleOf(item)}
                    </div>
                  ))}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => slideTo('next')}
              aria-label="Следующий тур"
              className={clsx(
                "p-1 text-content-main hover:text-brand transition-[color,opacity] outline-none rotate-180 z-10",
                !hasNext && "opacity-25 pointer-events-none"
              )}
            >
              <Icon name="chevron_left" style={{ width: uiFixed(20), height: uiFixed(20) }} />
            </button>
          </div>

          <div className="flex items-center bg-surface-level1 shadow-lg rounded-3xl px-3 py-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsGridOpen(true)}
              className="p-1 text-content-main hover:text-brand transition-colors outline-none flex items-center justify-center active:scale-95"
              aria-label="Все туры"
            >
              <Icon name="view_grid" className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── ЛЕНТА ТУРОВ: три слайда, видна средняя. Соседние нужны только на время
          перелистывания — в покое их прячем по высоте, чтобы длинный соседний тур
          не добавлял пустой прокрутки под коротким ── */}
      <div
        className="-mx-3 overflow-hidden min-h-[50vh]"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="w-[300%] flex items-start"
          style={{ ...trackStyle, pointerEvents: isAnimating ? 'none' : 'auto' }}
        >
          {neighbours.map((item, idx) => (
            <div
              key={item ? item.key : `empty-${idx}`}
              className={clsx("w-1/3 shrink-0 px-3", idx !== 1 && !isAnimating && "h-0 overflow-hidden")}
            >
              {item && <PageGames page={item} onGameClick={onGameClick} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── ВСЕ ТУРЫ СЕТКОЙ. Шторка сверху — как сетка месяца в календаре ── */}
      <TopSheet isOpen={isGridOpen} onClose={() => setIsGridOpen(false)}>
        <div className="flex flex-col gap-5 pb-2">
          {groups.map(group => (
            <div key={group.name} className="flex flex-col gap-3">
              <div className="text-center text-[14px] font-black text-content-main uppercase tracking-widest">
                {group.name}
              </div>
              <div className={group.isPlayoff ? "flex flex-col gap-2" : "grid grid-cols-5 gap-2"}>
                {group.items.map(({ item, idx }) => {
                  const isActive = idx === selectedIndex;
                  const isCurrent = isNow && idx === currentIndex;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        jumpTo(idx);
                        setIsGridOpen(false);
                      }}
                      className={clsx(
                        "relative flex flex-col items-center justify-center rounded-2xl font-black outline-none transition-colors active:scale-95",
                        group.isPlayoff
                          ? "h-[52px] px-4 text-[13px] uppercase tracking-wide"
                          // «Без тура» в сетке номеров — шириной в две клетки
                          : item.cell.length > 3
                            ? "h-14 col-span-2 text-[13px] uppercase tracking-wide"
                            : "h-14 text-[16px]",
                        isActive
                          ? "bg-brand text-white"
                          : item.isDone
                            ? "bg-surface-level2 text-content-muted"
                            : "bg-surface-level2 text-content-main"
                      )}
                    >
                      <span className="leading-none">{item.cell}</span>
                      {isCurrent && (
                        <span className={clsx(
                          "mt-1 text-[10px] font-semibold normal-case tracking-normal leading-none",
                          isActive ? "text-white/80" : "text-brand"
                        )}>
                          сейчас
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </TopSheet>
    </div>
  );
}
