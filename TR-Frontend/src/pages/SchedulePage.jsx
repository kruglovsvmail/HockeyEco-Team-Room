import React from 'react';
import { useAccess } from '../hooks/useAccess';

export function SchedulePage() {
  const { selectedTeam } = useAccess();

  return (
      <div className="flex-1">
        {/* Здесь будет компонент календаря/расписания */}
        <div className="bg-surface-level1 p-6 text-center">
          <p className="text-sm text-content-muted leading-relaxed">
            Матчей в расписании пока нет.
          </p>
        </div>
      </div>

  );
}