import React, { useState } from 'react';
import clsx from 'clsx';
import { ImageUploaderLP } from '../../ui/ImageUploaderLP';
import { ButtonLP } from '../../ui/Button-LP';
import { TextInputLP } from '../../ui/Input-LP';
import { PanelBlock } from './CommunityPanelBlock';
import { CHAT_MESSENGERS } from '../../ui/MessengerLogos';
import { getAuthHeaders, DEFAULT_BRAND_COLOR } from '../../utils/helpers';

// Слишком светлый цвет теряется на светлой теме, слишком тёмный — на тёмной,
// и в обоих случаях на нём не читается белый текст плашек. Границы по
// воспринимаемой яркости, а не по сумме каналов: жёлтый и синий одной «суммы»
// выглядят совершенно по-разному.
const relativeLuminance = (hex) => {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return null;
  const channel = (v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(clean.slice(0, 2))
       + 0.7152 * channel(clean.slice(2, 4))
       + 0.0722 * channel(clean.slice(4, 6));
};

const MIN_LUMINANCE = 0.05;
const MAX_LUMINANCE = 0.62;

// =============================================================================
// ПРОФИЛЬ СООБЩЕСТВА
//
// Название, логотип, город, описание и один акцентный цвет. Второго цвета у
// сообщества нет: в интерфейсе он нигде не участвовал, а в форме занимал место
// и заставлял выбирать то, что ни на что не влияет.
//
// Блоки вкладки «Инфо» правятся отдельным подразделом того же меню — их бывает
// много, и вместе с логотипом они превращали панель в свалку.
// =============================================================================
export function CommunityProfilePanel({
  communityId, community, activeBrandColor, onSaved,
}) {
  const [formData, setFormData] = useState({
    name: community?.name || '',
    city: community?.city || '',
    description: community?.description || '',
    color_1: community?.color_1 || DEFAULT_BRAND_COLOR,
    logo_url: community?.logo_url || null,
  });

  // Чат сообщества: мессенджер и ссылка на группу
  const [chat, setChat] = useState({
    messenger: community?.chat_messenger || '',
    url: community?.chat_url || '',
  });

  const [logoFile, setLogoFile] = useState(null);
  const [savingBlock, setSavingBlock] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const luminance = relativeLuminance(formData.color_1);
  const isTooLight = luminance !== null && luminance > MAX_LUMINANCE;
  const isTooDark = luminance !== null && luminance < MIN_LUMINANCE;
  const isColorRejected = isTooLight || isTooDark;

  const accentColor = isColorRejected ? (activeBrandColor || null) : formData.color_1;

  const save = async (blockKey, fields) => {
    setSavingBlock(blockKey);
    setErrorMessage('');

    const bodyData = new FormData();
    Object.entries(fields).forEach(([key, value]) => bodyData.append(key, value));
    if (blockKey === 'main' && logoFile) bodyData.append('logo', logoFile);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/profile`, {
        method: 'PUT',
        headers: { Authorization: getAuthHeaders().Authorization },
        body: bodyData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить');
      setLogoFile(null);
      await onSaved?.();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSavingBlock(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-hide text-left">
      <div className="flex flex-col gap-3 p-4 pb-32">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[14px] font-semibold">
            {errorMessage}
          </div>
        )}

        <PanelBlock title="Сообщество" icon="edit" accentColor={accentColor} isSaving={savingBlock === 'main'}>
          <div className="flex flex-col gap-3 pt-1">
            <TextInputLP
              placeholder="Название сообщества"
              value={formData.name}
              onChange={val => setFormData(prev => ({ ...prev, name: val }))}
              activeColor={accentColor}
              size="lg"
              textAlign="center"
              maxLength={100}
            />

            <div className="grid grid-cols-[84px_1fr] gap-3 items-center">
              <ImageUploaderLP
                currentImageUrl={formData.logo_url}
                onChange={(file) => setLogoFile(file)}
                showDelete={false}
                sizeClass="w-[84px] h-[84px]"
              />
              <TextInputLP
                placeholder="Город"
                value={formData.city}
                onChange={val => setFormData(prev => ({ ...prev, city: val }))}
                activeColor={accentColor}
                size="sm"
              />
            </div>

            <TextInputLP
              type="textarea"
              rows={3}
              placeholder="О сообществе (катаемся по вторникам, уровень любой)..."
              value={formData.description}
              onChange={val => setFormData(prev => ({ ...prev, description: val }))}
              activeColor={accentColor}
              size="sm"
            />

            <ButtonLP
              onClick={() => save('main', {
                name: formData.name,
                city: formData.city,
                description: formData.description,
              })}
              disabled={savingBlock === 'main'}
              activeColor={accentColor}
              className="w-full py-2.5"
            >
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>

        <PanelBlock title="Чат сообщества" icon="handshake" accentColor={accentColor} isSaving={savingBlock === 'chat'}>
          <div className="flex flex-col gap-3 pt-1">
            <span className="text-[11px] text-content-subtle leading-relaxed">
              Ссылка на группу сообщества. Значок появится в шапке страницы
              и в карточке сообщества в каталоге.
            </span>

            <div className="flex items-center gap-3">
              {CHAT_MESSENGERS.map(({ id, label, Logo }) => {
                const isActive = chat.messenger === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    title={label}
                    // Повторный тап по выбранному снимает выбор: так чат убирают,
                    // не выискивая отдельную кнопку «удалить»
                    onClick={() => setChat(prev => ({ ...prev, messenger: isActive ? '' : id }))}
                    className={clsx(
                      'w-11 h-11 rounded-xl overflow-hidden outline-none transition-all',
                      isActive ? 'ring-2 ring-offset-2 ring-offset-surface-level1 scale-105' : 'opacity-45 hover:opacity-80'
                    )}
                    style={isActive ? { '--tw-ring-color': accentColor || 'var(--color-brand)' } : undefined}
                  >
                    <Logo className="w-full h-full" />
                  </button>
                );
              })}
            </div>

            <TextInputLP
              label="Ссылка на чат"
              value={chat.url}
              onChange={val => setChat(prev => ({ ...prev, url: val }))}
              placeholder="https://t.me/..."
              size="sm"
              activeColor={accentColor}
            />

            <ButtonLP
              onClick={() => save('chat', { chat_messenger: chat.messenger, chat_url: chat.url })}
              disabled={savingBlock === 'chat'}
              activeColor={accentColor}
              className="w-full py-2.5"
            >
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>

        <PanelBlock title="Акцентный цвет" icon="fill" accentColor={accentColor} isSaving={savingBlock === 'color'}>
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={formData.color_1}
                onChange={e => setFormData(prev => ({ ...prev, color_1: e.target.value }))}
                className="w-10 h-10 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90 shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-content-main">
                  {formData.color_1.toUpperCase()}
                </span>
                <span className="text-[11px] text-content-subtle leading-snug">
                  Им подсвечиваются кнопки, карандаши и плашки сообщества
                </span>
              </div>

              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, color_1: DEFAULT_BRAND_COLOR }))}
                className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-content-muted outline-none"
              >
                Сбросить
              </button>
            </div>

            {isColorRejected && (
              <span className="text-[11px] text-danger leading-relaxed">
                {isTooLight
                  ? 'Слишком светлый: на белом фоне такие кнопки и подписи не читаются.'
                  : 'Слишком тёмный: на тёмной теме он сливается с фоном.'}
              </span>
            )}

            <ButtonLP
              onClick={() => save('color', { color_1: formData.color_1 })}
              disabled={savingBlock === 'color' || isColorRejected}
              activeColor={accentColor}
              className="w-full py-2.5"
            >
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>
      </div>
    </div>
  );
}
