// TournamentReserveGoalies.jsx
import React from 'react';
import clsx from 'clsx';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { getTelegramLink } from '../../ui/MessengerLinks';
import { TelegramLogo } from '../../ui/MessengerLogos';
import { pluralRu } from '../../utils/helpers';

// Номер в базе лежит как есть (+79991234567) — приводим к читаемому виду.
// Российский формат: 11 цифр с ведущей 7 или 8; остальное показываем без изменений,
// чтобы не испортить нестандартный номер. Та же функция, что на сайте ТФХ.
const formatPhone = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return raw;
};

// Среднее пропущенных за матч — главная цифра карточки. Процент отражённых для этого
// не годится: он есть, только если лига ведёт броски, а пропущенные считаются всегда
const goalsAgainstAverage = (g) => (
  g.gamesPlayed > 0 ? (g.goalsAgainst / g.gamesPlayed).toFixed(2).replace('.', ',') : '—'
);

/**
 * Карточка резервного вратаря — в одном стиле с карточкой матча: сверху полоса фактов
 * (сколько сыграл в воротах в этой лиге и телефон), в середине фото, имя, игровой номер
 * и главная цифра, внизу — две широкие кнопки связи: «Позвонить» и «Написать».
 */
function GoalieCard({ goalie, onOpenProfile }) {
  const telegramLink = goalie.phone ? getTelegramLink(goalie.phone) : null;

  return (
    <div className={clsx(
      'bg-surface-level1 rounded-2xl shadow-md overflow-hidden',
      (goalie.isBlocked || goalie.isUnavailable) && 'opacity-60'
    )}>
      {/* ── ПОЛОСА ФАКТОВ: сколько матчей сыграл в воротах в этой лиге за все сезоны
          (за свою команду и резервным; ноль тоже) слева, телефон справа. Команд здесь
          нет: у резервных их часто нет вовсе ── */}
      <div className="flex items-center gap-3 px-4 h-9 border-b border-surface-border text-[12px] font-semibold text-content-muted">
        <span className="flex-1 min-w-0 flex items-center gap-2">
          {/* Наказание — только там, где оно меняет дело: выход закрыт.
              Ни вид, ни срок наказания списку не нужны */}
          {goalie.isBlocked && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-wider">
              Дисквал.
            </span>
          )}
          <span className="truncate tabular-nums">
            {goalie.gamesPlayed} {pluralRu(goalie.gamesPlayed, 'матч', 'матча', 'матчей')}
            {goalie.shutouts > 0 && ` · ${goalie.shutouts} на ноль`}
          </span>
        </span>
        {/* Номер целиком и текстом — его можно выделить и скопировать. У вратаря без
            обязательных документов номер не приходит: пока лига его не допустит,
            договариваться с ним нельзя */}
        {goalie.phone ? (
          <span className="shrink-0 tabular-nums text-content-main select-text">{formatPhone(goalie.phone)}</span>
        ) : goalie.isUnavailable && (
          <span className="shrink-0 text-content-main">Вратарь не доступен</span>
        )}
      </div>

      {/* ── ФОТО, ИМЯ И ГЛАВНАЯ ЦИФРА ── */}
      <div
        onClick={onOpenProfile}
        className={clsx('flex items-center gap-3 px-4 py-3', onOpenProfile && 'cursor-pointer active:opacity-70 transition-opacity')}
      >
        <Avatar
          photoUrl={goalie.photoUrl}
          firstName={goalie.firstName}
          lastName={goalie.lastName}
          className="w-14 h-14 rounded-xl bg-surface-level2"
        />
        <div className="flex flex-col min-w-0 flex-1 leading-tight gap-0.5">
          <span className="text-[18px] font-bold text-content-main truncate">{goalie.lastName}</span>
          <span className="text-[13px] text-content-muted truncate">
            {goalie.firstName}
            {goalie.jerseyNumber != null && <span className="font-bold"> · №{goalie.jerseyNumber}</span>}
          </span>
          {goalie.note && (
            <span className="text-[11px] text-content-muted leading-snug line-clamp-2 mt-0.5">{goalie.note}</span>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end leading-tight">
          <span className="text-[24px] font-black text-content-main tabular-nums leading-none">
            {goalsAgainstAverage(goalie)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted mt-1">
            за один матч
          </span>
        </div>
      </div>

      {/* ── СВЯЗЬ: две широкие кнопки, как на макете; сам номер — в полосе сверху ── */}
      {goalie.phone && (
        <div className="flex border-t border-surface-border">
          <a
            href={`tel:${goalie.phone}`}
            className="flex-1 min-w-0 h-11 flex items-center justify-center gap-2 text-[13px] font-bold text-brand outline-none active:bg-surface-level2 transition-colors"
          >
            <Icon name="phone" className="w-4 h-4 shrink-0" />
            Позвонить
          </a>
          {telegramLink && (
            <a
              href={telegramLink}
              target="_blank"
              rel="noreferrer noopener"
              className="flex-1 min-w-0 h-11 flex items-center justify-center gap-2 border-l border-surface-border text-[13px] font-bold text-content-main outline-none active:bg-surface-level2 transition-colors"
            >
              <TelegramLogo className="w-5 h-5 rounded-md overflow-hidden shrink-0" />
              Написать
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function TournamentReserveGoalies({ goalies, openRightPanel }) {
  const handleOpenProfile = (goalie) => {
    if (!openRightPanel || !goalie?.playerId) return;
    openRightPanel('playerProfile', { playerId: goalie.playerId }, 'Профиль игрока');
  };

  return (
    <div className="flex flex-col gap-3 w-full">

      {goalies.length === 0 ? (
        <div className="text-center py-12 text-[14px] font-bold text-content-subtle uppercase tracking-wider">
          Резервные вратари пока не назначены
        </div>
      ) : (
        goalies.map(goalie => (
          <GoalieCard
            key={goalie.playerId}
            goalie={goalie}
            onOpenProfile={openRightPanel ? () => handleOpenProfile(goalie) : null}
          />
        ))
      )}

      {/* Главное, что нужно знать, — о замене сообщают заранее. Внизу, после списка:
          сначала вратари, потом напоминание */}
      <p className="px-2 pt-1 text-[13px] leading-snug text-content-muted text-center">
        О замене вратаря сообщите организаторам лиги и секретарю матча до начала игры.
      </p>
    </div>
  );
}
