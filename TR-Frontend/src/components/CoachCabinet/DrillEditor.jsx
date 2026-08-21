import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../ui/Icon';
import { TextInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { PageLoader } from '../../ui/Loader';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { SegmentedControl } from '../../ui/SegmentedControl';
import Toggle from '../../ui/Toggle';
import { getAuthHeaders, getPortalRoot } from '../../utils/helpers';
import { BoardEditor } from '../TacticalBoard/BoardEditor';
import { BoardPlayer } from '../TacticalBoard/BoardPlayer';
import { RINK_TYPES, createEmptyScene, normalizeScene } from '../TacticalBoard/boardModel';

// Карточка упражнения. Живёт содержимым полноэкранной панели — шапку с кнопкой «назад»
// рисует сама панель, поэтому здесь только тело формы.
//
// Планшет есть у упражнения всегда: зайти в него и сохранить схему можно в любой момент.
// Тумблер решает только одно — показывать ли эту схему в упражнении. Поэтому его
// выключение ничего не стирает, и сам планшет здесь не отображается: на этой странице
// нужны параметры, а не сцена.
//
// Форма обслуживает и разовое упражнение из плана тренировки: поля у него ровно те же,
// а вот адресат другой — в библиотеку оно не пишется. Такой вызов передаёт содержимое
// готовым (initial) и забирает сохранение себе (onSubmit); своей загрузки и своего
// запроса в /api/drills в этом случае нет.

const API = import.meta.env.VITE_API_URL || '';

// Длительность выезда планшета. Обязана совпадать с duration-300 у слоя — по этому
// таймеру он выносится из дерева.
const BOARD_ANIM_MS = 300;

const FormBlock = ({ title, icon, children }) => (
  <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md">
    <div className="flex items-center gap-2 mb-3 border-b border-surface-border pb-1.5">
      {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
      <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
        {title}
      </span>
    </div>
    <div className="flex flex-col gap-5 pt-1">{children}</div>
  </div>
);

export function DrillEditor({ drillId, initial, onSubmit, submitLabel, onClose, onSaved, onNotify }) {
  const isNew = !drillId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [rinkType, setRinkType] = useState(
    RINK_TYPES.some(t => t.id === initial?.rink_type) ? initial.rink_type : 'full'
  );
  const [boardEnabled, setBoardEnabled] = useState(initial?.board_enabled !== false);
  const [scene, setScene] = useState(
    () => initial?.board_json ? normalizeScene(initial.board_json) : createEmptyScene()
  );
  // Теги из формы убраны, но существующие сохраняем как есть: молча стирать данные
  // упражнения из-за того, что поле временно не показывается, нельзя
  const [tags, setTags] = useState([]);

  // Планшет правится в черновике, а не прямо в сцене упражнения: только так у кнопок
  // «Сохранить» и «Отменить» есть смысл — отменять было бы нечего, если бы каждое
  // движение фишки уже уходило в форму.
  const [boardDraft, setBoardDraft] = useState(null);
  const [isBoardShown, setIsBoardShown] = useState(false);
  const [boardConfirm, setBoardConfirm] = useState(null); // 'save' | 'cancel'

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/drills/${drillId}`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (cancelled || !json.success) return;

        const drill = json.drill;
        setName(drill.name || '');
        setDescription(drill.description || '');
        setRinkType(RINK_TYPES.some(t => t.id === drill.rink_type) ? drill.rink_type : 'full');
        setBoardEnabled(drill.board_enabled !== false);
        setScene(drill.board_json ? normalizeScene(drill.board_json) : createEmptyScene());
        setTags(Array.isArray(drill.tags) ? drill.tags : []);
      } catch {
        if (!cancelled) onNotify?.('Не удалось загрузить упражнение', 'danger');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [drillId, isNew, onNotify]);

  // Открытие и закрытие планшета — со сдвигом, как переходы между экранами приложения.
  // Два кадра ожидания: за один браузер не успевает применить стартовую позицию, и
  // слой появлялся бы рывком, уже на месте.
  const openBoard = () => {
    setBoardDraft(scene);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsBoardShown(true)));
  };

  const closeBoard = useCallback((nextScene) => {
    if (nextScene) setScene(nextScene);
    setBoardConfirm(null);
    setIsBoardShown(false);
    setTimeout(() => setBoardDraft(null), BOARD_ANIM_MS);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      onNotify?.('Введите название упражнения', 'danger');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      rink_type: rinkType,
      board_json: scene,
      board_enabled: boardEnabled,
    };

    setSaving(true);
    try {
      // Разовое упражнение сохраняет вызывающая сторона — в план тренировки, а не в
      // библиотеку. Форма закрывается только на успехе: иначе набранное пропадёт
      // вместе с сообщением об ошибке.
      if (onSubmit) {
        if (await onSubmit(payload)) onClose?.();
        return;
      }

      const res = await fetch(`${API}/api/drills${isNew ? '' : `/${drillId}`}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, tags }),
      });

      const json = await res.json();
      if (!json.success) {
        onNotify?.(json.error || 'Не удалось сохранить упражнение', 'danger');
        return;
      }

      onSaved?.();
      onClose?.();
    } catch {
      onNotify?.('Не удалось сохранить упражнение', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="h-full overflow-y-auto scrollbar-hide px-3 py-4 flex flex-col gap-3">

      <FormBlock title="Упражнение" icon="handbook">
        <TextInputLP
          label="Название"
          value={name}
          onChange={setName}
          placeholder="Например, «Пас в парах с сопротивлением»"
          maxLength={255}
        />

        {/* Абзацы поддерживаются: перенос строки сохраняется как есть и так же
            показывается в плане тренировки */}
        <TextInputLP
          label="Описание"
          type="textarea"
          rows={6}
          value={description}
          onChange={setDescription}
          placeholder="Смысл упражнения, на что обратить внимание, инвентарь"
        />
      </FormBlock>

      <FormBlock title="Тактический планшет" icon="training_tactics">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[18px] font-bold text-content-main">Показывать схему</span>
            <span className="text-[12px] text-content-muted pr-4 mt-0.5">
              Выключенный планшет не стирает нарисованное — упражнение просто
              показывается одним описанием
            </span>
          </div>
          <Toggle checked={boardEnabled} onChange={setBoardEnabled} />
        </div>

        <SegmentedControl
          options={RINK_TYPES.map(type => ({ value: type.id, label: type.label }))}
          value={rinkType}
          onChange={setRinkType}
        />

        <ButtonLP variant="outline" onClick={openBoard}>
          Перейти к планшету
        </ButtonLP>
      </FormBlock>

      {/* Просмотр отдельным блоком: на странице упражнения нужны параметры, но без
          проигрывателя нельзя ни посмотреть анимацию, ни добраться до тумблеров
          траекторий и пауз. Показывается ровно тогда, когда планшет включён — так
          редактор совпадает с тем, что увидит команда. */}
      {boardEnabled && (
        <FormBlock title="Просмотр" icon="play">
          <BoardPlayer scene={scene} rinkType={rinkType} />
        </FormBlock>
      )}

      <div className="pt-2 pb-8">
        <ButtonLP onClick={handleSave} isLoading={saving} disabled={saving}>
          {submitLabel || 'Сохранить'}
        </ButtonLP>
      </div>

      {/* Планшет на весь экран: сцена требует всей площади, а внутри формы каток
          получался бы размером с почтовую марку.

          Через портал, а не обычным fixed-слоем: слой панели анимируется трансформацией
          и становится точкой отсчёта для fixed, из-за чего планшет не перекрывал шапку
          панели — над ней оставалась чужая строка «‹ Упражнение».

          z-индекс низкий намеренно: в этом же портале живут шторки подтверждения
          (z-100/110) и выпадалка фишки. Накрыв их собой, планшет сделал бы их
          невидимыми, хотя нажатия проходили бы. */}
      {boardDraft && createPortal(
        <div
          className="absolute inset-0 z-[20] pointer-events-auto bg-surface-base flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ transform: isBoardShown ? 'translateX(0)' : 'translateX(100%)' }}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 h-[60px] border-b border-surface-border">
            <h3 className="text-[14px] font-bold text-content-main uppercase tracking-wider truncate">
              Тактический планшет
            </h3>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setBoardConfirm('cancel')}
                className="w-10 h-10 rounded-xl bg-surface-level2 text-content-muted flex items-center justify-center outline-none active:scale-95 transition-transform"
                aria-label="Отменить изменения"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
              <button
                onClick={() => setBoardConfirm('save')}
                className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center outline-none active:scale-95 transition-transform"
                aria-label="Сохранить изменения"
              >
                <Icon name="save" className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 p-3">
            <BoardEditor scene={boardDraft} rinkType={rinkType} onChange={setBoardDraft} />
          </div>

          <ConfirmSheet
            isOpen={boardConfirm === 'save'}
            onClose={() => setBoardConfirm(null)}
            onConfirm={() => closeBoard(boardDraft)}
            title="Сохранить планшет?"
            description="Расстановка, траектории и подписи кадров перейдут в упражнение. Само упражнение сохранится кнопкой внизу формы."
            confirmLabel="Сохранить"
            variant="primary"
          />

          <ConfirmSheet
            isOpen={boardConfirm === 'cancel'}
            onClose={() => setBoardConfirm(null)}
            onConfirm={() => closeBoard(null)}
            title="Отменить изменения?"
            description="Всё, что вы нарисовали на планшете с момента открытия, будет потеряно."
            confirmLabel="Отменить"
            cancelLabel="Продолжить"
            variant="danger"
          />
        </div>,
        getPortalRoot()
      )}
    </div>
  );
}
