import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { getImageUrl, getAuthHeaders, uiFixed } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { PageLoader } from '../../ui/Loader';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { HintPopover } from '../../ui/HintPopover';

const GRIP_LABELS = { left: 'Левый', right: 'Правый' };

const calcAge = (birthDate) => {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
};

// Склонение «год/года/лет»: 1,21,31... → год; 2-4,22-24... → года; остальное
// (в т.ч. 11-14) → лет.
const formatYears = (n) => {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} лет`;
  if (mod10 === 1) return `${n} год`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} года`;
  return `${n} лет`;
};

// Одна цифра статистики — компактный тайл вместо строки таблицы (на 80%
// мобильного экрана широкая таблица со скроллом читается гораздо хуже).
// compact — уменьшенная версия для строки возраст/рост/вес под шапкой, где
// полноразмерные тайлы статистики занимали слишком много места.
// hideLabel — для строки возраст/рост/вес значения самодостаточны (25 лет,
// 180 см), подпись под ними только отнимала место.
const StatTile = ({ label, value, compact, hideLabel }) => (
  <div className={clsx("flex flex-col items-center justify-center bg-surface-level2 rounded-xl", compact ? "py-1.5" : "py-1.5")}>
    <span className={clsx("font-bold text-content-main tabular-nums leading-tight", compact ? "text-[10px]" : "text-[16px]")}>{value ?? '—'}</span>
    {!hideLabel && (
      <span className="text-[10px] font-mibold uppercase tracking-wider text-content-subtle mt-1.5 leading-none">{label}</span>
    )}
  </div>
);

// Всплывающая карточка команды (клик по короткому названию/лого) — крупный
// логотип, полное название, город.
const TeamPopoverContent = ({ row }) => (
  <div className="flex flex-col items-center text-center">
    {row.team_logo && (
      <img src={getImageUrl(row.team_logo)} alt="" className="w-12 h-12 object-contain" />
    )}
    <div className="text-[14px] font-bold text-content-main leading-tight mt-2">{row.team_full_name || row.team_name}</div>
    {row.team_city && <div className="text-[12px] text-content-muted">{row.team_city}</div>}
  </div>
);

// Одна строка сезона — без собственного контейнера/тени, отделяется от
// соседних строк горизонтальной линией (как в TeamStatsPanel.jsx: единая
// карточка-группа с разделителями внутри, а не стопка отдельных карточек).
const SeasonRow = ({ row, isGoalie, isLast }) => {
  const tiles = isGoalie
    ? [
        { label: 'Игры', value: row.gp },
        { label: 'Штраф', value: row.pim },
        { label: 'ПШ', value: row.ga },
        { label: 'Об', value: row.sv },
        { label: '%Об', value: row.svp != null ? `${row.svp}%` : null, span: 2 },
      ]
    : [
        { label: 'Игры', value: row.gp },
        { label: 'Шайбы', value: row.g },
        { label: 'Передачи', value: row.a },
        { label: 'Очки', value: row.pts },
        { label: '+/-', value: row.pm > 0 ? `+${row.pm}` : row.pm },
        { label: 'Штраф', value: row.pim },
      ];

  // Поповер с полным названием лиги/турнира не нужен, если короткое и полное
  // названия совпадают — показывать одно и то же во всплывашке бессмысленно.
  const showLeaguePopover = !!row.league_full_name && row.league_full_name !== row.league_name;

  return (
    <div className={clsx("flex flex-col gap-2 py-3", !isLast && "border-b border-surface-border")}>
      {/* Строка 1: «Сезон {название}» слева, короткое название команды + лого справа */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand truncate">
          Сезон {row.season_name || '—'}
        </span>
        {(row.team_short_name || row.team_name) && (
          <HintPopover customContent={<TeamPopoverContent row={row} />} className="shrink-0 ">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-content-main truncate max-w-[110px]">
                {row.team_short_name || row.team_name}
              </span>
              {row.team_logo && (
                <img src={getImageUrl(row.team_logo)} alt="" className="w-5 h-5 object-contain shrink-0" />
              )}
            </div>
          </HintPopover>
        )}
      </div>

      {/* Строка 2: лого дивизиона слева, короткое название лиги + дивизион справа от него */}
      <div className="flex items-center gap-4 min-w-0">
        {row.division_logo && (
          <img src={getImageUrl(row.division_logo)} alt="" className="w-10 h-10 rounded-xl p-0.5 bg-surface-level2 object-contain shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {showLeaguePopover ? (
            <HintPopover customContent={<div className="text-[14px] font-bold text-content-main text-center">{row.league_full_name}</div>}>
              <div className="text-[16px] font-semibold text-content-main truncate">{row.league_name}</div>
            </HintPopover>
          ) : (
            <div className="text-[16px] font-semibold text-content-main truncate">{row.league_name}</div>
          )}
          {row.division_name && (
            <div className="text-[12px] font-normal text-content-muted truncate -mt-1.5">{row.division_name}</div>
          )}
        </div>
      </div>

      {/* Максимум 3 тайла в ряд — при 5 параметрах у вратаря (grid-cols-5) всё
          сжималось в кашу на узкой панели, поэтому всегда grid-cols-3 (вратарь
          переносится 3+2). */}
      <div className="grid grid-cols-3 gap-1.5 mt-1">
        {tiles.map(t => (
          <div key={t.label} className={t.span === 2 ? 'col-span-2' : undefined}>
            <StatTile label={t.label} value={t.value} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Заголовок группы внутри самой карточки (шапка с разделителем), а не
// отдельной плашкой над ней — тот же приём, что и в TeamStatsPanel.jsx. Фон
// панели сам по себе surface-level2 (наследуется от TeamLayout), поэтому
// карточка — surface-level1, иначе она сливается с фоном и становится невидимой.
const SeasonGroup = ({ title, rows, isGoalie }) => (
  <div className="bg-surface-level1 rounded-xl p-4 shadow-md flex flex-col">
    <div className="pb-2 px-1 border-b border-surface-border">
      <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle">{title}</span>
    </div>
    {rows.length === 0 ? (
      <div className="text-center text-[12px] font-bold uppercase tracking-widest text-content-subtle py-6">
        Нет данных
      </div>
    ) : (
      rows.map((row, i) => <SeasonRow key={i} row={row} isGoalie={isGoalie} isLast={i === rows.length - 1} />)
    )}
  </div>
);

// data: { playerId, activeBrandColor?, hasTeamColor?, hideBioTiles? } — передаётся
// через openRightPanel/pushRightPanel('playerProfile', data, 'Профиль игрока').
// hideBioTiles — скрывает блок возраст/рост/вес/хват: используется при переходе
// из «Участника команды» (UserDetails.jsx), где эти же данные уже показаны.
export function PlayerProfilePanel({ data }) {
  const { playerId, activeBrandColor, hasTeamColor, hideBioTiles } = data || {};

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [role, setRole] = useState('skater'); // 'skater' | 'goalie'

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/players/${playerId}/profile`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          const hasSkater = json.stats.some(s => s.position !== 'goalie');
          const hasGoalie = json.stats.some(s => s.position === 'goalie');
          setRole(hasGoalie && !hasSkater ? 'goalie' : 'skater');
          setProfile(json);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [playerId]);

  // «Основная» команда для порядка фото — из текущего сезона (is_current),
  // если таких несколько — та, где сыграно больше игр (gp).
  const primaryTeamId = useMemo(() => {
    if (!profile) return null;
    const currentRows = profile.stats.filter(s => s.is_current && s.team_id != null);
    if (currentRows.length === 0) return null;
    return currentRows.reduce((best, row) =>
      (row.gp || 0) > (best.gp || 0) ? row : best
    ).team_id;
  }, [profile]);

  // Фото основной команды — первым (photoIndex стартует с 0), остальные
  // командные фото — следом, обычный аватар — в конец как запасной вариант.
  const allPhotos = useMemo(() => {
    if (!profile) return [];
    const teamPhotos = [];
    const seen = new Set();
    (profile.info.team_photos || []).forEach(p => {
      if (p.url && !seen.has(p.url)) {
        teamPhotos.push({ url: p.url, type: 'team', teamLogo: p.teamLogo, teamId: p.teamId });
        seen.add(p.url);
      }
    });
    teamPhotos.sort((a, b) => {
      const aIsPrimary = primaryTeamId != null && a.teamId === primaryTeamId;
      const bIsPrimary = primaryTeamId != null && b.teamId === primaryTeamId;
      return (bIsPrimary ? 1 : 0) - (aIsPrimary ? 1 : 0);
    });
    const photos = [...teamPhotos];
    if (profile.info.avatar_url && !seen.has(profile.info.avatar_url)) {
      photos.push({ url: profile.info.avatar_url, type: 'avatar' });
      seen.add(profile.info.avatar_url);
    }
    return photos;
  }, [profile, primaryTeamId]);

  if (loading) return <PageLoader />;

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full text-content-subtle text-[12px] font-bold uppercase tracking-widest px-6 text-center">
        Не удалось загрузить профиль игрока
      </div>
    );
  }

  const { info } = profile;
  const isGoalie = role === 'goalie';
  const hasSkaterStats = profile.stats.some(s => s.position !== 'goalie');
  const hasGoalieStats = profile.stats.some(s => s.position === 'goalie');

  const filteredStats = profile.stats.filter(s => isGoalie ? s.position === 'goalie' : s.position !== 'goalie');
  const currentStats = filteredStats.filter(s => s.is_current);
  const pastStats = filteredStats.filter(s => !s.is_current);

  // Единая сетка 3+3: первая строка — возраст/дата рождения (третья ячейка
  // пустая, чтобы тайлы были прижаты влево и выровнены по колонкам со второй
  // строкой), вторая строка — рост/вес/хват.
  const ageRowTiles = [
    calcAge(info.birth_date) != null && { label: 'Возраст', value: formatYears(calcAge(info.birth_date)) },
    info.birth_date && { label: 'Дата рожд.', value: new Date(info.birth_date).toLocaleDateString('ru-RU') },
  ].filter(Boolean);
  const bodyRowTiles = [
    info.height && { label: 'Рост', value: `${info.height} см` },
    info.weight && { label: 'Вес', value: `${info.weight} кг` },
    GRIP_LABELS[info.grip] && { label: 'Хват', value: GRIP_LABELS[info.grip] },
  ].filter(Boolean);
  const ageRowPadded = ageRowTiles.length > 0 && ageRowTiles.length < 3
    ? [...ageRowTiles, ...Array(3 - ageRowTiles.length).fill(null)]
    : ageRowTiles;
  const infoGridTiles = [...ageRowPadded, ...bodyRowTiles];

  return (
    <div
      className="flex flex-col h-full overflow-y-auto scrollbar-hide"
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
    >
      {/* ШАПКА */}
      <div className="p-4 flex flex-col gap-3 shrink-0">
        {/* КАРТОЧКА ШАПКИ ИГРОКА — тот же вид, что и в TeamStatsPanel.jsx/UserDetails.jsx,
            но с сохранённой каруселью фото (клик по фото листает allPhotos) и
            бейджем лого команды поверх текущего фото. */}
        <div className="flex items-center gap-4 p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm">
          <div
            className={clsx(
              "relative shrink-0 rounded-3xl bg-surface-base border border-surface-border p-0.5 shadow-sm overflow-hidden",
              allPhotos.length > 1 && "cursor-pointer active:scale-95 transition-transform"
            )}
            style={{ width: uiFixed(80), height: uiFixed(80) }}
            onClick={() => allPhotos.length > 1 && setPhotoIndex(p => (p + 1) % allPhotos.length)}
          >
            <Avatar
              photoUrl={allPhotos[photoIndex]?.url || info.avatar_url}
              firstName={info.first_name}
              lastName={info.last_name}
              className="w-full h-full rounded-3xl"
              fallbackClassName="bg-surface-level1 text-content-muted"
            />
            {allPhotos[photoIndex]?.type === 'team' && allPhotos[photoIndex]?.teamLogo && (
              <div className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-surface-base shadow-sm flex items-center justify-center p-0.5">
                <img src={getImageUrl(allPhotos[photoIndex].teamLogo)} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            {allPhotos.length > 1 && (
              <div className="absolute top-1 right-1 bg-black/40 text-white text-[10px] font-bold px-1 py-0.5 rounded">
                {photoIndex + 1}/{allPhotos.length}
              </div>
            )}
          </div>
          <div className="flex flex-col text-left flex-1 min-w-0">
            <h2 className="font-bold text-content-main uppercase whitespace-nowrap leading-tight" style={{ fontSize: uiFixed(16) }}>{info.last_name}</h2>
            <h3 className="text-[12px] font-bold text-content-muted mt-0.5 capitalize">{info.first_name}</h3>
            {info.middle_name && <h4 className="text-[12px] font-medium text-content-muted truncate opacity-60">{info.middle_name}</h4>}
          </div>
        </div>

        {!hideBioTiles && infoGridTiles.length > 0 && (
          <div className="bg-surface-level1 rounded-2xl p-3 shadow-md">
            <div className="grid grid-cols-3 gap-1.5">
              {infoGridTiles.map((t, i) => t
                ? <StatTile key={t.label} label={t.label} value={t.value} compact hideLabel />
                : <div key={`empty-${i}`} />
              )}
            </div>
          </div>
        )}

        {hasSkaterStats && hasGoalieStats && (
          <SegmentedControl
            options={[{ value: 'skater', label: 'Полевой' }, { value: 'goalie', label: 'Вратарь' }]}
            value={role}
            onChange={setRole}
            activeColor={activeBrandColor}
          />
        )}
      </div>

      {/* СОДЕРЖИМОЕ */}
      <div className="flex-1 px-4 pb-6">
        <div className="flex flex-col gap-4">
          <SeasonGroup title="Текущие сезоны" rows={currentStats} isGoalie={isGoalie} />
          <SeasonGroup title="Прошедшие сезоны" rows={pastStats} isGoalie={isGoalie} />
        </div>
      </div>
    </div>
  );
}
