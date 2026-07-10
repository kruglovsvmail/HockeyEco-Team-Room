import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { getImageUrl, getAuthHeaders } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { PageLoader } from '../../ui/Loader';
import { SegmentedControl } from '../../ui/SegmentedControl';

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
  <div className={clsx("flex flex-col items-center justify-center bg-surface-level2 rounded-xl", compact ? "py-1.5" : "py-2")}>
    <span className={clsx("font-bold text-content-main tabular-nums leading-tight", compact ? "text-[10px]" : "text-[14px]")}>{value ?? '—'}</span>
    {!hideLabel && (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-content-subtle mt-0.5 leading-none">{label}</span>
    )}
  </div>
);

// Карточка одного сезона — вместо строки широкой таблицы (замена таблицам из
// LMS, которые физически не влезают в узкую панель).
const SeasonCard = ({ row, isGoalie }) => {
  const tiles = isGoalie
    ? [
        { label: 'И', value: row.gp },
        { label: 'Штр', value: row.pim },
        { label: 'ПШ', value: row.ga },
        { label: 'Об', value: row.sv },
        { label: '%Об', value: row.svp != null ? `${row.svp}%` : null },
      ]
    : [
        { label: 'И', value: row.gp },
        { label: 'Ш', value: row.g },
        { label: 'П', value: row.a },
        { label: 'О', value: row.pts },
        { label: '+/-', value: row.pm > 0 ? `+${row.pm}` : row.pm },
        { label: 'Штр', value: row.pim },
      ];

  return (
    <div className="bg-surface-level1 rounded-2xl p-3 shadow-md flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand truncate">{row.season_name || '—'}</span>
        {row.qual_name && (
          <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-brand/10 text-brand">
            {row.qual_name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {row.team_logo && (
          <img src={getImageUrl(row.team_logo)} alt="" className="w-7 h-7 rounded-full bg-surface-base object-contain shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-content-main truncate">{row.team_name}</div>
          <div className="text-[10px] text-content-muted truncate">
            {row.league_name}{row.division_name ? ` · ${row.division_name}` : ''}
          </div>
        </div>
      </div>
      {/* Максимум 3 тайла в ряд — при 5 параметрах у вратаря (grid-cols-5) всё
          сжималось в кашу на узкой панели, поэтому всегда grid-cols-3 (вратарь
          переносится 3+2). */}
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map(t => <StatTile key={t.label} label={t.label} value={t.value} />)}
      </div>
    </div>
  );
};

const SeasonGroup = ({ title, rows, isGoalie }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-content-subtle mb-2 px-1">{title}</div>
    {rows.length === 0 ? (
      <div className="text-center text-[11px] font-bold uppercase tracking-widest text-content-subtle py-6 bg-surface-level1 rounded-2xl border border-dashed border-surface-border">
        Нет данных
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => <SeasonCard key={i} row={row} isGoalie={isGoalie} />)}
      </div>
    )}
  </div>
);

// data: { playerId, activeBrandColor?, hasTeamColor? } — передаётся через
// openRightPanel('playerProfile', data, 'Профиль игрока') из TeamLayout.jsx.
export function PlayerProfilePanel({ data }) {
  const { playerId, activeBrandColor, hasTeamColor } = data || {};

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
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              "relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden shadow-md bg-surface-level1",
              allPhotos.length > 1 && "cursor-pointer active:scale-95 transition-transform"
            )}
            onClick={() => allPhotos.length > 1 && setPhotoIndex(p => (p + 1) % allPhotos.length)}
          >
            <Avatar
              photoUrl={allPhotos[photoIndex]?.url || info.avatar_url}
              firstName={info.first_name}
              lastName={info.last_name}
              className="w-full h-full rounded-2xl"
              fallbackClassName="bg-surface-level1 text-content-muted"
            />
            {allPhotos[photoIndex]?.type === 'team' && allPhotos[photoIndex]?.teamLogo && (
              <div className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-surface-base shadow-sm flex items-center justify-center p-0.5">
                <img src={getImageUrl(allPhotos[photoIndex].teamLogo)} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            {allPhotos.length > 1 && (
              <div className="absolute top-1 right-1 bg-black/40 text-white text-[8px] font-bold px-1 py-0.5 rounded">
                {photoIndex + 1}/{allPhotos.length}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-black text-content-main uppercase truncate leading-tight">{info.last_name}</div>
            <div className="text-[16px] font-black text-content-main uppercase truncate leading-tight">{info.first_name}</div>
            {info.middle_name && <div className="text-[14px] text-content-muted truncate mt-0.5">{info.middle_name}</div>}
          </div>
        </div>

        {infoGridTiles.length > 0 && (
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
