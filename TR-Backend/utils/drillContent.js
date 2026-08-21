// Содержимое упражнения — название, описание и планшет.
//
// Живёт отдельно от контроллеров, потому что мест, где такое содержимое приходит от
// клиента, теперь два: библиотека Тренерской и разовое упражнение в плане
// тренировки. Проверка у них обязана быть одна — иначе разовое упражнение оказалось бы
// свободнее библиотечного и в план проехало бы то, что в библиотеку не пустили.

const RINK_TYPES = ['full', 'top', 'bottom'];

// Названия площадок сменились вместе с разворотом катка на вертикаль. Старые значения
// принимаем и переводим на месте: упражнение не должно ломаться из-за переименования.
const LEGACY_RINK_TYPES = { half: 'top', zone: 'top' };

// Пустая сцена для упражнения, у которого включили доску, но ещё ничего не расставили.
// Кадр всегда есть хотя бы один — на нём стоит вся отрисовка и проигрывание.
const EMPTY_BOARD = { objects: [], frames: [{ id: 'f1', note: '', positions: {}, shapes: [] }] };

/**
 * Приводит присланные клиентом поля к тому, что можно писать в БД.
 * Возвращает { error } при некорректных данных — вызывающий сам решает, как ответить.
 */
export const normalizeDrillInput = (body) => {
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Название упражнения обязательно' };
  if (name.length > 255) return { error: 'Название слишком длинное' };

  const description = body?.description ? String(body.description).trim() : null;

  // Планшет есть у упражнения всегда: в него можно зайти и сохранить схему, даже если
  // показывать её в упражнении тренер не собирается. За показ отвечает отдельный флаг
  // board_enabled — иначе выключение планшета стирало бы нарисованное.
  let rinkType = body?.rink_type || 'full';
  rinkType = LEGACY_RINK_TYPES[rinkType] || rinkType;
  if (!RINK_TYPES.includes(rinkType)) {
    return { error: 'Некорректный тип площадки' };
  }

  let boardJson = body?.board_json && typeof body.board_json === 'object' ? body.board_json : EMPTY_BOARD;
  if (!Array.isArray(boardJson.frames) || boardJson.frames.length === 0) {
    boardJson = { ...boardJson, frames: EMPTY_BOARD.frames };
  }
  if (!Array.isArray(boardJson.objects)) {
    boardJson = { ...boardJson, objects: [] };
  }

  const boardEnabled = body?.board_enabled !== false;

  // Теги свободные, но храним их нормализованными: обрезанными, без пустых и дублей.
  const rawTags = Array.isArray(body?.tags) ? body.tags : [];
  const tags = [...new Set(
    rawTags.map(t => String(t).trim()).filter(t => t.length > 0 && t.length <= 40)
  )].slice(0, 20);

  return { name, description, rinkType, boardJson, boardEnabled, tags };
};
