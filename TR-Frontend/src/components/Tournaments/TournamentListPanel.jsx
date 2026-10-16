import React, { useState, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl, pluralRu } from '../../utils/helpers';
import { BottomSheet } from '../../ui/BottomSheet';
import { TextInputLP } from '../../ui/Input-LP';
import { Icon } from '../../ui/Icon';
import { PageLoader } from '../../ui/Loader';

const LEAGUES_PAGE_SIZE = 20;

// Список лиг в шторке — постоянной высоты: шторка подстраивается под содержимое, и пока
// грузились лиги (список → лоудер → новый список), она прыгала по высоте
const LEAGUE_LIST_HEIGHT = 'clamp(260px, 50dvh, 440px)';
const sameId = (left, right) => left != null && right != null && String(left) === String(right);

const RU_SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Даты турнира коротко: «12–14 дек», «28 ноя – 2 дек», «12 дек». Год не пишем — сезон
// и так выбран чипом. Даты приходят строкой YYYY-MM-DD, без поясов
const formatDateRange = (start, end) => {
  const parse = (value) => {
    const [, month, day] = String(value || '').split('-').map(Number);
    return month && day ? { day, month: month - 1 } : null;
  };
  const from = parse(start);
  const to = parse(end);
  if (!from && !to) return null;
  if (!from || !to) {
    const single = from || to;
    return `${single.day} ${RU_SHORT_MONTHS[single.month]}`;
  }
  if (from.month === to.month) {
    return from.day === to.day
      ? `${from.day} ${RU_SHORT_MONTHS[from.month]}`
      : `${from.day}–${to.day} ${RU_SHORT_MONTHS[to.month]}`;
  }
  return `${from.day} ${RU_SHORT_MONTHS[from.month]} – ${to.day} ${RU_SHORT_MONTHS[to.month]}`;
};

// Подпись под дивизионом: даты (у турниров), число команд и где он сейчас.
// «Идёт» — сыграно и ещё есть впереди; «не начался» — впереди есть, сыгранных нет;
// «завершён» — всё сыграно. Нет ни одного матча — про ход ничего не говорим
const getDivisionMeta = (division) => {
  const parts = [];
  if (division.isTournament) {
    const range = formatDateRange(division.startDate, division.endDate);
    if (range) parts.push(range);
  }
  if (division.teamsCount > 0) {
    parts.push(`${division.teamsCount} ${pluralRu(division.teamsCount, 'команда', 'команды', 'команд')}`);
  }
  if (division.gamesLeft > 0) parts.push(division.gamesPlayed > 0 ? 'идёт' : 'не начался');
  else if (division.gamesPlayed > 0) parts.push('завершён');
  return parts.join(' · ');
};

// Логотип лиги или дивизиона; нет логотипа — кубок
const Logo = ({ url, className }) => (
  <div className={clsx('shrink-0 flex items-center justify-center', className)}>
    {url
      ? <img src={getImageUrl(url)} alt="" className="w-full h-full object-contain" />
      : <Icon name="trophy" className="w-1/2 h-1/2 text-content-subtle" />}
  </div>
);

// Строка лиги в шторке. Крупно — короткое имя (то же, что в шапке раздела и в карточке
// лиги), под ним мелко полное: длинное официальное название, да ещё набранное
// заглавными, крупным шрифтом перекрикивало весь список. Логотип — в рамке одного
// размера и по верху строки, вровень с названием: эмблемы бывают круглые и щитом,
// а по центру трёх строк он «плавал»
const LeagueRow = ({ league: item, checked, onClick }) => {
  const title = item.short_name || item.name;
  const fullName = item.short_name && item.name && item.short_name !== item.name ? item.name : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={clsx(
        'w-full flex items-start gap-3 px-3 py-3 rounded-2xl transition-colors text-left focus-visible:ring-2 focus-visible:ring-brand',
        checked ? 'bg-brand-opacity' : 'bg-surface-level1 active:bg-surface-level2'
      )}
    >
      <div className="w-12 h-12 shrink-0 rounded-xl bg-surface-base p-1.5 flex items-center justify-center">
        {item.logo_url
          ? <img src={getImageUrl(item.logo_url)} alt="" className="w-full h-full object-contain" />
          : <Icon name="trophy" className="w-6 h-6 text-content-subtle" />}
      </div>
      <span className="flex flex-col min-w-0 flex-1 pt-0.5">
        <span className="text-[15px] font-bold text-content-main leading-snug break-words">{title}</span>
        {fullName && (
          <span className="text-[12px] font-medium text-content-muted leading-snug mt-0.5 break-words">{fullName}</span>
        )}
        {item.city && <span className="text-[11px] font-semibold text-content-subtle mt-1">{item.city}</span>}
      </span>
      {/* Выбранную видно по подложке и галочке — текст не красим, иначе он кричит */}
      <span className="w-5 shrink-0 self-center">
        {checked && <Icon name="check" className="w-5 h-5 text-brand" />}
      </span>
    </button>
  );
};

// Общий лоадер приложения с летящей шайбой
const Loading = () => (
  <div role="status" aria-label="Загрузка" className="py-8">
    <PageLoader />
  </div>
);

// Шторка лиг показывает все лиги с поиском — без «Мои / Все»: переключатель только
// удлинял шторку, а лиг пока немного
export function TournamentListPanel({ activeDivisionId, activeTournament, onSelect }) {
  const initialTournamentRef = useRef(activeTournament);
  const [league, setLeague] = useState(() => activeTournament?.league_id ? {
    id: activeTournament.league_id,
    name: activeTournament.league_name,
    short_name: activeTournament.league_short_name,
    logo_url: activeTournament.league_logo
  } : null);
  const [season, setSeason] = useState(null);
  const seasonsRef = useRef(null);
  const activeSeasonRef = useRef(null);
  const [seasons, setSeasons] = useState([]);
  const [isStructureLoading, setIsStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState('');
  const [isRestoringLeague, setIsRestoringLeague] = useState(!!activeTournament?.league_name && !activeTournament?.league_id);
  const [leagues, setLeagues] = useState([]);
  const [leaguesOffset, setLeaguesOffset] = useState(0);
  const [hasMoreLeagues, setHasMoreLeagues] = useState(false);
  const [isLeaguesLoading, setIsLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState('');
  const [search, setSearch] = useState('');
  const [openSheet, setOpenSheet] = useState(null);
  const leaguesRequestRef = useRef(0);
  const leaguesLoadingRef = useRef(false);
  const structureRequestRef = useRef(0);
  const restoreVersionRef = useRef(0);
  const listRef = useRef(null);
  const activeRowRef = useRef(null);

  // Старые сохранённые турниры содержат название лиги, но ещё не её id.
  // Восстанавливаем их через существующий справочник, не меняя API.
  useEffect(() => {
    const saved = initialTournamentRef.current;
    if (saved?.league_id || !saved?.league_name) return;
    const controller = new AbortController();
    const version = restoreVersionRef.current;
    const restore = async () => {
      try {
        const params = new URLSearchParams({ scope: 'all', search: saved.league_name, limit: '50' });
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/leagues?${params}`, {
          headers: getAuthHeaders(), signal: controller.signal
        });
        const data = await res.json();
        if (!res.ok || !data.success || version !== restoreVersionRef.current) return;
        const match = data.leagues.find(item => item.name === saved.league_name);
        if (match) setLeague(match);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Ошибка восстановления лиги:', err);
      } finally {
        if (!controller.signal.aborted) setIsRestoringLeague(false);
      }
    };
    restore();
    return () => controller.abort();
  }, []);

  const loadStructure = useCallback(async (leagueId) => {
    const requestId = ++structureRequestRef.current;
    setIsStructureLoading(true);
    setStructureError('');
    setSeasons([]);
    setSeason(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/leagues/${leagueId}/structure`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('Не удалось загрузить соревнования');
      if (requestId !== structureRequestRef.current) return;
      // Свежие сведения о лиге (логотип, город) — поверх сохранённых в выборе
      if (data.league) setLeague(prev => (prev && sameId(prev.id, data.league.id) ? { ...prev, ...data.league } : prev));
      const nextSeasons = data.seasons || [];
      const saved = initialTournamentRef.current;
      // Дивизион и сезон имеют общие id во всей платформе, поэтому совпадение
      // безопасно даже при переключении на другую лигу.
      const restored = nextSeasons.find(item => sameId(item.id, saved?.season_id))
        || nextSeasons.find(item => item.divisions.some(division => sameId(division.id, saved?.division_id)));
      setSeasons(nextSeasons);
      setSeason(restored || nextSeasons.find(item => item.isActive) || nextSeasons[0] || null);
    } catch (err) {
      if (requestId === structureRequestRef.current) setStructureError('Не удалось загрузить соревнования. Попробуйте ещё раз.');
    } finally {
      if (requestId === structureRequestRef.current) setIsStructureLoading(false);
    }
  }, []);

  const leagueId = league?.id;
  useEffect(() => {
    if (leagueId) loadStructure(leagueId);
    return () => { structureRequestRef.current += 1; };
  }, [leagueId, loadStructure]);

  const loadLeagues = useCallback(async (offset, searchValue) => {
    const requestId = ++leaguesRequestRef.current;
    leaguesLoadingRef.current = true;
    setIsLeaguesLoading(true);
    setLeaguesError('');
    try {
      const params = new URLSearchParams({ scope: 'all', limit: String(LEAGUES_PAGE_SIZE), offset: String(offset) });
      if (searchValue.trim()) params.set('search', searchValue.trim());
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/leagues?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('Не удалось загрузить лиги');
      if (requestId !== leaguesRequestRef.current) return;
      setLeagues(prev => offset === 0 ? data.leagues : [...prev, ...data.leagues]);
      setHasMoreLeagues(data.hasMore);
      setLeaguesOffset(offset + data.leagues.length);
    } catch (err) {
      if (requestId === leaguesRequestRef.current) setLeaguesError('Не удалось загрузить лиги. Попробуйте ещё раз.');
    } finally {
      if (requestId === leaguesRequestRef.current) {
        setIsLeaguesLoading(false);
        leaguesLoadingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (openSheet !== 'league') return;
    setLeagues([]);
    setLeaguesOffset(0);
    setHasMoreLeagues(false);
    setLeaguesError('');
    setIsLeaguesLoading(true);
    leaguesLoadingRef.current = true;
    const timer = setTimeout(() => loadLeagues(0, search), search.trim() ? 300 : 0);
    return () => {
      clearTimeout(timer);
      leaguesRequestRef.current += 1;
      leaguesLoadingRef.current = false;
    };
  }, [openSheet, search, loadLeagues]);

  useEffect(() => {
    const list = listRef.current;
    const row = activeRowRef.current;
    if (!list || !row || isStructureLoading) return;
    const bounds = list.getBoundingClientRect();
    const selected = row.getBoundingClientRect();
    if (selected.top < bounds.top || selected.bottom > bounds.bottom) {
      list.scrollTop += selected.top - bounds.top - (list.clientHeight - selected.height) / 2;
    }
  }, [season?.id, isStructureLoading]);

  // Выбранный сезон — в поле зрения ленты чипов (восстановленный может быть старым)
  useEffect(() => {
    const strip = seasonsRef.current;
    const chip = activeSeasonRef.current;
    if (!strip || !chip) return;
    if (chip.offsetLeft < strip.scrollLeft || chip.offsetLeft + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = chip.offsetLeft - 16;
    }
  }, [season?.id, seasons.length]);

  const handleLeagueSelect = (nextLeague) => {
    restoreVersionRef.current += 1;
    setIsRestoringLeague(false);
    if (!sameId(nextLeague.id, league?.id)) {
      setSeasons([]);
      setSeason(null);
      setIsStructureLoading(true);
    }
    setLeague(nextLeague);
    setOpenSheet(null);
  };

  const handleDivisionSelect = (division) => {
    onSelect({
      division_id: division.id,
      division_name: division.name,
      division_short_name: division.shortName,
      division_logo: division.logoUrl,
      league_id: league.id,
      league_name: league.name || '',
      league_short_name: league.short_name || '',
      league_logo: league.logo_url || null,
      season_id: season.id,
      season_name: season.name || ''
    });
  };

  const loadMoreLeagues = () => {
    if (!leaguesLoadingRef.current && hasMoreLeagues && !leaguesError) loadLeagues(leaguesOffset, search);
  };
  const handleLeaguesScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 120) loadMoreLeagues();
  };
  const divisions = season?.divisions || [];
  const groups = [
    { title: 'Дивизионы', items: divisions.filter(item => !item.isTournament) },
    { title: 'Турниры', items: divisions.filter(item => item.isTournament) }
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── ЛИГА: карточка с логотипом, полным названием и городом. Нажатие — выбор
          другой лиги в шторке снизу (открывается из тела панели) ── */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-1 shrink-0">
        <button
          type="button"
          onClick={() => setOpenSheet('league')}
          aria-haspopup="dialog"
          aria-expanded={openSheet === 'league'}
          aria-label={league ? `Лига: ${league.name || league.short_name}. Сменить лигу` : 'Выбрать лигу'}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-surface-level1 shadow-sm text-left outline-none active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-brand"
        >
          {league ? (
            <>
              <Logo url={league.logo_url} className="w-12 h-12" />
              <span className="flex flex-col min-w-0 flex-1">
                {/* Короткое имя лиги — полное («Тюменская городская общественная…»)
                    в карточку не влезало. Без block: он перебивает line-clamp */}
                <span className="text-[15px] font-bold text-content-main leading-snug line-clamp-2 break-words">
                  {league.short_name || league.name}
                </span>
                {league.city && (
                  <span className="text-[12px] font-semibold text-content-muted mt-0.5 truncate">{league.city}</span>
                )}
              </span>
              {/* Сменить лигу — значком круговых стрелок, без слова */}
              <span
                className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-header-button)] flex items-center justify-center text-brand"
                aria-hidden="true"
              >
                <Icon name="refresh" className="w-5 h-5" />
              </span>
            </>
          ) : (
            <>
              <Logo url={null} className="w-12 h-12" />
              <span className="flex-1 min-w-0 text-[15px] font-bold text-content-muted">Лига не выбрана</span>
              <span className="shrink-0 text-[13px] font-bold text-brand">Выбрать</span>
            </>
          )}
        </button>

        {/* ── СЕЗОНЫ чипами: новые слева, выбор одним касанием ── */}
        {league && seasons.length > 0 && !isStructureLoading && (
          <div
            ref={seasonsRef}
            className="relative flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-1"
            role="tablist"
            aria-label="Сезон"
          >
            {seasons.map(item => {
              const isActive = sameId(season?.id, item.id);
              return (
                <button
                  key={item.id}
                  ref={isActive ? activeSeasonRef : null}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSeason(item)}
                  className={clsx(
                    'shrink-0 h-8 px-3.5 rounded-full text-[13px] font-bold whitespace-nowrap outline-none transition-colors active:scale-95',
                    isActive ? 'bg-brand text-white shadow-md' : 'bg-surface-level1 text-content-main shadow-sm'
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-4 pb-6" aria-busy={isStructureLoading || isRestoringLeague}>
        {isStructureLoading || isRestoringLeague ? <Loading /> : structureError ? (
          <div role="alert" className="py-10 text-center text-[13px] text-content-muted">
            <p>{structureError}</p>
            <button type="button" onClick={() => loadStructure(league.id)} className="mt-3 min-h-[44px] text-brand font-bold">Повторить</button>
          </div>
        ) : !league ? (
          <p className="py-10 text-center text-[14px] font-bold text-content-subtle leading-relaxed px-2">Выберите лигу, чтобы увидеть её турниры и дивизионы</p>
        ) : divisions.length === 0 ? (
          <p className="py-10 text-center text-[14px] font-bold text-content-subtle leading-relaxed px-2">В этом сезоне нет опубликованных соревнований</p>
        ) : groups.filter(group => group.items.length > 0).map(group => (
          <section key={group.title} aria-label={group.title} className="mt-4">
            <h4 className="px-1 mb-2 text-[11px] font-bold uppercase tracking-widest text-content-muted">{group.title}</h4>
            <div className="rounded-2xl bg-surface-level1 shadow-sm overflow-hidden divide-y divide-surface-border">
              {group.items.map(division => {
                const isActive = sameId(activeDivisionId, division.id);
                return (
                  <button
                    key={division.id}
                    ref={isActive ? activeRowRef : null}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleDivisionSelect(division)}
                    className={clsx('w-full min-h-[60px] flex items-center gap-4 px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand', isActive ? 'bg-brand-opacity text-brand' : 'text-content-main active:bg-surface-level2')}
                  >
                    {/* Логотип скромнее названия: 32px — у дивизионов одной лиги эмблемы часто
                        одинаковые, и крупные они только повторяли друг друга */}
                    <Logo url={division.logoUrl} className="w-8 h-8" />
                    <span className="flex flex-col min-w-0 flex-1">
                      {/* Короткое название дивизиона, если лига его задала — в одну строку до
                          края, не влезло — многоточие. Подпись под ним держит место всегда,
                          даже пустая, — так все строки списка одной высоты */}
                      <span className="text-[14px] font-bold leading-snug truncate">{division.shortName || division.name}</span>
                      <span className="text-[11px] font-semibold text-content-muted mt-0.5 min-h-[1.25em] leading-tight truncate">
                        {getDivisionMeta(division)}
                      </span>
                    </span>
                    {/* Место под галочку — только у выбранного: постоянный пустой столбец
                        отнимал у названий ширину, и «им. САМОПАЛЬНИКОВА» не помещалась */}
                    {isActive && <Icon name="check" className="w-5 h-5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <BottomSheet isOpen={openSheet === 'league'} onClose={() => setOpenSheet(null)}>
        <div role="dialog" aria-modal="true" aria-label="Выбор лиги" className="flex flex-col gap-4">
          <h3 className="text-[16px] font-black tracking-widest text-content-main uppercase">Выбор лиги</h3>
          <TextInputLP label="" value={search} onChange={setSearch} placeholder="Название лиги или город" />
          <div
            className="flex flex-col gap-2 overflow-y-auto overscroll-contain scrollbar-hide"
            style={{ height: LEAGUE_LIST_HEIGHT }}
            onScroll={handleLeaguesScroll}
            aria-busy={isLeaguesLoading}
          >
            {leagues.map(item => <LeagueRow key={item.id} league={item} checked={sameId(league?.id, item.id)} onClick={() => handleLeagueSelect(item)} />)}
            {isLeaguesLoading && <Loading />}
            {leaguesError && <div role="alert" className="text-center text-[13px] text-content-muted py-3"><p>{leaguesError}</p><button type="button" className="min-h-[44px] text-brand font-bold" onClick={() => loadLeagues(leaguesOffset, search)}>Повторить</button></div>}
            {!isLeaguesLoading && !leaguesError && leagues.length === 0 && <p className="text-[13px] font-semibold text-content-muted leading-relaxed text-center py-6">{search.trim() ? 'По этому запросу лиг не нашлось.' : 'Здесь пока нет ни одной лиги.'}</p>}
            {!isLeaguesLoading && !leaguesError && hasMoreLeagues && <button type="button" onClick={loadMoreLeagues} className="min-h-[44px] text-brand text-[13px] font-bold">Показать ещё</button>}
          </div>
        </div>
      </BottomSheet>

    </div>
  );
}
