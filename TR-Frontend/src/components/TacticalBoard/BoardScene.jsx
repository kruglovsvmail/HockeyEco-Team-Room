import React, { useId } from 'react';
import { RinkSvg } from './RinkSvg';
import {
  outerViewBox,
  RINK_ROTATION,
  percentToRink,
  pointsToPath,
  playerStyle,
  PUCK_REACH_M,
} from './boardModel';

// Отрисовка сцены на катке: фишки в заданных позициях плюс линии текущего кадра.
// Один и тот же компонент обслуживает редактор, проигрыватель и миниатюру в плане —
// разница только в том, кто передаёт позиции: перетаскивание, анимация или кадр как есть.
//
// Цвета игроков живут в модели рядом со списком типов (PLAYER_TYPES): их знает и площадка,
// и чип в интерфейсе, и разъезжаться этим двум нельзя.

const CONE_FILL = '#f2a13b';
const PUCK_FILL = '#111418';

// Выделение и ареол — оранжевый бренда. Он не совпадает ни с одной командой,
// поэтому обводка читается и на зелёной фишке, и на красной.
const SELECT_ACCENT = '#0c7ee8';

const SHAPE_COLOR = '#1f2b3d';
const SHAPE_WIDTH = 0.28;

// Толщина и штрих у каждого вида линии — это стандартная тренерская нотация:
// пас пунктиром, бросок жирным, катание сплошным, ведение волной (см. pointsToPath).
const SHAPE_STYLE = {
  skate: { dash: null,        width: SHAPE_WIDTH },
  pass:  { dash: '1.1 0.8',   width: SHAPE_WIDTH },
  shot:  { dash: null,        width: SHAPE_WIDTH * 1.9 },
  carry: { dash: null,        width: SHAPE_WIDTH },
};

const PLAYER_R = 1.05;

// Каток развёрнут на вертикаль целиком, вместе с содержимым. Номера на фишках и конусы
// от этого легли бы набок, поэтому их разворачиваем обратно вокруг собственного центра.
const UPRIGHT_DEG = 90;

/**
 * Фишка вне катка — для выпадалки и любых списков в интерфейсе. Рисуется теми же
 * цветами и формами, что и на площадке: тренер должен узнавать её без подписи.
 */
export function ObjectChip({ type, label, size = 30 }) {
  const player = playerStyle(type);

  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'block', flexShrink: 0 }}>
      {type === 'puck' && <circle cx="5" cy="5" r="2.2" fill={PUCK_FILL} />}

      {type === 'cone' && (
        <polygon points="5,0.9 9.2,8.6 0.8,8.6" fill={CONE_FILL} stroke="#b0741f" strokeWidth="0.5" />
      )}

      {player && (
        <circle cx="5" cy="5" r="4.4" fill={player.fill} stroke={player.stroke} strokeWidth="0.6" />
      )}

      {/* У конуса метка мельче и ниже центра: вверху треугольник слишком узкий */}
      {label && type !== 'puck' && (
        <text
          x="5" y={type === 'cone' ? 6.6 : 5}
          textAnchor="middle" dominantBaseline="central"
          fontSize={type === 'cone' ? 3.2 : 5} fontWeight="800"
          fill={player ? player.ink : '#5a3a0c'}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

function BoardObject({ obj, pos, rinkType, isSelected, upright }) {
  const [cx, cy] = percentToRink(rinkType, pos[0], pos[1]);
  const player = playerStyle(obj.type);

  // Фишки не ловят события сами: выбор считает планшет, по расстоянию до центров.
  // Иначе в куче побеждала бы верхняя по порядку отрисовки, а не ближайшая к пальцу.
  const common = { style: { pointerEvents: 'none' } };

  // Ареол выделенной фишки — это не украшение, а зона, в которой шайба считается её:
  // именно по нему система решает, кто владеет шайбой, и какие действия ей доступны.
  const showHalo = isSelected && !!player;

  return (
    <g {...common}>
      {showHalo && (
        <circle
          cx={cx} cy={cy} r={PUCK_REACH_M}
          fill={`${SELECT_ACCENT}14`} stroke={SELECT_ACCENT} strokeWidth="0.12" strokeDasharray="0.7 0.5"
        />
      )}

      {/* Подсветка выбранной фишки — рисуется под ней, чтобы не глушить номер */}
      {isSelected && (
        <circle cx={cx} cy={cy} r={PLAYER_R + 0.5} fill="none" stroke={SELECT_ACCENT} strokeWidth="0.22" />
      )}

      {obj.type === 'puck' && <circle cx={cx} cy={cy} r="0.45" fill={PUCK_FILL} />}

      {obj.type === 'cone' && (
        <polygon
          points={
            `${cx},${cy - PLAYER_R * 1.05} ` +
            `${cx + PLAYER_R * 1.05},${cy + PLAYER_R * 0.8} ` +
            `${cx - PLAYER_R * 1.05},${cy + PLAYER_R * 0.8}`
          }
          fill={CONE_FILL}
          stroke="#b0741f"
          strokeWidth="0.14"
          transform={upright ? `rotate(${UPRIGHT_DEG} ${cx} ${cy})` : undefined}
        />
      )}

      {player && (
        <circle
          cx={cx} cy={cy} r={PLAYER_R}
          fill={player.fill}
          stroke={player.stroke}
          strokeWidth="0.18"
        />
      )}

      {/* У конуса метка мельче и смещена вниз: вверху треугольник слишком узкий.
          Смещение переживает разворот катка — обе поворота гасят друг друга вокруг
          центра фишки, и на экране подпись остаётся строго под её вершиной. */}
      {obj.label && obj.type !== 'puck' && (
        <text
          x={cx} y={obj.type === 'cone' ? cy + PLAYER_R * 0.34 : cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={obj.type === 'cone' ? 0.78 : 1.15}
          fontWeight="800"
          fill={player ? player.ink : '#5a3a0c'}
          transform={upright ? `rotate(${UPRIGHT_DEG} ${cx} ${cy})` : undefined}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {obj.label}
        </text>
      )}

    </g>
  );
}

export function BoardScene({
  rinkType = 'full',
  scene,
  positions,
  // Слои линий: [{ key, shapes, opacity }]. Их несколько только во время перехода
  // между кадрами — тогда стрелки прошлого кадра гаснут, пока проявляются новые.
  shapeLayers = [],
  selectedId = null,
  onSurfacePointerDown = null,
  svgRef = null,
  className = '',
  // Забирать ли жест у страницы. Пока на планшете ничего не выбрано, касание уходит
  // странице — иначе по планшету невозможно проскроллить экран. Как только фишка
  // выделена, планшет переходит в рабочий режим и жест забирает себе.
  lockTouch = false,
  children,
}) {
  const vb = outerViewBox(rinkType);
  // Маркеры стрелок обязаны быть уникальными: на странице плана одновременно живёт
  // несколько досок, и общий id склеил бы их определения между собой.
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ touchAction: lockTouch ? 'none' : 'pan-y', display: 'block', width: '100%', height: '100%' }}
      onPointerDown={onSurfacePointerDown}
    >
      <defs>
        <marker
          id={`arrow-${uid}`}
          viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="4" markerHeight="4" orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill={SHAPE_COLOR} />
        </marker>
      </defs>

      {/* Разворот на вертикаль. Ref стоит именно на этой группе: getScreenCTM берёт
          матрицу вместе с её собственным transform, поэтому перевод касания в
          координаты катка работает без единой поправки на поворот. */}
      <g ref={svgRef} transform={RINK_ROTATION}>

      <RinkSvg />

      {/* Линии кадра. Стрелки принадлежат конкретному моменту упражнения, а не всей
          сцене, поэтому при переходе один слой гаснет, а следующий проявляется. */}
      {shapeLayers.map(layer => (
        <g key={layer.key} opacity={layer.opacity}>
          {(layer.shapes || []).map(shape => {
            const style = SHAPE_STYLE[shape.kind] || SHAPE_STYLE.skate;
            // Привязанная линия — это траектория фишки, а не пояснение. Отмечаем её
            // конец кружком: тренер сразу видит, куда фишка приедет к следующему кадру.
            const end = shape.objIds?.length > 0 && shape.points?.length >= 2
              ? percentToRink(rinkType, ...shape.points[shape.points.length - 1])
              : null;

            return (
              <g key={shape.id}>
                <path
                  d={pointsToPath(shape.points, shape.kind, rinkType)}
                  fill="none"
                  stroke={SHAPE_COLOR}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash || undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={`url(#arrow-${uid})`}
                />
                {end && (
                  <circle
                    cx={end[0]} cy={end[1]} r={PLAYER_R}
                    fill="none" stroke={SHAPE_COLOR} strokeWidth="0.12" strokeDasharray="0.5 0.4"
                  />
                )}
              </g>
            );
          })}
        </g>
      ))}

      {/* Выделенная рисуется последней — в куче она должна лежать поверх остальных,
          иначе ареол и обводка теряются под соседями */}
      {[...scene.objects]
        .sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0))
        .map(obj => (
          <BoardObject
            key={obj.id}
            obj={obj}
            pos={positions[obj.id] || [50, 50]}
            rinkType={rinkType}
            isSelected={selectedId === obj.id}
            upright
          />
        ))}

      {children}

      </g>
    </svg>
  );
}
