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

if (typeof window !== 'undefined' && !window.__fetch_mutation_patched__) {
  window.__fetch_mutation_patched__ = true;
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource, config] = args;
    const method = (config?.method || 'GET').toUpperCase();

    // Если сервер недоступен и совершается попытка изменить БД (мутация)
    if (!networkState.serverReachable && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      // Генерируем глобальное событие для вызова Тоста о блокировке записи
      window.dispatchEvent(
        new CustomEvent('show-offline-mutation-toast', {
          detail: { message: 'Нет подключения. Изменения не сохранятся!' }
        })
      );

      // Возвращаем структурированный ответ с кодом 503, чтобы в вызывающих компонентах
      // сработали проверки (!res.ok) или блоки catch, сбросив лоадеры на кнопках
      return new Response(
        JSON.stringify({ success: false, error: 'Database mutation blocked due to offline state' }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Если сервер доступен или это обычный GET-запрос чтения — пропускаем дальше в штатном режиме
    return originalFetch.apply(this, args);
  };
}

// Разделяем код standard страниц на независимые чанки
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(module => ({ default: module.SchedulePage })));
const MyTeamPage = lazy(() => import('./pages/MyTeamPage').then(module => ({ default: module.MyTeamPage })));
const TournamentsPage = lazy(() => import('./pages/TournamentsPage').then(module => ({ default: module.TournamentsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })));

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

const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 4000;

const pingServer = async () => {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
};

export default function App() {
  // Единый глобальный статус подключения к серверу для плавающего баннера.
  // Определяется активным пингом /api/health, а не navigator.onLine.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Состояние отображения глобального тоста блокировки мутаций в офлайне
  const [mutationToast, setMutationToast] = useState({ isOpen: false, message: '' });

  const applyReachability = (reachable) => {
    networkState.serverReachable = reachable;
    setIsOnline(reachable);
  };

  useEffect(() => {
    let intervalId;

    const check = async () => {
      const reachable = await pingServer();
      applyReachability(reachable);
    };

    // Физически нет сети — сразу скрываем, без пинга
    const handleOffline = () => applyReachability(false);
    // Сеть появилась — проверяем сервер немедленно, не ждём интервала
    const handleOnline = () => check();

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Первая проверка при старте и периодический пинг
    check();
    intervalId = setInterval(check, PING_INTERVAL_MS);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearInterval(intervalId);
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

  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-surface-border text-content font-sans overflow-hidden overscroll-none transition-colors duration-300">
      
      {/* Фоновые decorative элементы */}
      <div className="absolute top-1/4 right-[-20%] w-80 h-80 bg-brand-glow saturate-[40%] blur-ambient rounded-full pointer-events-none z-0 opacity-100"></div>
      <div className="absolute inset-0 w-full h-full bg-noise mix-blend-overlay z-0"></div>

      {/* Заливка системных safe-area зон (edge-to-edge, viewport-fit=cover):
          верх = статус-бар, низ = системная панель навигации Android.
          Цвет surface-base (#f3f4f6 / #242424). На устройствах без вырезов высота = 0. */}
      <div className="fixed top-0 inset-x-0 z-[5] bg-surface-base pointer-events-none" style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="fixed bottom-0 inset-x-0 z-[5] bg-surface-base pointer-events-none" style={{ height: 'env(safe-area-inset-bottom)' }} />

      {/* Edge-to-edge: контент сдвигаем внутрь безопасной зоны через padding на оболочке.
          Порталы (тосты/шторки) лежат в #app-portal-root и сами учитывают env() — их не трогаем. */}
      <div
        id="app-shell"
        className="relative z-10 w-full h-full max-w-[1000px] mx-auto flex flex-col overflow-hidden overflow-x-hidden scrollbar-hide shadow-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Точка монтирования всех порталов (шторки, тосты, попперы), чтобы они оставались внутри 1000px-контейнера */}
        <div id="app-portal-root" className="absolute inset-0 z-[200] pointer-events-none" />

        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              <Route element={<TeamLayout />}>
                <Route path="/" element={<SchedulePage />} />
                <Route path="/event/:eventType/:eventId" element={<SchedulePage />} />
                <Route path="/my-team" element={<MyTeamPage />} />
                <Route path="/tournaments" element={<TournamentsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />

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

      {/* ФИКСИРОВАННЫЙ ТОП-ЦЕНТР БАННЕР ОФФЛАЙНА НАД ВСЕМИ СЛОЯМИ */}
      {!isOnline && createPortal(
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

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a080a]/90 backdrop-blur-md border border-red-500/20 shadow-xl shadow-black/50">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest select-none whitespace-nowrap">
              Нет подключения
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