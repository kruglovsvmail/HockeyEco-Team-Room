import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import { TeamLayout } from './TeamLayout';
import { SchedulePage } from './pages/SchedulePage';
import { MyTeamPage } from './pages/MyTeamPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-surface-base text-content font-sans overflow-hidden overscroll-none">
      
      <div className="absolute top-1/4 right-[-20%] w-80 h-80 bg-brand-glow saturate-[40%] blur-ambient rounded-full pointer-events-none z-0 opacity-100"></div>
      <div className="absolute inset-0 w-full h-full bg-noise mix-blend-overlay z-0"></div>

      <div className="relative z-10 w-full h-full flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            <Route element={<TeamLayout />}>
              <Route path="/" element={<SchedulePage />} />
              <Route path="/my-team" element={<MyTeamPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </div>
    </div>
  );
}