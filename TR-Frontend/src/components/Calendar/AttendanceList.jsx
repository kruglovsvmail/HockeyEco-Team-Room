/********** ФАЙЛ: TR-Frontend\src\components\Calendar\AttendanceList.jsx **********/

import React from 'react';
import { User } from 'lucide-react';
import { getImageUrl } from '../../utils/helpers';

export function AttendanceList({ attendees = [] }) {
  if (attendees.length === 0) {
    return (
      <div className="pb-2 text-center text-[13px] text-[#8E8E93] italic">
        Пока никто не отметился
      </div>
    );
  }

  // Заглушка для разбивки по амплуа (пока бэкенд не отдает position, выводим всех в "ПОЛЕВЫЕ")
  const fieldPlayers = attendees;

  return (
    <div className="pb-2">
      {/* Заголовок секции */}
      <div className="text-[11px] uppercase tracking-[0.2em] font-medium text-[#8E8E93] mb-5 pl-1">
        Полевые ({fieldPlayers.length})
      </div>
      
      {/* Сетка игроков (2 колонки) */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-6 px-1">
        {fieldPlayers.map(user => {
          // Разбиваем ФИО на Фамилию (крупно) и Имя (мелко)
          const displayName = user.name || 'Без имени';
          const parts = displayName.split(' ');
          const lastName = parts[0];
          const firstName = parts.slice(1).join(' ');
          
          return (
            <div key={user.id} className="flex items-center gap-3 group">
              
              {/* Аватарка: Сквиркл (rounded-[16px]) как на макете */}
              <div className="w-[46px] h-[46px] rounded-[16px] bg-[#2A2A2A] border border-[#333333] flex items-center justify-center overflow-hidden shrink-0">
                {user.avatar_url ? (
                  <img src={getImageUrl(user.avatar_url)} alt={lastName} className="w-full h-full object-cover" />
                ) : (
                  <User size={24} className="text-[#8E8E93]" strokeWidth={1.5} />
                )}
              </div>
              
              {/* Данные игрока */}
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-white uppercase tracking-wide truncate leading-tight">
                  {lastName}
                </span>
                <span className="text-[10px] text-[#8E8E93] uppercase tracking-wider truncate mt-[2px] leading-tight">
                  {firstName}
                </span>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}