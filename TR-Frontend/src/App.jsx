import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import { TeamLayout } from './TeamLayout';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    // Глобальный контейнер остается на весь экран. 
    // Фон теперь простой однотонный (bg-surface-base), чтобы свечение выделялось чище.
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-surface-base text-content font-sans overflow-hidden overscroll-none">
      
      {/* 
        Единственное радиальное свечение.
        
        КАК РЕГУЛИРОВАТЬ РАСПОЛОЖЕНИЕ:
        Управляйте классами 'top', 'left', 'bottom', 'right' и сдвигом '-translate'.
        
        Примеры:
        - Текущий (вверху по центру): top-1/4 left-1/2 -translate-x-1/2
        - Строго по центру: top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
        - Левый верхний угол: top-[-10%] left-[-10%]
        - Правый нижний угол: bottom-[-10%] right-[-10%]
        
        КАК РЕГУЛИРОВАТЬ РАЗМЕР:
        Меняйте w-96 и h-96 на нужные значения (например, w-[500px] h-[500px]).
      */}
      <div className="absolute top-1/4 right-[-20%] w-80 h-80 bg-brand/50 saturate-[40%] blur-ambient rounded-full pointer-events-none z-0 opacity-100"></div>

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