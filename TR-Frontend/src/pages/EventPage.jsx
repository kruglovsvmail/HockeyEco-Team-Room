import React from 'react';
import { SubscriptionStub } from '../ui/SubscriptionStub';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';

import { EventDetailsMatch } from '../components/EventDetails/Match/EventDetailsMatch';
import { EventDetailsTraining } from '../components/EventDetails/Training/EventDetailsTraining';
import { EventDetailsMeeting } from '../components/EventDetails/Meeting/EventDetailsMeeting';

const componentMap = {
  match: EventDetailsMatch,
  training: EventDetailsTraining,
  meeting: EventDetailsMeeting,
};

export function EventPage({ eventType, event, user, selectedTeam, onClose, showEditButton = false, onEditClick, openRightPanel }) {
  const { checkAccess } = useAccess(user, selectedTeam);
  const hasAccess = event ? checkAccess('INTERNAL_VIEW', event.my_team_id) : true;

  if (!hasAccess) {
    return <SubscriptionStub isOpen={true} onClose={onClose} />;
  }

  const Component = componentMap[eventType];
  if (!Component || !event) return null;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Единая шапка приложения (Header.jsx) в режиме вложенного экрана:
          левая кнопка — «назад», правая — редактирование (по правам). */}
      <Header
        onBack={onClose}
        showEditButton={showEditButton}
        onEditClick={onEditClick}
      />

      <div className="flex-1 overflow-hidden relative" style={{ paddingTop: '60px' }}>
        <Component
          event={event}
          user={user}
          selectedTeam={selectedTeam}
          openRightPanel={openRightPanel}
        />
      </div>
    </div>
  );
}
