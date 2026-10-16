// TournamentReserveGoalies.jsx
import React from 'react';
import clsx from 'clsx';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { MessengerLinks } from '../../ui/MessengerLinks';
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

const savePercent = (g) => (
  g.shotsAgainst > 0 ? `${((g.saves / g.shotsAgainst) * 100).toFixed(1)}%` : '—'
);

function GoalieStat({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className="text-[16px] font-black text-content-main tabular-nums leading-none">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">{label}</span>
    </div>
  );
}

function GoalieCard({ goalie, showShots, onOpenProfile }) {
  return (
    <div className={clsx(
      "bg-surface-level1 rounded-2xl shadow-md overflow-hidden",
      goalie.isBlocked && "opacity-60"
    )}>
      <div
        onClick={onOpenProfile}
        className={clsx("flex items-center gap-3 px-4 pt-4", onOpenProfile && "cursor-pointer active:opacity-70 transition-opacity")}
      >
        <Avatar
          photoUrl={goalie.photoUrl}
          firstName={goalie.firstName}
          lastName={goalie.lastName}
          className="w-12 h-12 rounded-xl bg-surface-level2"
        />
        <div className="flex flex-col min-w-0 flex-1 leading-tight gap-0.5">
          <span className="text-[16px] font-bold text-content-main truncate">
            {goalie.lastName}
          </span>
          <span className="text-[13px] text-content-muted truncate">
            {goalie.firstName}
            {goalie.jerseyNumber != null && <span className="font-bold"> · №{goalie.jerseyNumber}</span>}
          </span>
        </div>
        {/* Наказание показываем только там, где оно меняет дело: выход закрыт.
            Ни вид, ни срок наказания списку не нужны */}
        {goalie.isBlocked && (
          <span className="shrink-0 px-2 py-1 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-wider">
            Дисквал.
          </span>
        )}
      </div>

      {(goalie.note || goalie.teams.length > 0) && (
        <div className="px-4 pt-2 flex flex-col gap-1 text-[12px] leading-snug text-content-muted">
          {goalie.note && <span>{goalie.note}</span>}
          {goalie.teams.length > 0 && <span>Выходил за: {goalie.teams.join(', ')}</span>}
        </div>
      )}

      {/* Выходы резервным вратарём в этом дивизионе. Броски — только если лига их ведёт */}
      <div className={clsx(
        "grid gap-2 px-4 pt-4 pb-4",
        showShots ? "grid-cols-4" : "grid-cols-3"
      )}>
        <GoalieStat value={goalie.gamesPlayed} label={pluralRu(goalie.gamesPlayed, 'матч', 'матча', 'матчей')} />
        <GoalieStat value={goalie.goalsAgainst} label="пропущ." />
        {showShots && <GoalieStat value={savePercent(goalie)} label="% отраж." />}
        <GoalieStat value={goalie.shutouts} label="на ноль" />
      </div>

      {/* Список ради одного — быстро договориться: номер виден целиком (его можно
          выделить и скопировать), рядом — позвонить и написать в Telegram */}
      {goalie.phone && (
        <div className="flex items-center gap-2 h-14 px-4 border-t border-surface-border">
          <span className="flex-1 min-w-0 truncate text-[15px] font-bold text-content-main tabular-nums select-text">
            {formatPhone(goalie.phone)}
          </span>
          <a
            href={`tel:${goalie.phone}`}
            aria-label="Позвонить"
            title="Позвонить"
            className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center shadow-sm shrink-0 outline-none active:scale-90 transition-transform"
          >
            <Icon name="phone" className="w-5 h-5" />
          </a>
          <MessengerLinks phone={goalie.phone} />
        </div>
      )}
    </div>
  );
}

export function TournamentReserveGoalies({ goalies, openRightPanel }) {
  // Колонку % отражённых решаем на весь список, а не по вратарю: у того, кто ещё
  // не выходил, признака учёта бросков нет, и карточки получались бы разной формы
  const showShots = goalies.some(g => g.tracksShots);

  const handleOpenProfile = (goalie) => {
    if (!openRightPanel || !goalie?.playerId) return;
    openRightPanel('playerProfile', { playerId: goalie.playerId }, 'Профиль игрока');
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="px-2 text-[13px] leading-relaxed text-content-muted">
        Если ваш вратарь не выходит на матч, с любым из списка можно договориться напрямую.
        О замене нужно сообщить организаторам лиги и секретарю матча до его начала.
      </p>

      {goalies.length === 0 ? (
        <div className="text-center py-12 text-[14px] font-bold text-content-subtle uppercase tracking-wider">
          Резервные вратари пока не назначены
        </div>
      ) : (
        goalies.map(goalie => (
          <GoalieCard
            key={goalie.playerId}
            goalie={goalie}
            showShots={showShots}
            onOpenProfile={openRightPanel ? () => handleOpenProfile(goalie) : null}
          />
        ))
      )}
    </div>
  );
}
