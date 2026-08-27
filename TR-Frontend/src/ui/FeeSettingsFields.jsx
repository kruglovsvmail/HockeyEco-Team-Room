import React from 'react';
import { TextInputLP, StepperLP } from './Input-LP';
import { CheckboxLP } from './Checkbox-LP';
import { SegmentedControl } from './SegmentedControl';
import Toggle from './Toggle';
import { FEE_PENDING_TEXT } from '../utils/eventFee';

// =============================================================================
// ПАРАМЕТРЫ ВЗНОСА ЗА СОБЫТИЕ
//
// Один и тот же набор полей нужен трём экранам — созданию события, шторке
// редактирования и панели блоков, — поэтому живёт отдельным компонентом.
// Компонент управляемый: наружу отдаёт патч, состояние держит родитель.
//
// Режимы:
//   per_person — сумма с человека, как было всегда;
//   split      — общая сумма события делится между отметившимися плательщиками.
// Поля порога и «вратари бесплатно» имеют смысл только в долевом режиме,
// поэтому в фиксированном не показываются вовсе.
// =============================================================================

const MODE_OPTIONS = [
  { value: 'per_person', label: 'С человека' },
  { value: 'split',      label: 'Сумма' },
];

export const FeeSettingsFields = ({
  value,
  onChange,
  disabled = false,
  activeColor = null,
  isMeeting = false,
}) => {
  const {
    costMode = 'per_person',
    playerFee = '',
    totalCost = '',
    isFree = false,
    goaliesFree = true,
    minParticipants = 1,
    deadlineHours = 4,
  } = value || {};

  const isSplit = costMode === 'split';
  const amount = isSplit ? totalCost : playerFee;
  const amountKey = isSplit ? 'totalCost' : 'playerFee';

  const patch = (next) => onChange({ ...value, ...next });

  // Ноль в поле суммы и галочка «Бесплатно» — одно и то же состояние, держим их
  // синхронно в обе стороны, как это было в форме создания события.
  const handleAmountChange = (raw) => {
    const clean = String(raw).replace(/\D/g, '');
    patch({ [amountKey]: clean, isFree: clean === '0' });
  };

  const handleToggleFree = (checked) => {
    patch({ isFree: checked, [amountKey]: checked ? '0' : '' });
  };

  const who = isMeeting ? 'участника' : 'игрока';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">
          Как считается взнос
        </span>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={costMode}
          onChange={(mode) => !disabled && patch({ costMode: mode })}
          activeColor={activeColor}
        />
        <span className="text-[12px] font-тщкьфд text-content-muted leading-tight pl-1">
          {isSplit
            ? `Введите стоимость всего события — она разделится между отметившимися. Чем больше ${isMeeting ? 'участников' : 'игроков'}, тем дешевле каждому.`
            : `Фиксированная сумма с каждого ${who}, от числа отметившихся не зависит.`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 items-end mt-5">
        <TextInputLP
          label={isSplit ? 'Общая сумма' : `Взнос ${who}`}
          placeholder="Не указан"
          value={amount}
          onChange={handleAmountChange}
          disabled={disabled || isFree}
          activeColor={activeColor}
        />
        <div className="pb-3.5 pl-1">
          <CheckboxLP
            checked={isFree}
            onChange={(checked) => !disabled && handleToggleFree(checked)}
            label="Бесплатно"
            activeColor={activeColor}
          />
        </div>
      </div>

      {isSplit && !isFree && (
        <>
          {!isMeeting && (
            <div className="flex items-center justify-between gap-4 px-1 mt-6">
              <div className="min-w-0">
                <span className="text-[14px] font-bold text-content-main block">Вратари бесплатно</span>

              </div>
              <Toggle
                checked={goaliesFree}
                disabled={disabled}
                activeColor={activeColor}
                onChange={(val) => patch({ goaliesFree: val })}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5 mt-6">
            <StepperLP
              label="Показывать цену от"
              value={minParticipants}
              onChange={(val) => patch({ minParticipants: Math.max(val, 1) })}
              min={1}
              max={40}
              suffix="чел."
              disabled={disabled}
              activeColor={activeColor}
            />
            <span className="text-[12px] text-content-muted leading-tight pl-1">
              {/* Формулировку берём из того же места, что и карточка события,
                  чтобы руководитель видел ровно то, что увидит игрок. */}
              Пока отметившихся меньше, взнос будет скрыт.
            </span>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5 mt-6">
        <StepperLP
          label="Деадлайн снятия отметки"
          value={deadlineHours ?? 0}
          onChange={(val) => patch({ deadlineHours: val })}
          min={0}
          max={72}
          suffix="ч."
          disabled={disabled}
          activeColor={activeColor}
        />
        <span className="text-[12px] text-content-muted leading-tight pl-1">
          {Number(deadlineHours) > 0
            ? `Кто снимет отметку позже, всё равно будет учитыается в расчете общей суммы.`
            : 'Снять отметку можно до самого начала события.'}
        </span>
      </div>
    </div>
  );
};

export default FeeSettingsFields;
