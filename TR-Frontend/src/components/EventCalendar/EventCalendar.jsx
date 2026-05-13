import React from 'react';
import { CompactWeek } from './CompactWeek';
import { ExpandedGrid } from './ExpandedGrid';
import { BottomSheet } from '../../ui/BottomSheet';

export function EventCalendar({ currentDate, setCurrentDate, isExpanded, setIsExpanded }) {
  return (
    <div className="w-full bg-surface-level1 shadow-[inset_0_-8px_8px_-8px_rgba(0,0,0,0.1)]">
      {/* Статичная панель недели, которая всегда на экране */}
      <CompactWeek 
        date={currentDate} 
        onChangeDate={setCurrentDate} 
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(true)} // По клику открываем шторку
      />
      
      {/* Выпадающая шторка с календарем */}
      <BottomSheet isOpen={isExpanded} onClose={() => setIsExpanded(false)}>
        <div className="pb-2">
          <ExpandedGrid 
            date={currentDate} 
            onChangeDate={setCurrentDate} 
            // Мы больше не передаем функцию закрытия сюда, 
            // чтобы шторка оставалась открытой при выборе даты
          />
        </div>
      </BottomSheet>
    </div>
  );
}