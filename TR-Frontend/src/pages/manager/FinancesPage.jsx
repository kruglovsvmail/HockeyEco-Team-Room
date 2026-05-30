import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';

export function FinancesPage() {
  const { selectedTeam, user } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();

  const hasAccess = checkAccess('MGR_FINANCES');

  if (!hasAccess) {
    return (
      <SubscriptionStub 
        isOpen={true} 
        onClose={() => navigate(-1)} 
        title="Бухгалтерия заблокирована"
        description="Доступ к управлению бюджетом команды, финансовым ведомостям и контролю сборов игроков `has_pay_tag` ограничен. Требуется продление подписки."
      />
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pt-6 bg-surface-base overflow-y-auto scrollbar-hide transition-colors duration-300">
      <div className="shrink-0 mb-4 text-left">
        <h1 className="text-2xl font-black uppercase tracking-widest text-content-main">
          Управление финансами
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
            Бухгалтерия и сборы
          </span>
          <p className="text-sm font-medium text-content-main leading-relaxed">
            Модуль в разработке. Здесь руководитель сможет контролировать баланс команды, отслеживать оплату игроками долей за аренду льда на основе меток `has_pay_tag`.
          </p>
        </div>
      </div>
    </div>
  );
}