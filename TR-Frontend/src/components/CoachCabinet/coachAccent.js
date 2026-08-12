// Настройки оформления Кабинета тренера.
//
// Живут только в браузере: это личное предпочтение конкретного устройства, а не свойство
// тренера или упражнения. На сервер их отправлять незачем — синхронизировать между
// устройствами тут нечего.

export const ACCENT_ENABLED_KEY = 'tr_coach_accent_enabled';
export const ACCENT_COLOR_KEY = 'tr_coach_accent_color';

// Событие для страницы: панель настроек живёт в другом поддереве и о правке
// localStorage сама по себе не узнает
export const ACCENT_CHANGED_EVENT = 'tr_coach_accent_changed';

export const ACCENT_PRESETS = [
  { value: '#e8590c', label: 'Оранжевый' },
  { value: '#2f6fd0', label: 'Синий' },
  { value: '#0ca678', label: 'Бирюзовый' },
  { value: '#2f9e44', label: 'Зелёный' },
  { value: '#c92a2a', label: 'Красный' },
  { value: '#7048e8', label: 'Фиолетовый' },
];

export const readAccentSettings = () => ({
  enabled: localStorage.getItem(ACCENT_ENABLED_KEY) === 'true',
  color: localStorage.getItem(ACCENT_COLOR_KEY) || ACCENT_PRESETS[0].value,
});

export const writeAccentSettings = ({ enabled, color }) => {
  localStorage.setItem(ACCENT_ENABLED_KEY, enabled ? 'true' : 'false');
  localStorage.setItem(ACCENT_COLOR_KEY, color);
  window.dispatchEvent(new Event(ACCENT_CHANGED_EVENT));
};
