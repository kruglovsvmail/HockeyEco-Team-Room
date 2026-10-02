import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import { ButtonLP } from '../ui/Button-LP';
import { getPortalRoot, isStandaloneApp } from '../utils/helpers';
import { usePushSubscription, isPushPromptDone, markPushPromptDone } from '../hooks/usePushSubscription';

/**
 * «Последний шаг» после установки: окно с одной кнопкой включения уведомлений.
 * Показывается только в установленном приложении (открыто с иконки) и только если
 * на этом устройстве уведомления ещё не включены и про них ещё не решали.
 *
 * Включить уведомления совсем без нажатия нельзя: браузеры, особенно Safari на iPhone,
 * показывают системный вопрос «Разрешить уведомления?» только в ответ на нажатие
 * человека. Поэтому здесь одна кнопка. Если разрешение уже выдано раньше, системного
 * вопроса не будет вовсе — подписка оформится сразу по нажатию.
 *
 * canShow — очередь окон при входе свободна (TeamLayout): сначала согласие с политикой,
 * приветствие и новости от лиги, это окно — последним.
 */
export function PushPromptModal({ canShow }) {
  const { isSupported, isSubscribed, isLoading, isToggling, permission, subscribe } = usePushSubscription();
  const [isDone, setIsDone] = useState(isPushPromptDone);
  // Тап мимо окна прячет его до следующего запуска, но не запоминается навсегда:
  // случайное касание не должно стоить человеку уведомлений
  const [isHidden, setIsHidden] = useState(false);

  if (
    !canShow || isDone || isHidden || !isStandaloneApp() ||
    !isSupported || isLoading || isSubscribed || permission === 'denied'
  ) return null;

  const finish = () => {
    markPushPromptDone();
    setIsDone(true);
  };

  const handleEnable = async () => {
    // Чем бы ни кончилось — разрешили, запретили в системном окне или не дошёл запрос —
    // больше не спрашиваем: включить можно в Настройках, там же видно, что не так
    await subscribe();
    finish();
  };

  return createPortal(
    <div className="absolute inset-0 z-[350] flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
      <div className="absolute inset-0 bg-overlay backdrop-blur-md" onClick={() => setIsHidden(true)} />

      <div className="bg-surface-level1 border border-surface-border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 flex flex-col gap-5 animate-scale-in text-left">

        <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-opacity text-brand flex items-center justify-center shrink-0">
            <Icon name="bell" className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-[14px] font-black text-content-main uppercase tracking-wider leading-none">
              Уведомления
            </h3>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-1 block">
              Последний шаг
            </span>
          </div>
        </div>

        <p className="text-[14px] text-content-main font-medium leading-relaxed">
          Приложение установлено. Включите уведомления — пришлём новые события и напоминания,
          переносы и отмены, составы на игру.
        </p>

        <p className="text-[12px] text-content-muted font-medium leading-relaxed">
          Что именно присылать, можно выбрать в Настройках, в разделе «Уведомления».
        </p>

        <div className="flex gap-3 w-full pt-4 border-t border-surface-level2">
          <ButtonLP
            variant="outline"
            onClick={finish}
            disabled={isToggling}
            className="flex-1 !h-11 !py-0 !text-[10px] !font-black !uppercase !tracking-widest"
          >
            Не сейчас
          </ButtonLP>
          <ButtonLP
            variant="primary"
            onClick={handleEnable}
            isLoading={isToggling}
            className="flex-1 !h-11 !py-0 !text-[10px] !font-black !uppercase !tracking-widest shadow-md"
          >
            Включить
          </ButtonLP>
        </div>

      </div>
    </div>,
    getPortalRoot()
  );
}
