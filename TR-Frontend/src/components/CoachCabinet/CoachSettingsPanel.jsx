import React from 'react';
import { Icon } from '../../ui/Icon';

// Правая панель карандашика в шапке Кабинета тренера.
//
// Пока пуста: переопределение акцентного цвета отсюда убрано. Панель оставлена как
// точка входа — когда появятся настройки раздела, они лягут сюда, и карандашик в шапке
// не придётся заводить заново.

export function CoachSettingsPanel() {
  return (
    <div className="h-full overflow-y-auto scrollbar-hide px-3 py-4">
      <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
        <Icon name="settings" className="w-12 h-12 text-content-subtle opacity-40" />
        <p className="text-[14px] text-content-muted leading-snug max-w-[260px]">
          Настроек раздела пока нет
        </p>
      </div>
    </div>
  );
}
