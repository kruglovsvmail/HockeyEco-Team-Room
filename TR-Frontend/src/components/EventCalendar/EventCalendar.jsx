import React from 'react';
import { CompactWeek } from './CompactWeek';
import { ExpandedGrid } from './ExpandedGrid';
import { TopSheet } from '../../ui/TopSheet';

// Принимаем matchDatesSet
export function EventCalendar({ currentDate, setCurrentDate, isExpanded, setIsExpanded, matchDatesSet }) {
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
            matchDatesSet={matchDatesSet} // Передаем вниз
          />
        </div>
      </TopSheet>
    </div>
  );
}