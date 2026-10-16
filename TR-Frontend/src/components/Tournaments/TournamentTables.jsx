// TournamentTables.jsx
import React, { useState } from 'react';
import clsx from 'clsx';
import { TournamentTable } from './TournamentTable';
import { TournamentPlayoff } from './TournamentPlayoff';
import { PagerBar, PagerTrack, useSlideAnimation, useStickyPager } from './TournamentPager';

const EMPTY_NOTE = 'text-center py-8 text-[12px] italic font-semibold text-content-subtle uppercase tracking-wider bg-surface-base rounded-2xl border border-surface-border';

function PlayoffBrackets({ brackets, games }) {
  if (brackets.length === 0) {
    return <div className={EMPTY_NOTE}>Матчи плей-офф еще не сформированы</div>;
  }
  return (
    <div className="flex flex-col gap-6">
      {brackets.map((bracket, index) => (
        <div key={bracket.id} className={clsx('flex flex-col gap-4 w-full', index > 0 && 'mt-6 pt-6 border-t border-surface-border')}>
          {!bracket.is_main && (
            <div className="text-left text-[10px] font-black uppercase tracking-[0.12em] text-content-muted pl-1 opacity-90">
              {bracket.name}
            </div>
          )}
          <TournamentPlayoff bracket={bracket} games={games} />
        </div>
      ))}
    </div>
  );
}

/**
 * Вкладка «Таблицы»: «Турнирная таблица» и «Плей-офф» — двумя страницами в той же панели,
 * что туры во «Матчах» (TournamentPager.jsx). Стрелки и свайп листают, нажатие на
 * название переключает на другую страницу — их всего две.
 */
export function TournamentTables({
  standings,
  expandedTeams,
  onToggleTeam,
  brackets,
  games,
  scrollContainerRef,
  headerOffset,
}) {
  const pages = [
    {
      key: 'standings',
      label: 'Турнирная таблица',
      content: <TournamentTable standings={standings} expandedTeams={expandedTeams} onToggleTeam={onToggleTeam} />,
    },
    {
      key: 'playoff',
      label: 'Плей-офф',
      content: <PlayoffBrackets brackets={brackets} games={games} />,
    },
  ];

  const [index, setIndex] = useState(0);
  const sticky = useStickyPager({ scrollContainerRef, headerOffset });
  const { offsetIndex, isAnimating, slideTo } = useSlideAnimation({
    index,
    count: pages.length,
    onCommit: setIndex,
    beforeSlide: sticky.scrollToStart,
  });

  const neighbours = [pages[index - 1], pages[index], pages[index + 1]];

  return (
    <div className="flex flex-col">
      <div ref={sticky.anchorRef} />

      <PagerBar
        sticky={sticky}
        titles={neighbours.map(page => page?.label ?? '')}
        offsetIndex={offsetIndex}
        isAnimating={isAnimating}
        hasPrev={index > 0}
        hasNext={index < pages.length - 1}
        onPrev={() => slideTo('prev')}
        onNext={() => slideTo('next')}
        onTitleClick={() => slideTo(index === 0 ? 'next' : 'prev')}
        titleAriaLabel={index === 0 ? 'Показать плей-офф' : 'Показать турнирную таблицу'}
        uppercase
      />

      <PagerTrack
        slides={neighbours}
        offsetIndex={offsetIndex}
        isAnimating={isAnimating}
        onSwipe={slideTo}
      />
    </div>
  );
}
