import React, { useState, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../../utils/helpers';
import { BottomSheet } from '../../ui/BottomSheet';
import { TextInputLP } from '../../ui/Input-LP';
import { Icon } from '../../ui/Icon';
import { SegmentedControl } from '../../ui/SegmentedControl';

const LEAGUES_PAGE_SIZE = 20;
const sameId = (left, right) => left != null && right != null && String(left) === String(right);
const selectionStyle = (color) => color ? { backgroundColor: `${color}1a`, color } : undefined;

const FilterButton = ({ title, value, onClick, disabled, expanded, activeBrandColor }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={`${title}: ${value}`}
    aria-haspopup="dialog"
    aria-expanded={expanded}
    className="min-w-0 rounded-2xl bg-surface-level1 px-3 py-2.5 text-left shadow-sm disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand"
  >
    <span className="block text-[11px] font-semibold text-content-muted mb-1">{title}</span>
    <span className="flex items-center justify-between gap-2 text-brand" style={activeBrandColor ? { color: activeBrandColor } : undefined}>
      <span className="min-w-0 text-[14px] font-bold truncate">{value}</span>
      <Icon name="chevron" className="w-3 h-3 shrink-0" />
    </span>
  </button>
);

const OptionRow = ({ title, subtitle, logoUrl, showLogo, checked, onClick, activeBrandColor }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={checked}
    className={clsx(
      'w-full flex items-center gap-3 px-4 py-3 min-h-[52px] rounded-2xl transition-colors text-left focus-visible:ring-2 focus-visible:ring-brand',
      checked ? 'bg-brand-opacity' : 'bg-surface-level1 active:bg-surface-level2'
    )}
    style={checked ? selectionStyle(activeBrandColor) : undefined}
  >
    {showLogo && (
      <div className="w-12 h-12 shrink-0 flex items-center justify-center">
        {logoUrl
          ? <img src={getImageUrl(logoUrl)} alt="" className="w-full h-full object-contain" />
          : <Icon name="trophy" className="w-7 h-7 text-content-subtle" />}
      </div>
    )}
    <span className="flex flex-col min-w-0 flex-1">
      <span
        className={clsx('text-[14px] font-bold whitespace-normal break-words leading-snug', checked ? 'text-brand' : 'text-content-main')}
        style={checked && activeBrandColor ? { color: activeBrandColor } : undefined}
      >
        {title}
      </span>
      {subtitle && <span className="text-[11px] font-semibold text-content-muted mt-1 break-words">{subtitle}</span>}
    </span>
    <span className="w-5 shrink-0">
      {checked && <Icon name="check" className="w-5 h-5 text-brand" style={activeBrandColor ? { color: activeBrandColor } : undefined} />}
    </span>
  </button>
);

const Loading = () => (
  <div role="status" aria-label="Загрузка" className="flex justify-center py-8">
    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
  </div>
);

export function TournamentListPanel({ teams = [], activeDivisionId, activeTournament, onSelect, hasTeamColor, activeBrandColor }) {
  const hasTeams = teams.length > 0;
  const brandColor = hasTeamColor ? activeBrandColor : undefined;
  const initialTournamentRef = useRef(activeTournament);
  const [scope, setScope] = useState(hasTeams ? 'my' : 'all');
  const [league, setLeague] = useState(() => activeTournament?.league_id ? {
    id: activeTournament.league_id,
    name: activeTournament.league_name,
    short_name: activeTournament.league_short_name,
    logo_url: activeTournament.league_logo
  } : null);
  const [season, setSeason] = useState(null);
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

  const loadLeagues = useCallback(async (offset, searchValue, scopeValue) => {
    const requestId = ++leaguesRequestRef.current;
    leaguesLoadingRef.current = true;
    setIsLeaguesLoading(true);
    setLeaguesError('');
    try {
      const params = new URLSearchParams({ scope: scopeValue, limit: String(LEAGUES_PAGE_SIZE), offset: String(offset) });
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
    const timer = setTimeout(() => loadLeagues(0, search, scope), search.trim() ? 300 : 0);
    return () => {
      clearTimeout(timer);
      leaguesRequestRef.current += 1;
      leaguesLoadingRef.current = false;
    };
  }, [openSheet, scope, search, loadLeagues]);

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
    if (!leaguesLoadingRef.current && hasMoreLeagues && !leaguesError) loadLeagues(leaguesOffset, search, scope);
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,0.65fr)] gap-2 px-4 pt-4 pb-2 shrink-0">
        <FilterButton title="Лига" value={league ? (league.short_name || league.name) : 'Выбрать лигу'} onClick={() => setOpenSheet('league')} expanded={openSheet === 'league'} activeBrandColor={brandColor} />
        <FilterButton title="Сезон" value={season?.name || 'Выбрать'} disabled={!league || isStructureLoading || seasons.length === 0} onClick={() => setOpenSheet('season')} expanded={openSheet === 'season'} activeBrandColor={brandColor} />
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
            <div className="flex items-center justify-between gap-2 px-1 mb-2 text-[11px] font-bold uppercase tracking-widest text-content-muted">
              <h4>{group.title}</h4><span>{group.items.length}</span>
            </div>
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
                    className={clsx('w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand', isActive ? 'bg-brand-opacity text-brand' : 'text-content-main active:bg-surface-level2')}
                    style={isActive ? selectionStyle(brandColor) : undefined}
                  >
                    <span className="min-w-0 text-[14px] font-bold break-words leading-snug">{division.shortName || division.name}</span>
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
          {hasTeams && <SegmentedControl options={[{ value: 'my', label: 'Мои лиги' }, { value: 'all', label: 'Все лиги' }]} value={scope} onChange={value => { setScope(value); setSearch(''); }} activeColor={brandColor} />}
          {scope === 'all' && <TextInputLP label="" value={search} onChange={setSearch} placeholder="Название лиги или город" />}
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto overscroll-contain scrollbar-hide" onScroll={handleLeaguesScroll} aria-busy={isLeaguesLoading}>
            {leagues.map(item => <OptionRow key={item.id} title={item.name} subtitle={item.city} logoUrl={item.logo_url} showLogo checked={sameId(league?.id, item.id)} onClick={() => handleLeagueSelect(item)} activeBrandColor={brandColor} />)}
            {isLeaguesLoading && <Loading />}
            {leaguesError && <div role="alert" className="text-center text-[13px] text-content-muted py-3"><p>{leaguesError}</p><button type="button" className="min-h-[44px] text-brand font-bold" onClick={() => loadLeagues(leaguesOffset, search, scope)}>Повторить</button></div>}
            {!isLeaguesLoading && !leaguesError && leagues.length === 0 && <p className="text-[13px] font-semibold text-content-muted leading-relaxed text-center py-6">{search.trim() ? 'По этому запросу лиг не нашлось.' : scope === 'my' ? 'У ваших команд пока нет лиг. Посмотрите список «Все лиги».' : 'Здесь пока нет ни одной лиги.'}</p>}
            {!isLeaguesLoading && !leaguesError && hasMoreLeagues && <button type="button" onClick={loadMoreLeagues} className="min-h-[44px] text-brand text-[13px] font-bold">Показать ещё</button>}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={openSheet === 'season'} onClose={() => setOpenSheet(null)}>
        <div role="dialog" aria-modal="true" aria-label="Выбор сезона" className="flex flex-col gap-4">
          <h3 className="text-[16px] font-black tracking-widest text-content-main uppercase">Выбор сезона</h3>
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto overscroll-contain scrollbar-hide">
            {seasons.map(item => <OptionRow key={item.id} title={item.name} checked={sameId(season?.id, item.id)} onClick={() => { setSeason(item); setOpenSheet(null); }} activeBrandColor={brandColor} />)}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
