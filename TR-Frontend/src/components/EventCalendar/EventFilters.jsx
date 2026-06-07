import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../ui/Icon';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { getImageUrl } from '../../utils/helpers';

export function EventFilters({ user, teams = [], onClose }) {
  // Локальное состояние фильтров
  const [filters, setFilters] = useState({
    teams: {}, // { teamId: boolean }
    showClub: true
  });

  const localStorageKey = user?.id ? `tr_filter_${user.id}` : null;

  // Инициализация дефолтных значений, если в localStorage ничего нет
  const initializeDefaultFilters = useCallback(() => {
    if (!teams || teams.length === 0) return;
    const defaultTeams = {};
    teams.forEach(t => {
      defaultTeams[t.id] = true;
    });
    setFilters({
      teams: defaultTeams,
      showClub: true
    });
  }, [teams]);

  // Чтение фильтров из localStorage при монтировании компонента
  useEffect(() => {
    if (!localStorageKey || !teams || teams.length === 0) return;

    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const updatedTeams = {};
        let hasChanges = false;
        
        // СТРОГАЯ САНИТАРИЯ: Переносим только ТЕ команды, которые сейчас реально активны
        teams.forEach(t => {
          if (parsed.teams && parsed.teams[t.id] !== undefined) {
            updatedTeams[t.id] = parsed.teams[t.id];
          } else {
            updatedTeams[t.id] = true; // Новая команда по умолчанию включена
            hasChanges = true;
          }
        });

        // Проверяем, не остались ли в parsed.teams лишние (архивные) ID
        if (parsed.teams && Object.keys(parsed.teams).length !== teams.length) {
          hasChanges = true;
        }

        const newFilters = {
          teams: updatedTeams,
          showClub: parsed.showClub !== undefined ? parsed.showClub : true
        };

        setFilters(newFilters);
        
        // Перезаписываем localStorage только если состав команд РЕАЛЬНО изменился,
        // это полностью предотвращает бесконечный цикл рендеринга!
        if (hasChanges) {
          localStorage.setItem(localStorageKey, JSON.stringify(newFilters));
        }
      } catch (e) {
        console.error('Ошибка чтения фильтров из localStorage:', e);
        initializeDefaultFilters();
      }
    } else {
      initializeDefaultFilters();
    }
    // Используем строку из ID команд в качестве зависимости, чтобы не триггериться на смену ссылок массивов
  }, [localStorageKey, JSON.stringify(teams.map(t => t.id)), initializeDefaultFilters]);

  // Обработчик клика по чекбоксу команды
  const handleTeamCheckboxChange = (teamId, checked) => {
    if (!localStorageKey) return;

    const updatedFilters = {
      ...filters,
      teams: {
        ...filters.teams,
        [teamId]: checked
      }
    };
    setFilters(updatedFilters);
    localStorage.setItem(localStorageKey, JSON.stringify(updatedFilters));
    window.dispatchEvent(new Event('tr-filter-changed'));
  };

  // Обработчик клика по чекбоксу клубных событий
  const handleClubCheckboxChange = (checked) => {
    if (!localStorageKey) return;

    const updatedFilters = {
      ...filters,
      showClub: checked
    };
    setFilters(updatedFilters);
    localStorage.setItem(localStorageKey, JSON.stringify(updatedFilters));
    window.dispatchEvent(new Event('tr-filter-changed'));
  };

  return (
    <div className="p-4 text-left">
      <h2 className="text-lg font-black text-content-main">Фильтр событий</h2>

      <div className="space-y-4 my-4">
        {/* Клубные события: кликабельный контейнер */}
        <div 
          onClick={() => handleClubCheckboxChange(!filters.showClub)}
          className="flex flex-col p-3 rounded-xl bg-surface-base cursor-pointer active:scale-[0.99] transition-all"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <CheckboxLP 
              checked={filters.showClub}
              onChange={handleClubCheckboxChange}
              label="Показывать клубные события"
              className="w-full pointer-events-auto"
            />
          </div>
          <span className="block text-[10px] text-content-main ml-8 mt-1 select-none">
            Клубные тренировки и собрания
          </span>
        </div>

        {/* Блок фильтрации команд */}
        {teams && teams.length > 0 ? (
          <div className="space-y-2">
            <span className="block text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1 select-none">
              Мои команды
            </span>
            <div className="space-y-3">
              {teams.map(team => {
                const isChecked = filters.teams[team.id] !== false;
                return (
                  <div 
                    key={team.id} 
                    onClick={() => handleTeamCheckboxChange(team.id, !isChecked)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-base cursor-pointer active:scale-[0.99] transition-all select-none"
                  >
                    {/* 1. Логотип команды */}
                    {team.logo_url ? (
                      <img 
                        src={getImageUrl(team.logo_url)} 
                        alt={team.name} 
                        className="w-7 h-7 object-contain img-render-smooth shrink-0"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-level3 border border-surface-border0 text-content-muted font-black text-[10px] uppercase tracking-wider shrink-0">
                        {team.short_name || 'Т'}
                      </div>
                    )}

                    {/* 2. Название команды */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-content-main block truncate">
                        {team.name}
                      </span>
                    </div>

                    {/* 3. Чекбокс */}
                    <div className="shrink-0 flex items-center pointer-events-none">
                      <CheckboxLP 
                        checked={isChecked}
                        onChange={() => {}}
                        label=""
                        activeColor={team.color_home_1 || null}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs italic text-content-muted text-center py-2 select-none">
            Список доступных команд пуст
          </p>
        )}
      </div>
    </div>
  );
}