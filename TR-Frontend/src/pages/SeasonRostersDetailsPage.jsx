import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { PageLoader } from '../ui/Loader';
import { getAuthHeaders } from '../utils/helpers';
import { SeasonRosterDetails } from '../components/Manager/Season/SeasonRosterDetails';

// Тонкая страница-обёртка (шапка + загрузка/статусы) по образцу EventPage.jsx —
// вся содержательная часть экрана вынесена в components/Manager/Season/SeasonRosterDetails.jsx
export function SeasonRostersDetailsPage({ appId, teamId, teamColor, onClose, openRightPanel }) {
  const [app, setApp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const teamCacheKey = teamId ? `tr_cached_team_${teamId}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = cachedDetails?.color_home_1 || teamColor;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : null;

  const loadApp = useCallback(async () => {
    if (!teamId || !appId) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        setApp(json.application);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error('Ошибка загрузки заявки:', err);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [teamId, appId]);

  useEffect(() => { loadApp(); }, [loadApp]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-surface-base" style={hasTeamColor ? { '--color-brand': activeBrandColor } : {}}>
      <Header onBack={onClose} />

      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingTop: '60px' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><PageLoader /></div>
        ) : notFound || !app ? (
          <div className="flex items-center justify-center py-20 text-[14px] font-bold text-content-muted">
            Заявка не найдена
          </div>
        ) : (
          <SeasonRosterDetails
            app={app}
            teamId={teamId}
            onClose={onClose}
            activeBrandColor={activeBrandColor}
            openRightPanel={openRightPanel}
            loadData={loadApp}
          />
        )}
      </div>
    </div>
  );
}
