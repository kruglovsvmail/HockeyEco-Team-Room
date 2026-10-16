// TournamentNominations.jsx
import React, { useState } from 'react';
import clsx from 'clsx';
import { getImageUrl, pluralRu } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { TopSheet } from '../../ui/TopSheet';
import { PagerBar, PagerTrack, useSlideAnimation, useStickyPager } from './TournamentPager';

// Подписи правила под названием номинации — те же, что на сайте ТФХ
const STAGE_LABEL = { regular: 'регулярка', playoff: 'плей-офф', all: 'регулярка + плей-офф' };

const typeLabel = (n) => {
  if (n.playerType === 'goalie') return 'вратари';
  if (n.playerType === 'all') return 'все игроки';
  if (n.positionFilter === 'forward') return 'нападающие';
  if (n.positionFilter === 'defense') return 'защитники';
  return 'полевые';
};

const formatValue = (value, format) => {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return `${(Number(value) * 100).toFixed(1)}%`;
  return Number(value);
};

// Подпись под показателем: число матчей, а когда места нет (не играл, не набрал
// минимум) — пояснение от сервера
const gamesLabel = (player) => (
  player.note || `${player.gamesPlayed} ${pluralRu(player.gamesPlayed, 'игра', 'игры', 'игр')}`
);

const TeamBadge = ({ logo, className }) => (
  logo ? (
    <img
      src={getImageUrl(logo)}
      alt=""
      className={clsx("absolute -bottom-1 -left-1 rounded-full bg-surface-base object-contain", className)}
    />
  ) : null
);

// Первое место — крупно. Фамилия занимает всю первую строку, ниже слева имя и матчи,
// а справа от них показатель высотой в эти две строки: так длинная фамилия и длинный
// процент вратаря не делят одну строку и не обрезают друг друга.
function LeaderRow({ player, format, onClick }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        LEADER_ROW_H, "flex items-center gap-3 px-3 border-b border-surface-border last:border-0",
        player.isMe && "bg-brand-opacity",
        onClick && "cursor-pointer active:opacity-70 transition-opacity"
      )}
    >
      <div className="w-6 shrink-0 text-center font-mono text-[18px] font-black text-brand">
        {player.rank ?? '—'}
      </div>

      <div className="relative shrink-0 w-16 h-16">
        <Avatar
          photoUrl={player.photoUrl}
          firstName={player.firstName}
          lastName={player.lastName}
          className="w-16 h-16 rounded-xl bg-surface-level2"
        />
        <TeamBadge logo={player.teamLogo} className="w-6 h-6" />
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 leading-tight">
        <span className="col-span-2 row-start-1 text-[16px] font-bold text-content-main truncate">
          {player.lastName}
        </span>
        <span className="col-start-1 row-start-2 text-[14px] font-normal text-content-muted truncate">
          {player.firstName}
        </span>
        <span className="col-start-1 row-start-3 text-[10px] font-semibold uppercase tracking-wide text-content-muted truncate">
          {gamesLabel(player)}
        </span>
        <span className="col-start-2 row-start-2 row-span-2 self-end text-[32px] leading-none font-black tabular-nums text-brand">
          {formatValue(player.value, format)}
        </span>
      </div>
    </div>
  );
}

function NominationRow({ player, format, onClick }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        ROW_H, "flex items-center gap-3 px-3 border-b border-surface-border last:border-0",
        player.isMe && "bg-brand-opacity",
        onClick && "cursor-pointer active:opacity-70 transition-opacity"
      )}
    >
      <div className="w-6 shrink-0 text-center font-mono text-[12px] text-content-muted">
        {player.rank ?? '—'}
      </div>

      <div className="relative shrink-0 w-9 h-9">
        <Avatar
          photoUrl={player.photoUrl}
          firstName={player.firstName}
          lastName={player.lastName}
          className="w-9 h-9 rounded-lg bg-surface-level2"
        />
        <TeamBadge logo={player.teamLogo} className="w-4 h-4" />
      </div>

      <div className="flex flex-col min-w-0 flex-1 leading-tight gap-0.5">
        <span className={clsx("text-[14px] text-content-main truncate", player.isMe ? "font-bold" : "font-normal")}>
          {player.lastName}
        </span>
        <span className="text-[12px] text-content-muted font-normal truncate">
          {player.firstName}
        </span>
      </div>

      <div className="shrink-0 flex flex-col items-end leading-tight gap-0.5">
        <span className="text-[16px] font-black tabular-nums text-content-main">
          {formatValue(player.value, format)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
          {gamesLabel(player)}
        </span>
      </div>
    </div>
  );
}

// Сколько мест в карточке — столько же отдаёт бэкенд (NOMINATION_TOP_SIZE в
// TR-Backend/controllers/tournamentController.js). Карточка всегда этой высоты: недостающие
// места — пустое пространство, а не сжатая карточка
const TOP_SIZE = 7;

// Высоты строк — общие для настоящих строк и пустых мест, чтобы карточки совпадали
const LEADER_ROW_H = 'h-24';
const ROW_H = 'h-14';

const subtitleOf = (nomination) => [
  nomination.metricLabel,
  typeLabel(nomination),
  STAGE_LABEL[nomination.stageType],
  nomination.scope === 'team' ? 'лучший в команде' : null,
  // «от 1 матча», «от 21 матча», но «от 3 матчей»
  nomination.minGames > 0
    ? `от ${nomination.minGames} ${pluralRu(nomination.minGames, 'матча', 'матчей', 'матчей')}`
    : null,
].filter(Boolean).join(' · ');

function NominationCard({ nomination, onPlayerClick }) {
  const players = (nomination.players || []).slice(0, TOP_SIZE);
  const me = nomination.me;

  return (
    <div className="flex flex-col">
      <div className="bg-surface-level1 rounded-2xl shadow-md overflow-hidden flex flex-col">
        <div className="flex flex-col">
          {Array.from({ length: TOP_SIZE }, (_, idx) => {
            const p = players[idx];
            // Место, на которое пока никто не набрал результата, — просто пустое
            if (!p) return <div key={`empty-${idx}`} className={idx === 0 ? LEADER_ROW_H : ROW_H} />;
            const Row = idx === 0 ? LeaderRow : NominationRow;
            return (
              <Row
                key={`${p.playerId}-${p.teamId}`}
                player={p}
                format={nomination.metricFormat}
                onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
              />
            );
          })}

        </div>
      </div>

      {/* Своё место, если в топ не попал, — отдельным блоком сразу под лидерами:
          близко, чтобы читалось как продолжение рейтинга, но не внутри него.
          Карточка лидеров при этом всегда одной высоты */}
      {me && (
        <div className="mt-2 bg-surface-level1 rounded-2xl shadow-md overflow-hidden">
          <NominationRow
            player={me}
            format={nomination.metricFormat}
            onClick={onPlayerClick ? () => onPlayerClick(me) : undefined}
          />
        </div>
      )}

      {/* Название номинации — в панели над карточкой, а её правило — под карточкой,
          мелким пояснением. Под него две строки (2 × leading-snug = 2.75em), чтобы
          страницы номинаций были одной высоты */}
      <p className="mt-3 px-2 min-h-[2.75em] text-center text-[12px] font-normal text-content-muted leading-snug line-clamp-2">
        {subtitleOf(nomination)}
      </p>
    </div>
  );
}

/**
 * Вкладка «Лидеры»: по одной номинации на экране. Панель над карточкой — общая для
 * вкладок раздела (TournamentPager.jsx): название номинации, стрелки и свайп листают
 * на соседнюю, нажатие на название — список всех номинаций (шторка сверху).
 */
export function TournamentNominations({ nominations, openRightPanel, scrollContainerRef, headerOffset }) {
  // Выбор держим по id номинации: сменился дивизион — такой номинации нет, открываем первую
  const [selectedId, setSelectedId] = useState(null);
  const pickedIndex = nominations.findIndex(n => n.id === selectedId);
  const index = pickedIndex >= 0 ? pickedIndex : 0;

  const [isListOpen, setIsListOpen] = useState(false);

  const sticky = useStickyPager({ scrollContainerRef, headerOffset });
  const { offsetIndex, isAnimating, slideTo } = useSlideAnimation({
    index,
    count: nominations.length,
    onCommit: (next) => setSelectedId(nominations[next]?.id ?? null),
    beforeSlide: sticky.scrollToStart,
  });

  const handlePlayerClick = openRightPanel
    ? (p) => p?.playerId && openRightPanel('playerProfile', { playerId: p.playerId }, 'Профиль игрока')
    : null;

  if (nominations.length === 0) return null;

  const neighbours = [nominations[index - 1], nominations[index], nominations[index + 1]];

  return (
    <div className="flex flex-col">
      <div ref={sticky.anchorRef} />

      <PagerBar
        sticky={sticky}
        titles={neighbours.map(n => n?.name ?? '')}
        offsetIndex={offsetIndex}
        isAnimating={isAnimating}
        hasPrev={index > 0}
        hasNext={index < nominations.length - 1}
        onPrev={() => slideTo('prev')}
        onNext={() => slideTo('next')}
        onTitleClick={() => setIsListOpen(true)}
        titleAriaLabel="Все номинации"
        uppercase
      />

      <PagerTrack
        slides={neighbours.map(n => n && {
          key: n.id,
          content: <NominationCard nomination={n} onPlayerClick={handlePlayerClick} />,
        })}
        offsetIndex={offsetIndex}
        isAnimating={isAnimating}
        onSwipe={slideTo}
      />

      {/* ── ВСЕ НОМИНАЦИИ СПИСКОМ. Шторка сверху — как сетка туров во «Матчах» ── */}
      <TopSheet isOpen={isListOpen} onClose={() => setIsListOpen(false)}>
        <div className="flex flex-col gap-2 pb-2">
          <div className="text-center text-[14px] font-black text-content-main uppercase tracking-widest mb-1">
            Номинации
          </div>
          {nominations.map((n, idx) => {
            const isActive = idx === index;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  sticky.scrollToStart();
                  setSelectedId(n.id);
                  setIsListOpen(false);
                }}
                className={clsx(
                  'w-full flex flex-col items-start gap-0.5 px-4 py-3 rounded-2xl text-left outline-none transition-colors active:scale-[0.99]',
                  isActive ? 'bg-brand text-white' : 'bg-surface-level2 text-content-main'
                )}
              >
                <span className="text-[13px] font-black uppercase tracking-wide leading-snug">{n.name}</span>
                <span className={clsx('text-[11px] font-medium leading-snug', isActive ? 'text-white/80' : 'text-content-muted')}>
                  {subtitleOf(n)}
                </span>
              </button>
            );
          })}
        </div>
      </TopSheet>
    </div>
  );
}
