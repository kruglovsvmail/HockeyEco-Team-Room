import React, { useState, useEffect } from 'react';
import { ImageUploaderLP } from '../../ui/ImageUploaderLP';
import { ButtonLP } from '../../ui/Button-LP';
import { TextInputLP } from '../../ui/Input-LP'; 
import { getAuthHeaders } from '../../utils/helpers';

export function EditTeamProfilePanel({ teamId, onRefresh, activeBrandColor, onClose }) {
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

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Логика динамического определения флага включения цветов из localStorage
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  // Считываем цвет прямо из стейта формы, чтобы перекрашивание происходило "на лету" при интерактивном выборе в палитре
  const hasTeamColor = isColorsEnabled && !!formData.color_home_1 && formData.color_home_1.toLowerCase() !== '#ffffff';
  const dynamicBrandColor = hasTeamColor ? formData.color_home_1 : (activeBrandColor || 'var(--color-brand)');

  // Фоновый запрос полных параметров команды из БД при открытии панели
  useEffect(() => {
    if (teamId) {
      const fetchFullTeamRow = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/my`, {
            headers: getAuthHeaders()
          });
          if (res.ok) {
            const data = await res.json();
            const dbTeam = data.teams?.find(t => t.id === teamId);
            
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
      setErrorMessage('');
    }
  }, [teamId]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!teamId) return;

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

    if (logoFile) bodyData.append('logo', logoFile);
    if (jerseyDarkFile) bodyData.append('jersey_dark', jerseyDarkFile);
    if (jerseyLightFile) bodyData.append('jersey_light', jerseyLightFile);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': getAuthHeaders().Authorization
        },
        body: bodyData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Вызываем обновление данных и кэша на главной странице MyTeamPage
        if (onRefresh) await onRefresh();
        // Закрываем правую панель
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
        {/* ВЕРХНИЙ БЛОК: НАЗВАНИЕ → ЛОГОТИП + АББР/ГОРОД */}
        <div className="flex flex-col gap-3 w-full bg-surface-level1 p-4 rounded-2xl border border-surface-border shadow-sm">

          {/* Строка 1: Полное название во всю ширину */}
          <TextInputLP 
            placeholder="Название команды"
            value={formData.name}
            onChange={val => setFormData(prev => ({ ...prev, name: val }))}
            activeColor={dynamicBrandColor}
            size="lg"
            textAlign="center"
          />

          {/* Строка 2: Логотип слева + аббревиатура и город справа */}
          <div className="grid grid-cols-[84px_1fr] gap-3 items-center">
            <ImageUploaderLP 
              currentImageUrl={formData.logo_url} 
              onChange={(file) => setLogoFile(file)} 
              showDelete={false}
              sizeClass="w-[84px] h-[84px]"
            />

            <div className="flex flex-col gap-2 w-full">
              {/* Аббревиатура — жёстко ограничена шириной под 4 символа */}
              <TextInputLP 
                maxLength={4}
                placeholder="АББР"
                value={formData.short_name}
                onChange={val => setFormData(prev => ({ ...prev, short_name: val.toUpperCase() }))}
                activeColor={dynamicBrandColor}
                size="sm"
                className="w-[72px]"
              />
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

        {/* ПОЛЕ ОПИСАНИЯ КЛУБА */}
        <div className="w-full bg-surface-level1 p-4 rounded-2xl border border-surface-border shadow-sm">
          <TextInputLP 
            type="textarea"
            rows={3}
            placeholder="О команде (фарм-клуб организации, основан в 2020 году)..."
            value={formData.description}
            onChange={val => setFormData(prev => ({ ...prev, description: val }))}
            activeColor={dynamicBrandColor}
            size="sm"
          />
        </div>

        {/* БЛОК ФОРМ И ЦВЕТОВ — вертикально: домашняя сверху, гостевая снизу */}
        <div className="flex flex-col gap-2 w-full">

          {/* ДОМАШНИЙ КОМПЛЕКТ */}
          <div className="flex flex-col p-3 bg-surface-level1 rounded-2xl shadow-sm border border-surface-border">
            <span className="text-[10px] font-black text-content-muted uppercase tracking-widest block px-0.5 mb-3 select-none">
              Домашняя
            </span>
            <div className="flex items-center gap-3 w-full">
              <ImageUploaderLP 
                currentImageUrl={formData.jersey_dark_url} 
                onChange={(file) => setJerseyDarkFile(file)} 
                showDelete={false}
                sizeClass="w-20 h-20 shrink-0"
              />

              {/* Два цвета горизонтально с подписями */}
              <div className="flex gap-5 flex-1">
                <div className="flex flex-col items-center gap-1">
                  <input 
                    type="color" 
                    value={formData.color_home_1} 
                    onChange={e => setFormData(prev => ({ ...prev, color_home_1: e.target.value }))} 
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
                    value={formData.color_home_2} 
                    onChange={e => setFormData(prev => ({ ...prev, color_home_2: e.target.value }))} 
                    className="w-8 h-8 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[10px] font-black text-content-muted uppercase tracking-tight select-none mb-1">Основной</span>
                    <span className="text-[10px] font-medium text-content-subtle select-none">на джерси</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ГОСТЕВОЙ КОМПЛЕКТ */}
          <div className="flex flex-col p-3 bg-surface-level1 rounded-2xl shadow-sm border border-surface-border">
            <span className="text-[10px] font-black text-content-muted uppercase tracking-widest block px-0.5 mb-3 select-none">
              Гостевая
            </span>
            <div className="flex items-center gap-3 w-full">
              <ImageUploaderLP 
                currentImageUrl={formData.jersey_light_url} 
                onChange={(file) => setJerseyLightFile(file)} 
                showDelete={false}
                sizeClass="w-20 h-20 shrink-0"
              />

              {/* Два цвета горизонтально с подписями */}
              <div className="flex gap-5 flex-1">
                <div className="flex flex-col items-center gap-1">
                  <input 
                    type="color" 
                    value={formData.color_away_1} 
                    onChange={e => setFormData(prev => ({ ...prev, color_away_1: e.target.value }))} 
                    className="w-8 h-8 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[10px] font-black text-content-muted uppercase tracking-tight select-none mb-1">Акцентный</span>
                    <span className="text-[10px] font-medium text-content-subtle select-none">&nbsp;</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <input 
                    type="color" 
                    value={formData.color_away_2} 
                    onChange={e => setFormData(prev => ({ ...prev, color_away_2: e.target.value }))} 
                    className="w-8 h-8 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90" 
                  />
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[10px] font-black text-content-muted uppercase tracking-tight select-none mb-1">Основной</span>
                    <span className="text-[10px] font-medium text-content-subtle select-none">на джерси</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ФИНАЛЬНАЯ КНОПКА ОТПРАВКИ */}
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