import React, { useId } from 'react';

// Разметка катка в метрах: площадка 60 × 30, как в правилах ИИХФ. Рисуется всегда
// целиком, а «половина» получается обрезкой viewBox — см. boardModel.
//
// Лёд намеренно остаётся светлым в обеих темах: тактический планшет читается как лист
// бумаги, а тёмный каток с белыми линиями превращается в негатив, где синие и красные
// линии перестают различаться.
const LINE_RED = '#d33a3a';
const LINE_BLUE = '#2f6fd0';
const BOARD = '#8d97a8';

const GOAL_LINE_X = 4;
const BLUE_LINE_X = 23;
const CIRCLE_R = 4.5;

// Круги вбрасывания: 7 м от линии ворот и 7 м от продольной оси
const FACEOFF_SPOTS = [
  [GOAL_LINE_X + 7, 8], [GOAL_LINE_X + 7, 22],
  [60 - GOAL_LINE_X - 7, 8], [60 - GOAL_LINE_X - 7, 22],
];

// Точки в средней зоне — 1,5 м от синих линий
const NEUTRAL_SPOTS = [
  [BLUE_LINE_X + 1.5, 8], [BLUE_LINE_X + 1.5, 22],
  [60 - BLUE_LINE_X - 1.5, 8], [60 - BLUE_LINE_X - 1.5, 22],
];

// Полукруг площади ворот радиусом 1,8 м, развёрнутый в сторону центра
const crease = (x, dir) =>
  `M ${x},${15 - 1.8} A 1.8,1.8 0 0 ${dir > 0 ? 1 : 0} ${x},${15 + 1.8}`;

// Усы: по два штриха сверху и снизу круга, снаружи, в 0,85 м от его оси
const HASH = 'M-0.85,-5.4 v0.9 M0.85,-5.4 v0.9 M-0.85,4.5 v0.9 M0.85,4.5 v0.9';

// Прицел у точки вбрасывания: четыре уголка, сходящиеся к точке и расходящиеся от неё
const SPOT = 'M-0.6,-0.6 H-1.7 M-0.6,-0.6 V-1.7 M0.6,-0.6 H1.7 M0.6,-0.6 V-1.7 '
           + 'M-0.6,0.6 H-1.7 M-0.6,0.6 V1.7 M0.6,0.6 H1.7 M0.6,0.6 V1.7';

// Логотип в центральном круге. Квадрат вписан в круг радиусом 4,5 м с запасом:
// у самой картинки есть поля, поэтому знак получается заметно меньше рамки.
const LOGO_BOX = { x: 26.2, y: 11.2, size: 7.6 };

export function RinkSvg() {
  // Идентификаторы фильтров и градиентов живут в общем пространстве документа,
  // а планшетов на экране может быть несколько — поэтому у каждого свои
  const uid = useId().replace(/:/g, '');
  const ref = (name) => `${name}-${uid}`;

  return (
    <g>
      <defs>
        {/* ── Фактура льда ──
            Рисуется фильтрами, а не картинкой: лишний файл ради фона планшета грузить
            незачем, а шум масштабируется под любой размер доски без потери резкости.
            Слои считаются один раз и дальше кэшируются браузером — их атрибуты
            неизменны, и React к ним не притрагивается на перерисовках сцены. */}
        <linearGradient id={ref('iceBase')} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#eaf1fa" />
          <stop offset="0.45" stopColor="#f8fbff" />
          <stop offset="1" stopColor="#e3ebf6" />
        </linearGradient>

        <radialGradient id={ref('iceSheen')} cx="0.42" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {/* Мелкое зерно: без него лёд выглядит пластиковым */}
        <filter id={ref('iceGrain')} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="13" numOctaves="4" seed="11" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.44
                                               0 0 0 0 0.52
                                               0 0 0 0 0.63
                                               0.4 0.4 0.4 0 -0.14" />
        </filter>

        {/* Следы коньков вдоль площадки и редкие поперечные */}
        <filter id={ref('iceScratch')} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.14 9" numOctaves="2" seed="5" />
          <feColorMatrix type="matrix" values="0 0 0 0 1
                                               0 0 0 0 1
                                               0 0 0 0 1
                                               1.1 1.1 1.1 0 -0.72" />
        </filter>

        <filter id={ref('iceCross')} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="7 0.2" numOctaves="2" seed="19" />
          <feColorMatrix type="matrix" values="0 0 0 0 1
                                               0 0 0 0 1
                                               0 0 0 0 1
                                               1 1 1 0 -0.74" />
        </filter>

        <clipPath id={ref('iceClip')}>
          <rect x="0" y="0" width="60" height="30" rx="8.5" />
        </clipPath>

        {/* ── Логотип ──
            Готового файла с прозрачным фоном нет, поэтому маску строим сами: инверсия
            цвета → яркость в альфу → заливка цветом разметки. Светлая подложка PNG
            инвертируется в тёмное и становится прозрачной, тёмный знак — наоборот.
            Так на льду остаётся только силуэт, без серого квадрата. */}
        <filter id={ref('logoInk')} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="-1 0 0 0 1
                     0 -1 0 0 1
                     0 0 -1 0 1
                     0 0 0 1 0"
            result="inverted"
          />
          <feColorMatrix in="inverted" type="luminanceToAlpha" result="shape" />
          <feComponentTransfer in="shape" result="shapeBoosted">
            <feFuncA type="gamma" exponent="1.3" />
          </feComponentTransfer>
          <feFlood floodColor={LINE_BLUE} result="ink" />
          <feComposite in="ink" in2="shapeBoosted" operator="in" />
        </filter>
      </defs>

      {/* Лёд. Рисуем по всей площадке, обрезку делает viewBox */}
      <g clipPath={`url(#${ref('iceClip')})`}>
        <rect x="0" y="0" width="60" height="30" fill={`url(#${ref('iceBase')})`} />
        <rect x="0" y="0" width="60" height="30" fill={`url(#${ref('iceSheen')})`} />
        <rect x="0" y="0" width="60" height="30" filter={`url(#${ref('iceScratch')})`} opacity="0.5" />
        <rect x="0" y="0" width="60" height="30" filter={`url(#${ref('iceCross')})`} opacity="0.3" />
        <rect x="0" y="0" width="60" height="30" filter={`url(#${ref('iceGrain')})`} opacity="0.4" />
      </g>

      {/* Разметка приглушена: она фон для упражнения, а не его содержание — фишки
          и траектории должны читаться первыми */}
      <g opacity="0.45">

      {/* Синие линии — толстые, как на настоящем катке */}
      <line x1={BLUE_LINE_X} y1="0" x2={BLUE_LINE_X} y2="30" stroke={LINE_BLUE} strokeWidth="0.3" />
      <line x1={60 - BLUE_LINE_X} y1="0" x2={60 - BLUE_LINE_X} y2="30" stroke={LINE_BLUE} strokeWidth="0.3" />

      {/* Центральная линия и круг вбрасывания в центре */}
      <line x1="30" y1="0" x2="30" y2="30" stroke={LINE_RED} strokeWidth="0.3" />
      <circle cx="30" cy="15" r={CIRCLE_R} fill="none" stroke={LINE_BLUE} strokeWidth="0.15" />
      <circle cx="30" cy="15" r="0.35" fill={LINE_BLUE} />

      {/* Линии ворот, площади ворот и сами ворота */}
      {[GOAL_LINE_X, 60 - GOAL_LINE_X].map((x, i) => {
        const dir = i === 0 ? 1 : -1;
        return (
          <g key={x}>
            <line x1={x} y1="1.6" x2={x} y2="28.4" stroke={LINE_RED} strokeWidth="0.15" />
            <path d={crease(x, dir)} fill="rgba(47,111,208,0.12)" stroke={LINE_BLUE} strokeWidth="0.12" />
            <rect
              x={dir > 0 ? x - 1.2 : x}
              y={15 - 0.92}
              width="1.2"
              height="1.84"
              fill="none"
              stroke={LINE_RED}
              strokeWidth="0.15"
            />
          </g>
        );
      })}

      {/* Круги вбрасывания в зонах: сам круг, усы снаружи и прицел у точки.
          У центрального круга ни усов, ни прицела нет — как и на настоящем катке. */}
      {FACEOFF_SPOTS.map(([cx, cy]) => (
        <g key={`f${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
          <circle cx="0" cy="0" r={CIRCLE_R} fill="none" stroke={LINE_RED} strokeWidth="0.15" />
          <path d={HASH} fill="none" stroke={LINE_RED} strokeWidth="0.15" />
          <path d={SPOT} fill="none" stroke={LINE_RED} strokeWidth="0.15" />
          <circle cx="0" cy="0" r="0.35" fill={LINE_RED} />
        </g>
      ))}

      {/* Точки вбрасывания в средней зоне */}
      {NEUTRAL_SPOTS.map(([cx, cy]) => (
        <circle key={`n${cx}-${cy}`} cx={cx} cy={cy} r="0.35" fill={LINE_RED} />
      ))}

      {/* Борта поверх всего: на обрезанных видах линии не должны выходить за край */}
      <rect
        x="0.1" y="0.1" width="59.8" height="29.8" rx="8.4"
        fill="none" stroke={BOARD} strokeWidth="0.25"
      />
      </g>

      {/* Логотип в центральном круге. На половине площадки круг разрезан краем вида,
          и знак режется вместе с ним — так и должно быть: это разметка центра катка,
          а не наклейка поверх планшета. Разворот на 90° гасит разворот катка на
          вертикаль — тот же приём, что у номеров на фишках. */}
      <g transform="rotate(90 30 15)" opacity="0.38">
        <image
          href="/logo.png"
          x={LOGO_BOX.x}
          y={LOGO_BOX.y}
          width={LOGO_BOX.size}
          height={LOGO_BOX.size}
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${ref('logoInk')})`}
        />
      </g>
    </g>
  );
}
