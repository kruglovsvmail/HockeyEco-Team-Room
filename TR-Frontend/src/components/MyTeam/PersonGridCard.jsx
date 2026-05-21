import React from 'react';
import { Avatar } from '../../ui/Avatar';

export const PersonGridCard = ({ person, onClick, showBadges = false }) => {
  return (
    <div 
      onClick={() => onClick(person)}
      className="flex flex-col items-center gap-1.5 select-none w-full cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="relative">
        <Avatar 
          photoUrl={person.photo_url || person.avatar_url}
          firstName={person.first_name}
          lastName={person.last_name}
          className="w-16 h-16 rounded-2xl bg-surface-level2 border border-surface-level2 shadow-sm origin-center"
        />

        {showBadges && (person.is_captain || person.is_assistant) && (
          <div className="absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full bg-brand shadow-sm flex items-center justify-center text-[9px] font-black text-content-dark z-20">
            {person.is_captain ? 'К' : 'А'}
          </div>
        )}

        {showBadges && person.jersey_number != null && (
          <div className="absolute -bottom-1 -right-3 w-[32px] h-[32px] bg-brand-glow rounded-full backdrop-blur-[4px] border border-white/50 shadow-sm flex items-center justify-center text-[13px] font-black text-content-dark z-10">
            {person.jersey_number}
          </div>
        )}
      </div>

      <div className="w-full text-center px-0.5">
        <span className="text-[13px] font-bold text-content-main leading-tight break-words block pointer-events-none">
          {person.last_name}
        </span>
        <span className="text-[11px] text-content-muted leading-tight break-words block pointer-events-none mt-0.5">
          {person.first_name}
        </span>
      </div>
    </div>
  );
};