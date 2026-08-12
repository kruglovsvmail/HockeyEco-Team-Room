import React, { useState } from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import Toggle from '../../ui/Toggle';
import { ACCENT_PRESETS, readAccentSettings, writeAccentSettings } from './coachAccent';

// Правая панель карандашика в шапке Кабинета тренера.
//
// Всё, что здесь есть, хранится в браузере и действует только внутри раздела: это
// оформление рабочего места тренера, а не свойство упражнений, поэтому ни на сервер,
// ни в другие разделы приложения оно не уходит.

const SettingsBlock = ({ title, icon, children }) => (
  <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md text-left">
    <div className="flex items-center gap-2 mb-2 border-b border-surface-border pb-1.5">
      {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
      <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
        {title}
      </span>
    </div>
    <div className="flex flex-col text-left pt-1">{children}</div>
  </div>
);

export function CoachSettingsPanel() {
  const [settings, setSettings] = useState(readAccentSettings);

  const apply = (next) => {
    setSettings(next);
    writeAccentSettings(next);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-hide px-3 py-4 flex flex-col gap-3">

      <SettingsBlock title="Оформление раздела" icon="jersey">
        <div className="flex items-center justify-between">
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[18px] font-bold text-content-main">Свой акцентный цвет</span>
            <span className="text-[12px] text-content-muted pr-4 mt-0.5">
              Заменяет фирменный оранжевый внутри Кабинета тренера. На остальные
              разделы приложения не влияет.
            </span>
          </div>
          <Toggle
            checked={settings.enabled}
            onChange={(checked) => apply({ ...settings, enabled: checked })}
          />
        </div>

        {settings.enabled && (
          <div className="flex flex-col gap-4 pt-4">

            {/* Свой цвет — системный пикер и поле HEX. Пресеты ниже только ускоряют
                выбор, но ничем его не ограничивают */}
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.color}
                onChange={(e) => apply({ ...settings, color: e.target.value })}
                aria-label="Свой цвет"
                className="w-12 h-12 shrink-0 rounded-full cursor-pointer border border-surface-border bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full transition-transform active:scale-90"
              />

              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-1">
                  Код цвета
                </span>
                <input
                  value={settings.color.toUpperCase()}
                  onChange={(e) => {
                    const next = e.target.value.trim();
                    setSettings(prev => ({ ...prev, color: next }));
                    // Пишем только законченный HEX: пока пользователь допечатывает
                    // символы, значение невалидно, и раздел мигал бы чёрным
                    if (/^#[0-9a-fA-F]{6}$/.test(next)) apply({ ...settings, color: next });
                  }}
                  maxLength={7}
                  placeholder="#1794DD"
                  className="w-full px-3 py-2 rounded-xl bg-surface-level2 text-content-main text-[14px] font-bold tracking-wider outline-none border border-surface-border placeholder:text-content-subtle"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">
                Быстрый выбор
              </span>
              <div className="grid grid-cols-6 gap-2">
                {ACCENT_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => apply({ ...settings, color: preset.value })}
                    aria-label={preset.label}
                    className={clsx(
                      'aspect-square rounded-xl outline-none transition-transform active:scale-90 flex items-center justify-center border-2',
                      settings.color.toLowerCase() === preset.value ? 'border-content-main' : 'border-transparent'
                    )}
                    style={{ backgroundColor: preset.value }}
                  >
                    {settings.color.toLowerCase() === preset.value && (
                      <span className="w-2.5 h-2.5 rounded-full bg-white shadow" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </SettingsBlock>

      <p className="text-[12px] text-content-subtle leading-snug px-2">
        Настройка хранится в этом браузере. На другом устройстве раздел откроется
        с обычным цветом приложения.
      </p>
    </div>
  );
}
