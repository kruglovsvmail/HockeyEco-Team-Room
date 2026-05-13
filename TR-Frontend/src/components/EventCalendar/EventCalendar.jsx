import React from 'react';
import { CompactWeek } from './CompactWeek';
import { ExpandedGrid } from './ExpandedGrid';
import { TopSheet } from '../../ui/TopSheet';

export function EventCalendar({ currentDate, setCurrentDate, isExpanded, setIsExpanded }) {
  return (
    <div className="w-full bg-surface-level1 rounded-2xl shadow-md">
      {/* Статичная панель недели, которая всегда на экране */}
      <CompactWeek 
        date={currentDate} 
        onChangeDate={setCurrentDate} 
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(true)} // По клику открываем шторку
      />
      
      {/* Выпадающая шторка с календарем */}
      <TopSheet isOpen={isExpanded} onClose={() => setIsExpanded(false)}>
        <div className="pb-2">
          <ExpandedGrid 
            date={currentDate} 
            onChangeDate={setCurrentDate} 
            // Мы больше не передаем функцию закрытия сюда, 
            // чтобы шторка оставалась открытой при выборе даты
          />
        </div>
      </TopSheet>
    </div>
  );
}