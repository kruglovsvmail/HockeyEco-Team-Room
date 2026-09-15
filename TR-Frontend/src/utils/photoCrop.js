// =============================================================================
// КАДРИРОВАНИЕ ФОТО В КВАДРАТНОЙ РАМКЕ
//
// Фото игроков и сотрудников везде показываются квадратом с object-fit: cover.
// Портретный кадр в квадрат по высоте не помещается, и браузер по умолчанию
// режет его поровну сверху и снизу (для 3:4 — по 12,5 % высоты фото). Лицо на
// портрете стоит выше центра, и при таком кадрировании часто срезается макушка.
//
// Геометрия: фото масштабируется по ширине, значит видна ровно «ширина» высоты,
// а не помещается 100 · (1 − ширина/высота) процентов высоты фото — для 3:4 это
// 25 %, для 2:3 — 33,3 %. Правило задаёт только, сколько процентов ВЫСОТЫ ФОТО
// срезать сверху; всё остальное, что не влезло, срезается снизу — само.
//
// Правила заданы диапазонами соотношения сторон (ширина / высота), а не точными
// значениями: 300×400, 319×400 и 333×400 — это одно и то же «портрет, сверху
// 20 px из 400», и держать на каждый размер по строке незачем. Новый диапазон —
// одна строка в PHOTO_CROP_RULES; в dev-сборке пересечения диапазонов
// подсвечиваются в консоли.
//
// Работает глобально: один слушатель load на document ловит каждую картинку,
// у которой object-fit: cover, и выставляет ей object-position. Места, где
// рисуется <img>, править не нужно. Картинки с явно заданным выравниванием
// (например, object-top в эфирной графике) не трогаются.
//
// Один и тот же файл лежит в TR, LMS и ТФХ — как и остальные общие утилиты.
// =============================================================================

export const PHOTO_CROP_RULES = [
  // ширина/высота: от minRatio (включительно) до maxRatio (не включительно);
  // top — сколько процентов высоты фото срезать сверху.
  { label: 'узкие портреты, уже 7:10 (например, 2:3)', minRatio: 0,    maxRatio: 0.70, top: 10 },
  { label: 'портреты от 7:10 до 5:6 (3:4, 4:5 и т.п.)', minRatio: 0.70, maxRatio: 0.85, top: 5  },
  // Почти квадрат (шире 5:6), квадрат и альбомные кадры — правила нет:
  // браузер кадрирует по центру, как и раньше.
];

// Метка на картинке, которую кадрировали мы: чужое выравнивание не трогаем,
// своё пересчитываем при смене src.
const OWN_MARK = 'photoCrop';
const DEFAULT_POSITION = '50% 50%';

/**
 * object-position для фото с такими сторонами, либо null — если правила нет
 * (квадрат, альбомный кадр, соотношение вне диапазонов).
 *
 * Пример: 3:4 → не помещается 25 % высоты, сверху по правилу 5 %, снизу остаток
 * 20 % → object-position «50% 20%». 2:3 → 33,3 %, сверху 10 % → «50% 30%».
 */
export function getPhotoObjectPosition(width, height) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (ratio >= 1) return null; // квадрат и альбомные — по высоте резать нечего

  const rule = PHOTO_CROP_RULES.find(r => ratio >= r.minRatio && ratio < r.maxRatio);
  if (!rule) return null;

  // Не помещается в квадрат (в % высоты фото). Сверху — по правилу, но не больше,
  // чем не влезло; остаток уходит вниз. Браузер делит срезаемое между верхом и
  // низом в пропорции object-position: Y = top / overflow.
  const overflow = (1 - ratio) * 100;
  const top = Math.min(rule.top, overflow);
  const y = (top / overflow) * 100;
  return `50% ${Number(y.toFixed(2))}%`;
}

function applyCrop(img) {
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.naturalWidth || !img.naturalHeight) return;

  const computed = getComputedStyle(img);
  if (computed.objectFit !== 'cover') return;

  // Выравнивание задано классом или стилем не нами — оставляем как есть.
  const isOurs = img.dataset[OWN_MARK] === '1';
  if (!isOurs && computed.objectPosition !== DEFAULT_POSITION) return;

  const position = getPhotoObjectPosition(img.naturalWidth, img.naturalHeight);
  if (position) {
    img.style.objectPosition = position;
    img.dataset[OWN_MARK] = '1';
  } else if (isOurs) {
    // Тот же <img> получил другой файл, для которого правила нет, — возвращаем дефолт.
    img.style.objectPosition = '';
    delete img.dataset[OWN_MARK];
  }
}

// Диапазоны не должны пересекаться и обязаны идти от меньшего к большему —
// иначе часть фото попадёт не в то правило, а find() молча возьмёт первое.
function checkRules() {
  PHOTO_CROP_RULES.forEach((rule, i) => {
    if (!(rule.minRatio < rule.maxRatio) || rule.top < 0) {
      console.warn(`[photoCrop] Правило «${rule.label}»: диапазон или top заданы неверно.`);
    }
    const next = PHOTO_CROP_RULES[i + 1];
    if (next && next.minRatio < rule.maxRatio) {
      console.warn(`[photoCrop] Правила «${rule.label}» и «${next.label}» пересекаются по диапазону.`);
    }
  });
}

// load не всплывает — ловим на фазе перехвата, это единственный способ поймать
// его одним слушателем на все картинки, включая те, что появятся позже.
if (typeof document !== 'undefined') {
  document.addEventListener('load', (e) => applyCrop(e.target), true);
  // Картинки, успевшие загрузиться до подключения модуля.
  document.querySelectorAll('img').forEach(img => { if (img.complete) applyCrop(img); });
  if (import.meta.env?.DEV) checkRules();
}
