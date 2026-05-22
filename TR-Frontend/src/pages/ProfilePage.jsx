import React from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken } from '../utils/helpers';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';

export function ProfilePage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  // Подключаем страницу профиля к глобальному диспетчеру автоматического обновления.
  // Пока экран не делает изолированных fetch-запросов, передаем пустую функцию-заглушку.
  useFocusRevalidate(() => {
    // Сюда можно добавить локальный сброс кэша или fetchProfileData, когда расширишь этот экран
  });

  return (
    <div className="flex flex-col h-full px-4 pt-6 bg-surface-border">
      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Профиль игрока
        </h1>
      </div>

      <div className="flex-1 flex flex-col justify-end pb-8">
         <button 
           onClick={handleLogout} 
           className="w-full py-4 rounded-xl border border-danger/30 text-danger bg-danger/10 font-bold uppercase tracking-widest text-xs hover:bg-danger/20 transition-colors outline-none shadow-sm"
         >
           Выйти из аккаунта
         </button>
      </div>
    </div>
  );
}