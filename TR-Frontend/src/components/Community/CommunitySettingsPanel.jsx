import React, { useState } from 'react';
import { ButtonLP } from '../../ui/Button-LP';
import { RadioLP } from '../../ui/Radio-LP';
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

// Ближайшая ступень к произвольному значению из базы: лесенку могли завести
// когда угодно, и в минутах там может стоять что угодно.
const snapToStep = (hours) => HOUR_STEPS.reduce(
  (best, step) => (Math.abs(step - hours) < Math.abs(best - hours) ? step : best),
  HOUR_STEPS[0]
);

// Часы стрелками и с клавиатуры: соседнее значение удобнее ткнуть стрелкой,
// а «за 48 часов» быстрее набрать. Введённое приводим к ближайшей ступени —
// дробей мельче четверти в лесенке не бывает.
const HourStepper = ({ value, onChange, min = 0, max = null, accentColor }) => {
  const current = snapToStep(value);
  const index = HOUR_STEPS.indexOf(current);
  const minIndex = HOUR_STEPS.indexOf(snapToStep(min));
  const maxIndex = max === null ? HOUR_STEPS.length - 1 : HOUR_STEPS.indexOf(snapToStep(max));

  // Пока человек печатает, значение живёт в строке: иначе «1» на пути к «12»
  // тут же схлопнулась бы в ступень и стёрла набранное.
  const [draft, setDraft] = useState(null);

  const clampIndex = (i) => Math.min(maxIndex, Math.max(minIndex, i));

  const step = (delta) => {
    const next = HOUR_STEPS[clampIndex(index + delta)];
    if (next !== current) onChange(next);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    onChange(HOUR_STEPS[clampIndex(HOUR_STEPS.indexOf(snapToStep(parsed)))]);
  };

  const arrow = (dir, disabled) => (
    <button
      type="button"
      onClick={() => step(dir)}
      disabled={disabled}
      style={disabled ? undefined : { color: accentColor || 'var(--color-brand)' }}
      className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center shrink-0 outline-none active:scale-90 transition-transform disabled:opacity-30 disabled:text-content-subtle"
    >
      <Icon name="chevron_left" className={dir > 0 ? 'w-4 h-4 rotate-180' : 'w-4 h-4'} />
    </button>
  );

  return (
    <div className="flex items-center gap-1 shrink-0">
      {arrow(-1, index <= minIndex)}
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? formatHours(current)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-[52px] h-8 text-center text-[14px] font-black text-content-main tabular-nums bg-surface-base border border-surface-border rounded-lg outline-none focus:border-content-subtle"
      />
      {arrow(1, index >= maxIndex)}
    </div>
  );
};

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
    return Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_LADDER;
  });

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
  // первую подходящую ступень. Если «за» одной ступени перескочит соседнюю,
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

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-hide text-left">
      <div className="flex flex-col gap-3 p-4 pb-32">
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
              Чем ближе событие, тем меньше времени на ответ. Ступени читаются
              сверху вниз — берётся первая подходящая. Меньше часа можно указать
              как 0,25 · 0,5 · 0,75. «Даётся» всегда меньше «за»: иначе таймер
              истёк бы уже после начала события. Ступени нельзя перепутать между
              собой — каждая держится между соседями.
            </span>

            {ladder.map((rung, idx) => (
              <div key={idx} className="flex flex-col gap-2 p-3 rounded-xl bg-surface-level2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-content-muted">За, ч</span>
                  <HourStepper
                    value={toHours(rung.before_minutes)}
                    min={beforeBounds(idx).min}
                    max={beforeBounds(idx).max}
                    onChange={(h) => {
                      // Опустили планку — «даётся» могло оказаться больше неё,
                      // подтягиваем его следом, а не показываем недопустимую пару
                      const ceiling = confirmCeiling(h);
                      const confirm = ceiling === null
                        ? toHours(rung.confirm_minutes)
                        : Math.min(toHours(rung.confirm_minutes), ceiling);
                      patchRung(idx, {
                        before_minutes: toMinutes(h),
                        confirm_minutes: toMinutes(Math.max(0.25, confirm)),
                      });
                    }}
                    accentColor={accentColor}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-content-muted">Даётся, ч</span>
                  <HourStepper
                    value={toHours(rung.confirm_minutes)}
                    onChange={(h) => patchRung(idx, { confirm_minutes: toMinutes(h) })}
                    min={0.25}
                    max={confirmCeiling(toHours(rung.before_minutes))}
                    accentColor={accentColor}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setLadder(prev => prev.filter((_, i) => i !== idx))}
                  disabled={ladder.length <= 1}
                  className="self-start text-[10px] font-bold text-danger uppercase tracking-wider outline-none disabled:opacity-30"
                >
                  Убрать ступень
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setLadder(prev => {
                // Новая ступень встаёт в конец и берёт половину от предыдущей:
                // так она заведомо не перескакивает соседа и её сразу видно
                const lastBefore = prev.length ? prev[prev.length - 1].before_minutes : 120;
                const before = Math.max(0, Math.round(lastBefore / 2));
                return [...prev, { before_minutes: before, confirm_minutes: Math.max(15, Math.round(before / 2) || 15) }];
              })}
              className="text-[10px] font-bold uppercase tracking-wider outline-none self-start"
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
