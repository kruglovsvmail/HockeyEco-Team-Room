import React, { useState, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../../utils/helpers';
import { BottomSheet } from '../../ui/BottomSheet';
import { TextInputLP } from '../../ui/Input-LP';
import { Icon } from '../../ui/Icon';

// Выбор турнира для раздела «Турниры / Лиги».
//
// Раздел стал информационным: сюда заходят посмотреть чужую турнирную таблицу,
// статистику игрока или расписание любой лиги — в том числе те, у кого своей команды
// нет вовсе. Раньше панель показывала турниры одной команды, теперь выбор идёт цепочкой
// фильтров: область → лига → сезон → дивизионы.
//
// Сами фильтры — компактные строки «текст плюс шеврон» в брендовом цвете, как фильтр
// типа тренировки в «Статистике команды». Каждая открывает свою нижнюю шторку со
// списком вариантов. Шторки портируются на z-[110] и спокойно ложатся поверх этой
// панели, которая живёт на z-[40].

const LEAGUES_PAGE_SIZE = 20;

// Компактный триггер фильтра — тот же вид, что у фильтра тренировок в статистике команды
const FilterButton = ({ label, onClick, disabled, activeBrandColor }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      "flex items-center gap-1 min-w-0 text-brand cursor-pointer active:opacity-70",
      disabled && "opacity-40 cursor-not-allowed"
    )}
    style={activeBrandColor ? { color: activeBrandColor } : undefined}
  >
    <span className="text-[12px] font-bold truncate max-w-[140px]">{label}</span>
    <Icon name="chevron" className="w-3 h-3 shrink-0" />
  </button>
);

// Строка варианта внутри шторки
const OptionRow = ({ title, subtitle, logoUrl, showLogo, checked, onClick, activeBrandColor }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors outline-none text-left",
      checked ? "bg-brand-opacity" : "bg-surface-level2 active:scale-[0.99]"
    )}
    style={checked && activeBrandColor ? { backgroundColor: `${activeBrandColor}1a` } : undefined}
  >
    {showLogo && (
      <div className="w-9 h-9 rounded-full bg-surface-level1 shrink-0 overflow-hidden flex items-center justify-center">
        {logoUrl
          ? <img src={getImageUrl(logoUrl)} alt="" className="w-full h-full object-cover" />
          : <Icon name="trophy" className="w-4 h-4 text-content-subtle" />}
      </div>
    )}

    <div className="flex flex-col min-w-0 flex-1">
      <span
        className={clsx("text-[14px] font-bold truncate", checked ? "text-brand" : "text-content-main")}
        style={checked && activeBrandColor ? { color: activeBrandColor } : undefined}
      >
        {title}
      </span>
      {subtitle && <span className="text-[11px] font-semibold text-content-muted truncate">{subtitle}</span>}
    </div>

    {checked && (
      <Icon name="check" className="w-5 h-5 text-brand shrink-0"
            style={activeBrandColor ? { color: activeBrandColor } : undefined} />
    )}
  </button>
);

export function TournamentListPanel({
  teams = [],
  activeDivisionId,
  onSelect,
  hasTeamColor,
  activeBrandColor
}) {
  const hasTeams = teams.length > 0;
  const brandColor = hasTeamColor ? activeBrandColor : undefined;

  // Область поиска. У человека с командами по умолчанию «мои» — ему почти всегда нужен
  // свой турнир; у безкомандного выбора нет, сразу все лиги.
  const [scope, setScope] = useState(() => (hasTeams ? { type: 'my' } : { type: 'all' }));

  const [league, setLeague] = useState(null);
  const [season, setSeason] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [isStructureLoading, setIsStructureLoading] = useState(false);

  const [leagues, setLeagues] = useState([]);
  const [leaguesOffset, setLeaguesOffset] = useState(0);
  const [hasMoreLeagues, setHasMoreLeagues] = useState(false);
  const [isLeaguesLoading, setIsLeaguesLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [openSheet, setOpenSheet] = useState(null); // 'scope' | 'league' | 'season'

  // Гонка запросов: пока летит страница лиг, человек успевает поменять фильтр.
  // По номеру запроса отбрасываем ответы, которые к текущему состоянию уже не относятся.
  const requestIdRef = useRef(0);

  const scopeLabel = scope.type === 'all'
    ? 'Все лиги'
    : scope.type === 'my'
      ? 'Мои лиги'
      : (teams.find(t => t.id === scope.teamId)?.short_name
         || teams.find(t => t.id === scope.teamId)?.name
         || 'Команда');

  const loadLeagues = useCallback(async (offset, searchValue, scopeValue) => {
    const requestId = ++requestIdRef.current;
    setIsLeaguesLoading(true);

    try {
      const params = new URLSearchParams({
        scope: scopeValue.type === 'all' ? 'all' : 'my',
        limit: String(LEAGUES_PAGE_SIZE),
        offset: String(offset)
      });
      if (scopeValue.type === 'team') params.set('teamId', String(scopeValue.teamId));
      if (searchValue.trim()) params.set('search', searchValue.trim());

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/leagues?${params}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (requestId !== requestIdRef.current || !data.success) return;

      setLeagues(prev => (offset === 0 ? data.leagues : [...prev, ...data.leagues]));
      setHasMoreLeagues(data.hasMore);
      setLeaguesOffset(offset + data.leagues.length);
    } catch (err) {
      console.error('Ошибка загрузки списка лиг:', err);
    } finally {
      if (requestId === requestIdRef.current) setIsLeaguesLoading(false);
    }
  }, []);

  // Первая загрузка и перезагрузка при смене области
  useEffect(() => {
    setLeagues([]);
    setLeaguesOffset(0);
    loadLeagues(0, '', scope);
  }, [scope, loadLeagues]);

  // Поиск с задержкой: без неё каждая буква уходила бы отдельным запросом
  useEffect(() => {
    if (openSheet !== 'league') return;

    const timer = setTimeout(() => {
      setLeagues([]);
      setLeaguesOffset(0);
      loadLeagues(0, search, scope);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Сезоны и дивизионы выбранной лиги
  const loadStructure = useCallback(async (leagueId) => {
    setIsStructureLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournaments/leagues/${leagueId}/structure`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!data.success) return;

      setSeasons(data.seasons);
      // Сезон подставляем сам: активный, иначе самый свежий. Экономит тап, поменять можно.
      setSeason(data.seasons.find(s => s.isActive) || data.seasons[0] || null);
    } catch (err) {
      console.error('Ошибка загрузки сезонов лиги:', err);
    } finally {
      setIsStructureLoading(false);
    }
  }, []);

  const handleScopeSelect = (nextScope) => {
    setScope(nextScope);
    setLeague(null);
    setSeason(null);
    setSeasons([]);
    setSearch('');
    setOpenSheet(null);
  };

  const handleLeagueSelect = (nextLeague) => {
    setLeague(nextLeague);
    setSeason(null);
    setSeasons([]);
    setOpenSheet(null);
    loadStructure(nextLeague.id);
  };

  const handleDivisionSelect = (division) => {
    // Форма объекта повторяет ответ getTeamTournaments — на неё опирается вся остальная
    // страница и её шапка, менять её ради нового источника нельзя.
    onSelect({
      division_id: division.id,
      division_name: division.name,
      division_short_name: division.shortName,
      division_logo: division.logoUrl,
      league_name: league?.name || '',
      league_short_name: league?.short_name || '',
      season_id: season?.id || null,
      season_name: season?.name || ''
    });
  };

  // Подгрузка следующей порции при прокрутке к низу списка лиг
  const handleLeaguesScroll = (e) => {
    if (isLeaguesLoading || !hasMoreLeagues) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      loadLeagues(leaguesOffset, search, scope);
    }
  };

  const divisions = season ? (seasons.find(s => s.id === season.id)?.divisions || []) : [];

  return (
    <div className="flex flex-col h-full">

      {/* Строка фильтров. В ней лига показана КОРОТКИМ названием — строка узкая, и полное
          в неё не помещается. Полное с логотипом человек видит в шторке выбора. */}
      <div className="flex items-center gap-4 flex-wrap px-4 py-3 border-b border-surface-border shrink-0">
        <FilterButton
          label={scopeLabel}
          onClick={() => setOpenSheet('scope')}
          activeBrandColor={brandColor}
        />
        <FilterButton
          label={league ? (league.short_name || league.name) : 'Выбрать лигу'}
          onClick={() => setOpenSheet('league')}
          activeBrandColor={brandColor}
        />
        <FilterButton
          label={season ? season.name : 'Сезон'}
          disabled={!league || seasons.length === 0}
          onClick={() => setOpenSheet('season')}
          activeBrandColor={brandColor}
        />
      </div>

      {/* Результат: дивизионы и турниры выбранного сезона */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
        {isStructureLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !league ? (
          <div className="py-10 text-center text-[14px] font-bold text-content-subtle leading-relaxed px-4">
            Выберите лигу, чтобы увидеть её турниры и дивизионы
          </div>
        ) : divisions.length === 0 ? (
          <div className="py-10 text-center text-[14px] font-bold text-content-subtle leading-relaxed px-4">
            В этом сезоне нет опубликованных турниров
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {divisions.map((division) => {
              const isActive = activeDivisionId === division.id;
              return (
                <button
                  key={division.id}
                  onClick={() => handleDivisionSelect(division)}
                  className={clsx(
                    "flex items-center gap-4 p-3 rounded-3xl border transition-all text-left outline-none active:scale-95",
                    isActive
                      ? "bg-brand-opacity border-brand"
                      : "bg-surface-level1 border-surface-border hover:border-brand/30"
                  )}
                  /* Безопасное инлайн-наложение Hex-кодов прозрачности для активного элемента списка */
                  style={isActive && hasTeamColor ? {
                    backgroundColor: `${activeBrandColor}1a`,
                    borderColor: activeBrandColor
                  } : {}}
                >
                  <div className="w-10 h-10 shrink-0 overflow-hidden">
                    <img src={getImageUrl(division.logoUrl)} className="w-full h-full object-contain" alt="" />
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-black uppercase tracking-wide text-content-main">
                      {league.short_name || league.name}
                    </span>
                    <h4 className="text-[14px] font-semibold text-content-muted truncate leading-tight">
                      {division.shortName || division.name}
                    </h4>
                    <span className="text-[14px] font-bold text-content-muted mt-1">
                      {[
                        season?.name,
                        division.isTournament ? 'Турнир' : null,
                        division.isMine ? 'моя команда' : null
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>

                  {isActive && (
                    <Icon name="check" className="w-5 h-5 text-brand"
                          style={hasTeamColor ? { color: activeBrandColor } : {}} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Шторка: область поиска ───────────────────────────────────────── */}
      <BottomSheet isOpen={openSheet === 'scope'} onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-black tracking-widest text-content-main uppercase">Область поиска</h3>

          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide">
            <OptionRow
              title="Все лиги"
              subtitle="Любой турнир на платформе"
              checked={scope.type === 'all'}
              onClick={() => handleScopeSelect({ type: 'all' })}
              activeBrandColor={brandColor}
            />

            {hasTeams && (
              <OptionRow
                title="Мои лиги"
                subtitle="Только там, где заявлены мои команды"
                checked={scope.type === 'my'}
                onClick={() => handleScopeSelect({ type: 'my' })}
                activeBrandColor={brandColor}
              />
            )}

            {teams.map(team => (
              <OptionRow
                key={team.id}
                title={team.name}
                subtitle="Лиги одной команды"
                logoUrl={team.logo_url}
                showLogo
                checked={scope.type === 'team' && scope.teamId === team.id}
                onClick={() => handleScopeSelect({ type: 'team', teamId: team.id })}
                activeBrandColor={brandColor}
              />
            ))}
          </div>
        </div>
      </BottomSheet>

      {/* ── Шторка: лига. Здесь полное название и логотип ────────────────── */}
      <BottomSheet isOpen={openSheet === 'league'} onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-black tracking-widest text-content-main uppercase">Лига</h3>

          {/* Поиск нужен, только когда лиг много: в режиме своих команд их одна-две */}
          {scope.type === 'all' && (
            <TextInputLP
              label=""
              value={search}
              onChange={setSearch}
              placeholder="Название, аббревиатура или город"
            />
          )}

          <div
            className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide"
            onScroll={handleLeaguesScroll}
          >
            {leagues.map(item => (
              <OptionRow
                key={item.id}
                title={item.name}
                subtitle={[item.short_name, item.city].filter(Boolean).join(' · ')}
                logoUrl={item.logo_url}
                showLogo
                checked={league?.id === item.id}
                onClick={() => handleLeagueSelect(item)}
                activeBrandColor={brandColor}
              />
            ))}

            {isLeaguesLoading && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!isLeaguesLoading && leagues.length === 0 && (
              <p className="text-[13px] font-semibold text-content-muted leading-relaxed text-center py-6">
                {search.trim() ? 'По этому запросу лиг не нашлось.' : 'Здесь пока нет ни одной лиги.'}
              </p>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* ── Шторка: сезон ────────────────────────────────────────────────── */}
      <BottomSheet isOpen={openSheet === 'season'} onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-black tracking-widest text-content-main uppercase">Сезон</h3>

          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide">
            {seasons.map(item => (
              <OptionRow
                key={item.id}
                title={item.name}
                subtitle={[
                  item.isActive ? 'текущий' : null,
                  `${item.divisions.length} ${item.divisions.length === 1 ? 'турнир' : 'турниров'}`
                ].filter(Boolean).join(' · ')}
                checked={season?.id === item.id}
                onClick={() => { setSeason(item); setOpenSheet(null); }}
                activeBrandColor={brandColor}
              />
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
