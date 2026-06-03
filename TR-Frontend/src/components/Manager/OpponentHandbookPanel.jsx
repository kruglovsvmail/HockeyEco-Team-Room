import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Icon } from '../../ui/Icon';
import { getAuthHeaders } from '../../utils/helpers';

export function OpponentHandbookPanel({ data, onClose }) {
  const { editingOpponent, loadData, onInitiateDelete, selectedTeam } = data;

  const [oppName, setOppName] = useState('');
  const [oppShort, setOppShort] = useState('');
  const [oppCity, setOppCity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Вычисление динамического командного цвета
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;

  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  useEffect(() => {
    if (editingOpponent) {
      setOppName(editingOpponent.name || '');
      setOppShort(editingOpponent.short_name || '');
      setOppCity(editingOpponent.city || '');
    }
  }, [editingOpponent]);

  useEffect(() => {
    const handleClosePanel = () => onClose();
    window.addEventListener('close-manager-right-panel', handleClosePanel);
    return () => window.removeEventListener('close-manager-right-panel', handleClosePanel);
  }, [onClose]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!oppName.trim() || !oppCity.trim() || !selectedTeam?.id) return;

    setIsSubmitting(true);
    try {
      const method = editingOpponent ? 'PUT' : 'POST';
      const url = editingOpponent 
        ? `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents/${editingOpponent.id}`
        : `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ 
          teamId: selectedTeam.id, 
          name: oppName.trim(), 
          short_name: oppShort.trim().toUpperCase(), 
          city: oppCity.trim() 
        })
      });

      if (res.ok) {
        loadData();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeleteDisabled = editingOpponent?.games_count > 0;

  return (
    <form 
      onSubmit={handleSave} 
      className="flex flex-col h-full bg-surface-level2 p-5 text-left justify-between overflow-y-auto"
      style={{ ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}) }}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 border-b border-surface-border/40 pb-4">
          <span className="text-[10px] uppercase font-black tracking-widest text-content-muted">Справочник соперников</span>
          <h4 className="text-sm font-black uppercase text-content-main tracking-wider">
            {editingOpponent ? 'Редактирование профиля' : 'Регистрация команды'}
          </h4>
        </div>

        <TextInputLP 
          placeholder="Полное название команды (например, ХК Динамо)" 
          label="Название клуба"
          value={oppName} 
          onChange={setOppName} 
          activeColor={activeBrandColor}
        />
        
        <div className="grid grid-cols-2 gap-3">
          <TextInputLP 
            placeholder="Город" 
            label="Локация"
            value={oppCity} 
            onChange={setOppCity} 
            activeColor={activeBrandColor}
          />
          <TextInputLP 
            placeholder="Аббревиатура" 
            label="Кратко (3-4 символа)"
            value={oppShort} 
            onChange={setOppShort} 
            activeColor={activeBrandColor}
          />
        </div>

        {editingOpponent && (
          <div className="p-4 bg-surface-level1 border border-surface-border/40 rounded-2xl flex flex-col gap-1 mt-2">
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Статистическая сводка</span>
            <span className="text-xs text-content-main font-medium">
              Всего матчей в системе: <strong className="text-brand">{editingOpponent.games_count || 0}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-8 shrink-0">
        <ButtonLP 
          type="submit" 
          variant="primary" 
          disabled={!oppName.trim() || !oppCity.trim() || isSubmitting}
          className="rounded-xl font-bold uppercase tracking-wider text-xs py-3"
          activeColor={activeBrandColor}
        >
          {editingOpponent ? 'Сохранить изменения' : 'Внести в справочник'}
        </ButtonLP>

        {editingOpponent && (
          <button
            type="button"
            disabled={isDeleteDisabled}
            onClick={() => onInitiateDelete(editingOpponent.id, editingOpponent.name)}
            className={clsx(
              "w-full py-3 text-xs font-bold uppercase tracking-wider border transition-all rounded-xl text-center",
              isDeleteDisabled 
                ? "bg-surface-level1/40 border-surface-border/30 opacity-30 text-content-subtle cursor-not-allowed" 
                : "bg-danger/10 border-danger/20 text-danger hover:bg-danger/20 active:scale-[0.98]"
            )}
          >
            Удалить из базы данных
          </button>
        )}
      </div>
    </form>
  );
}