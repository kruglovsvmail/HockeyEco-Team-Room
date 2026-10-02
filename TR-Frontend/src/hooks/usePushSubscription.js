import { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../utils/helpers';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// «На этом устройстве про уведомления уже решили»: человек ответил на окно после
// установки (PushPromptModal) или сам выключил уведомления в Настройках. Пока ключ
// стоит, окно не появляется. Хранится на устройстве, а не в аккаунте: уведомления —
// свойство конкретного телефона. Снимается при выходе из аккаунта (releaseDevicePush) —
// следующему, кто войдёт на этом устройстве, окно покажется снова.
export const PUSH_PROMPT_DONE_KEY = 'teampwa_push_prompt_done';

export const markPushPromptDone = () => localStorage.setItem(PUSH_PROMPT_DONE_KEY, '1');
export const isPushPromptDone = () => localStorage.getItem(PUSH_PROMPT_DONE_KEY) === '1';

const isPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;

const apiUrl = () => import.meta.env.VITE_API_URL || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function getDeviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone Safari';
  if (/Android/.test(ua)) return 'Android Chrome';
  return 'Desktop';
}

// Сервер хранит подписку по её адресу (endpoint): повторная отправка той же подписки
// ничего не дублирует, а только обновляет владельца, ключи и часовой пояс
async function sendSubscriptionToServer(sub) {
  const res = await fetch(`${apiUrl()}/api/push/subscribe`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      deviceLabel: getDeviceLabel(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  const data = await res.json();
  return !!data.success;
}

/**
 * Тихая перепроверка при запуске приложения. Телефон помнит свою подписку, а сервер мог
 * её потерять: запрос при включении не дошёл, сервер стёр подписку после ошибки доставки,
 * браузер сменил её адрес. Тумблер в Настройках при этом горел бы «вкл», а уведомления
 * не приходили бы вовсе. Поэтому подписку, которая есть на устройстве, каждый раз
 * отправляем на сервер заново. Новую подписку здесь не создаём никогда: если на устройстве
 * её нет, значит, человек уведомления не включал или выключил сам.
 */
export async function syncPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sendSubscriptionToServer(sub);
  } catch {
    // Не вышло сейчас — попробуем при следующем запуске или возвращении в приложение
  }
}

/**
 * Выход из аккаунта: устройство перестаёт получать уведомления этого аккаунта. Без этого
 * на телефон после выхода продолжали приходить уведомления прошлого владельца — в том
 * числе на общий или переданный другому человеку телефон.
 * Заголовок с токеном берём синхронно: вызывающий сразу после этого стирает токен.
 */
export function releaseDevicePush() {
  localStorage.removeItem(PUSH_PROMPT_DONE_KEY);
  if (!isPushSupported()) return;

  const headers = getAuthHeaders();
  navigator.serviceWorker.getRegistration()
    .then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return;
      const { endpoint } = sub;
      // Сначала отписываемся на устройстве: даже если запрос к серверу не дойдёт, следующая
      // отправка на этот адрес вернёт 410, и сервер сам удалит подписку (pushService.js)
      await sub.unsubscribe();
      await fetch(`${apiUrl()}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    })
    .catch(() => {});
}

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    const supported = isPushSupported();
    setIsSupported(supported);

    if (!supported) { setIsLoading(false); return; }

    setPermission(Notification.permission);

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    setIsToggling(true);

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') { setIsToggling(false); return false; }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const ok = await sendSubscriptionToServer(sub);
      if (ok) setIsSubscribed(true);
      setIsToggling(false);
      return ok;
    } catch (err) {
      console.error('Ошибка подписки на push:', err);
      setIsToggling(false);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsToggling(true);
    // Человек выключил уведомления сам — окно «включите уведомления» ему больше не показываем
    markPushPromptDone();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setIsSubscribed(false); setIsToggling(false); return true; }

      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      await fetch(`${apiUrl()}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });

      setIsSubscribed(false);
      setIsToggling(false);
      return true;
    } catch (err) {
      console.error('Ошибка отписки от push:', err);
      setIsToggling(false);
      return false;
    }
  }, []);

  return { isSupported, isSubscribed, isLoading, isToggling, permission, subscribe, unsubscribe };
}
