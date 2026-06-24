import { useEffect } from 'react';

export function useFocusRevalidate(refreshCallback) {
  useEffect(() => {
    if (!refreshCallback) return;

    const handleRefresh = () => {
      // Вызываем обновление данных, так как макет уже проверил видимость страницы
      refreshCallback();
    };

    // Слушаем наше кастомное глобальное событие из корня TeamLayout
    window.addEventListener('app-global-refresh', handleRefresh);

    return () => {
      window.removeEventListener('app-global-refresh', handleRefresh);
    };
  }, [refreshCallback]);
}