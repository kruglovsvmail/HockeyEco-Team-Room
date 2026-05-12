import React from 'react';
import { Menu, X } from 'lucide-react';

export function Header({ isSidebarOpen, onToggleSidebar }) {
  return (
    <header className="shrink-0 h-16 px-4 flex items-center border-b border-surface-border bg-surface-base/70 backdrop-blur-md sticky top-0 z-40 transition-colors">
      
      <button 
        onClick={onToggleSidebar}
        className="md:hidden p-2 -ml-2 text-content-main hover:text-brand transition-colors outline-none"
        aria-label="Меню"
      >
        {isSidebarOpen ? <X size={28} /> : <Menu size={28} />}
      </button>

    </header>
  );
}