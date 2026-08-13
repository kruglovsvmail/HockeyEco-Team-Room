import { useEffect, useRef, useState } from 'react';

/**
 * «Потяни вниз — обнови» для конкретного скролл-контейнера.
 *
 * Зачем свой: приложение сделано нативным каркасом (html/body зафиксированы,
 * overscroll-behavior: none, display: standalone), поэтому браузерного
 * pull-to-refresh нет ни во вкладке, ни в установленной PWA.
 *
 * Обновление здесь — это ре-фетч данных экрана, а не перезагрузка страницы:
 * location.reload() в PWA стоит холодного старта, белого экрана и потери
 * состояния (открытая вкладка, позиция скролла).
 *
 * Как не конфликтует со скроллом: жест вообще не стартует, если контейнер
 * прокручен (scrollTop > 0), и отменяется, как только палец уходит вверх или
 * вбок — направление фиксируется после первых AXIS_LOCK пикселей, как это уже
 * сделано у горизонтального свайпа недель в календаре.
 */

const THRESHOLD  = 70;   // сколько нужно протянуть, чтобы обновление сработало
const MAX_PULL   = 110;  // дальше палец тянет, а индикатор уже стоит на месте
const RESISTANCE = 0.5;  // «тяжесть» жеста: контент идёт медленнее пальца
const AXIS_LOCK  = 6;    // после стольких пикселей решаем, наш это жест или чужой

/**
 * @param scrollRef  ref на прокручиваемый контейнер
 * @param onRefresh  что вызвать по жесту (ре-фетч данных экрана)
 * @param enabled    выключатель: пока экран не готов, вешать слушатели не на что
 * @param resetKey   меняется — слушатели переезжают на новый элемент. Нужен там,
 *                   где контейнер пересоздаётся (слайды недель в календаре)
 */
export function usePullToRefresh(scrollRef, onRefresh, { enabled = true, resetKey = null } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // onRefresh пересоздаётся на каждом рендере — держим в ref, иначе слушатели
  // переподписывались бы прямо посреди начатого жеста
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const isRefreshingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) return;

    let startY = 0;
    let startX = 0;
    let tracking = false;   // палец опущен в верхней точке, жест ещё может стать нашим
    let locked = false;     // направление уже определено
    let pulling = false;    // жест наш: тянем вниз
    let distance = 0;

    const setOffset = (px, animated = false) => {
      el.style.transition = animated ? 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)' : '';
      // Пустая строка, а не translateY(0): transform создаёт containing block,
      // и на неподвижном контейнере он не нужен
      el.style.transform = px ? `translateY(${px}px)` : '';
    };

    const reset = (animated = true) => {
      tracking = false;
      locked = false;
      pulling = false;
      distance = 0;
      setOffset(0, animated);
      setPullDistance(0);
    };

    const onTouchStart = (e) => {
      if (isRefreshingRef.current || e.touches.length !== 1) return;
      if (el.scrollTop > 0) return;

      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
      locked = false;
      pulling = false;
      distance = 0;
    };

    const onTouchMove = (e) => {
      if (!tracking || isRefreshingRef.current) return;

      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!locked) {
        if (Math.abs(dy) < AXIS_LOCK && Math.abs(dx) < AXIS_LOCK) return;
        locked = true;
        // Вверх или вбок — жест не наш: отдаём его скроллу и свайпу недель
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { tracking = false; return; }
        pulling = true;
      }

      // Контейнер успели прокрутить (инерция после предыдущего свайпа) — выходим
      if (el.scrollTop > 0) { reset(false); return; }

      distance = Math.min(MAX_PULL, dy * RESISTANCE);

      // Гасим собственную прокрутку контейнера, пока тянем. Слушатель повешен
      // с passive: false — без этого preventDefault браузер бы проигнорировал.
      if (e.cancelable) e.preventDefault();

      setOffset(distance);
      setPullDistance(distance);
    };

    const onTouchEnd = async () => {
      if (!pulling) { tracking = false; locked = false; return; }

      if (distance < THRESHOLD) { reset(); return; }

      // Порог взят: подтягиваем индикатор на фиксированную высоту и ждём данные
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      setPullDistance(THRESHOLD);
      setOffset(THRESHOLD, true);

      try {
        await onRefreshRef.current?.();
      } catch (err) {
        console.error('Ошибка обновления по жесту:', err);
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        reset();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.style.transition = '';
      el.style.transform = '';
    };
  }, [enabled, resetKey, scrollRef]);

  return { pullDistance, isRefreshing, threshold: THRESHOLD };
}
