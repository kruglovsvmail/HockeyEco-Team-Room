import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Icon } from '../../ui/Icon';
import { FadeIn, StaggerContainer } from '../../ui/FadeIn';
import { getAuthHeaders } from '../../utils/helpers';

// Переиспользуемый матовый блок с поддержкой индивидуального редактирования и лоадера сохранения
const CustomBlock = ({ title, icon, isEditing, onAction, isSaving, children }) => {
  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mb-3 relative overflow-hidden">
      
      {/* Оверлей блокировки контента при активном сохранении */}
      {isSaving && (
        <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
            <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Сохранение...</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
            {title}
          </span>
        </div>
        {onAction && (
          <button 
            type="button"
            onClick={onAction} 
            className="transition-colors p-1 text-content-subtle hover:text-brand outline-none cursor-pointer flex items-center justify-center rounded-lg hover:bg-surface-level2"
          >
            {isEditing ? (
              <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <Icon name="edit" className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      <div className="flex flex-col text-left">{children}</div>
    </div>
  );
};

export function OpponentHandbookPanel({ data, onClose }) {
  const { editingOpponent, loadData, onInitiateDelete, selectedTeam } = data;

  const [oppName, setOppName] = useState('');
  const [oppShort, setOppShort] = useState('');
  const [oppCity, setOppCity] = useState('');
  const [oppIsActive, setOppIsActive] = useState(true);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingBlock, setSavingBlock] = useState(null); // 'name' | 'city' | 'short' | 'status'

  // Режимы редактирования блоков (карандашики)
  const [isEditName, setIsEditName] = useState(!editingOpponent);
  const [isEditCity, setIsEditCity] = useState(!editingOpponent);
  const [isEditShort, setIsEditShort] = useState(!editingOpponent);
  const [isEditStatus, setIsEditStatus] = useState(!editingOpponent);

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
      setOppIsActive(editingOpponent.status !== 'archive');
      setIsEditName(false);
      setIsEditCity(false);
      setIsEditShort(false);
      setIsEditStatus(false);
    } else {
      setOppName('');
      setOppShort('');
      setOppCity('');
      setOppIsActive(true);
      setIsEditName(true);
      setIsEditCity(true);
      setIsEditShort(true);
      setIsEditStatus(true);
    }
  }, [editingOpponent]);

  useEffect(() => {
    const handleClosePanel = () => onClose();
    window.addEventListener('close-manager-right-panel', handleClosePanel);
    return () => window.removeEventListener('close-manager-right-panel', handleClosePanel);
  }, [onClose]);

  // Атомарное сохранение отдельного измененного параметра при редактировании
  const handleSaveField = async (blockKey) => {
    if (!oppName.trim() || !oppCity.trim() || !selectedTeam?.id) return;
    setSavingBlock(blockKey);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents/${editingOpponent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ 
          teamId: selectedTeam.id, 
          name: oppName.trim(), 
          short_name: oppShort.trim().toUpperCase(), 
          city: oppCity.trim(),
          status: oppIsActive ? 'active' : 'archive'
        })
      });

      if (res.ok) {
        loadData();
        if (blockKey === 'name') setIsEditName(false);
        if (blockKey === 'city') setIsEditCity(false);
        if (blockKey === 'short') setIsEditShort(false);
        if (blockKey === 'status') setIsEditStatus(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBlock(null);
    }
  };

  // Метод создания новой карточки соперника (POST)
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!oppName.trim() || !oppCity.trim() || !selectedTeam?.id) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ 
          teamId: selectedTeam.id, 
          name: oppName.trim(), 
          short_name: oppShort.trim().toUpperCase(), 
          city: oppCity.trim(),
          status: oppIsActive ? 'active' : 'archive'
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
    <div 
      className="flex flex-col h-full bg-surface-level2 text-left justify-between overflow-hidden"
      style={{ ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}) }}
    >
      <form 
        onSubmit={editingOpponent ? (e) => e.preventDefault() : handleCreateSubmit} 
        className="flex-1 overflow-y-auto scrollbar-hide p-5 pb-24"
      >
        <StaggerContainer key={editingOpponent ? "edit_opponent" : "create_opponent"}>
          
          {/* БЛОК 1: НАЗВАНИЕ КОМАНДЫ */}
          <CustomBlock 
            title="Название команды" 
            icon="team"
            isEditing={isEditName}
            isSaving={savingBlock === 'name'}
            onAction={editingOpponent ? () => {
              if (isEditName) handleSaveField('name');
              else setIsEditName(true);
            } : null}
          >
            {isEditName ? (
              <TextInputLP 
                placeholder="Например: Динамо" 
                value={oppName} 
                onChange={setOppName} 
                activeColor={activeBrandColor}
              />
            ) : (
              <div className="text-[18px] font-black text-brand tracking-wide pt-1">
                {oppName || '—'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК 2: ГОРОД КОМАНДЫ */}
          <CustomBlock 
            title="Город команды" 
            icon="arena"
            isEditing={isEditCity}
            isSaving={savingBlock === 'city'}
            onAction={editingOpponent ? () => {
              if (isEditCity) handleSaveField('city');
              else setIsEditCity(true);
            } : null}
          >
            {isEditCity ? (
              <TextInputLP 
                placeholder="Введите город команды" 
                value={oppCity} 
                onChange={setOppCity} 
                activeColor={activeBrandColor}
              />
            ) : (
              <div className="text-[14px] font-black text-content-main tracking-wide pt-1">
                {oppCity || '—'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК 3: АББРЕВИАТУРА КОМАНДЫ */}
          <CustomBlock 
            title="Аббревиатура" 
            icon="jersey"
            isEditing={isEditShort}
            isSaving={savingBlock === 'short'}
            onAction={editingOpponent ? () => {
              if (isEditShort) handleSaveField('short');
              else setIsEditShort(true);
            } : null}
          >
            {isEditShort ? (
              <TextInputLP 
                maxLength={4}
                placeholder="например: ДИН" 
                value={oppShort} 
                onChange={(val) => setOppShort(val.toUpperCase())} 
                activeColor={activeBrandColor}
              />
            ) : (
              <div className="text-[14px] font-black text-content-main tracking-wide pt-1">
                {oppShort || '—'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК 4: СТАТУС СОПЕРНИКА В БАЗЕ ДАННЫХ */}
          <CustomBlock 
            title="Статус соперника" 
            icon="calendar"
            isEditing={isEditStatus}
            isSaving={savingBlock === 'status'}
            onAction={editingOpponent ? () => {
              if (isEditStatus) handleSaveField('status');
              else setIsEditStatus(true);
            } : null}
          >
            {isEditStatus ? (
              <div className="pt-1">
                <CheckboxLP 
                  checked={oppIsActive} 
                  onChange={setOppIsActive} 
                  label="Активный соперник" 
                  activeColor={activeBrandColor}
                />
              </div>
            ) : (
              <div className="text-[14px] font-black text-content-main tracking-wide pt-1 flex items-center gap-1.5">
                <div className={clsx("w-2 h-2 rounded-full", oppIsActive ? "bg-brand animate-pulse" : "bg-content-muted")} />
                {oppIsActive ? 'Доступен (Активен)' : 'В архиве'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК СТАТИСТИКИ */}
          {editingOpponent && (
            <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex flex-col gap-1 my-6">
              <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Статистическая сводка</span>
              <span className="text-[14px] text-content-main font-medium">
                Матчей сыграно: <strong className="text-brand">{editingOpponent.games_count || 0}</strong>
              </span>
            </div>
          )}

          {/* НИЖНИЙ БЛОК ДЕЙСТВИЙ */}
          <div className="pt-4 shrink-0 flex flex-col gap-2">
            {!editingOpponent ? (
              <ButtonLP 
                type="submit" 
                variant="primary" 
                disabled={!oppName.trim() || !oppCity.trim() || isSubmitting}
                className="rounded-xl font-bold uppercase tracking-wider text-[14px] !py-3.5 !h-12"
                activeColor={activeBrandColor}
              >
                Создать соперника
              </ButtonLP>
            ) : (
              <>
                <ButtonLP
                  variant="outline"
                  disabled={isDeleteDisabled}
                  onClick={() => onInitiateDelete(editingOpponent.id, editingOpponent.name)}
                  className="w-full py-3 text-danger normal-case font-bold text-[14px] rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Удалить соперника
                </ButtonLP>
                {isDeleteDisabled && (
                  <p className="text-[14px] text-content-muted font-medium leading-relaxed text-center mt-1 px-1">
                    Удаление невозможно: ваша команда уже сыграла или планирует сыграть матч с этим соперником.
                  </p>
                )}
              </>
            )}
          </div>

        </StaggerContainer>
      </form>
    </div>
  );
}