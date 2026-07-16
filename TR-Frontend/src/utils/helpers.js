export const getPortalRoot = () => {
  if (typeof document === 'undefined') return null;
  return document.getElementById('app-portal-root') || document.body;
};

// Замораживает физический пиксельный размер элемента (шрифт/ширину/высоту) против
// глобального масштаба интерфейса --ui-scale из настроек (SettingsPage → App.jsx).
// Компенсирует деление на scale заранее, чтобы после общего transform: scale() на #app-shell
// итоговый видимый размер оставался равен исходному px независимо от выбранного масштаба.
export const uiFixed = (px) => `calc(${px}px / var(--ui-scale, 1))`;

export const getToken = () => localStorage.getItem('teampwa_token') || sessionStorage.getItem('teampwa_token');

export const removeToken = () => {
  localStorage.removeItem('teampwa_token');
  sessionStorage.removeItem('teampwa_token');
  localStorage.removeItem('teampwa_user');
  sessionStorage.removeItem('teampwa_user');
  // Оффлайн-кэш профиля тоже стираем, иначе после разлогина TeamLayout
  // покажет старый профиль из кэша, как будто сессия ещё жива.
  localStorage.removeItem('teampwa_cached_user');
  localStorage.removeItem('teampwa_selected_team');
};

export const getAuthHeaders = () => {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/**
 * Формирует прямую ссылку на файл в S3 Timeweb.
 * Пример: 'avatars/user_1.jpg' -> 'https://hockeyeco-uploads.s3.twcstorage.ru/avatars/user_1.jpg'
 */
export const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  
  const S3_BUCKET = 'hockeyeco-uploads';
  const S3_ENDPOINT = 's3.twcstorage.ru';
  
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Конструкция URL для Timeweb S3: https://[bucket].[endpoint]/[path]
  return `https://${S3_BUCKET}.${S3_ENDPOINT}/${cleanPath}`;
};

/**
 * Математический расчет контраста YIQ (W3C Стандарт).
 * Определяет, какой текст лучше читать на переданном HEX-фоне — белый или темный.
 */
export const getContrastTextColor = (hexColor) => {
  if (!hexColor) return 'text-white'; // Дефолт для серого цвета клуба
  
  const cleanHex = hexColor.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 184 ? 'text-content-main' : 'text-white';
};

// =============================================================================
// СЕТЕВОЙ ГЛОБАЛЬНЫЙ ИНТЕРЦЕПТОР 403 ОШИБОК (БЕЗБЛИКОВАЯ РЕВАЛИДАЦИЯ UX)
// =============================================================================

let isRevalidating = false;
let revalidatePromise = null;

if (typeof window !== 'undefined' && !window.__fetchInterceptorInitialized) {
  window.__fetchInterceptorInitialized = true;
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch(...args);

    // Если сервер ответил кодом 401 (Токен отсутствует/потерян на бэкенде).
    // Бэкенд возвращает 401 только когда заголовка Authorization нет вовсе —
    // значит сессия фактически невалидна. Снимаем токен и уводим на логин,
    // чтобы UI не оставался "молча пустым" с цепочкой 401 в консоли.
    if (response.status === 401) {
      const url = args[0];
      const urlStr = typeof url === 'string' ? url : (url?.url || '');
      const isAuthEndpoint = urlStr.includes('/api/auth/');
      const isOnLoginPage = typeof window !== 'undefined' && window.location?.pathname === '/login';

      if (!isAuthEndpoint && !isOnLoginPage) {
        removeToken();
        // Используем замену URL, а не pushState, чтобы кнопка "назад"
        // не возвращала пользователя на страницу, где он только что разлогинился.
        if (typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      }
    }

    // Если сервер ответил кодом 403 (Доступ запрещен или истекла подписка)
    if (response.status === 403) {
      const url = args[0];
      // Защита от зацикливания: не перехватываем сам запрос проверки профиля
      const isMeEndpoint = typeof url === 'string' && (url.includes('/api/auth/me') || url.includes('/me'));

      if (!isMeEndpoint && getToken()) {
        if (!isRevalidating) {
          isRevalidating = true;
          
          // Выполняем строго ОДИН микро-запрос на бэкенд для извлечения свежей матрицы прав
          revalidatePromise = originalFetch('/api/auth/me', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            }
          })
          .then(res => {
            if (res.status === 401 || res.status === 403) {
              // Сессия полностью уничтожена (токен протух или отозван).
              // Стираем токен и уводим на логин, иначе пользователь остаётся
              // "залогиненным" с пустым приложением и цепочкой 403 в консоли.
              removeToken();
              if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
                window.location.replace('/login');
              }
              return null;
            }

            // БЕЗОПАСНАЯ ПРОВЕРКА CONTENT-TYPE: Предотвращает краш парсинга HTML-страниц ошибок
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              return null; // Сервер вернул текстовый HTML вместо валидного JSON
            }

            return res.json();
          })
          .then(data => {
            if (data && data.success && data.user) {
              // Обновляем кэш профиля в локальном хранилище устройства
              localStorage.setItem('teampwa_user', JSON.stringify(data.user));
              
              // Генерируем системное событие для синхронизации и плавного изменения стейта React
              window.dispatchEvent(new CustomEvent('pwa_auth_matrix_refresh', { detail: data.user }));
            }
            return data;
          })
          .catch(err => {
            console.error('[Fetch Interceptor Error]: Ошибка обновления матрицы прав:', err);
          })
          .finally(() => {
            // Размораживаем флаг по окончании операции
            isRevalidating = false;
            revalidatePromise = null;
          });
        }

        // Вся лавина параллельных запросов плавно ждет выполнения одной этой микро-проверки
        await revalidatePromise;
      }
    }

    return response;
  };
}