// Ищем токен сначала в localStorage, затем в sessionStorage
export const getToken = () => localStorage.getItem('teampwa_token') || sessionStorage.getItem('teampwa_token');

export const removeToken = () => {
  // Очищаем оба хранилища при выходе
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