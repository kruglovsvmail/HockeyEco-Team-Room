import React, { useState } from 'react';
import clsx from 'clsx';
import { ButtonLP } from '../../ui/Button-LP';
import { RadioLP } from '../../ui/Radio-LP';
import { StepperLP } from '../../ui/Input-LP';
import { Icon } from '../../ui/Icon';
import { PanelBlock } from './CommunityPanelBlock';
import { getAuthHeaders } from '../../utils/helpers';

// Лесенка по умолчанию — та же, что стоит в communities.reserve_ladder
const DEFAULT_LADDER = [
  { before_minutes: 24 * 60, confirm_minutes: 6 * 60 },
  { before_minutes: 6 * 60, confirm_minutes: 60 },
  { before_minutes: 0, confirm_minutes: 30 },
];

// Часы вместо минут: минутами оперировать неудобно. Ниже часа шаг четвертной —
// других дробных значений в жизни не встречается, а клавиатуру ради «0,4 часа»
// открывать не за чем. Выше часа шаг целый, до недели.
const HOUR_STEPS = [
  0, 0.25, 0.5, 0.75,
  ...Array.from({ length: 168 }, (_, i) => i + 1),
];

const formatHours = (h) => (Number.isInteger(h) ? String(h) : String(h).replace('.', ','));
const toHours = (minutes) => (Number(minutes) || 0) / 60;
const toMinutes = (hours) => Math.round(hours * 60);

// В строках лесенки читаемее минуты: «даётся 0,25 ч» глазом не берётся,
// «даётся 15 мин» — сразу. В степперах при этом везде часы, как и было.
const formatSpan = (hours) => (
  hours > 0 && hours < 1 ? `${Math.round(hours * 60)} мин` : `${formatHours(hours)} ч`
);

// Ближайшая ступень к произвольному значению из базы: лесенку могли завести
// когда угодно, и в минутах там может стоять что угодно.
const snapToStep = (hours) => HOUR_STEPS.reduce(
  (best, step) => (Math.abs(step - hours) < Math.abs(best - hours) ? step : best),
  HOUR_STEPS[0]
);

// Предложение не может жить дольше, чем осталось до события: ступень «за 3 часа
// даётся 6 часов» означала бы таймер, истекающий уже после начала игры. Поэтому
// «даётся» всегда строго меньше «за» — кроме последней ступени с нулём, которая
// ловит всё оставшееся время и своего потолка не имеет.
const confirmCeiling = (beforeHours) => {
  if (!beforeHours) return null;
  const idx = HOUR_STEPS.indexOf(snapToStep(beforeHours));
  return HOUR_STEPS[Math.max(0, idx - 1)];
};

// =============================================================================
// НАСТРОЙКИ СООБЩЕСТВА
//
// Две независимые вещи, поэтому и блока два, каждый со своей кнопкой: видимость
// календаря меняет то, что человек видит прямо сейчас, а лесенка резерва —
// то, сколько ему дадут на ответ. Общая кнопка сохранения тут только сбивала бы.
// =============================================================================
export function CommunitySettingsPanel({
  communityId, community, activeBrandColor, onSaved,
}) {
  const isSkating = community?.category === 'skating';
  const accentColor = activeBrandColor || null;

  const [calendarScope, setCalendarScope] = useState(community?.calendar_scope || 'own_groups');
  const [ladder, setLadder] = useState(() => {
    const raw = community?.reserve_ladder;
    const list = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_LADDER;
    // Хвост прибиваем к нулю. Смысла лесенки это не меняет: всё, что ниже самой
    // мелкой ступени, сервер и так считал по ней же, просто эта зона нигде не
    // показывалась — человек настраивал три правила, а действовали четыре.
    return list.map((r, i) => (i === list.length - 1 ? { ...r, before_minutes: 0 } : r));
  });

  // Какая ступень раскрыта в редактирование. Одна за раз: границы соседние,
  // и править их удобнее, видя остальные строки целиком.
  const [editingIdx, setEditingIdx] = useState(null);

  const [savingBlock, setSavingBlock] = useState(null);
  const [error, setError] = useState('');

  const save = async (blockKey, payload) => {
    setSavingBlock(blockKey);
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/settings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить');
      await onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBlock(null);
    }
  };

  const patchRung = (idx, patch) => {
    setLadder(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  // Лесенка читается сверху вниз, и порядок в ней — не украшение: сервер берёт
  // первую подходящую ступень. Если порог одной ступени перескочит соседнюю,
  // нижняя перестанет срабатывать вовсе — поэтому держим каждую строго между
  // соседями и не даём их перепутать.
  const beforeBounds = (idx) => {
    const above = idx > 0 ? toHours(ladder[idx - 1].before_minutes) : null;
    const below = idx < ladder.length - 1 ? toHours(ladder[idx + 1].before_minutes) : null;
    return {
      // Ниже соседа сверху и выше соседа снизу — на одну ступень, не вплотную
      max: above === null ? null : HOUR_STEPS[Math.max(0, HOUR_STEPS.indexOf(snapToStep(above)) - 1)],
      min: below === null ? 0 : HOUR_STEPS[Math.min(HOUR_STEPS.length - 1, HOUR_STEPS.indexOf(snapToStep(below)) + 1)],
    };
  };

  // Подпись промежутка: одного порога недостаточно — «5 ч» управляет отрезком от
  // 5 до соседа сверху, и по числу это не читается. Верх открыт у первой ступени,
  // низ закрыт хвостом, так что отрезки видно целиком.
  const zoneLabel = (idx) => {
    const upper = idx > 0 ? toHours(ladder[idx - 1].before_minutes) : null;
    const lower = toHours(ladder[idx].before_minutes);
    if (upper === null) {
      return lower > 0 ? `Больше ${formatSpan(lower)}` : 'В любое время до события';
    }
    if (idx === ladder.length - 1) return `Меньше ${formatSpan(upper)}`;
    return `От ${formatSpan(lower)} до ${formatSpan(upper)}`;
  };

  // Порог ступени задаётся в двух местах — как «От» у неё самой и как «До» у
  // соседа снизу. Это один и тот же край отрезка, поэтому и обработчик один.
  const setRungBefore = (idx, h) => {
    const rung = ladder[idx];
    // Опустили планку — «даётся» могло оказаться больше неё, подтягиваем его
    // следом, а не показываем недопустимую пару
    const ceiling = confirmCeiling(h);
    const confirm = ceiling === null
      ? toHours(rung.confirm_minutes)
      : Math.min(toHours(rung.confirm_minutes), ceiling);
    patchRung(idx, {
      before_minutes: toMinutes(h),
      confirm_minutes: toMinutes(Math.max(0.25, confirm)),
    });
  };

  // Новая ступень встаёт перед хвостом и делит промежуток над ним пополам: так
  // она заведомо не перескакивает соседей и её сразу видно. Порог меньше получаса
  // делить уже некуда — «даётся» не может быть меньше четверти часа и упрётся
  // в собственный порог, поэтому на этом кнопка гаснет.
  const nextRungBefore = (list) => {
    const head = list.slice(0, -1);
    const above = head.length ? head[head.length - 1].before_minutes : 4 * 60;
    const before = Math.round(above / 2);
    return before >= 30 ? before : null;
  };

  const canAddRung = nextRungBefore(ladder) !== null;

  const addRung = () => {
    const before = nextRungBefore(ladder);
    if (before === null) return;
    const tail = ladder[ladder.length - 1];
    setLadder([
      ...ladder.slice(0, -1),
      { before_minutes: before, confirm_minutes: Math.round(before / 2) },
      tail,
    ]);
    // Новую ступень сразу раскрываем: половина от соседа — только заготовка,
    // её всё равно идут править.
    setEditingIdx(ladder.length - 1);
  };

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-hide text-left">
      <div className="flex flex-col gap-3 px-3 py-4 pb-32">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[14px] font-semibold">
            {error}
          </div>
        )}

        {isSkating && (
          <PanelBlock
            title="Что участники видят в календаре"
            icon="calendar"
            accentColor={accentColor}
            isSaving={savingBlock === 'scope'}
          >
            <div className="flex flex-col gap-2.5 pt-1">
              <RadioLP
                name="community-calendar-scope"
                checked={calendarScope === 'own_groups'}
                onChange={() => setCalendarScope('own_groups')}
                label="Только свою группу"
                activeColor={accentColor}
              />
              <RadioLP
                name="community-calendar-scope"
                checked={calendarScope === 'all'}
                onChange={() => setCalendarScope('all')}
                label="Все тренировки сообщества"
                activeColor={accentColor}
              />

              <ButtonLP
                onClick={() => save('scope', { calendar_scope: calendarScope })}
                disabled={savingBlock === 'scope'}
                activeColor={accentColor}
                className="w-full mt-2 py-2.5"
              >
                Сохранить
              </ButtonLP>
            </div>
          </PanelBlock>
        )}

        <PanelBlock
          title="Подтверждение места из резерва"
          icon="clock"
          accentColor={accentColor}
          isSaving={savingBlock === 'ladder'}
        >
          <div className="flex flex-col gap-3 pt-1">
            <span className="text-[11px] text-content-subtle leading-relaxed">
              
              Чем ближе событие, тем меньше времени на ответ. Каждая строка —
              свой промежуток; нажмите на неё, чтобы поправить границы и срок.
              Меньше часа можно указать как 0,25 · 0,5 · 0,75. 
            </span>

            {/* Строкой читается весь промежуток целиком, редактирование —
                по нажатию и по одной ступени за раз: иначе панель превращается
                в простыню из степперов, в которой границы теряются. */}
            {ladder.map((rung, idx) => {
              const isTail = idx === ladder.length - 1;
              const isOpen = editingIdx === idx;
              return (
                <div key={idx} className="flex flex-col rounded-xl bg-surface-level2 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setEditingIdx(isOpen ? null : idx)}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-left outline-none active:opacity-70 transition-opacity"
                  >
                    <span className="text-[14px] font-semibold text-content-main leading-tight min-w-0">
                      {zoneLabel(idx)}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[12px] text-content-muted">
                        даётся {formatSpan(toHours(rung.confirm_minutes))}
                      </span>
                      <Icon
                        name="chevron_right"
                        className={clsx(
                          'w-4 h-4 text-content-subtle transition-transform duration-200',
                          isOpen && 'rotate-90'
                        )}
                      />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="flex flex-col gap-2 px-3 pb-3 pt-2 border-t border-surface-border">
                      {/* У хвоста своей границы нет: он прибит к нулю и ловит всё,
                          что ближе соседа сверху. А верхний край хвоста — это «От»
                          соседа, там он и правится. */}
                      {!isTail && (
                        <StepperLP
                          inline
                          label={idx === 0 ? 'Больше' : 'От'}
                          steps={HOUR_STEPS}
                          formatValue={formatHours}
                          suffix="ч"
                          value={toHours(rung.before_minutes)}
                          min={beforeBounds(idx).min}
                          max={beforeBounds(idx).max}
                          onChange={(h) => setRungBefore(idx, h)}
                          activeColor={accentColor}
                        />
                      )}

                      {idx > 0 && !isTail && (
                        <StepperLP
                          inline
                          label="До"
                          steps={HOUR_STEPS}
                          formatValue={formatHours}
                          suffix="ч"
                          value={toHours(ladder[idx - 1].before_minutes)}
                          min={beforeBounds(idx - 1).min}
                          max={beforeBounds(idx - 1).max}
                          onChange={(h) => setRungBefore(idx - 1, h)}
                          activeColor={accentColor}
                        />
                      )}

                      <StepperLP
                        inline
                        label="Даётся на подтверждение"
                        steps={HOUR_STEPS}
                        formatValue={formatHours}
                        suffix="ч"
                        value={toHours(rung.confirm_minutes)}
                        onChange={(h) => patchRung(idx, { confirm_minutes: toMinutes(h) })}
                        min={0.25}
                        max={confirmCeiling(toHours(rung.before_minutes))}
                        activeColor={accentColor}
                      />

                      {!isTail && (
                        <button
                          type="button"
                          onClick={() => {
                            setLadder(prev => prev.filter((_, i) => i !== idx));
                            setEditingIdx(null);
                          }}
                          className="self-start mt-1 text-[10px] font-bold text-danger uppercase tracking-wider outline-none"
                        >
                          Убрать ступень
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addRung}
              disabled={!canAddRung}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-2 outline-none self-start mb-4 mt-2 disabled:opacity-30"
              style={{ color: accentColor || 'var(--color-brand)' }}
            >
              Добавить ступень
            </button>

            <ButtonLP
              onClick={() => save('ladder', { reserve_ladder: ladder })}
              disabled={savingBlock === 'ladder'}
              activeColor={accentColor}
              className="w-full mt-1 py-2.5"
            >
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>
      </div>
    </div>
  );
}
