import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';

export function SeasonRostersPage() {
  const { selectedTeam, user } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  const hasAccess = checkAccess('MGR_SEASON_ROSTERS');

  if (!hasAccess) {
    return (
      <SubscriptionStub 
        isOpen={true} 
        onClose={() => navigate(-1)} 
        title="Заявочный лист заблокирован"
        description="Раздел управления дозаявками и отзаявками хоккеистов в официальные дивизионы лиги через буфер заявок ограничен. Пожалуйста, продлите подписку."
      />
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pt-6 bg-surface-base overflow-y-auto scrollbar-hide transition-colors duration-300">
      <div className="shrink-0 mb-4 text-left">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Заявки на сезон
        </h1>
        {selectedTeam && (
          <p className="text-xs font-bold text-brand uppercase tracking-wider mt-1">
            Команда: {selectedTeam.name}
          </p>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm text-left transition-colors duration-300">
          <span className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-3 block border-b border-surface-border pb-1.5">
            Заявочные кампании лиги
          </span>
          <p className="text-sm font-medium text-content-main leading-relaxed">
            Модуль в разработке. Здесь будет доступно управление официальными дозаявками и отзаявками хоккеистов в официальные дивизионы лиги через буфер `roster_requests`.
          </p>
        </div>
      </div>
    </div>
  );
}