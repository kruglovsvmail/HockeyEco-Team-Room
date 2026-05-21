import React from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';

export const TeamRosterPlayers = ({ roster = [], onPersonClick }) => {
  const getPlayersByRole = (match) => roster.filter(p => p.position === match) || [];

  const groups = [
    { id: 'goalie', label: 'Вратари' },
    { id: 'defense', label: 'Защитники' },
    { id: 'forward', label: 'Нападающие' }
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map(group => {
        const players = getPlayersByRole(group.id);
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