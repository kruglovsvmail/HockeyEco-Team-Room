import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { ConfirmSheet } from './ConfirmSheet';
import { HintPopover } from './HintPopover';
import { isAfterWithdrawDeadline } from '../utils/eventFee';

// Бейдж «Отметиться / Снять отметку» в шапке блока отметок.
//
// Стоит на месте кнопки добавления участника: у штаба там иконка «отметить
// другого», у всех остальных — этот переключатель на себя. Раньше отметиться
// можно было только тумблером на карточке календаря, и человек, открывший
// событие, чтобы посмотреть состав, вынужден был возвращаться назад.
//
// Блок выбирает вызывающая сторона: вратарю бейдж показывают среди вратарей,
// полевому — среди полевых, иначе человек искал бы себя не в своей группе.
//
// Правила ровно те же, что у тумблера на карточке (EventCard):
//   • отмечаться можно только при toggle_status === 'allowed', иначе на месте
//     бейджа стоит подсказка с причиной отказа — та же самая, что на карточке;
//   • снятие отметки после дедлайна подтверждается отдельно: отметка уходит,
//     а взнос остаётся, и узнать об этом постфактум человек не должен.
export const SelfAttendanceBadge = ({ event, onToggle, activeColor, disabled = false }) => {
  // Ответ сервера доезжает не мгновенно: is_attending живёт в карточке события,
  // а она перечитывается после запроса. До тех пор показываем намерение —
  // иначе бейдж выглядит «залипшим». Как только проп догоняет, снимаем.
  const [pending, setPending] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => { setPending(null); }, [event?.is_attending]);

  if (!event) return null;
  if (event.toggle_status !== 'allowed') {
    return <HintPopover status={event.toggle_status} />;
  }

  const isAttending = pending === null ? !!event.is_attending : pending === 'on';

  // Прошедшее событие состав уже не принимает — сервер откажет, и человек увидел
  // бы только отскочивший обратно бейдж. Гасим его заранее, как гасится тумблер
  // на карточке. cost_locked_at ставится кроном после события, дата — точнее.
  const eventDate = event.event_date || event.game_date;
  const isClosed = !!event.cost_locked_at
    || (!!eventDate && new Date(eventDate).getTime() < Date.now());

  const apply = async (next) => {
    setPending(next ? 'on' : 'off');
    setIsBusy(true);
    try {
      await onToggle(next);
    } catch {
      setPending(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (isBusy || disabled || isClosed) return;
    // Снятие после дедлайна платное — спрашиваем до запроса, а не после
    if (isAttending && isAfterWithdrawDeadline(event)) {
      setIsConfirmOpen(true);
      return;
    }
    apply(!isAttending);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy || disabled || isClosed}
        style={isAttending ? undefined : { backgroundColor: activeColor || 'var(--color-brand)' }}
        className={clsx(
          // Пилюля: рядом с заголовком блока она читается как метка состояния,
          // а не как ещё одна кнопка действия.
          // Высота ровно как у иконки «отметить другого» (w-5 h-5) у штаба —
          // иначе шапки блоков с бейджем и без него разъезжаются по высоте.
          'shrink-0 inline-flex items-center justify-center px-2.5 h-5',
          'rounded-full text-[9px] font-bold uppercase tracking-wider',
          'outline-none transition-transform active:scale-95 disabled:opacity-40 cursor-pointer',
          isAttending
            ? 'bg-surface-level3 text-content-muted'
            : 'text-white'
        )}
      >
        {/* Ширину держит самая длинная подпись: она лежит невидимой распоркой,
            а видимое содержимое — спиннер или текущий текст — накрывает её
            сверху. Иначе пилюля дёргалась бы на каждом переключении и на время
            запроса, а подбирать ширину числом нельзя: она зависит от шрифта
            и от пользовательского масштаба интерфейса. */}
        <span className="relative inline-flex items-center justify-center">
          <span aria-hidden className="invisible whitespace-nowrap">Снять отметку</span>
          <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
            {isBusy
              ? <span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
              : (isAttending ? 'Снять отметку' : 'Отметиться')}
          </span>
        </span>
      </button>

      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmSheet
          isOpen={isConfirmOpen}
          onClose={() => !isBusy && setIsConfirmOpen(false)}
          isLoading={isBusy}
          onConfirm={async () => {
            await apply(false);
            setIsConfirmOpen(false);
          }}
          title="Дедлайн уже прошёл"
          description={
            <>
              Отметку снимем, но взнос за событие останется: вы продолжите
              учитываться в расчёте стоимости и попадёте в список снявшихся после деадлайна.
              {event.attendance_deadline_hours ? (
                <> Снять отметку без последствий можно было за {event.attendance_deadline_hours} ч. до начала.</>
              ) : null}
            </>
          }
          confirmLabel="Снять"
          variant="danger"
        />
      </div>
    </>
  );
};
