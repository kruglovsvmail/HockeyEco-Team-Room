import React from 'react';
import { useAccess } from '../hooks/useAccess';

export function MyTeamPage() {
  const { selectedTeam } = useAccess();

  return (
    <div className="flex flex-col h-full px-4 pt-6">
      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Моя команда
        </h1>
        <p className="text-[10px] text-content-muted font-bold uppercase tracking-widest mt-1">
          {selectedTeam?.name || 'Команда не выбрана'}
        </p>
      </div>

      <div className="flex-1">
        {/* Здесь будет контент страницы "Моя команда" (состав, статистика и т.д.) */}
        <div className="text-center">
          <p className="text-sm text-content-muted leading-relaxed">
            Раздел «Моя команда» находится в разработке.
          </p>
        </div>
      </div>
    </div>
  );
}