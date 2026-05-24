import React, { useState, useEffect } from 'react';
import { TopSheet } from '../../ui/TopSheet';
import { ImageUploaderLP } from '../../ui/ImageUploaderLP';
import { ButtonLP } from '../../ui/Button-LP';
import { getAuthHeaders } from '../../utils/helpers';

export function TeamProfileEditSheet({ isOpen, onClose, selectedTeam, user, onTeamUpdated }) {
  // Расширенный стейт формы, включающий существующие URL-адреса медиафайлов из БД
  const [formData, setFormData] = useState({
    name: '', short_name: '', city: '', description: '',
    color_home_1: '#ffffff', color_home_2: '#ffffff',
    color_away_1: '#ffffff', color_away_2: '#ffffff',
    logo_url: null, jersey_dark_url: null, jersey_light_url: null
  });

  const [logoFile, setLogoFile] = useState(null);
  const [jerseyDarkFile, setJerseyDarkFile] = useState(null);
  const [jerseyLightFile, setJerseyLightFile] = useState(null);

  const [deleteLogo, setDeleteLogo] = useState(false);
  const [deleteJerseyDark, setDeleteJerseyDark] = useState(false);
  const [deleteJerseyLight, setDeleteJerseyLight] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Динамическое определение флага включения цветов из localStorage (по дефолту true)
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const activeColor = isColorsEnabled && selectedTeam?.color_home_1 ? selectedTeam.color_home_1 : null;

  // Фоновый запрос полных параметров команды из БД при открытии шторки
  useEffect(() => {
    if (selectedTeam?.id && isOpen) {
      const fetchFullTeamRow = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/my`, {
            headers: getAuthHeaders()
          });
          if (res.ok) {
            const data = await res.json();
            const dbTeam = data.teams?.find(t => t.id === selectedTeam.id);
            
            if (dbTeam) {
              setFormData({
                name: dbTeam.name || '',
                short_name: dbTeam.short_name || '',
                city: dbTeam.city || '',
                description: dbTeam.description || '',
                color_home_1: dbTeam.color_home_1 || '#ffffff',
                color_home_2: dbTeam.color_home_2 || '#ffffff',
                color_away_1: dbTeam.color_away_1 || '#ffffff',
                color_away_2: dbTeam.color_away_2 || '#ffffff',
                logo_url: dbTeam.logo_url,
                jersey_dark_url: dbTeam.jersey_dark_url,
                jersey_light_url: dbTeam.jersey_light_url
              });
            }
          }
        } catch (err) {
          console.error('Ошибка предзагрузки параметров команды:', err);
        }
      };

      fetchFullTeamRow();
      setLogoFile(null);
      setJerseyDarkFile(null);
      setJerseyLightFile(null);
      setDeleteLogo(false);
      setDeleteJerseyDark(false);
      setDeleteJerseyLight(false);
      setErrorMessage('');
    }
  }, [selectedTeam, isOpen]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!selectedTeam?.id) return;

    setIsSaving(true);
    setErrorMessage('');

    const bodyData = new FormData();
    bodyData.append('name', formData.name);
    bodyData.append('short_name', formData.short_name);
    bodyData.append('city', formData.city);
    bodyData.append('description', formData.description);
    bodyData.append('color_home_1', formData.color_home_1);
    bodyData.append('color_home_2', formData.color_home_2);
    bodyData.append('color_away_1', formData.color_away_1);
    bodyData.append('color_away_2', formData.color_away_2);

    bodyData.append('delete_logo', deleteLogo ? 'true' : 'false');
    bodyData.append('delete_jersey_dark', deleteJerseyDark ? 'true' : 'false');
    bodyData.append('delete_jersey_light', deleteJerseyLight ? 'true' : 'false');

    if (logoFile && !deleteLogo) bodyData.append('logo', logoFile);
    if (jerseyDarkFile && !deleteJerseyDark) bodyData.append('jersey_dark', jerseyDarkFile);
    if (jerseyLightFile && !deleteJerseyLight) bodyData.append('jersey_light', jerseyLightFile);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeam.id}/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': getAuthHeaders().Authorization
        },
        body: bodyData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onTeamUpdated(data.team);
        onClose();
      } else {
        setErrorMessage(data.error || 'Ошибка при сохранении профиля');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Ошибка соединения с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TopSheet isOpen={isOpen} onClose={() => { if (!isSaving) onClose(); }}>
      <div className="w-full max-w-xl mx-auto flex flex-col pt-0.5">
        
        <h3 className="text-[12px] font-black uppercase tracking-widest text-content-main mb-6 text-center">
          Параметры команды
        </h3>

        {errorMessage && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-3 max-h-[74vh] overflow-y-auto scrollbar-hide px-0.5 pb-3">
          
          {/* ВЕРХНИЙ БЛОК */}
          <div className="grid grid-cols-[90px_1fr] gap-3 items-center w-full">
            <ImageUploaderLP 
              currentImageUrl={deleteLogo ? null : formData.logo_url} 
              onChange={(file) => { setLogoFile(file); setDeleteLogo(false); }} 
              onDelete={() => { setLogoFile(null); setDeleteLogo(true); }}
              sizeClass="w-[84px] h-[84px]"
            />

            <div className="flex flex-col gap-2 w-full">
              <input 
                type="text" 
                required
                placeholder="Название команды"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                style={activeColor ? { '--tw-placeholder-opacity': 0.6 } : {}}
                className="w-full h-10 bg-surface-level2 border border-surface-border rounded-xl px-3 text-xs font-bold text-content-main focus:outline-none transition-colors"
              />

              <div className="grid grid-cols-[64px_1fr] gap-2">
                <input 
                  type="text" 
                  maxLength={4}
                  required
                  placeholder="АББР"
                  value={formData.short_name}
                  style={activeColor ? { color: activeColor } : {}}
                  onChange={e => setFormData(prev => ({ ...prev, short_name: e.target.value.toUpperCase() }))}
                  className="w-full h-10 bg-surface-level2 border border-surface-border rounded-xl px-1 text-xs font-black text-brand text-center focus:outline-none transition-colors uppercase tracking-wider"
                />
                <input 
                  type="text" 
                  required
                  placeholder="Город"
                  value={formData.city}
                  onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full h-10 bg-surface-level2 border border-surface-border rounded-xl px-3 text-xs font-bold text-content-main focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <textarea 
            rows={3}
            value={formData.description}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-surface-level2 border border-surface-border rounded-xl px-3 py-2.5 text-xs font-bold text-content-main focus:outline-none transition-colors resize-none leading-normal min-h-[74px]"
            placeholder="О команде (например: фарм-клуб организации, основан в 2020 году)..."
          />

          <div className="grid grid-cols-2 gap-2 w-full">
            {/* ДОМАШНИЙ КОМПЛЕКТ */}
            <div className="flex flex-col p-2.5 bg-surface-level2 border border-surface-border rounded-xl justify-between min-h-[96px]">
              <span className="text-[10px] font-black text-content-muted uppercase tracking-widest block px-0.5 mb-4 select-none">
                Домашняя
              </span>
              <div className="flex items-center justify-between gap-3 w-full">
                <ImageUploaderLP 
                  currentImageUrl={deleteJerseyDark ? null : formData.jersey_dark_url} 
                  onChange={(file) => { setJerseyDarkFile(file); setDeleteJerseyDark(false); }} 
                  onDelete={() => { setJerseyDarkFile(null); setDeleteJerseyDark(true); }}
                  sizeClass="w-20 h-20"
                />
                <div className="flex flex-col gap-1 shrink-0 justify-center">
                  <input 
                    type="color" 
                    value={formData.color_home_1} 
                    onChange={e => setFormData(prev => ({ ...prev, color_home_1: e.target.value }))} 
                    className="w-[32px] h-[32px] rounded-full cursor-pointer border border-surface-border/50 bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                  <input 
                    type="color" 
                    value={formData.color_home_2} 
                    onChange={e => setFormData(prev => ({ ...prev, color_home_2: e.target.value }))} 
                    className="w-[32px] h-[32px] rounded-full cursor-pointer border border-surface-border/50 bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                </div>
              </div>
            </div>

            {/* ГОСТЕВОЙ КОМПЛЕКТ */}
            <div className="flex flex-col p-2.5 bg-surface-level2 border border-surface-border rounded-xl justify-between min-h-[96px]">
              <span className="text-[10px] font-black text-content-muted uppercase tracking-widest block px-0.5 mb-4 select-none">
                Гостевая
              </span>
              <div className="flex items-center justify-between gap-3 w-full">
                <ImageUploaderLP 
                  currentImageUrl={deleteJerseyLight ? null : formData.jersey_light_url} 
                  onChange={(file) => { setJerseyLightFile(file); setDeleteJerseyLight(false); }} 
                  onDelete={() => { setJerseyLightFile(null); setDeleteJerseyLight(true); }}
                  sizeClass="w-20 h-20"
                />
                <div className="flex flex-col gap-1 shrink-0 justify-center">
                  <input 
                    type="color" 
                    value={formData.color_away_1} 
                    onChange={e => setFormData(prev => ({ ...prev, color_away_1: e.target.value }))} 
                    className="w-[32px] h-[32px] rounded-full cursor-pointer border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                  <input 
                    type="color" 
                    value={formData.color_away_2} 
                    onChange={e => setFormData(prev => ({ ...prev, color_away_2: e.target.value }))} 
                    className="w-[32px] h-[32px] rounded-full cursor-pointer border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                </div>
              </div>
            </div>

          </div>

          {/* ФИНАЛЬНАЯ КНОПКА ОТПРАВКИ */}
          <div className="py-3 w-full">
            {/* ИСПРАВЛЕНО: Кнопка сохранения параметров принимает activeColor */}
            <ButtonLP type="submit" isLoading={isSaving} className="!h-12 !text-xs" activeColor={activeColor}>
              Сохранить изменения
            </ButtonLP>
          </div>

        </form>
      </div>
    </TopSheet>
  );
}