import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../utils/helpers';

// Картинка состава на матч / расстановки на тренировку. Собирает её сервер
// (TR-Backend services/formationImageService.js); приложение только забирает готовую.
// Раньше её снимал телефон того, кто сохранял состав (html-to-image), и на iPhone
// в ней пропадали фото и рисовались серые полосы вместо теней.
//
// Хук живёт на странице события, а не во вкладке «Состав»: картинка подтягивается
// заранее, и «Поделиться» срабатывает сразу. Сервер отвечает ETag-ом, поэтому
// повторный запрос при каждом перечитывании события стоит 304 без тела.
//
// status: 'idle' — запрашивать нечего; 'loading' — ждём; 'ready' — file готов;
// 'empty' — расстановки нет; 'error' — не получилось (invalidate() — попробовать ещё).
export function useFormationImage(path, { enabled = true, refreshKey, fileName = 'sostav.jpg' } = {}) {
  const [state, setState] = useState({ file: null, status: 'idle' });
  const requestId = useRef(0);

  // drop — выбросить то, что есть, и ждать свежую. Нужен сразу после сохранения
  // состава: иначе по «Поделиться» ушла бы прежняя картинка, пока едет новая.
  const load = useCallback(async ({ drop = false } = {}) => {
    if (!path) return;
    const id = ++requestId.current;
    setState(prev => (drop || !prev.file ? { file: null, status: 'loading' } : prev));
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const resp = await fetch(`${apiUrl}${path}`, { headers: getAuthHeaders(), cache: 'no-cache' });
      if (id !== requestId.current) return;
      if (resp.status === 204) {
        setState({ file: null, status: 'empty' });
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (id !== requestId.current) return;
      setState({
        file: { blob, file: new File([blob], fileName, { type: blob.type || 'image/jpeg' }) },
        status: 'ready',
      });
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('Не удалось получить картинку состава:', err);
      // Фоновое перечитывание не удалось — прежняя картинка остаётся в силе
      setState(prev => (prev.file && !drop ? prev : { file: null, status: 'error' }));
    }
  }, [path, fileName]);

  useEffect(() => {
    if (!enabled || !path) {
      requestId.current++;
      setState({ file: null, status: 'idle' });
      return;
    }
    load();
  }, [enabled, path, refreshKey, load]);

  const invalidate = useCallback(() => load({ drop: true }), [load]);

  return { ...state, invalidate };
}

// В буфер обмена браузеры принимают картинку только в PNG, а сервер отдаёт JPEG
const toPngBlob = async (blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(png => (png ? resolve(png) : reject(new Error('PNG не собрался'))), 'image/png');
  });
};

/**
 * Отдать картинку: телефон — системное «Поделиться», компьютер без него — буфер
 * обмена, последний резерв — скачивание файла.
 * Вызывать прямо из обработчика нажатия и без await перед ним: iOS открывает
 * «Поделиться» только синхронно из жеста пользователя.
 * notify(message, type) — показать тост; what — «состава» / «расстановки».
 */
export function shareFormationImage({ blob, file }, { notify, what }) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => { /* пользователь закрыл окно */ });
    return;
  }

  (async () => {
    if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
      try {
        // Промис, а не готовый PNG: Safari требует отдать ClipboardItem ещё в жесте
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': toPngBlob(blob) })]);
        notify(`Картинка ${what} скопирована в буфер обмена`, 'success');
        return;
      } catch { /* буфер недоступен — скачиваем */ }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify(`Картинка ${what} сохранена`, 'success');
  })();
}
