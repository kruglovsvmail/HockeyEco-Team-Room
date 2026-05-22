import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { TeamLayout } from './TeamLayout';
import { UpdatePromptModal } from './components/UpdatePromptModal';

// Разделяем код страниц на независимые чанки
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(module => ({ default: module.SchedulePage })));
const MyTeamPage = lazy(() => import('./pages/MyTeamPage').then(module => ({ default: module.MyTeamPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })));

// Минималистичный индикатор загрузки для плавного перехода между экранами
const PageLoader = () => (
  <div className="flex items-center justify-center w-full h-full min-h-[60vh]">
    <span className="text-[11px] font-black text-content-muted uppercase tracking-widest animate-pulse">
      Загрузка...
    </span>
  </div>
);

export default function App() {
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
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-surface-base text-content font-sans overflow-hidden overscroll-none">
      
      {/* Фоновые decorative элементы */}
      <div className="absolute top-1/4 right-[-20%] w-80 h-80 bg-brand-glow saturate-[40%] blur-ambient rounded-full pointer-events-none z-0 opacity-100"></div>
      <div className="absolute inset-0 w-full h-full bg-noise mix-blend-overlay z-0"></div>

      <div className="relative z-10 w-full h-full flex flex-col overflow-hidden overflow-x-hidden scrollbar-hide pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              <Route element={<TeamLayout />}>
                <Route path="/" element={<SchedulePage />} />
                <Route path="/my-team" element={<MyTeamPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              {/* Автоматический редирект для любых неописанных путей */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </div>

      {/* ГЛОБАЛЬНЫЙ ИНТЕРАКТИВНЫЙ ОБНОВЛЯТОР КОДА PWA С СПИСКОМ ИЗМЕНЕНИЙ */}
      <UpdatePromptModal 
        isOpen={needRefresh}
        onUpdate={() => updateServiceWorker(true)}
        onLater={() => setNeedRefresh(false)}
      />

    </div>
  );
}