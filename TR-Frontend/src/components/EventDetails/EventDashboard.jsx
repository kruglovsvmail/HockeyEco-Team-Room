import React from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { EventDetailsMatch } from './EventDetailsMatch';
import { EventDetailsTraining } from './EventDetailsTraining';
import { EventDetailsMeeting } from './EventDetailsMeeting';

export const EventDashboard = ({ isOpen, onClose, data, type, title }) => {
  return (
    <div 
      className={clsx(
        "fixed inset-0 z-[100] bg-surface-base flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* ШАПКА ПАНЕЛИ СОБЫТИЯ */}
      <div className="flex items-center justify-between shadow-md p-4 h-[60px] shrink-0 bg-surface-base z-[110]">
        <button 
          onClick={onClose}
          className="p-2 -ml-2 text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center"
          aria-label="Назад"
        >
          <Icon name="chevron_left" className="w-7 h-7 text-content-main" />
        </button>
        <h3 className="text-sm font-bold text-content-main uppercase tracking-wider text-right line-clamp-1 pl-4">
          {title}
        </h3>
      </div>

      {/* КОНТЕНТНАЯ ЗОНА (100% ШИРИНЫ) */}
      <div className="flex-1 overflow-hidden bg-surface-level1 relative">
        {type === 'matchDetails' && <EventDetailsMatch event={data} />}
        {type === 'trainingDetails' && <EventDetailsTraining event={data} />}
        {type === 'meetingDetails' && <EventDetailsMeeting event={data} />}
      </div>
    </div>
  );
};