import React from 'react';
import { Icon } from '../../ui/Icon';

export function CompactWeek({ date, onChangeDate, isExpanded, onToggleExpand }) {
  const startOfWeek = date.startOf('isoWeek');
  const endOfWeek = date.endOf('isoWeek');

  const isSameMonth = startOfWeek.month() === endOfWeek.month();
  const title = isSameMonth
    ? `${startOfWeek.format('D')} — ${endOfWeek.format('D MMM')}`
    : `${startOfWeek.format('D MMM')} — ${endOfWeek.format('D MMM')}`;

  const handlePrevWeek = (e) => {
    e.stopPropagation();
    onChangeDate(date.subtract(1, 'week'));
  };

  const handleNextWeek = (e) => {
    e.stopPropagation();
    onChangeDate(date.add(1, 'week'));
  };

  return (
    <div 
      className="flex items-center justify-between px-4 py-2 cursor-pointer select-none active:bg-surface-level2/30 transition-colors"
      onClick={onToggleExpand}
    >
      <button 
        onClick={handlePrevWeek}
        className="p-1 text-content-main hover:text-brand transition-colors outline-none"
      >
        <Icon name="chevron_left" className="w-6 h-6" />
      </button>

      <span className="text-sm font-bold text-content-main tracking-widest capitalize">
        {title}
      </span>

      <button 
        onClick={handleNextWeek}
        className="p-1 text-content-main hover:text-brand transition-colors outline-none rotate-180"
      >
        <Icon name="chevron_left" className="w-6 h-6" />
      </button>
    </div>
  );
}