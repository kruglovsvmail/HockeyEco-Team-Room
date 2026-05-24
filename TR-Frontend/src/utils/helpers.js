export const getToken = () => localStorage.getItem('teampwa_token') || sessionStorage.getItem('teampwa_token');

export const removeToken = () => {
  localStorage.removeItem('teampwa_token');
  sessionStorage.removeItem('teampwa_token');
  localStorage.removeItem('teampwa_user');
  sessionStorage.removeItem('teampwa_user');
  localStorage.removeItem('teampwa_selected_team');
};

export const getAuthHeaders = () => {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/**
 * Формирует прямую ссылку на файл в S3 Timeweb.
 * Пример: 'avatars/user_1.jpg' -> 'https://hockeyeco-uploads.s3.twcstorage.ru/avatars/user_1.jpg'
 */
export const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  
  const S3_BUCKET = 'hockeyeco-uploads';
  const S3_ENDPOINT = 's3.twcstorage.ru';
  
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Конструкция URL для Timeweb S3: https://[bucket].[endpoint]/[path]
  return `https://${S3_BUCKET}.${S3_ENDPOINT}/${cleanPath}`;
};

/**
 * Математический расчет контраста YIQ (W3C Стандарт).
 * Определяет, какой текст лучше читать на переданном HEX-фоне — белый или темный.
 */
export const getContrastTextColor = (hexColor) => {
  if (!hexColor) return 'text-white'; // Дефолт для серого цвета клуба
  
  const cleanHex = hexColor.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 184 ? 'text-content-main' : 'text-white';
};