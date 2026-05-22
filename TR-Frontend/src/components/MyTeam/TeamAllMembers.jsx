import React, { useRef } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';
import { Icon } from '../../ui/Icon';
import clsx from 'clsx';

export const TeamAllMembers = ({ 
  members, 
  onPersonClick, 
  isEditMode, 
  setIsEditMode, 
  hasManageAccess, 
  onExcludeClick, 
  animatingOutId 
}) => {
  const pressTimer = useRef(null);

  const handlePointerDown = () => {
    if (isEditMode || !hasManageAccess) return;
    pressTimer.current = setTimeout(() => {
      setIsEditMode(true);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <ContainerContent title="Общий состав" count={members.length}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center">
        {members.map((m, index) => {
          const isRemoving = m.member_id === animatingOutId;
          const jiggleClass = isEditMode && hasManageAccess && !isRemoving 
            ? `animate-jiggle jiggle-delay-${index % 3}` 
            : '';

          return (
            <div
              key={m.member_id}
              onPointerDown={handlePointerDown}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onPointerMove={cancelPress}
              onClick={(e) => {
                if (isEditMode) e.stopPropagation();
              }}
              className={clsx(
                "relative select-none w-full text-center transition-all duration-200",
                jiggleClass,
                isRemoving && "animate-slot-exit"
              )}
            >
              {/* Передаем undefined вместо клика, если включен режим редактирования, чтобы карточка не открывала правое боковое меню профиля */}
              <PersonGridCard 
                person={m} 
                onClick={isEditMode ? undefined : onPersonClick} 
                showBadges={false} 
              />
              
              {/* Оверлейная плавающая кнопка удаления над аватаром */}
              {isEditMode && hasManageAccess && !isRemoving && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExcludeClick(m);
                  }}
                  className="absolute top-0 right-1/2 translate-x-10 -translate-y-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-30 hover:scale-110 active:scale-90 transition-transform"
                >
                  <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ContainerContent>
  );
};