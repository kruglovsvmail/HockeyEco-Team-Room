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

  useFocusRevalidate(() => {
    // Диспетчер автоматического обновления экрана при возврате фокуса
  });

  return (
    <div className="flex flex-col h-full px-4 pt-6 bg-surface-base overflow-y-auto scrollbar-hide transition-colors duration-300">
      
      {/* Заголовок экрана */}
      <div className="shrink-0 mb-4 text-left">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Профиль игрока
        </h1>
      </div>

      {/* Информационный контейнер профиля */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm text-left transition-colors duration-300">
          <span className="text-[10px] font-black text-brand uppercase tracking-widest mb-3 block border-b border-surface-border pb-1.5">
            Учетная запись PWA
          </span>
          <p className="text-xs font-semibold text-content-muted leading-relaxed">
            Добро пожаловать в персональный кабинет игрока. Здесь вы можете управлять сессией подключения к цифровой платформе HockeyEco.
          </p>
        </div>
      </div>

      {/* Подвал: Системная кнопка выхода */}
      <div className="shrink-0 pb-8 mt-6">
         <button 
           onClick={handleLogout} 
           className="w-full py-4 rounded-xl border border-danger text-danger bg-danger-muted font-bold uppercase tracking-widest text-xs transition-opacity outline-none shadow-sm hover:opacity-90 active:scale-[0.99]"
         >
           Выйти из аккаунта
         </button>
      </div>

    </div>
  );
}