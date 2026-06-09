import React, { useRef, useMemo } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';
import { Icon } from '../../ui/Icon';
import { HintPopover } from '../../ui/HintPopover';
import clsx from 'clsx';
import { FadeIn } from '../../ui/FadeIn';

export const TeamAllMembers = ({ 
  members = [], 
  onPersonClick, 
  isEditMode, 
  setIsEditMode, 
  hasManageAccess, 
  isManager, // Новый флаг административного статуса
  onExcludeClick, 
  animatingOutId,
  onAddClick,
  activeBrandColor
}) => {
  const pressTimer = useRef(null);

  const handlePointerDown = () => {
    if (isEditMode || !isManager) return;
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

  // Разделяем состав на активных участников и архивных (у которых left_at не NULL)
  const { activeMembers, archivedMembers } = useMemo(() => {
    return {
      activeMembers: members.filter(m => !m.left_at),
      archivedMembers: members.filter(m => !!m.left_at)
    };
  }, [members]);

  // Контекстная кнопка добавления хоккеиста в правый угол шапки общего состава
  let addButton = null;
  if (isManager && !isEditMode) {
    if (hasManageAccess) {
      addButton = (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddClick();
          }}
          className="transition-colors active:scale-90 outline-none flex items-center justify-center text-content-muted hover:opacity-80 cursor-pointer"
          style={activeBrandColor ? { color: activeBrandColor } : {}}
        >
          <Icon name="user_plus" className="w-5 h-5" />
        </button>
      );
    } else {
      addButton = (
        <HintPopover status="no_subscription">
          <button
            type="button"
            className="transition-all opacity-30 outline-none flex items-center justify-center text-content-muted cursor-pointer"
            style={activeBrandColor ? { color: activeBrandColor } : {}}
          >
            <Icon name="user_plus" className="w-5 h-5" />
          </button>
        </HintPopover>
      );
    }
  }

  const renderGrid = (itemsList, isArchiveGroup = false) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-3 justify-items-center mt-2">
      {itemsList.map((m, index) => {
        const isRemoving = m.member_id === animatingOutId;
        // Режим покачивания jiggle активен только для действующего состава руководителей
        const jiggleClass = isEditMode && isManager && !isRemoving && !isArchiveGroup
          ? `animate-jiggle jiggle-delay-${index % 3}` 
          : '';

        return (
          <FadeIn 
            key={m.member_id} 
            delay={index * 30} 
            duration={300} 
            className={clsx("w-full flex justify-center", isArchiveGroup && "opacity-60")}
          >
            <div
              onPointerDown={isArchiveGroup ? undefined : handlePointerDown}
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
              <PersonGridCard 
                person={m} 
                onClick={isEditMode ? undefined : onPersonClick} 
                showBadges={!isArchiveGroup} 
                activeBrandColor={isArchiveGroup ? 'var(--color-content-subtle)' : activeBrandColor}
              />
              
              {/* Кнопка исключения выводится только для активных участников */}
              {isEditMode && isManager && !isRemoving && !isArchiveGroup && (
                hasManageAccess ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExcludeClick(m);
                    }}
                    className="absolute top-0 right-1/2 translate-x-10 -translate-y-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-30 hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                  >
                    <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                  </button>
                ) : (
                  <div className="absolute top-0 right-1/2 translate-x-10 -translate-y-1.5 z-30">
                    <HintPopover status="no_subscription">
                      <button
                        type="button"
                        className="w-[22px] h-[22px] bg-red-500 opacity-30 rounded-full flex items-center justify-center shadow-md transition-transform cursor-pointer"
                      >
                        <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                      </button>
                    </HintPopover>
                  </div>
                )
              )}
            </div>
          </FadeIn>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Секция активного состава */}
      <ContainerContent title="Общий состав" count={activeMembers.length} action={addButton}>
        {activeMembers.length > 0 ? (
          renderGrid(activeMembers, false)
        ) : (
          <div className="text-center py-6 text-[11px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
            Активные участники отсутствуют
          </div>
        )}
      </ContainerContent>

      {/* Секция архивных участников (скрыта, если пуста) */}
      {archivedMembers.length > 0 && (
        <ContainerContent title="Архив состава" count={archivedMembers.length}>
          {renderGrid(archivedMembers, true)}
        </ContainerContent>
      )}
    </div>
  );
};