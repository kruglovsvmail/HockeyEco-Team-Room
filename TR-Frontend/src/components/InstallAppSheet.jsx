import React, { useEffect } from 'react';
import { Share, PlusSquare, Download, AlertCircle, MoreVertical } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { ButtonLP } from '../ui/Button-LP';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

/**
 * Шторка «Как установить приложение» — одна на экран входа, сайдбар и Настройки.
 * Открывается, только когда браузер не может поставить приложение сам одним нажатием
 * (useInstallPrompt().canPrompt): на iPhone — три шага через «Поделиться», в Chrome без
 * готового события — путь через меню браузера, в остальных браузерах — просьба открыть
 * сайт в Chrome или Safari.
 */
export function InstallAppSheet({ isOpen, onClose }) {
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt();

  const ua = navigator.userAgent.toLowerCase();
  const isIos = /ipad|iphone|ipod/.test(ua);
  const isSafari = isIos && /safari/.test(ua) && !/crios|fxios/.test(ua);
  const isChrome = /chrome|crios/.test(ua) && !/opr|edg|brave|yabrowser|samsungbrowser|ucbrowser/.test(ua);

  // Поставили, пока шторка открыта (системным окном или через меню браузера) — закрываем
  useEffect(() => {
    if (isOpen && isInstalled) onClose();
  }, [isOpen, isInstalled, onClose]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {!isSafari && !isChrome ? (
        <div className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-level2 text-brand shadow-sm">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-[18px] font-bold text-content-main mb-3">Браузер не поддерживается</h2>
          <p className="text-content-muted text-[14px] leading-relaxed mb-8 px-2">
            Установка PWA-приложения доступна только в браузерах <b className="text-content-main">Google Chrome</b> и <b className="text-content-main">Safari</b>. <br className="hidden sm:block"/>
            Пожалуйста, откройте этот сайт в одном из них.
          </p>
         </div>
      ) : isSafari ? (
        <div className="pb-2">
          <div className="mb-12 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-level2 shadow-sm overflow-hidden">
              <img src="/apple-touch-icon.png" alt="App Icon" className="h-full w-full object-cover" onError={(e) => e.target.style.display='none'} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-content-main mb-1">Установка на iPhone</h2>
              <p className="text-[14px] text-content-muted">Добавьте на экран «Домой»</p>
            </div>
          </div>
          <ul className="space-y-4 text-[14px] text-content-main p-5 rounded-2xl border border-surface-level2">
            <li className="flex gap-4 items-center">
              <div className="w-8 h-8 shrink-0 bg-surface-base rounded-full flex items-center justify-center font-bold text-brand shadow-sm">1</div>
              <p>Нажмите <b>Поделиться</b> <Share size={16} className="inline text-brand mx-0.5 relative -top-[1px]" /> в меню браузера снизу.</p>
            </li>
            <li className="flex gap-4 items-center">
              <div className="w-8 h-8 shrink-0 bg-surface-base rounded-full flex items-center justify-center font-bold text-brand shadow-sm">2</div>
              <p>Выберите <b>На экран «Домой»</b> <PlusSquare size={16} className="inline text-content-main mx-0.5 relative -top-[1px]" />.</p>
            </li>
            <li className="flex gap-4 items-center">
              <div className="w-8 h-8 shrink-0 bg-surface-base rounded-full flex items-center justify-center font-bold text-brand shadow-sm">3</div>
              <p>Нажмите <b>Добавить</b> в правом верхнем углу.</p>
            </li>
          </ul>
          {/* У приложения на экране «Домой» своё хранилище, отдельное от Safari: войти
              придётся заново. Без этой строки человек решит, что его разлогинило */}
          <p className="text-[12px] text-content-muted leading-relaxed mt-4 px-1">
            Откройте приложение с иконки и войдите — после этого можно включить уведомления.
          </p>
        </div>
      ) : (
        <div className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-level2 text-brand shadow-sm">
            <Download size={28} />
          </div>
          <h2 className="text-[18px] font-bold text-content-main mb-3">Установить приложение</h2>
          <p className="text-content-muted text-[14px] mb-8 px-2 leading-relaxed">
            Установите Heco TR на ваше устройство для быстрого доступа, работы оффлайн и получения уведомлений.
          </p>
          {/* Без готового события установки (браузер его ещё не прислал или человек уже
              отказался) кнопка ничего бы не сделала — вместо неё путь через меню браузера */}
          {canPrompt ? (
            <ButtonLP
              variant="primary"
              onClick={promptInstall}
              className="mt-24 mb-12"
            >
              Установить сейчас
            </ButtonLP>
          ) : (
            <p className="text-content-main text-[14px] leading-relaxed p-5 rounded-2xl border border-surface-level2">
              Откройте меню браузера <MoreVertical size={16} className="inline text-brand mx-0.5 relative -top-[1px]" /> и выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
