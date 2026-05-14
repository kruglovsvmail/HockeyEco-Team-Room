import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { TopSheet } from '../ui/TopSheet';

export function Header({ isSidebarOpen, onToggleSidebar }) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const openCalendar = () => {
    window.dispatchEvent(new Event('open-calendar-sheet'));
  };

  return (
    <>
      <header className="shrink-0 p-4 h-[60px] flex items-center justify-between sticky top-0 z-40 transition-colors">
        
        <button 
          onClick={onToggleSidebar}
          className="md:hidden p-2 -ml-2 text-content-main hover:text-brand transition-colors outline-none"
          aria-label="Меню"
        >
          {isSidebarOpen ? <X size={28} /> : <Menu size={28} />}
        </button>

        {/* Правая панель с кнопками */}
        <div className="flex items-center gap-1 ml-auto">
          <button 
            onClick={openCalendar}
            className="p-2 text-content-main hover:text-brand transition-colors outline-none"
            aria-label="Календарь"
          >
            <Icon name="calendar" className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setIsFilterOpen(true)}
            className="p-2 text-content-main hover:text-brand transition-colors outline-none"
            aria-label="Фильтр"
          >
            <Icon name="filter" className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Шторка Фильтра */}
      <TopSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
        <div className="p-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-level2 text-brand shadow-sm">
            <Icon name="filter" className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-content-main mb-2">Фильтры</h2>
          <p className="text-sm text-content-muted leading-relaxed pb-6">
            Фильтрация по командам и событиям находится в разработке.
          </p>
        </div>
      </TopSheet>
    </>
  );
}