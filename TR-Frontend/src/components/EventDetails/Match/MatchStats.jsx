import React, { useState, useEffect } from 'react';
import { FadeIn } from '../../../ui/FadeIn';
import { PageLoader } from '../../../ui/Loader';
import { GameTeamStats } from '../../GameTeamStats';
import { getAuthHeaders, getImageUrl } from '../../../utils/helpers';

export const MatchStats = ({ event }) => {
  const [teamStats, setTeamStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/matches/${event.event_id}/details`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setTeamStats(data.team_stats || null);
        }
      } catch (err) {
        console.error('Ошибка загрузки статистики матча:', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (event?.event_id) load();
    else setIsLoading(false);
  }, [event?.event_id]);

  if (isLoading) return <PageLoader />;

  return (
    <FadeIn>
      <GameTeamStats teamStats={teamStats} />
    </FadeIn>
  );
};