/********** ФАЙЛ: TR-Frontend\src\utils\helpers.js **********/

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