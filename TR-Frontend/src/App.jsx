import React, { Suspense, lazy, useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; // Импортируем Portal для выноса в body
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { TeamLayout } from './TeamLayout';
import { UpdatePromptModal } from './components/UpdatePromptModal';
import { Toast } from './ui/Toast'; // Импортируем наш переиспользуемый компонент тостов
import { getPortalRoot } from './utils/helpers';

// ============================================================================
// ГЛОБАЛЬНЫЙ СЕТЕВОЙ ИНТЕРЦЕПТОР (СТРАТЕГИЯ №1)
// Перехватывает любые POST, PUT, DELETE, PATCH запросы когда сервер недоступен ДО отправки
// ============================================================================

// Разделяемое состояние между интерцептором (вне React) и компонентом App.
// Обновляется пингом к /api/health — не navigator.onLine.
export const networkState = { serverReachable: navigator.onLine };

// Маршруты авторизации перехватчик не блокирует никогда: сам запрос входа — самая честная
// проверка доступности сервера. Если бэкенд жив, а офлайн-флаг взведён ошибочно (медленный
// мобильный интернет, таймаут пинга), пользователь всё равно войдёт, а не упрётся в стену.
const OFFLINE_BYPASS_PATTERN = '/api/auth/';

const API_BASE = import.meta.env.VITE_API_URL || '';
// Пинг здоровья — служебный запрос, обновлением данных на экране он не является
const HEALTH_PATH = '/api/health';

if (typeof window !== 'undefined' && !window.__fetch_mutation_patched__) {
  window.__fetch_mutation_patched__ = true;
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource, config] = args;
    const method = (config?.method || 'GET').toUpperCase();
    // resource приходит строкой, объектом URL или Request — приводим к строке любой из вариантов
    const url = typeof resource === 'string' ? resource : String(resource?.url ?? resource ?? '');
    const isBypassed = url.includes(OFFLINE_BYPASS_PATTERN);
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

    // Следим только за обращениями к нашему API: судить о связи по реальным запросам
    // честнее, чем по одному пингу, — именно они наполняют экран данными.
    const isTracked = Boolean(API_BASE) && url.startsWith(API_BASE) && !url.includes(HEALTH_PATH);
    // Чтение данных — то, из-за чего на экране может оказаться устаревшая информация
    const isDataRead = isTracked && !isMutation;

    // Если сервер недоступен и совершается попытка изменить БД (мутация)
    if (!networkState.serverReachable && !isBypassed && isMutation) {
      // Генерируем глобальное событие для вызова Тоста о блокировке записи
      window.dispatchEvent(
        new CustomEvent('show-offline-mutation-toast', {
          detail: { message: 'Нет подключения. Изменения не сохранятся!' }
        })
      );

      // Возвращаем структурированный ответ с кодом 503, чтобы в вызывающих компонентах
      // сработали проверки (!res.ok) или блоки catch, сбросив лоадеры на кнопках.
      // Текст ошибки — по-русски: компоненты нередко показывают error как есть.
      return new Response(
        JSON.stringify({ success: false, error: 'Нет подключения к серверу. Изменения не сохранены.' }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Пока чтение данных в полёте — на экране может висеть старое: сообщаем об этом UI,
    // чтобы пользователь не принял ещё не обновлённую картинку за актуальную.
    if (isDataRead) window.dispatchEvent(new Event('net-read-start'));

    try {
      // Если сервер доступен или это обычный GET-запрос чтения — пропускаем дальше в штатном режиме
      const res = await originalFetch.apply(this, args);
      // Сервер ответил — связь есть, даже если код ответа сам по себе с ошибкой
      if (isTracked) window.dispatchEvent(new CustomEvent('net-result', { detail: { reachable: true } }));
      return res;
    } catch (err) {
      // AbortError — это отмена запроса самим приложением (поиск, размонтирование),
      // а не потеря связи: за офлайн такое принимать нельзя.
      if (isTracked && err?.name !== 'AbortError') {
        window.dispatchEvent(new CustomEvent('net-result', { detail: { reachable: false } }));
      }
      throw err;
    } finally {
      if (isDataRead) window.dispatchEvent(new Event('net-read-end'));
    }
  };
}

// Разделяем код standard страниц на независимые чанки
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(module => ({ default: module.SchedulePage })));
const MyTeamPage = lazy(() => import('./pages/MyTeamPage').then(module => ({ default: module.MyTeamPage })));
const TournamentsPage = lazy(() => import('./pages/TournamentsPage').then(module => ({ default: module.TournamentsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage').then(module => ({ default: module.SubscriptionPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(module => ({ default: module.PrivacyPage })));

// Чанки страниц раздела Руководства — ИСПРАВЛЕНЫ пути импорта для сборщика Vite
const CreateEventPage = lazy(() => import('./pages/manager/CreateEventPage').then(m => ({ default: m.CreateEventPage })));
const SeasonRostersPage = lazy(() => import('./pages/manager/SeasonRostersPage').then(m => ({ default: m.SeasonRostersPage })));
const FinancesPage = lazy(() => import('./pages/manager/FinancesPage').then(m => ({ default: m.FinancesPage })));
const HandbooksPage = lazy(() => import('./pages/manager/HandbooksPage').then(m => ({ default: m.HandbooksPage })));

// Минималистичный индикатор загрузки для плавного перехода между экранами
const PageLoader = () => (
  <div className="flex items-center justify-center w-full h-full min-h-[60vh]">
    <span className="text-[10px] font-black text-content-muted uppercase tracking-widest animate-pulse">
      Загрузка...
    </span>
  </div>
);

const PING_INTERVAL_MS = 15000;       // обычный интервал опроса, когда сервер отвечает
const PING_RETRY_INTERVAL_MS = 4000;  // ускоренный опрос, пока связи нет
const PING_TIMEOUT_MS = 10000;        // холодный старт мобильной сети (DNS + TCP + TLS) легко занимает 3-5 с
const PING_TIMEOUTS_TO_OFFLINE = 3;   // одиночный таймаут — не повод блокировать запись

// Исход пинга различаем по природе сбоя, а не просто «получилось / не получилось»:
//   PING_OK      — сервер ответил;
//   PING_TIMEOUT — не уложился в PING_TIMEOUT_MS: сеть может быть просто медленной;
//   PING_FAILED  — соединение отбито сразу (нет маршрута, DNS, RST, CORS) или сервер вернул
//                  ошибку. Это определённый ответ «связи нет», ждать подтверждений незачем.
const PING_OK = 'ok';
const PING_TIMEOUT = 'timeout';
const PING_FAILED = 'failed';

const REFRESH_BANNER_DELAY_MS = 300;  // короткие обновления плашку не показывают — иначе она мигает
const REFRESH_STALL_MS = 10000;       // дольше этого — это уже не «обновляем», а «связи нет»

const pingServer = async () => {
  // AbortController вместо AbortSignal.timeout: последний появился только в Safari 16,
  // а на iOS 15 бросает TypeError прямо здесь — приложение навсегда уходило в офлайн.
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, PING_TIMEOUT_MS);

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok ? PING_OK : PING_FAILED;
  } catch {
    return didTimeout ? PING_TIMEOUT : PING_FAILED;
  } finally {
    clearTimeout(timeoutId);
  }
};

export default function App() {
  // Единый глобальный статус подключения к серверу для плавающего баннера.
  // Определяется активным пингом /api/health, а не navigator.onLine.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Идёт ли прямо сейчас чтение данных с сервера. Нужно, чтобы у баннера не было
  // «немого» состояния: пока данные не подтверждены, пользователь видит плашку обновления,
  // а пустой экран без плашки означает ровно одно — на экране свежие данные.
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Состояние отображения глобального тоста блокировки мутаций в офлайне
  const [mutationToast, setMutationToast] = useState({ isOpen: false, message: '' });

  const applyReachability = (reachable) => {
    networkState.serverReachable = reachable;
    setIsOnline(reachable);
  };

  useEffect(() => {
    let timeoutId;
    let cancelled = false;
    let timeouts = 0;
    // Номер поколения цикла: событие online перезапускает опрос, и уже висящий в ожидании
    // ответа пинг не должен после возврата запустить второй параллельный цикл.
    let generation = 0;

    // Самопланирующийся цикл вместо setInterval: пока сервер молчит, опрашиваем чаще,
    // чтобы связь восстанавливалась быстро, а не раз в 15 секунд.
    const check = async (gen) => {
      const result = await pingServer();
      if (cancelled || gen !== generation) return;

      if (result === PING_OK) {
        timeouts = 0;
        applyReachability(true);
      } else if (result === PING_FAILED) {
        // Сеть ответила отказом сразу — это не медленный канал, а его отсутствие
        // (в том числе ограничения мобильного оператора). Показываем офлайн немедленно.
        timeouts = 0;
        applyReachability(false);
      } else {
        // Таймаут: канал может быть просто медленным. В офлайн уходим только после
        // нескольких подряд, чтобы холодный LTE не блокировал запись в БД.
        timeouts += 1;
        if (timeouts >= PING_TIMEOUTS_TO_OFFLINE) applyReachability(false);
      }

      timeoutId = setTimeout(
        () => check(gen),
        result === PING_OK ? PING_INTERVAL_MS : PING_RETRY_INTERVAL_MS
      );
    };

    // Физически нет сети — сразу скрываем, без пинга
    const handleOffline = () => {
      timeouts = PING_TIMEOUTS_TO_OFFLINE;
      applyReachability(false);
    };
    // Сеть появилась — проверяем сервер немедленно, не ждём интервала
    const handleOnline = () => {
      clearTimeout(timeoutId);
      timeouts = 0;
      generation += 1;
      check(generation);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Первая проверка при старте, дальше цикл планирует себя сам
    check(generation);

    return () => {
      cancelled = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearTimeout(timeoutId);
    };
  }, []);

  // Статус по фактическим запросам данных, а не только по пингу. Это закрывает разрыв,
  // из-за которого пользователь успевал увидеть неактуальный экран до того, как загорался
  // баннер: при блокировке провайдером запрос отбивается сразу, и плашка честно краснеет.
  useEffect(() => {
    let inflight = 0;
    let showTimerId;
    let stallTimerId;

    const handleReadStart = () => {
      inflight += 1;
      if (inflight > 1) return;

      showTimerId = setTimeout(() => setIsRefreshing(true), REFRESH_BANNER_DELAY_MS);
      // Обновление, которое не завершилось за REFRESH_STALL_MS, перестаём выдавать за
      // «сейчас догрузим»: для пользователя это уже отсутствие связи.
      stallTimerId = setTimeout(() => applyReachability(false), REFRESH_STALL_MS);
    };

    const handleReadEnd = () => {
      inflight = Math.max(0, inflight - 1);
      if (inflight > 0) return;

      clearTimeout(showTimerId);
      clearTimeout(stallTimerId);
      setIsRefreshing(false);
    };

    const handleResult = (e) => applyReachability(Boolean(e.detail?.reachable));

    window.addEventListener('net-read-start', handleReadStart);
    window.addEventListener('net-read-end', handleReadEnd);
    window.addEventListener('net-result', handleResult);

    return () => {
      window.removeEventListener('net-read-start', handleReadStart);
      window.removeEventListener('net-read-end', handleReadEnd);
      window.removeEventListener('net-result', handleResult);
      clearTimeout(showTimerId);
      clearTimeout(stallTimerId);
    };
  }, []);

  // Контроль подписки на событие системного шинного перехвата fetch-интерцептора
  useEffect(() => {
    const handleShowOfflineToast = (e) => {
      setMutationToast({
        isOpen: true,
        message: e.detail?.message || 'Действие недоступно в офлайн-режиме.'
      });
    };

    window.addEventListener('show-offline-mutation-toast', handleShowOfflineToast);
    return () => {
      window.removeEventListener('show-offline-mutation-toast', handleShowOfflineToast);
    };
  }, []);

  // Инициализируем тему на этапе старта приложения
  useEffect(() => {
    const isDark = localStorage.getItem('tr_theme') === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#242424' : '#f3f4f6');
    }
  }, []);

  // Инициализируем пользовательский масштаб интерфейса (настройка размера шрифта)
  useEffect(() => {
    const savedScale = localStorage.getItem('tr_ui_scale') || '1';
    document.documentElement.style.setProperty('--ui-scale', savedScale);
  }, []);

  // Инициализируем менеджер жизненного цикла Service Worker
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Каждые 5 минут принудительно опрашиваем сервер на наличие обновлений кода
      if (r) {
        setInterval(() => {
          r.update();
        }, 5 * 60 * 1000);
      }
    },
  });

  // Три состояния одной плашки. Скрыта она только тогда, когда данные на экране
  // подтверждены сервером — «пусто» больше не может означать «не знаем».
  const connectionBanner = !isOnline
    ? {
        text: 'Нет подключения',
        shell: 'bg-[#1a080a]/90 border-red-500/20',
        dot: 'bg-red-500',
        label: 'text-red-400',
      }
    : isRefreshing
      ? {
          text: 'Обновляем данные',
          shell: 'bg-[#0d1017]/90 border-white/15',
          dot: 'bg-slate-300',
          label: 'text-slate-300',
        }
      : null;

  // Фон полей вокруг приложения (видны только на ПК, где оболочка сужена до 800px).
  // Задан инлайном, а не классом bg-surface-canvas: класс требует, чтобы Tailwind
  // пересобрал конфиг, а переменная из global.css подхватывается браузером напрямую —
  // цвет можно править без перезапуска dev-сервера.
  // Важно: этот div обязан иметь фон. Он лежит поверх body, у которого в index.html
  // цвет зашит жёстко (#f3f4f6 / #242424) — без своего фона поля показывали бы body
  // и на правку переменной не реагировали.
  return (
    <div
      className="fixed inset-0 w-full h-[100dvh] flex flex-col text-content font-sans overflow-hidden overscroll-none transition-colors duration-300"
      style={{ backgroundColor: 'var(--color-surface-canvas)' }}
    >

      {/* Заливка системных safe-area зон (edge-to-edge, viewport-fit=cover):
          верх = статус-бар, низ = системная панель навигации Android.
          Цвет surface-base (#f3f4f6 / #242424). На устройствах без вырезов высота = 0. */}
      <div className="fixed top-0 inset-x-0 z-[5] bg-surface-base pointer-events-none" style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="fixed bottom-0 inset-x-0 z-[5] bg-surface-base pointer-events-none" style={{ height: 'env(safe-area-inset-bottom)' }} />

      {/* Edge-to-edge: контент сдвигаем внутрь безопасной зоны через padding на оболочке.
          Порталы (тосты/шторки) лежат в #app-portal-root и сами учитывают env() — их не трогаем. */}
      {/* bg-surface-border на оболочке обязателен: TeamLayout и страницы прозрачные,
          раньше фон приложения давал корневой div. Теперь корень красится в
          surface-canvas (поля на ПК), поэтому собственный фон переехал сюда — иначе
          на тёмной теме приложение потемнело бы до цвета полей. */}
      <div
        id="app-shell"
        className="relative z-10 w-full h-full max-w-[800px] mx-auto overflow-hidden bg-surface-border shadow-[0_0_80px_rgba(0,0,0,0.07)] min-[800px]:shadow-none"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Фоновые decorative элементы — ВНУТРИ оболочки, а не под ней. Рисовались для
            мобильного вида, где оболочка занимает весь экран; на ПК она сужена до 800px,
            и снаружи эти слои читались как грязь на полях. Клипуются overflow-hidden
            оболочки; на телефоне вид не меняется.
            Порог min-[800px] = ширина самой оболочки: ровно с этой точки экран шире
            приложения, то есть начинается «версия для ПК». Шум там убран совсем —
            на большой площади зерно читается как загрязнение, а не как текстура. */}
        <div className="absolute top-1/4 right-[-20%] w-80 h-80 bg-brand-glow saturate-[40%] blur-ambient rounded-full pointer-events-none z-0 opacity-100"></div>
        <div className="absolute inset-0 w-full h-full bg-noise mix-blend-overlay pointer-events-none z-0 min-[800px]:hidden"></div>

        {/* Масштабирующий слой: компенсированный transform-scale, управляемый переменной --ui-scale
            (настройка размера шрифта в SettingsPage). Отступы safe-area специально оставлены на
            внешнем #app-shell — они физические и не должны увеличиваться вместе с интерфейсом.
            relative z-10 — чтобы контент лёг поверх декоративных слоёв выше. */}
        <div
          className="relative z-10 flex flex-col overflow-hidden overflow-x-hidden scrollbar-hide"
          style={{
            width: 'calc(100% / var(--ui-scale, 1))',
            height: 'calc(100% / var(--ui-scale, 1))',
            transform: 'scale(var(--ui-scale, 1))',
            transformOrigin: 'top left',
          }}
        >
          {/* Точка монтирования всех порталов (шторки, тосты, попперы), чтобы они оставались внутри 800px-контейнера */}
          <div id="app-portal-root" className="absolute inset-0 z-[200] pointer-events-none" />

          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* Публичная страница политики — доступна без авторизации (модерация платёжных систем) */}
                <Route path="/privacy" element={<PrivacyPage />} />

                <Route element={<TeamLayout />}>
                  <Route path="/" element={<SchedulePage />} />
                  <Route path="/event/:eventType/:eventId" element={<SchedulePage />} />
                  <Route path="/my-team" element={<MyTeamPage />} />
                  <Route path="/tournaments" element={<TournamentsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/subscription" element={<SubscriptionPage />} />

                  <Route path="/manager/create-event" element={<CreateEventPage />} />
                  <Route path="/manager/season-rosters" element={<SeasonRostersPage />} />
                  <Route path="/application/:appId" element={<SeasonRostersPage />} />
                  <Route path="/manager/finances" element={<FinancesPage />} />
                  <Route path="/manager/handbooks" element={<HandbooksPage />} />
                </Route>

                {/* Автоматический редирект для любых неописанных путей */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </div>
      </div>

      {/* ФИКСИРОВАННЫЙ ТОП-ЦЕНТР БАННЕР СОСТОЯНИЯ СВЯЗИ НАД ВСЕМИ СЛОЯМИ */}
      {connectionBanner && createPortal(
        <div
          className="absolute left-0 right-0 mx-auto w-max z-[999999] pointer-events-none"
          style={{
            animationName: 'tr-pure-layout-offline',
            animationDuration: '300ms',
            animationTimingFunction: 'cubic-bezier(0.21, 1.02, 0.43, 1.01)',
            animationFillMode: 'both'
          }}
        >
          <style>
            {`
              @keyframes tr-pure-layout-offline {
                0% {
                  top: -50px;
                  opacity: 0;
                }
                100% {
                  top: calc(env(safe-area-inset-top, 0px) + 12px);
                  opacity: 1;
                }
              }
            `}
          </style>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-xl shadow-black/50 ${connectionBanner.shell}`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${connectionBanner.dot}`} />
            <span className={`text-[10px] font-black uppercase tracking-widest select-none whitespace-nowrap ${connectionBanner.label}`}>
              {connectionBanner.text}
            </span>
          </div>
        </div>,
        getPortalRoot()
      )}

      {/* ГЛОБАЛЬНЫЙ ТОСТ ПРЕДУПРЕЖДЕНИЯ О БЛОКИРОВКЕ ОФЛАЙН-МУТАЦИЙ */}
      <Toast 
        isOpen={mutationToast.isOpen}
        message={mutationToast.message}
        type="danger"
        onClose={() => setMutationToast(prev => ({ ...prev, isOpen: false }))}
      />

      {/* ГЛОБАЛЬНЫЙ ИНТЕРАКТИВНЫЙ ОБНОВЛЯТОР КОДА PWA С СПИСКОМ ИЗМЕНЕНИЙ */}
      <UpdatePromptModal 
        isOpen={needRefresh}
        onUpdate={() => updateServiceWorker(true)}
        onLater={() => setNeedRefresh(false)}
      />

    </div>
  );
}