// Шаблон картинки состава — матч и тренировка. Собирается на сервере: Satori
// раскладывает карточку и отдаёт SVG (весь текст — кривыми, системные шрифты
// не нужны), resvg растрирует SVG, sharp жмёт в JPEG.
//
// Раньше картинку снимал телефон того, кто сохранил состав (html-to-image), и на
// iPhone в ней пропадали фото и рисовались серые полосы вместо теней. Здесь браузера
// нет: картинка одна и та же, с какого бы устройства ни сохраняли, и всегда в
// светлой теме — цвета ниже зашиты из светлой темы TR (TR-Frontend/src/assets/global.css).
//
// Вёрстка повторяет прежние карточки (MatchLinesShareCard / TrainingLinesShareCard):
// шапка на всю ширину, под ней блоки в две колонки. Меняешь вид — подними
// TEMPLATE_VERSION, иначе уже собранные картинки так и останутся старыми.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// Satori и resvg (родной модуль) подгружаются при первой сборке, а не при старте:
// не загрузись они на сервере — сломаются только картинки состава, а не весь бэкенд
let renderers = null;
const getRenderers = () => {
  renderers ||= Promise.all([import('satori'), import('@resvg/resvg-js')])
    .then(([satoriModule, resvgModule]) => ({ satori: satoriModule.default, Resvg: resvgModule.Resvg }))
    .catch((err) => { renderers = null; throw err; });
  return renderers;
};

export const TEMPLATE_VERSION = 1;

// Масштаб растра: карточка свёрстана в CSS-пикселях, картинка выходит в SCALE раз
// крупнее. Матч 600 → 1800 px по ширине: фото в слоте 58 px получает 174 px —
// при увеличении пальцем лица не рассыпаются на квадраты.
const SCALE = 3;
const JPEG = { quality: 84, chromaSubsampling: '4:4:4', optimiseCoding: true };

// Фото в слоте: рамка 60 px с границей 1 px, внутри 58
const BOX = 60;
const PHOTO = BOX - 2;
export const PHOTO_PX = PHOTO * SCALE;

export const BRAND = '#1794dd';

// Светлая тема TR
const C = {
  base: '#f3f4f6',
  level1: '#ffffff',
  level2: '#e5e7eb',
  level3: '#e7e7e7',
  border: '#e2e4e7',
  main: '#1f2937',
  muted: '#6b7280',
};

// Manrope в приложении вариативный, а Satori умеет только статические начертания —
// они вырезаны из того же файла (500, 700, 800; «font-black» в браузере тоже 800)
const FONTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
const FONTS = [
  { weight: 500, file: 'Manrope-Medium.ttf' },
  { weight: 700, file: 'Manrope-Bold.ttf' },
  { weight: 800, file: 'Manrope-ExtraBold.ttf' },
].map(({ weight, file }) => ({
  name: 'Manrope', weight, style: 'normal', data: fs.readFileSync(path.join(FONTS_DIR, file)),
}));

// Ширина букв (в долях кегля) — чтобы длинная фамилия ужалась, а не налезла на соседа
const GLYPH_WIDTHS = JSON.parse(fs.readFileSync(path.join(FONTS_DIR, 'manrope-widths.json'), 'utf8'));

const textWidth = (text, size, weight) => {
  const table = GLYPH_WIDTHS[weight] || GLYPH_WIDTHS[700];
  let em = 0;
  for (const ch of text) em += table[ch] ?? 0.62;
  return em * size;
};

const fitFontSize = (text, size, minSize, maxWidth, weight) => {
  const width = textWidth(text, size, weight);
  if (width <= maxWidth) return size;
  return Math.max(minSize, Math.floor((size * maxWidth / width) * 10) / 10);
};

// Белый или тёмный текст поверх цвета (буква капитана на цветном кружке)
const luminance = (hex) => {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const textOn = (hex) => (luminance(hex) > 0.45 ? '#111827' : '#ffffff');

// Цвет команды как акцент. Не цвет или слишком светлый для белой карточки
// (белый, бледно-жёлтый) — синий бренд TR, иначе «МАТЧ» и время пропали бы.
export const pickAccent = (color) => {
  if (typeof color !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) return BRAND;
  const hex = color.trim();
  const contrastOnWhite = 1.05 / (luminance(hex) + 0.05);
  return contrastOnWhite < 1.6 ? BRAND : hex;
};

// ── Тени ────────────────────────────────────────────────────────────────────
// box-shadow у Satori — это SVG-фильтры размытия, а растеризация полусотни таких
// фильтров на тройном масштабе стоит секунды. Поэтому тень рисуем сами: размытый
// силуэт скруглённого прямоугольника один раз готовит sharp, режет на куски
// (углы и края), и куски подкладываются под элемент картинками — края тянутся
// на любую длину. Картинки растеризатору почти ничего не стоят.
// Слои — те же, что у теней приложения (--shadow-sm/md/lg в global.css).
const SHADOWS = {
  sm: [{ y: 1, blur: 2, spread: 0, alpha: 0.05 }],
  md: [{ y: 4, blur: 6, spread: -1, alpha: 0.05 }, { y: 2, blur: 4, spread: -1, alpha: 0.06 }],
  lg: [{ y: 10, blur: 15, spread: -3, alpha: 0.1 }, { y: 4, blur: 6, spread: -2, alpha: 0.05 }],
};

const toDataUri = (png) => `data:image/png;base64,${png.toString('base64')}`;

// Силуэт с тенью: прямоугольник core×core со скруглением radius, вокруг поле pad
async function renderShadowSprite(layers, radius, core) {
  // Гауссово размытие тает примерно за полтора радиуса размытия
  const pad = Math.ceil(Math.max(...layers.map(l => l.blur * 1.5 + Math.abs(l.y) + Math.max(0, l.spread))));
  const px = (core + 2 * pad) * SCALE;
  const blurred = await Promise.all(layers.map(async (l) => {
    const side = core + 2 * l.spread;
    const at = pad - l.spread;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}">`
      + `<rect x="${at * SCALE}" y="${(at + l.y) * SCALE}" width="${side * SCALE}" height="${side * SCALE}" `
      + `rx="${Math.max(0, radius + l.spread) * SCALE}" fill="#000"/></svg>`;
    // Размываем непрозрачный силуэт и только потом гасим до нужной прозрачности —
    // так у плавного спада больше ступенек, чем у заранее бледного
    return sharp(Buffer.from(svg))
      .blur(Math.max(0.3, (l.blur / 2) * SCALE))
      .linear([1, 1, 1, l.alpha], [0, 0, 0, 0])
      .png()
      .toBuffer();
  }));
  const sprite = await sharp({ create: { width: px, height: px, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(blurred.map(input => ({ input })))
    .png()
    .toBuffer();
  return { sprite, pad };
}

// Куски для элемента любого размера (карточки, плашки позиций)
async function buildStretchShadow(name, radius) {
  const core = 2 * radius + 1;
  const { sprite, pad } = await renderShadowSprite(SHADOWS[name], radius, core);
  const k = (pad + radius) * SCALE;
  const m = SCALE;
  const cut = async (left, top, width, height) =>
    toDataUri(await sharp(sprite).extract({ left, top, width, height }).png().toBuffer());
  // Середина целиком лежит под самим элементом и не видна — её не режем
  const [tl, t, tr, l, r, bl, b, br] = await Promise.all([
    cut(0, 0, k, k), cut(k, 0, m, k), cut(k + m, 0, k, k),
    cut(0, k, k, m), cut(k + m, k, k, m),
    cut(0, k + m, k, k), cut(k, k + m, m, k), cut(k + m, k + m, k, k),
  ]);
  return { pad, corner: pad + radius, tl, t, tr, l, r, bl, b, br };
}

// Целый спрайт для элемента постоянного размера (рамка фото, кружок нашивки)
async function buildFixedShadow(name, radius, size) {
  const { sprite, pad } = await renderShadowSprite(SHADOWS[name], radius, size);
  return { pad, size, uri: toDataUri(sprite) };
}

// Тени готовятся один раз на процесс и дальше только переиспользуются
let shadowKit = null;
const getShadowKit = () => {
  shadowKit ||= (async () => {
    const [card, pill, box, badge] = await Promise.all([
      buildStretchShadow('md', 16),
      buildStretchShadow('sm', 6),
      buildFixedShadow('lg', 16, BOX),
      buildFixedShadow('sm', 10, 20),
    ]);
    return { card, pill, box, badge };
  })().catch((err) => { shadowKit = null; throw err; });
  return shadowKit;
};

// ── Элементы Satori ─────────────────────────────────────────────────────────
// У Satori у любого div, где больше одного ребёнка, обязателен display: flex —
// поэтому он стоит у всех по умолчанию.
const clean = (children) => children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false && c !== '');
const div = (style, ...children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children: clean(children) } });
const text = (value, style) => div(style, String(value));
const img = (src, width, height, style = {}) => ({ type: 'img', props: { src, width, height, style: { width, height, ...style } } });

// Тень под элементом: обёртка без фона, в ней сначала тень, потом сам элемент.
// Тень обязана быть отдельным соседом, а не ребёнком элемента — иначе она легла
// бы поверх его фона. Оба positioned — тогда рисуются строго по порядку.
// Куски — обычные картинки, а не фоны: фон Satori выводит SVG-узором, и сотня
// узоров растрируется в разы дольше сотни картинок.

// Растягивается только картинка размером «100%» внутри обёртки с координатами:
// у самой картинки Satori пары left/right (top/bottom) не понимает и рисует её
// в родном размере — края тени пропадали бы, оставались одни углы.
const part = (src, place) => div({ position: 'absolute', ...place },
  { type: 'img', props: { src, style: { width: '100%', height: '100%' } } });

const stretchShadow = (s) => {
  const k = s.corner;
  return div({ position: 'absolute', left: -s.pad, top: -s.pad, right: -s.pad, bottom: -s.pad },
    part(s.tl, { left: 0, top: 0, width: k, height: k }),
    part(s.t, { left: k, right: k, top: 0, height: k }),
    part(s.tr, { right: 0, top: 0, width: k, height: k }),
    part(s.l, { left: 0, top: k, bottom: k, width: k }),
    part(s.r, { right: 0, top: k, bottom: k, width: k }),
    part(s.bl, { left: 0, bottom: 0, width: k, height: k }),
    part(s.b, { left: k, right: k, bottom: 0, height: k }),
    part(s.br, { right: 0, bottom: 0, width: k, height: k }),
  );
};

const fixedShadow = (s) => img(s.uri, s.size + 2 * s.pad, s.size + 2 * s.pad, { position: 'absolute', left: -s.pad, top: -s.pad });

const ICONS = {
  calendar: [
    { type: 'rect', props: { x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 } },
    { type: 'line', props: { x1: 16, y1: 2, x2: 16, y2: 6 } },
    { type: 'line', props: { x1: 8, y1: 2, x2: 8, y2: 6 } },
    { type: 'line', props: { x1: 3, y1: 10, x2: 21, y2: 10 } },
  ],
  location_pin: [
    { type: 'path', props: { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' } },
    { type: 'circle', props: { cx: 12, cy: 10, r: 3 } },
  ],
};

// Иконки те же, что в приложении (ui/Icon.jsx): обводка 1.5, скруглённые концы
const icon = (name, color) => ({
  type: 'svg',
  props: {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: color,
    strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flexShrink: 0 },
    children: ICONS[name],
  },
});

const ellipsis = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };

// ── Слот игрока / пустой позиции ────────────────────────────────────────────
const SLOT_W = 84;
// Имя может выйти за слот на 4 px с каждой стороны: между слотами минимум 12 px
const NAME_W = SLOT_W + 8;

// Ширина карточки. Колонка обязана вместить три слота с зазорами (3·84 + 2·12 = 276)
// плюс поля блока (2·12): у матча это ровно 652 — поля 2·20, зазор колонок 12.
// В браузере прежняя карточка была 600, и слоты там молча сжимались до ~75 px.
// Тренировке шире: в режиме групп у вратарей и групп свои ряды.
export const MATCH_WIDTH = 652;
export const TRAINING_WIDTH = 760;

const initialsOf = (player) => `${(player.last || '').charAt(0)}${(player.first || '').charAt(0)}`.toUpperCase() || '?';

function slot({ label, player }, ctx) {
  if (!player) {
    return div({ flexDirection: 'column', alignItems: 'center', width: SLOT_W, flexShrink: 0 },
      div({
        width: BOX, height: BOX, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.base, border: `1px dashed ${C.muted}`,
      },
        text(label, { fontSize: 14, fontWeight: 800, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase' }),
      ),
      div({ marginTop: 12, height: 32 }),
    );
  }

  const photo = player.photo ? ctx.photos.get(player.photo) : null;
  const last = player.last || '';
  const first = player.first || '';
  const { kit } = ctx;

  return div({ flexDirection: 'column', alignItems: 'center', width: SLOT_W, flexShrink: 0 },
    div({ position: 'relative', width: BOX, height: BOX },
      fixedShadow(kit.box),
      div({
        position: 'relative', width: BOX, height: BOX, borderRadius: 16,
        backgroundColor: C.level3, border: `1px solid ${C.border}`,
      },
        photo
          ? img(photo, PHOTO, PHOTO, { borderRadius: 15, objectFit: 'cover' })
          : div({ width: PHOTO, height: PHOTO, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.level3 },
              text(initialsOf(player), { fontSize: 16, fontWeight: 800, color: ctx.accent })),
      ),

      player.letter && div({ position: 'absolute', top: -6, right: -6, width: 20, height: 20 },
        fixedShadow(kit.badge),
        div({
          position: 'relative', width: 20, height: 20, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center', backgroundColor: ctx.accent,
        },
          text(player.letter, { fontSize: 10, fontWeight: 800, color: textOn(ctx.accent), lineHeight: 1 }))),

      div({ position: 'absolute', left: 0, right: 0, bottom: -8, justifyContent: 'center' },
        div({ position: 'relative' },
          stretchShadow(kit.pill),
          div({ position: 'relative', backgroundColor: C.level2, borderRadius: 6, padding: '2px 6px', border: `1px solid ${C.border}` },
            text(label, { fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1 })))),
    ),

    div({ marginTop: 12, height: 32, flexDirection: 'column', alignItems: 'center', width: SLOT_W },
      nameLine(last, 12, 8, 700, C.main, 15),
      nameLine(first, 10, 8, 500, C.muted, 13),
    ),
  );
}

// Строка имени: длинное ужимается кеглем, высота строки при этом постоянная, чтобы
// фамилии в ряду стояли на одной линии. Не влезло и в минимальном кегле — режется
// многоточием, и тогда выравнивание по левому краю: по центру Satori срезал бы начало.
function nameLine(value, size, minSize, weight, color, height) {
  const fontSize = fitFontSize(value, size, minSize, NAME_W, weight);
  const fits = textWidth(value, fontSize, weight) <= NAME_W;
  return div({ width: NAME_W, height, alignItems: 'center', justifyContent: 'center' },
    text(value, {
      maxWidth: NAME_W, textAlign: fits ? 'center' : 'left', ...ellipsis,
      fontSize, fontWeight: weight, color, lineHeight: 1,
    }));
}

// Белая карточка с тенью — звено, группа, вратари и шапка
const card = (ctx, wrapStyle, style, ...children) => div({ position: 'relative', ...wrapStyle },
  stretchShadow(ctx.kit.card),
  div({ position: 'relative', flexGrow: 1, minWidth: 0, backgroundColor: C.level1, borderRadius: 16, ...style }, ...children),
);

// ── Блок (звено, группа, вратари) ───────────────────────────────────────────
function blockCard(block, ctx) {
  return card(ctx, { flexGrow: 1, flexBasis: 0, minWidth: 0 }, { flexDirection: 'column', padding: 12 },
    div({
      alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${C.border}`, paddingBottom: 8, paddingLeft: 8, paddingRight: 4, marginBottom: 16,
    },
      text(block.title, { fontSize: 14, fontWeight: 700, color: C.muted, letterSpacing: 0.7, textTransform: 'uppercase', lineHeight: 1.5 }),
      block.jersey && div({ alignItems: 'center', gap: 6, flexShrink: 0 },
        block.jersey.plural && text(block.jersey.plural, { fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase' }),
        div({ width: 16, height: 16, borderRadius: 8, border: `1px solid ${C.border}`, backgroundColor: block.jersey.hex })),
    ),
    div({ flexDirection: 'column', alignItems: 'center' },
      block.rows.map((row, i) => div({ justifyContent: 'center', gap: row.gap, marginTop: i > 0 ? (row.marginTop ?? 20) : 0 },
        row.slots.map(s => slot(s, ctx)))),
    ),
  );
}

// Две колонки: блоки парами в ряд, ширина колонок одинаковая; у нечётного
// последнего — пустая пара справа, чтобы он не растянулся на всю ширину
function grid(cards, alignItems) {
  const rows = [];
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(div({ gap: 12, alignItems }, cards[i], cards[i + 1] || div({ flexGrow: 1, flexBasis: 0 })));
  }
  return div({ flexDirection: 'column', gap: 12 }, rows);
}

// ── Шапка ───────────────────────────────────────────────────────────────────
function header(model, ctx) {
  return card(ctx, {}, { alignItems: 'flex-start', justifyContent: 'space-between', padding: 16 },
    div({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0 },
      text(model.title, { fontSize: 36, fontWeight: 800, color: ctx.accent, textTransform: 'uppercase', lineHeight: 1 }),
      model.subtitle && text(model.subtitle, {
        marginTop: 8, fontSize: 16, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
        letterSpacing: 0.4, lineHeight: 1.5, ...ellipsis,
      }),
    ),
    div({ flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingLeft: 12, flexShrink: 1, maxWidth: '64%' },
      model.date && div({ alignItems: 'center', gap: 8 },
        text(model.date, { fontSize: 16, fontWeight: 700, color: C.main, lineHeight: 1 }),
        icon('calendar', C.main)),
      (model.arena || model.time) && div({ alignItems: 'center', maxWidth: '100%' },
        // Длинное название арены режется многоточием, время после него — никогда
        model.arena && text(model.arena, { flexShrink: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: ctx.accent, lineHeight: 1.2, ...ellipsis }),
        model.time && text(model.arena ? `· ${model.time}` : model.time, {
          flexShrink: 0, marginLeft: model.arena ? 5 : 0, fontSize: 16, fontWeight: 700, color: ctx.accent, lineHeight: 1.2,
        }),
        div({ marginLeft: 8, flexShrink: 0 }, icon('location_pin', ctx.accent))),
      model.jersey && text(`Форма: ${model.jersey}`, { marginTop: 2, fontSize: 14, fontWeight: 500, color: C.muted, lineHeight: 1 }),
    ),
  );
}

/**
 * Разметка карточки в SVG.
 * model  — см. buildMatchModel / buildTrainingModel в formationImageService.js
 * photos — Map: путь фото → data URI (нет или null — рисуются инициалы)
 */
export async function buildFormationSvg(model, photos) {
  const ctx = { accent: model.accent, photos, kit: await getShadowKit() };
  const tree = div({
    width: model.width, flexDirection: 'column', gap: 16, padding: 20,
    backgroundColor: C.base, fontFamily: 'Manrope', color: C.main,
  },
    header(model, ctx),
    grid(model.blocks.map(b => blockCard(b, ctx)), model.stretchRows ? 'stretch' : 'flex-start'),
  );

  const { satori } = await getRenderers();
  return satori(tree, { width: model.width, fonts: FONTS });
}

export async function renderFormationJpeg(model, photos) {
  const svg = await buildFormationSvg(model, photos);
  const { Resvg } = await getRenderers();
  // Системные шрифты resvg не нужны: весь текст Satori уже превратил в кривые
  const raster = new Resvg(svg, { fitTo: { mode: 'zoom', value: SCALE }, font: { loadSystemFonts: false } }).render();
  return sharp(Buffer.from(raster.pixels), { raw: { width: raster.width, height: raster.height, channels: 4 } })
    .flatten({ background: C.base })
    .jpeg(JPEG)
    .toBuffer();
}
