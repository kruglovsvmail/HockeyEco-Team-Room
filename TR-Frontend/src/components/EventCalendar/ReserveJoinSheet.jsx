import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../utils/helpers';
import { BottomSheet } from '../../ui/BottomSheet';
import { ButtonLP } from '../../ui/Button-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { Icon } from '../../ui/Icon';

// Шторка «вы отмечаетесь в резерв».
//
// Показывается в момент, когда человек включает тумблер на событии сообщества с
// уже набранным составом. Без неё отметка выглядела бы как обычная, а человек
// узнал бы про резерв только на льду.
//
// Галочка с пушами тут не украшение: очередь работает предложениями с таймером,
// и резервист, у которого выключены уведомления, просто молча пропустит свою
// очередь. Поэтому предлагаем включить их — но только тем, у кого они выключены:
// остальным галочка не нужна и лишний раз пугать её не надо.
export function ReserveJoinSheet({ isOpen, onClose, onConfirm, event, activeColor }) {
  const [enablePush, setEnablePush] = useState(true);
  const [pushState, setPushState] = useState(null); // null — ещё не знаем
  const [isSubmitting, setIsSubmitting] = useState(false);

  const communityId = event?.my_community_id;
  const isGoalie = event?.my_pay_role === 'goalie';

  useEffect(() => {
    if (!isOpen || !communityId) return;

    let cancelled = false;
    setPushState(null);

    fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/notifications`, {
      headers: getAuthHeaders(),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json) return;
        const s = json.settings || {};
        setPushState(Boolean(s.enabled && s.reserve));
      })
      .catch(() => { if (!cancelled) setPushState(true); });

    return () => { cancelled = true; };
  }, [isOpen, communityId]);

  // Галочку показываем, только если уведомления о резерве сейчас выключены
  const needsPushOptIn = pushState === false;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      if (needsPushOptIn && enablePush) {
        await fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/notifications`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ enabled: true, reserve: true }),
        }).catch(() => {});
      }
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const queueLabel = event?.reserve_count
    ? `Перед вами в очереди: ${event.reserve_count}`
    : 'Вы будете первым в очереди';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-opacity flex items-center justify-center shrink-0">
            <Icon name="clock" className="w-5 h-5 text-brand" />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-[18px] font-black text-content-main leading-tight">
              Состав уже набран
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-1">
              {isGoalie ? 'Вратари' : 'Полевые'} · {queueLabel}
            </span>
          </div>
        </div>

        <p className="text-[13px] text-content-muted leading-relaxed">
          Вы отмечаетесь в резерв. Если кто-то снимет отметку, место предложат
          первому в очереди — на подтверждение будет ограниченное время, после
          чего оно уйдёт следующему.
        </p>

        {needsPushOptIn && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-level2">
            <CheckboxLP
              checked={enablePush}
              onChange={setEnablePush}
              label="Включить уведомления этого сообщества"
              activeColor={activeColor}
            />
            <p className="text-[11px] text-content-subtle leading-relaxed pl-8">
              Сейчас они выключены. Без них вы не узнаете, что подошла ваша
              очередь, и место уйдёт дальше.
            </p>
          </div>
        )}

        <ButtonLP
          onClick={handleConfirm}
          isLoading={isSubmitting}
          disabled={isSubmitting}
          activeColor={activeColor}
        >
          Встать в резерв
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}
