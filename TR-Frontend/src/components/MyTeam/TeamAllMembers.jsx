import React from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';

export const TeamAllMembers = ({ members, onPersonClick }) => {
  return (
    <ContainerContent title="Общий состав" count={members.length}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center">
        {members.map(m => (
          <PersonGridCard 
            key={m.member_id} 
            person={m} 
            onClick={onPersonClick} 
            showBadges={false} 
          />
        ))}
      </div>
    </ContainerContent>
  );
};