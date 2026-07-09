import { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../utils/helpers';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
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

      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/push/subscribe`, {
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
      if (data.success) { setIsSubscribed(true); setIsToggling(false); return true; }
      setIsToggling(false);
      return false;
    } catch (err) {
      console.error('Ошибка подписки на push:', err);
      setIsToggling(false);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsToggling(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setIsSubscribed(false); return true; }

      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      const apiUrl = import.meta.env.VITE_API_URL || '';
      await fetch(`${apiUrl}/api/push/unsubscribe`, {
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
