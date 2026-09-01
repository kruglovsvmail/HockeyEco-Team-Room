import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';

// Место человека в резервной очереди события сообщества.
//
// Заменяет тумблер, когда человек не в основном составе: обычная отметка тут
// ничего не значит, а значат три разных состояния очереди.
//   reserve  — ждёт, можно уйти из очереди;
//   offered  — подошла очередь, идёт таймер, надо подтвердить или отказаться;
//   expired  — не успел, место ушло дальше; можно встать в очередь заново.
//
// Таймер тикает на клиенте от offer_expires_at. Точность до секунды тут не
// нужна и даже вредна: решение всё равно принимает сервер при подтверждении,
// а расхождение часов на телефоне не должно выглядеть как «уже поздно».
export function ReserveSlotControl({ event, onAction, activeColor }) {
  const status = event?.my_slot_status;
  const [now, setNow] = useState(() => Date.now());
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (status !== 'offered') return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status]);

  if (!status || status === 'main') return null;

  const run = async (action) => {
    setIsBusy(true);
    try {
      await onAction(event, action);
    } finally {
      setIsBusy(false);
    }
  };

  if (status === 'reserve') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-content-muted">
          В резерве
        </span>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => run('leave')}
          className="w-8 h-8 rounded-lg bg-surface-level2 flex items-center justify-center outline-none active:scale-90 transition-transform disabled:opacity-40"
        >
          <Icon name="close" className="w-3.5 h-3.5 text-content-muted" />
        </button>
      </div>
    );
  }

  if (status === 'offered') {
    const msLeft = new Date(event.my_offer_expires_at).getTime() - now;
    const minutesLeft = Math.max(0, Math.round(msLeft / 60000));
    const left = minutesLeft >= 60
      ? `${Math.floor(minutesLeft / 60)} ч ${minutesLeft % 60} мин`
      : `${minutesLeft} мин`;

    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: activeColor }}>
          Место ваше · {left}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => run('decline')}
            className="px-2.5 h-8 rounded-lg bg-surface-level2 text-[10px] font-bold uppercase tracking-wider text-content-muted outline-none active:scale-95 transition-transform disabled:opacity-40"
          >
            Не поеду
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => run('confirm')}
            className={clsx(
              "px-3 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider outline-none",
              "active:scale-95 transition-transform disabled:opacity-40 bg-brand-opacity text-brand"
            )}
            style={activeColor ? { color: activeColor } : undefined}
          >
            Беру
          </button>
        </div>
      </div>
    );
  }

  // expired
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">
        Место упущено
      </span>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => run('requeue')}
        className="px-2.5 h-8 rounded-lg bg-surface-level2 text-[10px] font-bold uppercase tracking-wider text-content-muted outline-none active:scale-95 transition-transform disabled:opacity-40"
      >
        В очередь снова
      </button>
    </div>
  );
}
