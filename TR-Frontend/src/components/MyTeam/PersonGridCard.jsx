import React from 'react';
import { Avatar } from '../../ui/Avatar';
import { getContrastTextColor } from '../../utils/helpers';

// Оборачиваем в React.memo, чтобы компонент перерисовывался только при реальном изменении пропсов
export const PersonGridCard = React.memo(({ person, onClick, showBadges = false, activeBrandColor }) => {
  // Определяем цвет фона для плашек нашивок (капитан/ассистент)
  const badgeBgColor = activeBrandColor || 'var(--color-brand)';
  
  // Вычисляем контрастный класс текста (text-white или text-content-dark) на основе цвета плашки
  const badgeTextColorClass = getContrastTextColor(activeBrandColor);

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
          /* ИСПРАВЛЕНО: Заменен bg-brand и text-content-dark на динамический цвет команды и умный контраст текста */
          <div 
            style={{ backgroundColor: badgeBgColor }}
            className={`absolute -top-1 -right-2 w-[20px] h-[20px] rounded-full shadow-sm flex items-center justify-center text-[10px] font-black z-20 ${badgeTextColorClass}`}
          >
            {person.is_captain ? 'К' : 'А'}
          </div>
        )}

        {showBadges && person.jersey_number != null && (
          /* Убран ресурсоемкий backdrop-blur-[4px], заменен на чистый высокопроизводительный слой */
          <div className="absolute -bottom-1 -right-2 w-[24px] h-[24px] bg-content-muted rounded-full shadow-sm flex items-center justify-center text-[14px] font-bold text-content-dark z-10">
            {person.jersey_number}
          </div>
        )}
      </div>

      <div className="w-full text-center px-0.5">
        <span className="text-[14px] font-bold text-content-main leading-tight whitespace-nowrap block pointer-events-none">
          {person.last_name}
        </span>
        <span className="text-[10px] text-content-muted leading-tight whitespace-nowrap block pointer-events-none">
          {person.first_name}
        </span>
      </div>
    </div>
  );
});

PersonGridCard.displayName = 'PersonGridCard';