import { useSyncExternalStore, useCallback } from 'react';
import { isStandaloneApp } from '../utils/helpers';

// Chrome (Android и ПК) присылает событие beforeinstallprompt, когда готов поставить
// приложение сам — по нему можно открыть системное окно установки одним нажатием.
// Событие приходит один раз и сразу после загрузки страницы, раньше, чем успевают
// загрузиться ленивые страницы. Поэтому слушаем его здесь, на уровне модуля: модуль
// подключён в main.jsx до отрисовки приложения, а экран входа, сайдбар и шторка
// установки читают уже пойманное событие через хук.
let deferredPrompt = null;
let isInstalled = typeof window !== 'undefined' && isStandaloneApp();
let snapshot = { canPrompt: false, isInstalled };
const listeners = new Set();

const emit = () => {
  snapshot = { canPrompt: !!deferredPrompt, isInstalled };
  listeners.forEach((listener) => listener());
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Без preventDefault Chrome сам покажет свою плашку внизу — показываем своё окно по кнопке
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    isInstalled = true;
    emit();
  });

  // Приложение могли открыть с иконки, пока вкладка жила (ПК: «Открыть в приложении»)
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    if (isStandaloneApp()) {
      isInstalled = true;
      emit();
    }
  });
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

/**
 * canPrompt — браузер готов поставить приложение одним нажатием (promptInstall).
 * isInstalled — страница открыта установленным приложением или установка только что прошла.
 * promptInstall возвращает true, если человек согласился.
 */
export function useInstallPrompt() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    const event = deferredPrompt;
    // Событие одноразовое: повторный prompt() у него бросает ошибку, и кнопка молча
    // переставала бы работать. Забываем его сразу — после отказа следующее нажатие
    // откроет шторку с подсказкой, как поставить приложение через меню браузера.
    deferredPrompt = null;
    emit();
    event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      isInstalled = true;
      emit();
      return true;
    }
    return false;
  }, []);

  return { ...state, promptInstall };
}
