import React from 'react';
import dayjs from 'dayjs';
import { getImageUrl } from '../utils/helpers';

export const UserDetails = ({ data }) => {
  // Защита от белого экрана: если данные еще не загрузились или равны null/undefined
  if (!data) {
    return (
      <div className="w-full h-full flex items-center justify-center p-5">
        <span className="text-sm font-bold text-content-muted uppercase tracking-widest animate-pulse">
          Загрузка профиля...
        </span>
      </div>
    );
  }

  // Расчет возраста с защитой от пустой даты рождения
  const age = data.birth_date ? dayjs().diff(dayjs(data.birth_date), 'year') : null;

  // Компонент строки информации
  const InfoRow = ({ label, value }) => {
    if (!value) return null; // Если значения нет, строку не показываем
    return (
      <div className="flex items-center justify-between p-4 bg-surface-level2/40 rounded-2xl border border-surface-border/40 backdrop-blur-md">
        <span className="text-[11px] font-black text-content-muted uppercase tracking-widest">
          {label}
        </span>
        <span className="text-sm font-black text-content-main text-right">
          {value}
        </span>
      </div>
    );
  };

  return (
    <div className="h-full w-full flex flex-col bg-surface-level1 overflow-y-auto scrollbar-hide p-5 pb-10">
      
      {/* Большой красивый блок аватара */}
      <div className="flex flex-col items-center mb-8 mt-4">
        <div className="w-28 h-28 rounded-[36px] bg-surface-base border border-surface-border p-1 mb-4 shadow-md flex items-center justify-center relative overflow-hidden">
          <div className="w-full h-full rounded-[30px] overflow-hidden bg-surface-level2 shadow-inner flex items-center justify-center">
            {data.avatar_url ? (
              <img 
                src={getImageUrl(data.avatar_url)} 
                alt="Аватар" 
                className="w-full h-full object-cover" 
              />
            ) : (
              <span className="text-3xl font-black text-brand uppercase opacity-20 select-none">
                {data.last_name?.[0] || '?'}{data.first_name?.[0] || ''}
              </span>
            )}
          </div>
        </div>

        {/* ФИО в две строки с правильными размерами */}
        <h2 className="text-xl font-black text-content-main text-center uppercase tracking-tight leading-none truncate max-w-full px-2">
          {data.last_name || '—'}
        </h2>
        <h3 className="text-base font-bold text-brand mt-1 capitalize truncate max-w-full px-2">
          {data.first_name || '—'}
        </h3>
      </div>

      {/* Список параметров анкета */}
      <div className="flex flex-col gap-2.5 w-full">
        <InfoRow 
          label="Роль / Амплуа" 
          value={data.position === 'goalie' ? 'Вратарь' : data.position === 'defense' ? 'Защитник' : data.position === 'forward' ? 'Нападающий' : data.roles} 
        />
        
        <InfoRow 
          label="Возраст" 
          value={age ? `${age} лет` : null} 
        />
        
        <InfoRow 
          label="Дата рождения" 
          value={data.birth_date ? dayjs(data.birth_date).format('DD.MM.YYYY') : null} 
        />

        {/* Рост и вес в одну строку для экономии места */}
        {(data.height || data.weight) && (
          <div className="grid grid-cols-2 gap-2.5">
            {data.height && (
              <div className="flex flex-col p-3 bg-surface-level2/40 rounded-2xl border border-surface-border/40 backdrop-blur-md">
                <span className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">
                  Рост
                </span>
                <span className="text-sm font-black text-content-main">
                  {data.height} см
                </span>
              </div>
            )}
            {data.weight && (
              <div className="flex flex-col p-3 bg-surface-level2/40 rounded-2xl border border-surface-border/40 backdrop-blur-md">
                <span className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">
                  Вес
                </span>
                <span className="text-sm font-black text-content-main">
                  {data.weight} кг
                </span>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};