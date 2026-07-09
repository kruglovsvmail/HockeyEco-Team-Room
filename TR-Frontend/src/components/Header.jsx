import React from 'react';
import { Menu, X, ChevronLeft } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';

export function Header({
  isSidebarOpen, onToggleSidebar, user, teams, selectedTeam, onTeamUpdated,
  hideActions = false, title, section,
  // Режим вложенного экрана (детали события и т.п.):
  // onBack — если задан, левая кнопка становится «назад» вместо тоггла сайдбара;
  // showEditButton/onEditClick — правая кнопка-карандаш редактирования.
  onBack, showEditButton = false, onEditClick,
}) {
  const location = useLocation();

  const getSectionTitle = () => {
    if (title) {
      return title;
    }

    const path = location.pathname.toLowerCase();

    if (path.startsWith('/event/')) {
      return 'Детали события';
    }
    if (path.startsWith('/application/')) {
      return 'Заявка';
    }
    if (path.includes('my-team')) {
      return 'Состав команды';
    }
    if (path.includes('handbook')) {
      return 'Соперники и турниры';
    }
    if (path.includes('tournaments') || path.includes('leagues')) {
      return 'Турниры / Лиги';
    }
    if (path.includes('season-rosters')) {
      return 'Заявки на сезон';
    }
    if (path.includes('event') && path.includes('create')) {
      return 'Создание события';
    }
    if (path.includes('settings')) {
      return 'Настройки';
    }
    if (path.includes('profile')) {
      return 'Мой профиль';
    }
    if (path === '/' || path === '/manager' || path === '/manager/' || path.includes('schedule') || path.includes('calendar')) {
      return 'Календарь';
    }

    return '';
  };

  // Возвращает CSS-класс фона шапки в зависимости от текущего раздела.
  // Логика сводится к двум вариантам:
  //   • Детали события            → bg-surface-base (непрозрачная шапка, перекрывает контент)
  //   • Все остальные экраны       → bg-transparent  (прозрачная шапка, виден фон страницы)
  const getSectionBg = () => {

    const path = location.pathname.toLowerCase();

    // Детали события (/event/:type/:id) — непрозрачная шапка
    if (path.startsWith('/event/'))
      return 'bg-surface-base';

    // Детали заявки на сезон (/application/:id) — непрозрачная шапка
    if (path.startsWith('/application/'))
      return 'bg-surface-base';

    // Календарь (главный экран и раздел менеджера)
    if (path === '/' || path === '/manager' || path === '/manager/')
      return 'bg-transparent';

    // Состав команды
    if (path.includes('my-team'))
      return 'bg-surface-base';

    // Турниры / Лиги
    if (path.includes('tournaments'))
      return 'bg-surface-base';

    // Мой профиль
    if (path.includes('profile'))
      return 'bg-surface-base';

    // Настройки
    if (path.includes('settings'))
      return 'bg-surface-base';

    // Создание события
    if (path.includes('create-event'))
      return 'bg-surface-base';

    // Заявки на сезон (составы)
    if (path.includes('season-rosters'))
      return 'bg-surface-base';

    // Финансы
    if (path.includes('finances'))
      return 'bg-surface-base';

    // Справочники (внешние соперники/лиги)
    if (path.includes('handbooks'))
      return 'bg-surface-base';

    // Фолбэк для любых остальных маршрутов
    return 'bg-transparent';
  };

  return (
    <header
      className={`absolute top-0 left-0 right-0 flex flex-col z-40 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden ${getSectionBg()}`}
      style={{
        height: '60px',
        paddingTop: '0px'
      }}
    >
      <div className="flex-1 flex items-center justify-between p-3 h-[60px] w-full relative">
        {/* Левая кнопка: «назад» во вложенных экранах, иначе тоггл бокового меню */}
        {onBack ? (
          <button
            onClick={onBack}
            className="p-2 bg-white/10 rounded-xl text-content-main hover:text-brand transition-colors outline-none z-10 cursor-pointer active:scale-95"
            aria-label="Назад"
          >
            <ChevronLeft size={20} />
          </button>
        ) : (
          <button
            onClick={onToggleSidebar}
            className="p-2 bg-white/10 rounded-xl text-content-main hover:text-brand transition-colors outline-none z-10"
            aria-label="Menu"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[14px] font-semibold uppercase tracking-widest text-content-main pointer-events-none whitespace-nowrap text-center">
          {getSectionTitle()}
        </div>

        {/* Правая кнопка: редактирование (если включено), иначе пустой плейсхолдер для центрирования заголовка */}
        {showEditButton ? (
          <button
            onClick={onEditClick}
            className="p-2.5 bg-white/10 rounded-xl text-content-main hover:text-brand transition-colors outline-none z-10 cursor-pointer active:scale-95 flex items-center justify-center"
            aria-label="Редактировать"
          >
            <Icon name="edit" className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-9 h-9 opacity-0 pointer-events-none" />
        )}
      </div>
    </header>
  );
}
