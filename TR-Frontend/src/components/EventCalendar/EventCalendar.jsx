import React from 'react';
import { CompactWeek } from './CompactWeek';
import { ExpandedGrid } from './ExpandedGrid';
import { TopSheet } from '../../ui/TopSheet';

export function EventCalendar({ currentDate, setCurrentDate, isExpanded, setIsExpanded, matches }) {
  return (
    <div className="w-full bg-surface-level1 rounded-2xl shadow-md">
      <CompactWeek 
        date={currentDate} 
        onChangeDate={setCurrentDate} 
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(true)} 
      />
      
      <TopSheet isOpen={isExpanded} onClose={() => setIsExpanded(false)}>
        <div className="pb-2">
          <ExpandedGrid 
            date={currentDate} 
            onChangeDate={setCurrentDate} 
            matches={matches} 
          />
        </div>
      </TopSheet>
    </div>
  );
}