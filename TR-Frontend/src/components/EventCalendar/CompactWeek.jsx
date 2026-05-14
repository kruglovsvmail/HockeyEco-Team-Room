import React from 'react';
import { Icon } from '../../ui/Icon';

export const CompactWeek = React.memo(function CompactWeek({ date, onChangeDate, onToggleExpand }) {
  const startOfWeek = date.startOf('isoWeek');
  const endOfWeek = date.endOf('isoWeek');

  const title = `${startOfWeek.format('D MMM')} — ${endOfWeek.format('D MMM')}`;

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
      className="flex items-center justify-between bg-white rounded-2xl shadow-md px-4 py-2.5 cursor-pointer select-none active:bg-surface-level2/30 transition-colors mt-2"
      onClick={onToggleExpand}
    >
      <button 
        onClick={handlePrevWeek}
        className="p-1 text-content-main hover:text-brand transition-colors outline-none"
      >
        <Icon name="chevron_left" className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2">
        <Icon name="calendar" className="w-4 h-4 text-brand" />
        <span className="text-sm font-bold text-content-main tracking-widest capitalize">
          {title}
        </span>
      </div>

      <button 
        onClick={handleNextWeek}
        className="p-1 text-content-main hover:text-brand transition-colors outline-none rotate-180"
      >
        <Icon name="chevron_left" className="w-5 h-5" />
      </button>
    </div>
  );
});