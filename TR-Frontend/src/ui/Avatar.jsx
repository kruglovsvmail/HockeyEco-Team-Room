import React from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../utils/helpers';

export const Avatar = ({ 
  photoUrl, 
  firstName, 
  lastName, 
  className = "", 
  fallbackClassName = "bg-surface-level2 text-brand text-[18px]", // Светлый минимализм по умолчанию
}) => {
  const getInitials = (fName, lName) => {
    const f = fName ? String(fName).charAt(0).toUpperCase() : '';
    const l = lName ? String(lName).charAt(0).toUpperCase() : '';
    return `${l}${f}` || '?';
  };

  return (
    <div className={clsx(
      "shrink-0 overflow-hidden flex items-center justify-center relative",
      className
    )}>
      {photoUrl ? (
        <img 
          src={getImageUrl(photoUrl)} 
          alt={`${lastName || ''} ${firstName || ''}`.trim()} 
          className="w-full h-full object-cover pointer-events-none" 
        />
      ) : (
        <div className={clsx(
          "w-full h-full flex items-center justify-center font-bold pointer-events-none",
          fallbackClassName
        )}>
          {getInitials(firstName, lastName)}
        </div>
      )}
    </div>
  );
};