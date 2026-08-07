import React, { useState, useEffect } from 'react';
import { ImageUploaderLP } from '../../ui/ImageUploaderLP';
import { ButtonLP } from '../../ui/Button-LP';
import { TextInputLP } from '../../ui/Input-LP';
import { getAuthHeaders } from '../../utils/helpers';

// Профиль клуба проще командного: у организации нет ни аббревиатуры для инфографики,
// ни комплектов формы — играют составы. Остаются название, логотип, город,
// описание и два фирменных цвета.
export function EditClubProfilePanel({ clubId, onRefresh, onClubUpdated, activeBrandColor, onClose }) {
  const [formData, setFormData] = useState({
    name: '', city: '', description: '',
    color_1: '#ffffff', color_2: '#ffffff',
    logo_url: null
  });

  const [logoFile, setLogoFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasClubColor = isColorsEnabled && !!formData.color_1 && formData.color_1.toLowerCase() !== '#ffffff';
  const dynamicBrandColor = hasClubColor ? formData.color_1 : (activeBrandColor || 'var(--color-brand)');

  useEffect(() => {
    if (!clubId) return;

    const fetchFullClubRow = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs/my`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          const dbClub = data.clubs?.find(c => c.id === clubId);

          if (dbClub) {
            setFormData({
              name: dbClub.name || '',
              city: dbClub.city || '',
              description: dbClub.description || '',
              color_1: dbClub.color_1 || '#ffffff',
              color_2: dbClub.color_2 || '#ffffff',
              logo_url: dbClub.logo_url
            });
          }
        }
      } catch (err) {
        console.error('Ошибка предзагрузки параметров клуба:', err);
      }
    };

    fetchFullClubRow();
    setLogoFile(null);
    setErrorMessage('');
  }, [clubId]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!clubId) return;

    setIsSaving(true);
    setErrorMessage('');

    const bodyData = new FormData();
    bodyData.append('name', formData.name);
    bodyData.append('city', formData.city);
    bodyData.append('description', formData.description);
    bodyData.append('color_1', formData.color_1);
    bodyData.append('color_2', formData.color_2);
    if (logoFile) bodyData.append('logo', logoFile);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs/${clubId}/profile`, {
        method: 'PUT',
        headers: { 'Authorization': getAuthHeaders().Authorization },
        body: bodyData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Сайдбар и шапка держат свою копию клуба — обновляем и её, иначе там
        // останется старое название с логотипом до перезахода в приложение.
        if (onClubUpdated && data.club) onClubUpdated(data.club);
        if (onRefresh) await onRefresh();
        if (onClose) onClose();
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
    <div className="w-full flex flex-col h-full overflow-hidden text-left bg-transparent">
      {errorMessage && (
        <div className="m-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[14px] font-semibold">
          {errorMessage}
        </div>
      )}

      <form
        onSubmit={handleSaveProfile}
        className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-hide p-4 pb-32"
      >
        {/* ВЕРХНИЙ БЛОК: НАЗВАНИЕ → ЛОГОТИП + ГОРОД */}
        <div className="flex flex-col gap-3 w-full bg-surface-level1 p-4 rounded-2xl border border-surface-border shadow-sm">
          <TextInputLP
            placeholder="Название клуба"
            value={formData.name}
            onChange={val => setFormData(prev => ({ ...prev, name: val }))}
            activeColor={dynamicBrandColor}
            size="lg"
            textAlign="center"
          />

          <div className="grid grid-cols-[84px_1fr] gap-3 items-center">
            <ImageUploaderLP
              currentImageUrl={formData.logo_url}
              onChange={(file) => setLogoFile(file)}
              showDelete={false}
              sizeClass="w-[84px] h-[84px]"
            />

            <div className="flex flex-col gap-2 w-full">
              <TextInputLP
                placeholder="Город"
                value={formData.city}
                onChange={val => setFormData(prev => ({ ...prev, city: val }))}
                activeColor={dynamicBrandColor}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* ОПИСАНИЕ КЛУБА */}
        <div className="w-full bg-surface-level1 p-4 rounded-2xl border border-surface-border shadow-sm">
          <TextInputLP
            type="textarea"
            rows={3}
            placeholder="О клубе (три взрослых состава, основан в 2015 году)..."
            value={formData.description}
            onChange={val => setFormData(prev => ({ ...prev, description: val }))}
            activeColor={dynamicBrandColor}
            size="sm"
          />
        </div>

        {/* ФИРМЕННЫЕ ЦВЕТА КЛУБА */}
        <div className="flex flex-col p-3 bg-surface-level1 rounded-2xl shadow-sm border border-surface-border">
          <span className="text-[10px] font-black text-content-muted uppercase tracking-widest block px-0.5 mb-3 select-none">
            Цвета клуба
          </span>
          <div className="flex gap-6 px-1">
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={formData.color_1}
                onChange={e => setFormData(prev => ({ ...prev, color_1: e.target.value }))}
                className="w-8 h-8 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90"
              />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-black text-brand uppercase tracking-tight select-none mb-1">Акцентный</span>
                <span className="text-[10px] font-medium text-content-subtle select-none">(интерфейса)</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={formData.color_2}
                onChange={e => setFormData(prev => ({ ...prev, color_2: e.target.value }))}
                className="w-8 h-8 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90"
              />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-black text-content-muted uppercase tracking-tight select-none mb-1">Дополнительный</span>
                <span className="text-[10px] font-medium text-content-subtle select-none">&nbsp;</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4 w-full">
          <ButtonLP
            type="submit"
            isLoading={isSaving}
            className="!h-12 !text-[14px]"
            activeColor={dynamicBrandColor}
          >
            Сохранить изменения
          </ButtonLP>
        </div>

      </form>
    </div>
  );
}
