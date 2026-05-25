import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken } from '../utils/helpers';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { CheckboxLP } from '../ui/Checkbox-LP';

export function ProfilePage() {
  const navigate = useNavigate();

  // Инициализируем стейт из localStorage (по умолчанию true, если не выставлено 'false')
  const [useTeamColors, setUseTeamColors] = useState(() => {
    return localStorage.getItem('tr_use_team_colors') !== 'false';
  });

  // Инициализируем стейт темной темы напрямую из хранилища смартфона
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('tr_theme') === 'dark';
  });

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  // Сохранение флага кастомизации в память телефона без лишних запросов к СУБД
  const handleToggleColors = (checked) => {
    setUseTeamColors(checked);
    localStorage.setItem('tr_use_team_colors', checked ? 'true' : 'false');
  };

  // Атомарное переключение темы без перезагрузок страницы и сайд-эффектов
  const handleToggleTheme = (checked) => {
    setIsDarkMode(checked);
    const targetTheme = checked ? 'dark' : 'light';
    localStorage.setItem('tr_theme', targetTheme);
    
    // Переключаем класс на корневом элементе приложения
    document.documentElement.classList.toggle('dark', checked);

    // Подстраиваем цвет системного статус-бара PWA на устройствах под текущую тему
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', checked ? '#0f172a' : '#d1d5db');
    }
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

      {/* Контентный блок: Кастомная матовая карточка пользовательских настроек */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm text-left transition-colors duration-300">
          <span className="text-[10px] font-black text-brand uppercase tracking-widest mb-3 block border-b border-surface-border pb-1.5">
            Настройки интерфейса
          </span>
          
          <div className="flex flex-col gap-4">
            <CheckboxLP 
              checked={useTeamColors} 
              onChange={handleToggleColors} 
              label="Цветовое кодирование команд" 
              className="py-1"
            />
            
            <p className="text-[11px] text-content-muted -mt-2 font-medium leading-relaxed pl-8 border-b border-surface-border/50 pb-3">
              При включении этого параметра элементы календаря (челки карт, время проведения, иконки) будут адаптироваться под официальные брендовые цвета ваших хоккейных команд.
            </p>

            <CheckboxLP 
              checked={isDarkMode} 
              onChange={handleToggleTheme} 
              label="Темная тема оформления" 
              className="py-1"
            />
            
            <p className="text-[11px] text-content-muted -mt-2 font-medium leading-relaxed pl-8">
              Переключает интерфейс кабинета в ночной режим для комфортной работы со статистикой и расписанием при слабом освещении арен.
            </p>
          </div>
        </div>
      </div>

      {/* Подвал: Системная кнопка выхода (Реализована на сплошных переменных без слэшей) */}
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