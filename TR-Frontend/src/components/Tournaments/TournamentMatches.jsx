// TournamentMatches.jsx
import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getPlayoffStageDisplayLabel } from '../../utils/helpers';
import { TopSheet } from '../../ui/TopSheet';
import { TournamentCardGame } from './TournamentCardGame';
import { PagerBar, PagerTrack, useSlideAnimation, useStickyPager } from './TournamentPager';

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

/**
 * Вкладка «Матчи»: по одному туру (или стадии плей-офф) на экране. Панель над матчами —
 * общая для вкладок раздела (TournamentPager.jsx): стрелки и свайп листают на соседний
 * тур, нажатие на название — все туры сеткой (шторка сверху, как сетка месяца в
 * календаре).
 */
export function TournamentMatches({ games, onGameClick, scrollContainerRef, headerOffset }) {
  const pages = useMemo(() => buildPages(games), [games]);
  const { index: currentIndex, isNow } = useMemo(() => findCurrent(pages), [pages]);

  // Выбор человека держим ключом страницы. Пока он ничего не выбрал или выбранной
  // страницы больше нет (сменился дивизион) — открыт текущий тур, без промежуточного кадра
  const [selectedKey, setSelectedKey] = useState(null);
  const pickedIndex = pages.findIndex(page => page.key === selectedKey);
  const selectedIndex = pickedIndex >= 0 ? pickedIndex : currentIndex;

  const [isGridOpen, setIsGridOpen] = useState(false);

  const sticky = useStickyPager({ scrollContainerRef, headerOffset });
  const { offsetIndex, isAnimating, slideTo } = useSlideAnimation({
    index: selectedIndex,
    count: pages.length,
    onCommit: (index) => setSelectedKey(pages[index]?.key ?? null),
    beforeSlide: sticky.scrollToStart,
  });

  // Из сетки — сразу на выбранный тур, без перелистывания через все промежуточные
  const jumpTo = (index) => {
    const target = pages[index];
    if (!target) return;
    sticky.scrollToStart();
    setSelectedKey(target.key);
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

  const neighbours = [pages[selectedIndex - 1], pages[selectedIndex], pages[selectedIndex + 1]];

  return (
    <div className="flex flex-col">
      <div ref={sticky.anchorRef} />

      {/* В панели — только название тура, по центру; «сейчас» отмечено в сетке туров */}
      <PagerBar
        sticky={sticky}
        titles={neighbours.map(item => item?.label ?? '')}
        offsetIndex={offsetIndex}
        isAnimating={isAnimating}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex < pages.length - 1}
        onPrev={() => slideTo('prev')}
        onNext={() => slideTo('next')}
        onTitleClick={() => setIsGridOpen(true)}
        titleAriaLabel="Все туры"
      />

      <PagerTrack
        slides={neighbours.map(item => item && {
          key: item.key,
          content: <PageGames page={item} onGameClick={onGameClick} />,
        })}
        offsetIndex={offsetIndex}
        isAnimating={isAnimating}
        onSwipe={slideTo}
      />

      {/* ── ВСЕ ТУРЫ СЕТКОЙ. Шторка сверху — как сетка месяца в календаре ── */}
      <TopSheet isOpen={isGridOpen} onClose={() => setIsGridOpen(false)}>
        <div className="flex flex-col gap-5 pb-2">
          {groups.map(group => (
            <div key={group.name} className="flex flex-col gap-3">
              <div className="text-center text-[14px] font-black text-content-main uppercase tracking-widest">
                {group.name}
              </div>
              <div className={group.isPlayoff ? 'flex flex-col gap-2' : 'grid grid-cols-5 gap-2'}>
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
                        'relative flex flex-col items-center justify-center rounded-2xl font-black outline-none transition-colors active:scale-95',
                        group.isPlayoff
                          ? 'h-[52px] px-4 text-[13px] uppercase tracking-wide'
                          // «Без тура» в сетке номеров — шириной в две клетки
                          : item.cell.length > 3
                            ? 'h-14 col-span-2 text-[13px] uppercase tracking-wide'
                            : 'h-14 text-[16px]',
                        isActive
                          ? 'bg-brand text-white'
                          : item.isDone
                            ? 'bg-surface-level2 text-content-muted'
                            : 'bg-surface-level2 text-content-main'
                      )}
                    >
                      <span className="leading-none">{item.cell}</span>
                      {isCurrent && (
                        <span className={clsx(
                          'mt-1 text-[10px] font-semibold normal-case tracking-normal leading-none',
                          isActive ? 'text-white/80' : 'text-brand'
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
