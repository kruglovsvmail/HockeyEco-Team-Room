/********** ФАЙЛ: TR-Frontend\src\App.jsx **********/

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import { TeamLayout } from './TeamLayout';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    // Глобальный контейнер с использованием новых уровней поверхности
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface-level2 via-surface-level1 to-surface-base text-content font-sans overflow-hidden overscroll-none">
      
      {/* Декоративные свечения с использованием системного блюра 'ambient' и прозрачности 'glow' */}
      <div className="absolute top-[-10%] right-[-10%] w-80 h-80 bg-brand-glow blur-ambient rounded-full pointer-events-none z-0"></div>
      <div className="absolute bottom-[20%] left-[-20%] w-64 h-64 bg-brand-glow blur-ambient rounded-full pointer-events-none z-0"></div>

      {/* Обертка для контента роутера */}
      <div className="relative z-10 w-full h-full flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide">
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