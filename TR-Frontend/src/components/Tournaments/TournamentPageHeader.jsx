import React, { useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { ChipTabs } from '../../ui/ChipTabs';

// Высота карточки турнира. Развёрнутая зависит от длины названия лиги (до трёх строк)
// и считается по тексту; это её нижняя граница — под один логотип. Страница берёт
// развёрнутую высоту для отступа под шапку: шапка лежит поверх ленты, и при
// схлопывании лента не прыгает, а просто заезжает под неё.
// Логотип в развёрнутом виде — по высоте примерно как три строки названия лиги
const LOGO_SIZE = 72;
const LOGO_SIZE_COLLAPSED = 32;

// Поля карточки: по бокам — как у px-5, сверху и снизу — вокруг текста или логотипа
const CARD_PADDING_X = 20;
const CARD_PADDING_Y = 10;

export const TOURNAMENT_CARD_HEIGHT = LOGO_SIZE + CARD_PADDING_Y * 2;
export const TOURNAMENT_CARD_HEIGHT_COLLAPSED = 48;
const TEXT_GAP = 16;
const TEXT_GAP_COLLAPSED = 12;

const Separator = () => (
  <span className="shrink-0 px-1.5 text-content-subtle font-normal">|</span>
);

export function TournamentPageHeader({
  activeTournament,
  onClick,
  tabs,
  activeTab,
  onTabChange,
  collapsed = false,
  tabsRef,
  onExpandedHeightChange
}) {
  const hasData = !!activeTournament;
  // Без турнира схлопывать нечего — остаётся подсказка «Выберите турнир»
  const isCollapsed = collapsed && hasData;

  const divisionLabel = hasData
    ? (activeTournament.division_short_name || activeTournament.division_name)
    : '';
  // Короткое имя лиги есть не у всех лиг (и не в каждом сохранённом выборе) — тогда полное
  const leagueShortLabel = hasData
    ? (activeTournament.league_short_name || activeTournament.league_name)
    : '';

  // Развёрнутая высота — по тексту: название лиги занимает от одной до трёх строк.
  // Текстовые слои стоят на постоянном отступе слева, а не за логотипом: логотип при
  // схлопывании сжимается, и, будь текст привязан к нему, название переносилось бы
  // по-другому прямо на ходу и высота прыгала бы вместе с отступом ленты.
  const expandedTextRef = useRef(null);
  const [expandedHeight, setExpandedHeight] = useState(TOURNAMENT_CARD_HEIGHT);

  useLayoutEffect(() => {
    const el = expandedTextRef.current;
    if (!el) {
      setExpandedHeight(TOURNAMENT_CARD_HEIGHT);
      return;
    }
    const measure = () => {
      setExpandedHeight(Math.max(LOGO_SIZE, el.offsetHeight) + CARD_PADDING_Y * 2);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  useLayoutEffect(() => {
    onExpandedHeightChange?.(expandedHeight);
  }, [expandedHeight, onExpandedHeightChange]);

  return (
    <div className="absolute top-0 left-0 right-0 z-40 bg-transparent pointer-events-none flex flex-col">
      {/* 1. ВЕРХНИЙ БЛОК: Выбор турнира. При прокрутке сжимается в одну строку:
          логотип меньше, вместо полного названия — «лига | дивизион | сезон» */}
      <div className="pointer-events-auto relative z-20 bg-surface-base">
        <button
          onClick={onClick}
          className="relative w-full overflow-hidden flex items-center text-left outline-none active:scale-[0.98] transition-[height,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            height: isCollapsed ? TOURNAMENT_CARD_HEIGHT_COLLAPSED : expandedHeight,
            paddingLeft: CARD_PADDING_X,
            paddingRight: CARD_PADDING_X
          }}
        >
          <div
            className="shrink-0 flex items-center justify-center overflow-hidden transition-[width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              width: isCollapsed ? LOGO_SIZE_COLLAPSED : LOGO_SIZE,
              height: isCollapsed ? LOGO_SIZE_COLLAPSED : LOGO_SIZE
            }}
          >
            {hasData ? (
              <img
                src={getImageUrl(activeTournament.division_logo)}
                alt={activeTournament.division_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <Icon name="registry" className="w-6 h-6 text-content-subtle" />
            )}
          </div>

          {hasData ? (
            <>
              {/* Развёрнутый вид: полное название лиги до трёх строк, ниже «дивизион | сезон» */}
              <div
                className={clsx(
                  "absolute top-0 bottom-0 flex flex-col justify-center transition-[opacity,transform] duration-300",
                  isCollapsed ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
                )}
                style={{ left: CARD_PADDING_X + LOGO_SIZE + TEXT_GAP, right: CARD_PADDING_X }}
                aria-hidden={isCollapsed}
              >
                <div ref={expandedTextRef} className="min-w-0">
                  {/* Без block: он перебивает line-clamp, и обрезка по строкам не работает */}
                  <span className="text-[14px] font-black uppercase tracking-wider text-content-main line-clamp-3 leading-tight">
                    {activeTournament.league_name}
                  </span>
                  <div className="flex items-center min-w-0 mt-1.5 text-[13px] font-semibold uppercase tracking-wide text-content-muted">
                    <span className="min-w-0 truncate">{divisionLabel}</span>
                    {activeTournament.season_name && (
                      <>
                        <Separator />
                        <span className="shrink-0 opacity-50">{activeTournament.season_name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Схлопнутый вид: одна строка. Сезон не режем — обрезается
                  дивизион, а за ним, если совсем тесно, и лига */}
              <div
                className={clsx(
                  "absolute top-0 bottom-0 flex items-center min-w-0 text-[14px] uppercase tracking-wide transition-[opacity,transform] duration-300",
                  isCollapsed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                )}
                style={{ left: CARD_PADDING_X + LOGO_SIZE_COLLAPSED + TEXT_GAP_COLLAPSED, right: CARD_PADDING_X }}
                aria-hidden={!isCollapsed}
              >
                <span className="min-w-0 max-w-[50%] truncate font-black tracking-wider text-content-main">
                  {leagueShortLabel}
                </span>
                <Separator />
                <span className="min-w-0 truncate font-semibold text-content-main">
                  {divisionLabel}
                </span>
                {activeTournament.season_name && (
                  <>
                    <Separator />
                    <span className="shrink-0 font-semibold text-content-muted opacity-50">
                      {activeTournament.season_name}
                    </span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0 h-full flex items-center" style={{ paddingLeft: TEXT_GAP }}>
              <h2 className="text-[14px] font-black uppercase tracking-widest text-content-subtle text-left">
                Выберите турнир / лигу
              </h2>
            </div>
          )}
        </button>
      </div>

      {/* 2. НИЖНИЙ БЛОК: вкладки чипами, как в деталях события */}
      <div ref={tabsRef} className="relative pointer-events-auto bg-surface-base shadow-lg pb-1">
        <ChipTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={onTabChange}
          className="px-4 pt-3"
        />
      </div>
    </div>
  );
}
