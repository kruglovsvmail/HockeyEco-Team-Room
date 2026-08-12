import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { BoardScene } from './BoardScene';
import {
  normalizeScene,
  interpolatePositions,
  outerViewBox,
  frameTransitionMs,
  FRAME_HOLD_MS,
} from './boardModel';

// Проигрыватель упражнения: анимация между кадрами плюс подпись текущего кадра.
// Именно здесь упражнение читается игроком — смотрит движение и параллельно читает,
// что на этом шаге происходит.

// Настройки просмотра общие для всех упражнений и запоминаются: тренеру, который
// разбирает связку, и игроку, который смотрит её в раздевалке, удобно разное.
const PATHS_KEY = 'tr_board_show_paths';
const CONTINUOUS_KEY = 'tr_board_continuous';

export function BoardPlayer({ scene: rawScene, rinkType = 'full', autoPlay = false, className = '' }) {
  const scene = useMemo(() => normalizeScene(rawScene), [rawScene]);
  const frameCount = scene.frames.length;

  // Показывать ли нарисованные траектории во время проигрывания
  const [showPaths, setShowPaths] = useState(() => localStorage.getItem(PATHS_KEY) !== 'false');
  // Непрерывное проигрывание — без остановки на каждом кадре
  const [continuous, setContinuous] = useState(() => localStorage.getItem(CONTINUOUS_KEY) === 'true');

  const boardRatio = useMemo(() => outerViewBox(rinkType), [rinkType]);

  const holdMs = continuous ? 0 : FRAME_HOLD_MS;

  // Переходы у кадров разной длительности, поэтому позицию во времени считаем по
  // накопленным началам отрезков, а не делением на общий шаг.
  const timeline = useMemo(() => {
    const starts = [0];
    for (let i = 0; i < frameCount - 1; i++) {
      starts.push(starts[i] + holdMs + frameTransitionMs(scene.frames[i]));
    }
    return starts;
  }, [scene, frameCount, holdMs]);

  const totalMs = frameCount > 1 ? timeline[frameCount - 1] + holdMs : 0;

  // Время внутри упражнения. Хранится в state, потому что от него зависит вся картинка,
  // и в ref — потому что цикл rAF не должен зависеть от замыкания на каждый кадр.
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay && frameCount > 1);
  const elapsedRef = useRef(0);
  const rafRef = useRef(null);

  const setTime = useCallback((ms) => {
    elapsedRef.current = ms;
    setElapsed(ms);
  }, []);

  // Сцена сменилась (открыли другое упражнение) — перематываем в начало
  useEffect(() => {
    setTime(0);
    setIsPlaying(autoPlay && frameCount > 1);
  }, [rawScene, frameCount, autoPlay, setTime]);

  useEffect(() => {
    if (!isPlaying || frameCount < 2) return;

    let lastTs = null;

    const tick = (ts) => {
      if (lastTs === null) lastTs = ts;
      const next = elapsedRef.current + (ts - lastTs);
      lastTs = ts;

      if (next >= totalMs) {
        setTime(totalMs);
        setIsPlaying(false);
        return;
      }

      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, frameCount, totalMs, setTime]);

  // Где мы сейчас: индекс кадра и доля перехода к следующему
  const { frameIndex, t } = useMemo(() => {
    if (frameCount < 2) return { frameIndex: 0, t: 0 };

    let index = 0;
    while (index < frameCount - 1 && elapsed >= timeline[index + 1]) index++;
    if (index >= frameCount - 1) return { frameIndex: frameCount - 1, t: 0 };

    const rest = elapsed - timeline[index];
    const transition = frameTransitionMs(scene.frames[index]);

    return {
      frameIndex: index,
      t: rest <= holdMs ? 0 : Math.min(1, (rest - holdMs) / transition),
    };
  }, [elapsed, frameCount, timeline, holdMs, scene]);

  const positions = useMemo(
    () => interpolatePositions(scene, frameIndex, t, rinkType),
    [scene, frameIndex, t, rinkType]
  );

  const shapeLayers = useMemo(() => {
    // Выключенные траектории убираем совсем, оставляя стрелки-пояснения: они ничего
    // не двигают и без них схема теряет смысл
    const visible = (frame) => (
      showPaths ? frame.shapes : frame.shapes.filter(s => !(s.objIds?.length > 0))
    );

    const current = scene.frames[frameIndex];
    if (t === 0 || frameIndex >= frameCount - 1) {
      return [{ key: current.id, shapes: visible(current), opacity: 1 }];
    }

    const next = scene.frames[frameIndex + 1];
    return [
      { key: current.id, shapes: visible(current), opacity: 1 - t },
      { key: next.id,    shapes: visible(next),    opacity: t },
    ];
  }, [scene, frameIndex, t, frameCount, showPaths]);

  const togglePaths = () => {
    const next = !showPaths;
    localStorage.setItem(PATHS_KEY, String(next));
    setShowPaths(next);
  };

  const toggleContinuous = () => {
    const next = !continuous;
    localStorage.setItem(CONTINUOUS_KEY, String(next));

    // Перематываем на начало текущего кадра: паузы исчезают или возвращаются, и старое
    // время в новой шкале указывало бы на другое место упражнения
    const nextHold = next ? 0 : FRAME_HOLD_MS;
    let start = 0;
    for (let i = 0; i < frameIndex; i++) start += nextHold + frameTransitionMs(scene.frames[i]);

    setContinuous(next);
    setTime(start);
  };

  const handlePlayToggle = () => {
    if (isPlaying) { setIsPlaying(false); return; }
    // Доиграли до конца — кнопка становится «начать заново»
    if (elapsedRef.current >= totalMs) setTime(0);
    setIsPlaying(true);
  };

  const jumpToFrame = (index) => {
    setIsPlaying(false);
    setTime(timeline[index] || 0);
  };

  // Подпись показываем от кадра, к которому идёт движение: пока фишки едут, читать
  // нужно уже про новый шаг, а не про тот, который закончился.
  const noteIndex = t > 0.35 ? Math.min(frameIndex + 1, frameCount - 1) : frameIndex;
  const note = scene.frames[noteIndex]?.note || '';

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {/* Планшет занимает всю доступную ширину, высота следует за пропорцией площадки.
          Фиксированный размер важнее компактности: иначе каток прыгал бы при
          появлении и исчезновении элементов вокруг.

          Без собственного фона: каток скруглён, контейнер прямоугольный, и в углах
          просвечивает то, на чём планшет лежит. */}
      <div
        className="w-full"
        style={{ aspectRatio: `${boardRatio.w} / ${boardRatio.h}` }}
      >
        <BoardScene rinkType={rinkType} scene={scene} positions={positions} shapeLayers={shapeLayers} />
      </div>

      {/* Управление появляется только там, где есть что проигрывать */}
      {frameCount > 1 && (
        <div className="flex items-center gap-3 px-1">
          <button
            onClick={handlePlayToggle}
            className="shrink-0 text-brand flex items-center justify-center active:scale-90 transition-transform outline-none"
            aria-label={isPlaying ? 'Пауза' : 'Проиграть'}
          >
            <Icon name={isPlaying ? 'stop' : 'play'} className="w-7 h-7" />
          </button>

          {/* Кадры — одновременно индикатор и перемотка */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {scene.frames.map((frame, index) => (
              <button
                key={frame.id}
                onClick={() => jumpToFrame(index)}
                className={clsx(
                  'h-1.5 flex-1 rounded-full transition-colors outline-none',
                  index === frameIndex ? 'bg-brand' : 'bg-surface-border'
                )}
                aria-label={`Кадр ${index + 1}`}
              />
            ))}
          </div>

          <span className="text-[11px] font-bold text-content-muted tabular-nums shrink-0">
            {frameIndex + 1}/{frameCount}
          </span>
        </div>
      )}

      {frameCount > 1 && (
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={togglePaths}
            className={clsx(
              'px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors outline-none',
              showPaths ? 'bg-brand-opacity text-brand' : 'bg-surface-level2 text-content-muted'
            )}
          >
            Траектории
          </button>
          <button
            onClick={toggleContinuous}
            className={clsx(
              'px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors outline-none',
              continuous ? 'bg-brand-opacity text-brand' : 'bg-surface-level2 text-content-muted'
            )}
          >
            Без пауз
          </button>
        </div>
      )}

      {note && (
        <p className="text-[14px] text-content-main leading-snug px-1">
          {note}
        </p>
      )}
    </div>
  );
}
