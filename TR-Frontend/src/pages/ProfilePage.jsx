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

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  // Сохранение флага кастомизации в память телефона без лишних запросов к СУБД
  const handleToggleColors = (checked) => {
    setUseTeamColors(checked);
    localStorage.setItem('tr_use_team_colors', checked ? 'true' : 'false');
  };

  useFocusRevalidate(() => {
    // Диспетчер автоматического обновления экрана при возврате фокуса
  });

  return (
    <div className="flex flex-col h-full px-4 pt-6 bg-surface-base overflow-y-auto scrollbar-hide">
      
      {/* Заголовок экрана */}
      <div className="shrink-0 mb-4 text-left">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Профиль игрока
        </h1>
      </div>

      {/* Контентный блок: Кастомная матовая карточка пользовательских настроек */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm text-left">
          <span className="text-[10px] font-black text-brand uppercase tracking-widest mb-3 block border-b border-surface-border pb-1.5">
            Настройки интерфейса
          </span>
          
          <CheckboxLP 
            checked={useTeamColors} 
            onChange={handleToggleColors} 
            label="Цветовое кодирование команд" 
            className="py-1"
          />
          
          <p className="text-[11px] text-content-muted mt-2 font-medium leading-relaxed pl-8">
            При включении этого параметра элементы календаря (челки карт, время проведения, иконки) будут адаптироваться под официальные брендовые цвета ваших хоккейных команд.
          </p>
        </div>
      </div>

      {/* Подвал: Системная кнопка выхода (Реализована на сплошных переменных без слэшей) */}
      <div className="shrink-0 pb-8 mt-6">
         <button 
           onClick={handleLogout} 
           className="w-full py-4 rounded-xl border border-danger text-danger bg-danger-muted font-bold uppercase tracking-widest text-xs transition-colors outline-none shadow-sm hover:opacity-90"
         >
           Выйти из аккаунта
         </button>
      </div>

    </div>
  );
}