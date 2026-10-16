// TournamentMatches.jsx
import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getPlayoffStageDisplayLabel } from '../../utils/helpers';
import { FadeIn } from '../../ui/FadeIn';
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
 * страница, переключаются лентой чипов и свайпом.
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
        // Подпись по частям: «Тур » видно только у выбранного чипа, в ленте — номер
        const parts = tour
          ? [{ text: 'Тур ', onlyActive: true }, { text: String(tour) }]
          : [{ text: 'Без тура' }];
        pages.push({
          key: `r|${stage}|${tour}`,
          parts: severalStages ? [{ text: `${stage} · ` }, ...parts] : parts,
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
      // «1/4 финала» в ленте — просто «1/4», полностью только у выбранной
      const fraction = stage.match(/^\d+\/\d+/);
      pages.push({
        key: `p|${stage}`,
        parts: fraction
          ? [{ text: fraction[0] }, { text: stage.slice(fraction[0].length), onlyActive: true }]
          : [{ text: stage }],
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
  // или расписание ещё не составлено, и подпись на чипе только сбивала бы с толку
  for (let idx = pages.length - 1; idx >= 0; idx -= 1) {
    if (pages[idx].games.some(g => g.status === 'finished')) return { index: idx, isNow: false };
  }
  return { index: 0, isNow: false };
};

// Скрытая часть подписи чипа («Тур », « финала») раскрывается шириной, а не появляется
// рывком: чип плавно растёт, соседи плавно отъезжают. Ширину берём замером самого
// текста, а не прикидкой с запасом: с запасом рост кончался раньше анимации, и движение
// выходило рваным — рывок, потом пауза
const CHIP_EASE = 'cubic-bezier(0.25,0.8,0.25,1)';
const CHIP_MS = 250;

function ChipPart({ text, visible }) {
  const innerRef = useRef(null);
  const [fullWidth, setFullWidth] = useState(null);

  useLayoutEffect(() => {
    if (innerRef.current) setFullWidth(innerRef.current.offsetWidth);
  }, [text]);

  return (
    <span
      className="inline-block overflow-hidden align-top"
      style={{
        // Пока ширина не замерена (первый кадр) — без анимации, по факту видимости
        width: fullWidth == null ? (visible ? 'auto' : 0) : (visible ? fullWidth : 0),
        opacity: visible ? 1 : 0,
        transition: fullWidth == null ? 'none' : `width ${CHIP_MS}ms ${CHIP_EASE}, opacity ${CHIP_MS}ms ${CHIP_EASE}`,
      }}
    >
      <span ref={innerRef} className="inline-block whitespace-pre">{text}</span>
    </span>
  );
}

// Свайп считается переключением, только если палец ушёл вбок заметно дальше, чем
// вверх-вниз: иначе обычная прокрутка ленты листала бы туры
const SWIPE_MIN_PX = 60;
const SWIPE_RATIO = 1.5;

const MatchCard = ({ game, onClick }) => (
  <div onClick={() => onClick(game)} className="cursor-pointer active:opacity-70 transition-opacity">
    <TournamentCardGame game={game} />
  </div>
);

export function TournamentMatches({ games, onGameClick, scrollContainerRef, stickyTop }) {
  const pages = useMemo(() => buildPages(games), [games]);
  const { index: currentIndex, isNow } = useMemo(() => findCurrent(pages), [pages]);

  // Выбор человека держим ключом страницы. Пока он ничего не выбрал или выбранной
  // страницы больше нет (сменился дивизион) — открыт текущий тур, без промежуточного кадра
  const [selectedKey, setSelectedKey] = useState(null);
  const pickedIndex = pages.findIndex(page => page.key === selectedKey);
  const selectedIndex = pickedIndex >= 0 ? pickedIndex : currentIndex;

  const page = pages[selectedIndex];

  const stripRef = useRef(null);
  const chipRefs = useRef({});
  const anchorRef = useRef(null);
  const isFirstCenterRef = useRef(true);

  // Лента двигается сама только по необходимости. При открытии текущий тур ставим в
  // середину без анимации — иначе в конце сезона его бы не было видно. Дальше центрировать
  // каждый выбор не нужно: лента ехала одновременно с изменением ширины чипов, и всё
  // дёргалось. Подкручиваем, только если выбранный чип ушёл за край (выбрали свайпом)
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const chip = page && chipRefs.current[page.key];
    if (!strip || !chip) return;

    if (isFirstCenterRef.current) {
      isFirstCenterRef.current = false;
      strip.scrollLeft = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
      return;
    }

    const margin = 24;
    const chipLeft = chip.offsetLeft;
    const chipRight = chipLeft + chip.offsetWidth;
    if (chipLeft - margin < strip.scrollLeft) {
      strip.scrollTo({ left: chipLeft - margin, behavior: 'smooth' });
    } else if (chipRight + margin > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: chipRight + margin - strip.clientWidth, behavior: 'smooth' });
    }
  }, [page]);

  const selectPage = (index) => {
    const target = pages[index];
    if (!target || target.key === page?.key) return;
    setSelectedKey(target.key);

    // Ушли вниз по длинному туру — новый тур показываем с начала, а не с середины.
    // Отступ считаем через offsetTop, а не getBoundingClientRect: интерфейс масштабируется
    // transform'ом, и экранные координаты разошлись бы с scrollTop
    const container = scrollContainerRef?.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return;
    let anchorTop = 0;
    for (let el = anchor; el && el !== container; el = el.offsetParent) anchorTop += el.offsetTop;
    const stuckScrollTop = anchorTop - (stickyTop || 0);
    if (container.scrollTop > stuckScrollTop) container.scrollTo({ top: stuckScrollTop });
  };

  const touchRef = useRef(null);
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    selectPage(selectedIndex + (dx < 0 ? 1 : -1));
  };

  if (pages.length === 0) {
    return (
      <div className="text-center py-12 text-[14px] font-bold text-content-subtle uppercase tracking-wider">
        В данном дивизионе пока нет запланированных матчей
      </div>
    );
  }

  // Плей-офф внутри стадии — по сериям, как и раньше; серия из одного матча без заголовка
  const series = page.type === 'playoff'
    ? [...page.games.reduce((map, game) => {
        const num = game.series_number || 0;
        if (!map.has(num)) map.set(num, []);
        map.get(num).push(game);
        return map;
      }, new Map()).entries()]
    : null;

  return (
    <div className="flex flex-col">
      <div ref={anchorRef} />

      {/* ── ЛЕНТА ТУРОВ И СТАДИЙ. Прилипает под шапкой раздела: переключиться можно,
          не возвращаясь наверх длинного тура ── */}
      {/* Тень снизу отделяет полосу от карточки матча, которая уезжает под неё */}
      <div
        className="sticky z-20 -mx-3 bg-surface-base shadow-[0_8px_12px_-8px_rgba(0,0,0,0.25)]"
        style={{ top: stickyTop }}
      >
        <div
          ref={stripRef}
          className="relative flex items-center gap-2 overflow-x-auto scrollbar-hide px-3 py-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {pages.map((item, idx) => {
            const isActive = idx === selectedIndex;
            // «Сейчас» — только у тура, где матч идёт или ещё впереди по расписанию
            const isCurrent = isNow && idx === currentIndex;
            return (
              <button
                key={item.key}
                ref={(el) => { chipRefs.current[item.key] = el; }}
                type="button"
                onClick={() => selectPage(idx)}
                // Выбранный — обводкой цвета бренда, а не заливкой: залитые чипы —
                // это вкладки шапки, и две полосы одинаковых кнопок путались.
                // Рамка есть у всех (прозрачная), чтобы выбор не менял размер чипа
                className={clsx(
                  "relative shrink-0 flex items-center h-8 min-w-[2.5rem] px-3.5 rounded-full border-2 bg-surface-level1 text-[13px] font-bold whitespace-nowrap outline-none transition-colors active:scale-95",
                  isActive
                    ? "border-brand text-brand"
                    : item.isDone
                      ? "border-transparent text-content-muted"
                      : "border-transparent text-content-main"
                )}
                style={{ transitionDuration: `${CHIP_MS}ms` }}
              >
                {/* В ленте коротко — номер тура, полностью только выбранный:
                    так помещается больше туров и сразу видно, где ты */}
                {item.parts.map((part, partIdx) => (
                  part.onlyActive
                    ? <ChipPart key={partIdx} text={part.text} visible={isActive} />
                    : <span key={partIdx}>{part.text}</span>
                ))}
                {isCurrent && (
                  <span className="ml-1.5 text-[11px] font-semibold text-brand">сейчас</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="pt-4 min-h-[50vh]">
        <FadeIn key={page.key} duration={250}>
          {page.type === 'regular' ? (
            <div className="flex flex-col gap-3">
              {page.games.map(game => <MatchCard key={game.id} game={game} onClick={onGameClick} />)}
            </div>
          ) : (
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
          )}
        </FadeIn>
      </div>
    </div>
  );
}
