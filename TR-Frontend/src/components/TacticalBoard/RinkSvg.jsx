import React from 'react';

// Разметка катка в метрах: площадка 60 × 30, как в правилах ИИХФ. Рисуется всегда
// целиком, а «половина» и «зона» получаются обрезкой viewBox — см. boardModel.
//
// Лёд намеренно остаётся светлым в обеих темах: тактическая доска читается как лист
// бумаги, а тёмный каток с белыми линиями превращается в негатив, где синие и красные
// линии перестают различаться.
const ICE = '#f4f7fb';
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

export function RinkSvg({ rinkType = 'full' }) {
  return (
    <g>
      {/* Лёд. Рисуем по всей площадке, обрезку делает viewBox */}
      <rect x="0" y="0" width="60" height="30" rx="8.5" fill={ICE} />

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

      {/* Круги вбрасывания в зонах */}
      {FACEOFF_SPOTS.map(([cx, cy]) => (
        <g key={`f${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={CIRCLE_R} fill="none" stroke={LINE_RED} strokeWidth="0.15" />
          <circle cx={cx} cy={cy} r="0.35" fill={LINE_RED} />
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
    </g>
  );
}
