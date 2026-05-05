import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import { TeamLayout } from './TeamLayout';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    // Глобальный контейнер остается на весь экран (под статус-баром)
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface-level2 via-surface-level1 to-surface-base text-content font-sans overflow-hidden overscroll-none">
      
      {/* Декоративные свечения */}
      <div className="absolute top-[-10%] right-[-10%] w-80 h-80 bg-brand-glow blur-ambient rounded-full pointer-events-none z-0"></div>
      <div className="absolute bottom-[20%] left-[-10%] w-64 h-64 bg-brand-glow blur-ambient rounded-full pointer-events-none z-0"></div>
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-brand-glow to-transparent pointer-events-none z-0"></div>

      {/* НОВОЕ: Слой с шумом для маскировки "разводов" (banding). 
          Он перекрывает все фоны, сглаживая переходы. */}
      <div className="absolute inset-0 w-full h-full bg-noise mix-blend-overlay z-0"></div>

      {/* НОВОЕ: Обертка для контента с отступами safe-area. 
          Градиент фона будет виден под системными панелями, а сам контент не налезет на часы или свайп-бар. */}
      <div className="relative z-10 w-full h-full flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            <Route element={<TeamLayout />}>
              <Route path="/" element={<DashboardPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </div>
    </div>
  );
}