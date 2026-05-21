import React, { useMemo } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';

export const TeamRosterPlayers = ({ roster = [], onPersonClick }) => {
  
  // Группируем игроков по позициям один раз при изменении самого массива ростера,
  // а не вычисляем трижды на каждом рендере внутри .map()
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
              {players.map(p => (
                <PersonGridCard 
                  key={p.member_id} 
                  person={p} 
                  onClick={onPersonClick} 
                  showBadges={true} 
                />
              ))}
            </div>
          </ContainerContent>
        );
      })}
    </div>
  );
};