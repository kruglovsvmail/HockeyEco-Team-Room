import React from 'react';
import { Avatar } from '../../ui/Avatar';
import { getContrastTextColor } from '../../utils/helpers';

// Оборачиваем в React.memo, чтобы компонент перерисовывался только при реальном изменении пропсов
export const PersonGridCard = React.memo(({ person, onClick, showBadges = false, activeColor }) => {
  
  // Вычисляем контрастный цвет текста для капитанской нашивки
  const contrastBadgeText = activeColor && getContrastTextColor(activeColor) === 'text-white' ? '#ffffff' : '#111827';

  return (
    <div 
      onClick={() => onClick && onClick(person)}
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
          <div 
            style={activeColor ? { backgroundColor: activeColor, color: contrastBadgeText } : {}}
            className="absolute -top-1 -right-2 w-[20px] h-[20px] rounded-full bg-brand shadow-sm flex items-center justify-center text-[9px] font-black text-content-dark z-20"
          >
            {person.is_captain ? 'К' : 'А'}
          </div>
        )}

        {showBadges && person.jersey_number != null && (
          /* Убран ресурсоемкий backdrop-blur-[4px], заменен на чистый высокопроизводительный слой */
          <div className="absolute -bottom-1 -right-2 w-[24px] h-[24px] bg-content-muted rounded-full shadow-sm flex items-center justify-center text-[12px] font-bold text-content-dark z-10">
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
});

PersonGridCard.displayName = 'PersonGridCard';