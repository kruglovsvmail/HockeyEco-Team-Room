// TournamentPager.jsx
// Общая панель-перелистыватель вкладок раздела «Турниры / Лиги»: туры во «Матчах»,
// «Турнирная таблица / Плей-офф» в «Таблицах». Одна вёрстка и одно поведение на всех.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { uiFixed } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

// Перелистывание — как у недель в календаре на главной: та же длительность и кривая.
// Название в панели едет чуть быстрее ленты, тоже как в календаре
export const SLIDE_MS = 340;
const TITLE_SLIDE_MS = 250;
const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

// Свайп — как в календаре: порог 40px, у самых краёв экрана жест не ловим (там
// системный «назад»), направление фиксируем после первых 6px движения
const SWIPE_THRESHOLD_PX = 40;
const SWIPE_EDGE_PX = 40;
const SWIPE_LOCK_PX = 6;

// Прилипшая панель стоит не вплотную к шапке раздела, а с тем же зазором, что над ней
// в покое: отступы — как у фильтров во вкладке «Статистика»
const STUCK_GAP_PX = 16;

// Лента из трёх слайдов (прошлый, текущий, следующий): offsetIndex сдвигает её на слайд
export const slideTrackStyle = (offsetIndex, isAnimating, ms = SLIDE_MS) => ({
  transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}%))`,
  transition: isAnimating ? `transform ${ms}ms ${SLIDE_EASE}` : 'none',
  willChange: 'transform',
});

/**
 * Перелистывание по индексу: slideTo('next' | 'prev') сдвигает ленту анимацией и по её
 * окончании вызывает onCommit с новым индексом — кто хранит выбор, решает вызывающий.
 */
export function useSlideAnimation({ index, count, onCommit, beforeSlide }) {
  const [offsetIndex, setOffsetIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const slideTo = (direction) => {
    if (isAnimating) return;
    const target = index + (direction === 'next' ? 1 : -1);
    if (target < 0 || target >= count) return;

    beforeSlide?.();
    setIsAnimating(true);
    setOffsetIndex(direction === 'next' ? 1 : -1);

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onCommit(target);
      setOffsetIndex(0);
      setIsAnimating(false);
    }, SLIDE_MS);
  };

  return { offsetIndex, isAnimating, slideTo };
}

/**
 * Прилипание панели под шапкой раздела. anchorRef — пустой элемент прямо перед панелью:
 * по нему считаем, прилипла ли она, и куда вернуть ленту, чтобы новая страница
 * открылась с начала. Через offsetTop, а не getBoundingClientRect: интерфейс
 * масштабируется transform'ом, и экранные координаты разошлись бы с scrollTop.
 */
export function useStickyPager({ scrollContainerRef, headerOffset }) {
  const anchorRef = useRef(null);
  const stickyTop = (headerOffset || 0) + STUCK_GAP_PX;

  const getStuckScrollTop = useCallback(() => {
    const container = scrollContainerRef?.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return null;
    let anchorTop = 0;
    for (let el = anchor; el && el !== container; el = el.offsetParent) anchorTop += el.offsetTop;
    return anchorTop - stickyTop;
  }, [scrollContainerRef, stickyTop]);

  // Прилипла ли панель (лента ушла под неё). Только тогда за ней нужен шлейф: в покое
  // ровная заливка цвета фона закрывала «зерно» фона приложения (bg-noise в App.jsx),
  // и в тёмной теме за таблеткой проступало гладкое пятно другого оттенка
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return undefined;
    const update = () => {
      const stuckAt = getStuckScrollTop();
      setIsStuck(stuckAt != null && container.scrollTop > stuckAt + 1);
    };
    update();
    container.addEventListener('scroll', update, { passive: true });
    return () => container.removeEventListener('scroll', update);
  }, [scrollContainerRef, getStuckScrollTop]);

  // Ушли вниз по длинной странице — новую показываем с начала, а не с середины
  const scrollToStart = () => {
    const container = scrollContainerRef?.current;
    const stuckAt = getStuckScrollTop();
    if (container && stuckAt != null && container.scrollTop > stuckAt) {
      container.scrollTo({ top: stuckAt });
    }
  };

  return { anchorRef, stickyTop, isStuck, scrollToStart };
}

/**
 * Панель: «‹  Название  ›» во всю ширину. Высота, скругление и тень — как у фильтров во
 * вкладке «Статистика» (h-[40px], rounded-2xl, shadow-md), сверху отступа нет, снизу —
 * те же 16px до содержимого. Прилипает под шапкой раздела; содержимое уходит под неё,
 * растворяясь в шлейфе цвета фона, как в календаре. Обёртка прозрачна для нажатий:
 * прозрачный низ шлейфа не должен перекрывать карточки.
 *
 * titles — подписи трёх слайдов (прошлый, текущий, следующий): название уезжает вбок
 * вместе с лентой.
 */
export function PagerBar({
  sticky,
  titles,
  offsetIndex,
  isAnimating,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onTitleClick,
  titleAriaLabel,
  uppercase = false,
}) {
  // Без hover-цвета: на телефоне «наведение» залипает после касания, и стрелка
  // оставалась синей. Отклик на нажатие — прозрачностью
  const arrowClass = (enabled, flip) => clsx(
    'p-1 text-content-main transition-opacity outline-none z-10 active:opacity-50',
    flip && 'rotate-180',
    !enabled && 'opacity-25 pointer-events-none'
  );

  return (
    <div
      className="sticky z-20 -mx-3 px-3 pb-4 pointer-events-none"
      style={{ top: sticky.stickyTop }}
    >
      {/* Шлейф выходит выше панели на зазор до шапки, чтобы в этом зазоре не
          просвечивали уезжающие карточки */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-surface-border from-55% to-transparent transition-opacity duration-200"
        style={{ top: -STUCK_GAP_PX, opacity: sticky.isStuck ? 1 : 0 }}
      />

      <div className="relative flex items-center w-full h-[40px] px-1.5 bg-surface-level1 shadow-md rounded-2xl select-none pointer-events-auto">
        <button type="button" onClick={onPrev} aria-label="Назад" className={arrowClass(hasPrev, false)}>
          <Icon name="chevron_left" style={{ width: uiFixed(20), height: uiFixed(20) }} />
        </button>

        <button
          type="button"
          onClick={onTitleClick}
          className="flex-1 min-w-0 overflow-hidden outline-none active:opacity-60"
          aria-label={titleAriaLabel}
        >
          <div className="relative overflow-hidden w-full" style={{ height: uiFixed(20) }}>
            <div
              className="w-[300%] flex items-center h-full absolute left-0 top-0"
              style={slideTrackStyle(offsetIndex, isAnimating, TITLE_SLIDE_MS)}
            >
              {titles.map((title, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'w-1/3 shrink-0 text-center font-bold text-content-main truncate',
                    uppercase && 'uppercase tracking-widest'
                  )}
                  style={{ fontSize: uiFixed(uppercase ? 12 : 14) }}
                >
                  {title}
                </div>
              ))}
            </div>
          </div>
        </button>

        <button type="button" onClick={onNext} aria-label="Вперёд" className={arrowClass(hasNext, true)}>
          <Icon name="chevron_left" style={{ width: uiFixed(20), height: uiFixed(20) }} />
        </button>
      </div>
    </div>
  );
}

/**
 * Лента содержимого: три слайда, видна средняя. Соседние нужны только на время
 * перелистывания — в покое их прячем по высоте, чтобы длинная соседняя страница не
 * добавляла пустой прокрутки под короткой. Свайп листает, как в календаре.
 */
export function PagerTrack({ slides, offsetIndex, isAnimating, onSwipe }) {
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
    if (Math.abs(diffX) > SWIPE_THRESHOLD_PX) onSwipe(diffX > 0 ? 'next' : 'prev');
  };

  return (
    <div
      className="-mx-3 overflow-hidden min-h-[50vh]"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="w-[300%] flex items-start"
        style={{ ...slideTrackStyle(offsetIndex, isAnimating), pointerEvents: isAnimating ? 'none' : 'auto' }}
      >
        {slides.map((slide, idx) => (
          <div
            key={slide?.key ?? `empty-${idx}`}
            className={clsx('w-1/3 shrink-0 px-3', idx !== 1 && !isAnimating && 'h-0 overflow-hidden')}
          >
            {slide?.content}
          </div>
        ))}
      </div>
    </div>
  );
}
