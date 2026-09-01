import React, { useState, useMemo } from 'react';
import { SubscriptionStub } from '../ui/SubscriptionStub';
import { useAccess } from '../hooks/useAccess';
import { Header } from '../components/Header';
import { Toast } from '../ui/Toast';
import { isTouchDevice, copyToClipboard } from '../utils/helpers';
import { usePageVisit } from '../hooks/usePageVisit';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

import { EventDetailsMatch } from '../components/EventDetails/Match/EventDetailsMatch';
import { EventDetailsTraining } from '../components/EventDetails/Training/EventDetailsTraining';
import { EventDetailsMeeting } from '../components/EventDetails/Meeting/EventDetailsMeeting';
import { EventDetailsCommunity } from '../components/EventDetails/Community/EventDetailsCommunity';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const componentMap = {
  match: EventDetailsMatch,
  training: EventDetailsTraining,
  meeting: EventDetailsMeeting,
  // Тренировка и солянка — один компонент: набор вкладок он выбирает сам по типу
  'community-training': EventDetailsCommunity,
  'community-game': EventDetailsCommunity,
};

const EVENT_TITLES = {
  match: 'Матч',
  training: 'Тренировка',
  meeting: 'Собрание',
  'community-training': 'Тренировка',
  'community-game': 'Солянка',
};

// Маршрут события сообщества отличается дефисом — по нему же выбирается
// и контекст проверки прав ниже
const isCommunityRoute = (eventType) => String(eventType || '').startsWith('community-');

// Текст для окна «Поделиться»: заголовок события, дата/время в таймзоне арены и место.
// Ссылку в текст не подмешиваем — её отдаём отдельным полем url (иначе на части
// платформ она продублируется).
function buildShareText(eventType, event) {
  const title = EVENT_TITLES[eventType] || 'Событие';
  const heading = eventType === 'match' && event.opponent_name
    ? `${title}: ${event.my_team_name || 'Наша команда'} — ${event.opponent_name}`
    : `${title}: ${event.my_team_name || ''}`.trim().replace(/:\s*$/, '');

  const lines = [heading];

  if (event.event_date) {
    const d = dayjs.utc(event.event_date).tz(event.arena_timezone || 'UTC');
    lines.push(`${d.format('D MMMM YYYY')}, ${d.format('HH:mm')}`);
  }
  if (event.arena_name) {
    lines.push(event.arena_name);
  }

  return lines.join('\n');
}

export function EventPage({ eventType, event, user, selectedTeam, onClose, showEditButton = false, onEditClick, openRightPanel }) {
  // Контекст сообщества берём из самого события: человек мог открыть тренировку,
  // стоя в контексте команды, и selectedCommunity указывал бы на другое сообщество.
  const eventCommunity = useMemo(() => {
    const id = event?.my_community_id;
    if (!id) return null;
    return (user?.communities || []).find(c => String(c.id) === String(id)) || null;
  }, [event?.my_community_id, user?.communities]);

  const { checkAccess, checkCommunityAccess } = useAccess(user, selectedTeam, null, eventCommunity);

  // У события сообщества нет ни команды, ни клуба: INTERNAL_VIEW по my_team_id
  // здесь всегда давал бы отказ, потому что сравнивать не с чем.
  const hasAccess = !event
    ? true
    : isCommunityRoute(eventType)
      ? checkCommunityAccess('COMMUNITY_INTERNAL_VIEW', event.my_community_id)
      : checkAccess('INTERNAL_VIEW', event.my_team_id);

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  usePageVisit(event ? 'event_details' : null);

  // Кнопка «поделиться» в шапке. Ссылка — текущий адрес страницы события;
  // открывший её увидит то же событие, если оно есть в его календаре.
  const handleShareLink = () => {
    if (!event) return;
    const url = `${window.location.origin}${window.location.pathname}`;
    const text = buildShareText(eventType, event);

    // На телефоне — системное окно «Поделиться»: оттуда ссылка уходит сразу в мессенджер.
    // navigator.share обязан вызываться синхронно в обработчике клика,
    // иначе браузер потеряет user activation и отклонит запрос.
    if (isTouchDevice() && navigator.share) {
      navigator.share({ title: EVENT_TITLES[eventType] || 'Событие', text, url })
        .catch(() => { /* пользователь закрыл системное окно */ });
      return;
    }

    // ПК (и любой origin, где share недоступен) — копируем ссылку в буфер
    copyToClipboard(url).then(copied => setToast({
      isOpen: true,
      message: copied ? 'Ссылка скопирована в буфер обмена' : 'Не удалось скопировать ссылку',
      type: copied ? 'success' : 'danger',
    }));
  };

  if (!hasAccess) {
    return <SubscriptionStub isOpen={true} onClose={onClose} />;
  }

  const Component = componentMap[eventType];
  if (!Component || !event) return null;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Единая шапка приложения (Header.jsx) в режиме вложенного экрана:
          левая кнопка — «назад», справа — «поделиться» и редактирование (по правам). */}
      <Header
        onBack={onClose}
        showShareButton={true}
        onShareClick={handleShareLink}
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

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
