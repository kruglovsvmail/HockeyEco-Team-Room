import React from 'react';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

export function TournamentPageHeader({ activeTournament, onClick, hasTeamColor, activeBrandColor }) {
  const hasData = !!activeTournament;

  return (
    <div className="absolute top-0 left-0 right-0 z-40 bg-transparent pointer-events-none flex flex-col">
      {/* Фиксированная шапка с экономичным градиентным шлейфом */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-surface-border from-80% to-transparent z-10" />

      <div className="px-4 pointer-events-auto relative z-20">
        <button 
          onClick={onClick}
          className="w-full bg-surface-base p-4 rounded-3xl flex items-center shadow-lg text-left outline-none active:scale-[0.98] transition-all border border-surface-border/40"
        >
          {/* ЛЕВЫЙ КОНТЕЙНЕР (20%) — Для логотипа */}
          <div className="w-[20%] shrink-0 flex items-center justify-center">
            <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
              {hasData ? (
                <img 
                  src={getImageUrl(activeTournament.division_logo)} 
                  alt={activeTournament.division_name} 
                  className="w-full h-full object-contain" 
                />
              ) : (
                <Icon name="registry" className="w-6 h-6 text-content-subtle" />
              )}
            </div>
          </div>

          {/* ПРАВЫЙ КОНТЕЙНЕР (80%) — Двухуровневый текстовый block */}
          <div className="w-[80%] min-w-0 flex flex-col justify-center pl-3 pr-1">
            {hasData ? (
              <>
                {/* ВЕРХНИЙ КОНТЕЙНЕР: Название лиги с выравниванием по левой стороне (до 2 строк) */}
                <div className="text-left">
                  <span 
                    className="text-[12px] font-black uppercase tracking-widest text-content-main block whitespace-normal break-words line-clamp-2 leading-tight"
                  >
                    {activeTournament.league_name}
                  </span>
                </div>

                {/* НИЖНИЙ КОНТЕЙНЕР: Разделен на левую и правую стороны (один размер и цвет) */}
                <div className="flex items-center justify-between w-full mt-1.5 gap-2">
                  
                  {/* Левая сторона: Название дивизиона (выравнивание по левой стороне) */}
                  <div className="text-left min-w-0 flex-1">
                    <span className="text-[10px] font-semibold text-content-muted uppercase tracking-wide truncate block">
                      {activeTournament.division_name}
                    </span>
                  </div>
                  
                  {/* Правая сторона: Сезон (выравнивание по правой стороне) */}
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-semibold text-content-muted uppercase tracking-wide block opacity-50">
                      {activeTournament.season_name}
                    </span>
                  </div>

                </div>
              </>
            ) : (
              <h2 className="text-[14px] font-black uppercase tracking-widest text-content-subtle text-left">
                Выберите tournament / лигу
              </h2>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}