import React, { useRef } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';
import { Icon } from '../../ui/Icon';
import clsx from 'clsx';

// Импортируем наш новый унифицированный компонент производительности
import { FadeIn } from '../../ui/FadeIn';

export const TeamAllMembers = ({ 
  members, 
  onPersonClick, 
  isEditMode, 
  setIsEditMode, 
  hasManageAccess, 
  onExcludeClick, 
  animatingOutId,
  onAddClick,
  activeBrandColor
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

  // Контекстная кнопка добавления в правый угол шапки (динамический цвет)
  const addButton = hasManageAccess && !isEditMode && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onAddClick();
      }}
      className="transition-colors active:scale-90 outline-none flex items-center justify-center text-content-muted hover:opacity-80"
      style={activeBrandColor ? { color: activeBrandColor } : {}}
    >
      <Icon name="user_plus" className="w-5 h-5" />
    </button>
  );

  return (
    <ContainerContent title="Общий состав" count={members.length} action={addButton}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center">
        {members.map((m, index) => {
          const isRemoving = m.member_id === animatingOutId;
          const jiggleClass = isEditMode && hasManageAccess && !isRemoving 
            ? `animate-jiggle jiggle-delay-${index % 3}` 
            : '';

          return (
            <FadeIn 
              key={m.member_id} 
              delay={index * 30} 
              duration={300} 
              className="w-full flex justify-center"
            >
              <div
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
                {/* Передаем активный цвет команды в карточку */}
                <PersonGridCard 
                  person={m} 
                  onClick={isEditMode ? undefined : onPersonClick} 
                  showBadges={false} 
                  activeBrandColor={activeBrandColor}
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
            </FadeIn>
          );
        })}
      </div>
    </ContainerContent>
  );
};