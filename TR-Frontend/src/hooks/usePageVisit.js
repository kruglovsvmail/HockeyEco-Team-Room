import { useEffect } from 'react';
import { getAuthHeaders } from '../utils/helpers';

// Тихий фоновый учёт посещений страницы (fire-and-forget, без влияния на UI)
export function usePageVisit(page) {
  useEffect(() => {
    if (!page) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/analytics/page-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ page })
    }).catch(() => {});
  }, [page]);
}
