import React, { useState } from 'react';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { CheckboxLP } from '../ui/Checkbox-LP';
import { SegmentedControl } from '../ui/SegmentedControl';
import { FadeIn, StaggerContainer } from '../ui/FadeIn'; // Импортируем оба компонента анимации
import { Icon } from '../ui/Icon';

// Кастомный матовый блок настроек, полностью повторяющий визуальный почерк блоков ProfilePage
const SettingsBlock = ({ title, icon, children }) => {
  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mb-3 text-left relative overflow-hidden transition-colors duration-300">
      <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
            {title}
          </span>
        </div>
      </div>
      <div className="flex flex-col text-left pt-1">{children}</div>
    </div>
  );
};

export function SettingsPage() {
  // Навигационное состояние верхнего сегментного переключателя
  const [activeSubTab, setActiveSubTab] = useState('appearance');

  // Инициализируем стейт из localStorage (по умолчанию true, если не выставлено 'false')
  const [useTeamColors, setUseTeamColors] = useState(() => {
    return localStorage.getItem('tr_use_team_colors') !== 'false';
  });

  // Инициализируем стейт темной темы напрямую из хранилища смартфона
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('tr_theme') === 'dark';
  });

  const handleToggleColors = (checked) => {
    setUseTeamColors(checked);
    localStorage.setItem('tr_use_team_colors', checked ? 'true' : 'false');
  };

  const handleToggleTheme = (checked) => {
    setIsDarkMode(checked);
    const targetTheme = checked ? 'dark' : 'light';
    localStorage.setItem('tr_theme', targetTheme);
    
    document.documentElement.classList.toggle('dark', checked);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', checked ? '#0f172a' : '#d1d5db');
    }
  };

  useFocusRevalidate(() => {
    // Диспетчер автоматического обновления экрана при возврате фокуса
  });

  return (
    <FadeIn className="flex flex-col h-full overflow-hidden">
      
      {/* Верхний сегментный переключатель разделов настроек */}
      <div className="px-4 pb-3 shrink-0 shadow-lg">
        <SegmentedControl 
          options={[
            { value: 'appearance', label: 'Внешний вид' },
            { value: 'notifications', label: 'Push-уведомления' }
          ]} 
          value={activeSubTab} 
          onChange={setActiveSubTab} 
        />
      </div>

      {/* Основная скролл-зона контента */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-24 space-y-3">
        
        {/* Ключ по activeSubTab перезапускает поочередную анимацию при смене вкладок */}
        <StaggerContainer key={activeSubTab}>
          
          {activeSubTab === 'appearance' ? (
            <>
              {/* БЛОК 1: НАСТРОЙКА ЦВЕТОВОЙ ПАЛИТРЫ КОМАНД */}
              <SettingsBlock title="Персонализация" icon="jersey">
                <div className="flex flex-col text-left">
                  <CheckboxLP 
                    checked={useTeamColors} 
                    onChange={handleToggleColors} 
                    label="Цветовое кодирование команд" 
                    className="py-1"
                  />
                  <p className="text-[11px] text-content-muted font-medium leading-relaxed pl-8 pt-0.5">
                    При включении этого параметра элементы календаря (челки карт, время проведения матчей, тактические иконки, и др.) будут автоматически адаптироваться под официальный брендовый цвет ваших хоккейных команд, загруженные из базы данных.
                  </p>
                </div>
              </SettingsBlock>

              {/* БЛОК 2: НАСТРОЙКА ТЕМЫ ОФОРМЛЕНИЯ ПРИЛОЖЕНИЯ */}
              <SettingsBlock title="Тема интерфейса" icon="gear">
                <div className="flex flex-col text-left">
                  <CheckboxLP 
                    checked={isDarkMode} 
                    onChange={handleToggleTheme} 
                    label="Темная тема оформления" 
                    className="py-1"
                  />
                  <p className="text-[11px] text-content-muted font-medium leading-relaxed pl-8 pt-0.5">
                    Переключает интерфейс личного кабинета HockeyEco в ночной режим. Снижает нагрузку на зрение для комфортной работы со статистикой, составами пятерок и расписанием при слабом освещении.
                  </p>
                </div>
              </SettingsBlock>
            </>
          ) : (
            /* КАРТОЧКА-ЗАГЛУШКА РАЗДЕЛА УВЕДОМЛЕНИЙ В СТИЛЕ ПРОФИЛЯ */
            <div className="p-6 bg-surface-level1 border border-surface-border rounded-2xl shadow-md text-center flex flex-col items-center justify-center gap-3 py-12 mb-3">
              <div className="w-16 h-16 rounded-xl text-brand flex items-center justify-center shrink-0 shadow-md">
                <Icon name="shield_alert" className="w-6 h-6" />
              </div>
              <span className="text-md font-black uppercase text-content-main tracking-widest mt-1">
                Раздел в разработке
              </span>
              <p className="text-[12px] text-content-muted font-medium leading-relaxed max-w-[280px]">
                Настройка PUSH-уведомлений о расписании, изменениях времени событий и публикации протоколов матчей лиги сейчас находится на стадии проектирования.
              </p>
            </div>
          )}

        </StaggerContainer>
      </div>
    </FadeIn>
  );
}