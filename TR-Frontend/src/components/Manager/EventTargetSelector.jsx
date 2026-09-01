import React from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

// Выбор владельца события для страницы создания: клуб или конкретная команда.
//
// Раньше эту роль играл аккордеон в сайдбаре: он менял глобально выбранную команду
// и дописывал в адрес ?scope=club. Создание события для чужого состава при этом
// молча перетаскивало туда весь интерфейс — состав, календарь, заявки. Теперь выбор
// живёт только на странице создания и запоминается на устройстве, а глобальный
// контекст приложения остаётся там, где его оставил пользователь.
//
// Список плоский: сначала клубы, потом команды, у каждой строки подпись, что это
// такое. Клуб «Дружина» и команда «Дружина86» иначе не отличаются по названию.
export function EventTargetSelector({ targets = [], activeKey, onSelect, onClose, activeBrandColor }) {
  if (targets.length === 0) {
    return (
      <div className="p-6 text-center text-[14px] font-bold text-content-subtle leading-relaxed">
        Нет команд и клубов, для которых вы можете создавать события.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto scrollbar-hide h-full">
      {targets.map(target => {
        const isActive = target.key === activeKey;

        return (
          <button
            key={target.key}
            type="button"
            onClick={() => { onSelect(target); onClose?.(); }}
            className={clsx(
              "flex items-center gap-3 p-3 rounded-2xl border transition-all text-left outline-none active:scale-[0.98]",
              isActive
                ? "bg-brand-opacity border-brand"
                : "bg-surface-level1 border-surface-border hover:border-brand/30"
            )}
            /* Цвет команды приходит инлайном: панель живёт вне страницы, где переопределён --color-brand */
            style={isActive && activeBrandColor ? {
              backgroundColor: `${activeBrandColor}1a`,
              borderColor: activeBrandColor
            } : undefined}
          >
            <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center overflow-hidden shrink-0">
              {target.logoUrl
                ? <img src={getImageUrl(target.logoUrl)} alt="" className="w-full h-full object-contain" />
                : <Icon name="team" className="w-5 h-5 text-content-subtle" />}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[14px] font-bold text-content-main truncate">{target.name}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-content-muted mt-0.5">
                {target.type === 'club' ? 'Клуб'
                  : target.type === 'community' ? 'Сообщество'
                  : 'Команда'}
              </span>
            </div>

            {isActive && (
              <Icon
                name="check"
                className="w-5 h-5 text-brand shrink-0"
                style={activeBrandColor ? { color: activeBrandColor } : undefined}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
