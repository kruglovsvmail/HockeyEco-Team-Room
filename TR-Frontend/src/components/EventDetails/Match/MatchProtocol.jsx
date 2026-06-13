import React, { useState, useEffect } from 'react';
import { FadeIn } from '../../../ui/FadeIn';
import { PageLoader } from '../../../ui/Loader';
import { GameTimeline } from '../../GameTimeline';
import { getAuthHeaders } from '../../../utils/helpers';

export const MatchProtocol = ({ event }) => {
  const [timeline, setTimeline] = useState(null);
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
          setTimeline(data.timeline || []);
        }
      } catch (err) {
        console.error('Ошибка загрузки хода матча:', err);
        setTimeline([]);
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
      <GameTimeline timeline={timeline} homeTeamId={event.home_team_id} />
    </FadeIn>
  );
};