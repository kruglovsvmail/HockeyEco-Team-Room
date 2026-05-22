import React, { useMemo, useRef } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';
import { Icon } from '../../ui/Icon';
import clsx from 'clsx';

export const TeamRosterPlayers = ({ 
  roster = [], 
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

  const groupedPlayers = useMemo(() => {
    return {
      goalie: roster.filter(p => p.position === 'goalie'),
      defense: roster.filter(p => p.position === 'defense'),
      forward: roster.filter(p => p.position === 'forward')
    };
  }, [roster]);

  const groups = [
    { id: 'goalie', label: 'Вратари' },
    { id: 'defense', label: 'Защитники' },
    { id: 'forward', label: 'Нападающие' }
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map(group => {
        const players = groupedPlayers[group.id] || [];
        if (!players.length) return null;
        
        return (
          <ContainerContent key={group.id} title={group.label} count={players.length}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center">
              {players.map((p, index) => {
                const isRemoving = p.member_id === animatingOutId;
                const jiggleClass = isEditMode && hasManageAccess && !isRemoving 
                  ? `animate-jiggle jiggle-delay-${index % 3}` 
                  : '';

                return (
                  <div
                    key={p.member_id}
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
                    <PersonGridCard 
                      person={p} 
                      onClick={isEditMode ? undefined : onPersonClick} 
                      showBadges={true} 
                    />

                    {isEditMode && hasManageAccess && !isRemoving && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onExcludeClick(p);
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
      })}
    </div>
  );
};