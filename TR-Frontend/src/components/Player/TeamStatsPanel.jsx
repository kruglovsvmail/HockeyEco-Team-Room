import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl, uiFixed } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { PageLoader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { BottomSheet } from '../../ui/BottomSheet';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { HintPopover } from '../../ui/HintPopover';

// Кольцевая диаграмма процента посещений: серый фон-трек (пропущенные) +
// дуга цветом бренда (посещённые). При включённом командном цвете дуга
// красится в него через CSS-переменную --color-brand на корне панели.
const AttendanceRing = ({ percent, size = 68, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.max(0, Math.min(100, percent ?? 0));
  const dash = (safePercent / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-content-subtle)" strokeWidth={strokeWidth} opacity={0.3} />
        {percent != null && percent > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[14px] font-black text-content-main tabular-nums">
          {percent != null ? `${percent}%` : '—'}
        </span>
      </div>
    </div>
  );
};

// Карточка «Всего / Посетил» + кольцо, с заголовком блока прямо внутри карточки
// (а не отдельной плашкой над ней) — общий вид для тренировок и матчей.
// action — необязательный элемент справа в шапке (например, кнопка фильтра).
// children — необязательный доп. контент под строкой посещения, в той же
// карточке (используется для «Результата матчей», чтобы не городить отдельный блок).
const AttendanceCard = ({ title, action, total, attended, percent, children }) => (
  <div className="bg-surface-level1 rounded-2xl p-4 shadow-md flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-border">
      <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle">{title}</span>
      {action}
    </div>
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-2">
        <div className="text-[14px] font-bold text-content-main">
          Всего: <span className="text-content-muted font-black">{total}</span>
        </div>
        <div className="text-[14px] font-bold text-content-main">
          Посетил: <span className="text-content-muted font-black">{attended}</span>
        </div>
      </div>
      <AttendanceRing percent={percent} />
    </div>
    {children}
  </div>
);

// Одна колонка «ПОБЕДЫ / НИЧЬИ / ПОРАЖЕНИЯ»: подпись, крупное число, пилюля с %.
// Фон пилюли — не через bg-brand/10 (Tailwind-модификатор альфа-канала не
// применяется к цвету на основе CSS-переменной с hex-значением), а отдельным
// слоем на opacity: заливка непрозрачная, но сам слой полупрозрачный, текст —
// поверх него, отдельным элементом с полной непрозрачностью.
const ResultStat = ({ label, value, percent }) => (
  <div className="flex flex-col items-center gap-1.5 flex-1">
    <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle">{label}</span>
    <span className="text-[28px] font-bold text-content-main leading-none tabular-nums">{value}</span>
    <span className="relative inline-flex items-center justify-center rounded-full px-3 py-1 overflow-hidden">
      <span className="absolute inset-0 bg-brand opacity-10 rounded-full" />
      <span className="relative text-[12px] font-black text-brand tabular-nums">
        {percent != null ? `${percent}%` : '—'}
      </span>
    </span>
  </div>
);

// Одна цифра боксскора — тот же компактный тайл, что и в «Статистике в турнирах»
// (PlayerProfilePanel.jsx). Короткой подписи под числом на узкой панели не хватает,
// поэтому тап по тайлу открывает подсказку с полным названием и описанием показателя.
// display/width задаём инлайн-стилем: inline-block самого HintPopover иначе ломает
// ячейку сетки, а h-full внутри выравнивает тайлы одной строки по высоте.
const StatTile = ({ label, value, title, hint }) => (
  <HintPopover
    style={{ display: 'block', width: '100%' }}
    customContent={
      <div className="flex flex-col gap-1.5 text-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-brand">{title}</span>
        <span className="text-[12px] font-semibold text-content-main leading-snug whitespace-normal break-words">{hint}</span>
      </div>
    }
  >
    <div className="flex flex-col items-center justify-center h-full bg-surface-level2 rounded-xl py-1.5 px-1">
      <span className="text-[16px] font-bold tabular-nums leading-tight text-content-main">{value ?? '—'}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-content-subtle mt-1.5 leading-tight text-center">{label}</span>
    </div>
  </HintPopover>
);

// Подпись раздела внутри карточки «Матчи» — тот же вид, что и у заголовка самой
// карточки, но без разделительной линии над текстом (её рисует контейнер).
const SectionLabel = ({ children }) => (
  <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle">{children}</span>
);

// Послематчевые буллиты: два тайла слева, кольцевая диаграмма процента справа —
// та же раскладка, что и у строки посещаемости в шапке карточки. Кольцо тоже
// кликабельно и объясняет, что именно за процент показан.
const ShootoutRow = ({ attempts, made, percent, percentTitle, percentHint }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-0">
      <StatTile label={attempts.label} value={attempts.value} title={attempts.title} hint={attempts.hint} />
      <StatTile label={made.label} value={made.value} title={made.title} hint={made.hint} />
    </div>
    <HintPopover
      className="shrink-0"
      customContent={
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand">{percentTitle}</span>
          <span className="text-[12px] font-semibold text-content-main leading-snug whitespace-normal break-words">{percentHint}</span>
        </div>
      }
    >
      <AttendanceRing percent={percent} />
    </HintPopover>
  </div>
);

// Полный боксскор полевого игрока. Порядок тайлов — сетка 3×3, ровно как их
// перечислил пользователь. Значения уже просуммированы по текущему фильтру матчей.
const buildSkaterTiles = (s) => [
  { label: 'Шайбы', value: s.goals, title: 'Заброшенные шайбы',
    hint: 'Голы, заброшенные игроком в основное время и овертайме.' },
  { label: 'Передачи', value: s.assists, title: 'Голевые передачи',
    hint: 'Первые и вторые результативные передачи суммарно, без деления на первую и вторую.' },
  { label: 'Очки', value: s.points, title: 'Очки (гол + пас)',
    hint: 'Сумма заброшенных шайб и голевых передач.' },
  { label: 'Плюс', value: s.plusCount, title: 'Показатель «плюс»',
    hint: 'Сколько раз игрок был на льду в момент, когда шайбу забрасывала его команда.' },
  { label: 'Минус', value: s.minusCount, title: 'Показатель «минус»',
    hint: 'Сколько раз игрок был на льду в момент, когда шайбу забрасывал соперник.' },
  { label: '+/-', value: s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus, title: 'Показатель полезности',
    hint: 'Разница между показателями «плюс» и «минус». Чем выше, тем полезнее игрок был на льду.' },
  { label: 'Поб. Ш', value: s.goalsGw, title: 'Победные шайбы',
    hint: 'Количество победных заброшенных шайб игроком.' },
  { label: 'Штраф', value: s.pim, title: 'Штрафные минуты',
    hint: 'Суммарное штрафное время игрока в минутах за все матчи выборки.' },
  { label: 'ППУ', value: s.gaOnPenalty, title: 'Пропущено при его удалении',
    hint: 'Сколько шайб пропустила команда в большинстве соперника, пока игрок сидел на скамейке штрафников.' },
];

// Полный боксскор вратаря. Сетка 3×2 — броски/отражено/процент, затем
// пропущено/сухие матчи/штраф.
const buildGoalieTiles = (s) => [
  { label: 'Броски', value: s.shotsAgainst, title: 'Броски в створ',
    hint: 'Все броски в створ ворот, нанесённые по вратарю, включая те, что стали голами.' },
  { label: 'ОБ', value: s.saves, title: 'Отражённые броски (сейвы)',
    hint: 'Броски в створ, которые вратарь отразил.' },
  { label: '%ОБ', value: s.savePercent != null ? `${s.savePercent}%` : null, title: 'Процент отражённых бросков',
    hint: 'Доля отражённых бросков от всех бросков в створ ворот вратаря.' },
  { label: 'ПШ', value: s.goalsAgainst, title: 'Пропущенные шайбы',
    hint: 'Шайбы, заброшенные в ворота, пока вратарь стоял в них. Голы с назначенного по ходу матча буллита вратарю не записываются.' },
  { label: 'И"0"', value: s.shutouts, title: 'Игры «на ноль» (сухие матчи)',
    hint: 'Матчи, в которых вратарь единственным отстоял всю игру за свою команду, не пропустил ни одной шайбы и команда не проиграла.' },
  { label: 'Штраф', value: s.pim, title: 'Штрафные минуты',
    hint: 'Суммарное штрафное время вратаря в минутах за все матчи выборки.' },
];

// Плавная кривая через точки (симметричные кубические Безье вместо прямых
// отрезков) — тот же приём, что дают графики "формы" в спортивных приложениях:
// плато на высоте каждой точки, гладкий S-переход к следующей.
const buildSmoothPath = (points) => {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) / 2;
    d += ` C ${p0.x + dx} ${p0.y}, ${p1.x - dx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
};

// График последних (до 8) матчей: точка — матч, высота/цвет — исход
// (победа — зелёная сверху, поражение — оранжевая снизу, ничья — серая по
// центру). Клик по точке показывает соперника и счёт во всплывающей карточке.
//
// Линия/заливка рисуются в SVG (виду не важна ровность формы при растяжении),
// а сами точки — обычными HTML-кружками поверх, спозиционированными в %:
// так они остаются идеально круглыми при любом соотношении сторон контейнера
// (SVG-circle через preserveAspectRatio="none" растягивался бы в эллипс).
const MatchResultsChart = ({ games }) => {
  const [activeIdx, setActiveIdx] = useState(null);

  // recentGames с бэка идут от новых к старым — разворачиваем, чтобы график
  // читался слева направо от старых матчей к новым.
  const ordered = [...(games || [])].reverse();
  const width = 200, height = 60, marginX = 14, topY = 14, midY = 30, botY = 46;
  const step = ordered.length > 1 ? (width - marginX * 2) / (ordered.length - 1) : 0;

  const points = ordered.map((g, idx) => {
    const x = ordered.length === 1 ? width / 2 : marginX + idx * step;
    let y = midY, color = '#9ca3af';
    if (g.myScore > g.oppScore) { y = topY; color = 'var(--color-success)'; }
    else if (g.myScore < g.oppScore) { y = botY; color = 'var(--color-danger)'; }
    return { ...g, x, y, color };
  });

  const pathD = buildSmoothPath(points);
  const areaD = pathD ? `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z` : '';
  const active = activeIdx != null ? points[activeIdx] : null;

  if (points.length === 0) {
    return (
      <div className="text-center text-[10px] font-bold uppercase tracking-widest text-content-subtle py-6 bg-surface-level1 rounded-2xl border border-dashed border-surface-border">
        Нет данных
      </div>
    );
  }

  // h-* на контейнере — единственная ручка высоты графика: SVG растягивается по нему
  // (preserveAspectRatio="none"), а точки спозиционированы в % от той же области,
  // поэтому координаты viewBox (height/topY/midY/botY) трогать не нужно — размах точек
  // «победа/ничья/поражение» ужимается пропорционально сам.
  return (
    <div className="relative -mx-6 h-16 mb-4">
      {/* Слой кривой/заливки — обрезается по скруглению карточки */}
      <div className="absolute inset-x-3 inset-y-0 rounded-xl overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="matchResultsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.3" />
              <stop offset="90%" stopColor="var(--color-brand)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {areaD && <path d={areaD} fill="url(#matchResultsFill)" stroke="none" />}
          {pathD && (
            <path d={pathD} fill="none" stroke="var(--color-content-subtle)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="opacity-50" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>

      {/* Точки (HTML-кружки, всегда идеально круглые) и тултип — поверх, без
          обрезки, чтобы тултип мог всплывать за пределы карточки. Позиционируются
          в % от той же области (inset-x-3/inset-y-0), что и SVG выше, поэтому совпадают. */}
      <div className="absolute inset-x-3 inset-y-0">
        {points.map((p, i) => (
          <button
            key={p.gameId}
            type="button"
            onClick={() => setActiveIdx(activeIdx === i ? null : i)}
            className="absolute rounded-full border-2 border-surface-base shadow-sm -translate-x-1/2 -translate-y-1/2 transition-transform outline-none cursor-pointer"
            style={{
              left: `${(p.x / width) * 100}%`,
              top: `${(p.y / height) * 100}%`,
              width: activeIdx === i ? 14 : 10,
              height: activeIdx === i ? 14 : 10,
              backgroundColor: p.color
            }}
          />
        ))}

        {active && (
          <div
            className="absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] bg-surface-base border border-surface-border rounded-xl px-3 py-1.5 shadow-lg text-center pointer-events-none z-10 whitespace-nowrap"
            style={{ left: `${(active.x / width) * 100}%`, top: `${(active.y / height) * 100}%` }}
          >
            <div className="text-[10px] font-bold uppercase text-content-muted tracking-wide truncate max-w-[140px]">
              {active.opponentName || 'Соперник'}
            </div>
            <div className="text-[14px] font-black text-content-main">{active.myScore}:{active.oppScore}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const FILTER_FRIENDLY = 'friendly';

// Ключ фильтра для конкретного матча — тот же формат, что и у пунктов списка
// в шторке выбора, чтобы сравнивать напрямую. Внешние турниры в этом приложении
// без деления на дивизионы (плоский список), в отличие от официальных лиг.
const matchFilterKey = (m) => {
  if (m.division) return `division:${m.division.id}`;
  if (m.externalTournament) return `ext:${m.externalTournament.id}`;
  return FILTER_FRIENDLY;
};

// Одна строка в шторке выбора фильтра — тот же визуальный шаблон, что и у
// выбора игроков в CreateApplicationPanel.jsx (Турниры/лиги → заявка на сезон,
// вкладка выбора состава): лого/иконка слева, две строки текста, чекбокс справа.
const FilterOptionRow = ({ icon, logo, line1, line2, checked, onToggle, activeBrandColor }) => (
  <div
    onClick={onToggle}
    className="w-full py-3 px-4 rounded-xl flex items-center gap-3 bg-surface-border cursor-pointer select-none active:scale-[0.995] transition-all"
  >
    {(icon || logo !== undefined) && (
      <div className="w-10 h-10 rounded-xl bg-surface-base p-0.5 flex items-center justify-center overflow-hidden shrink-0">
        {logo ? (
          <img src={getImageUrl(logo)} alt="" className="w-full h-full object-contain" />
        ) : (
          <Icon name={icon} className="w-5 h-5 text-content-subtle" />
        )}
      </div>
    )}
    <div className="flex flex-col min-w-0 flex-1 text-left">
      <span className="text-[16px] font-bold text-content-main truncate">{line1}</span>
      {line2 && (
        <span className="text-[12px] text-content-muted uppercase font-bold tracking-wider mt-0.5 truncate">{line2}</span>
      )}
    </div>
    <CheckboxLP checked={checked} onChange={onToggle} activeColor={activeBrandColor} />
  </div>
);

// data: { teamId, userId, activeBrandColor?, hasTeamColor? } — передаётся через
// pushRightPanel('teamStats', data, 'Статистика в команде') из UserDetails.jsx.
//
// Тренировки — отдельный блок. Матчи — второй блок (Посещение + Результаты),
// с одним общим фильтром на оба (Все / Товарищеские / конкретная лига-сезон-
// дивизион / конкретный внешний турнир). Бэкенд отдаёт ВСЕ матчи одним списком
// с тегами лиги/турнира (variant Б) — переключение фильтра считается на лету
// в браузере, без повторных запросов на сервер.
export function TeamStatsPanel({ data }) {
  const { teamId, userId, activeBrandColor, hasTeamColor } = data || {};

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  // Пустой набор = «Все матчи». Выбор одной или нескольких лиг/дивизионов/
  // турниров сужает фильтр до их объединения.
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!teamId || !userId) return;
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${userId}/team-stats`, {
      headers: getAuthHeaders()
    })
      .then(r => r.json())
      .then(json => { if (json.success) setStats(json); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId, userId]);

  // Плоский список пунктов фильтра (без группировки по заголовкам — тот же
  // стиль, что и в CreateApplicationPanel.jsx: одна строка = лого + два лейбла).
  // Для лиг: line1 — короткое название лиги, line2 — дивизион и сезон.
  // Для внешних турниров: line1 — название турнира, line2 — пометка «Внешний турнир».
  const filterOptions = useMemo(() => {
    if (!stats) return [];
    const seen = new Set();
    const options = [];
    stats.matches.forEach(m => {
      if (m.division) {
        const key = `division:${m.division.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        options.push({
          key,
          logo: m.division.logo,
          line1: m.division.leagueName || 'Лига',
          line2: [m.division.seasonName, m.division.name].filter(Boolean).join(' · ') || null
        });
      } else if (m.externalTournament) {
        const key = `ext:${m.externalTournament.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        options.push({
          key,
          logo: m.externalTournament.logo,
          line1: m.externalTournament.name || 'Внешний турнир',
          line2: 'Внешний турнир'
        });
      }
    });
    return options;
  }, [stats]);

  const hasFriendly = useMemo(
    () => stats?.matches.some(m => m.gameType === 'friendly_pwa' || m.gameType === 'friendly_ext') ?? false,
    [stats]
  );

  // Поиск в шторке фильтра нужен только когда пунктов реально много —
  // при 10 и меньше (не считая «Все матчи») прокрутить список глазами быстрее,
  // чем печатать запрос.
  const showFilterSearch = filterOptions.length + (hasFriendly ? 1 : 0) > 10;

  const currentFilterLabel = useMemo(() => {
    if (selectedKeys.size === 0) return 'Все матчи';
    if (selectedKeys.size === 1) {
      const key = [...selectedKeys][0];
      if (key === FILTER_FRIENDLY) return 'Товарищеские';
      const opt = filterOptions.find(o => o.key === key);
      return opt ? opt.line1 : 'Матчи';
    }
    return `Выбрано: ${selectedKeys.size}`;
  }, [selectedKeys, filterOptions]);

  const filteredMatches = useMemo(() => {
    if (!stats) return [];
    if (selectedKeys.size === 0) return stats.matches;
    return stats.matches.filter(m => selectedKeys.has(matchFilterKey(m)));
  }, [stats, selectedKeys]);

  const toggleFilterKey = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const games = useMemo(() => {
    const total = filteredMatches.length;
    const attended = filteredMatches.filter(m => m.attended).length;
    return { total, attended, percent: total > 0 ? Math.round((attended / total) * 100) : null };
  }, [filteredMatches]);

  const matchResults = useMemo(() => {
    const attendedMatches = filteredMatches.filter(m => m.attended);
    let wins = 0, draws = 0, losses = 0;
    attendedMatches.forEach(m => {
      if (m.myScore > m.oppScore) wins++;
      else if (m.myScore < m.oppScore) losses++;
      else draws++;
    });
    const total = attendedMatches.length;
    const pct = (n) => total > 0 ? Math.round((n / total) * 100) : null;
    return {
      total, wins, draws, losses,
      winPercent: pct(wins), drawPercent: pct(draws), lossPercent: pct(losses),
      // filteredMatches уже отсортированы бэкендом по убыванию даты — берём первые 8.
      recentGames: attendedMatches.slice(0, 8).map(m => ({
        gameId: m.gameId, myScore: m.myScore, oppScore: m.oppScore, opponentName: m.opponentName
      }))
    };
  }, [filteredMatches]);

  // Полный боксскор игрока — сумма построчной статистики (player_game_statistics)
  // по ТЕМ ЖЕ матчам, что сейчас в фильтре: переключил фильтр — цифры пересчитались
  // на месте, без похода на сервер. Матчи без строки боксскора (игрок не попал в
  // протокол, технический результат) в сумму не идут вовсе.
  const playerStats = useMemo(() => {
    const rows = filteredMatches.map(m => m.stats).filter(Boolean);
    const sum = (pick) => rows.reduce((acc, s) => acc + (pick(s) || 0), 0);
    const pct = (part, whole) => whole > 0 ? Math.round((part / whole) * 100) : null;

    const soAttempts = sum(s => s.soGoals + s.soMisses);
    const soGoals = sum(s => s.soGoals);
    const shotsAgainst = sum(s => s.goalieShotsAgainst);
    const saves = sum(s => s.goalieSaves);
    const goalieSoAgainst = sum(s => s.goalieSoAgainst);
    const goalieSoSaves = sum(s => s.goalieSoSaves);

    return {
      hasRows: rows.length > 0,
      // Полевые
      goals: sum(s => s.goals),
      assists: sum(s => s.assists),
      points: sum(s => s.points),
      plusCount: sum(s => s.plusCount),
      minusCount: sum(s => s.minusCount),
      plusMinus: sum(s => s.plusMinus),
      goalsGw: sum(s => s.goalsGw),
      gaOnPenalty: sum(s => s.gaOnPenalty),
      soAttempts, soGoals, soPercent: pct(soGoals, soAttempts),
      // Вратарские
      shotsAgainst, saves, savePercent: pct(saves, shotsAgainst),
      goalsAgainst: sum(s => s.goalieGoalsAgainst),
      shutouts: rows.filter(s => s.goalieShutout).length,
      goalieSoAgainst, goalieSoSaves, goalieSoPercent: pct(goalieSoSaves, goalieSoAgainst),
      // Общие
      pim: sum(s => s.pim),
    };
  }, [filteredMatches]);

  if (loading) return <PageLoader />;

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full text-content-subtle text-[12px] font-bold uppercase tracking-widest px-6 text-center">
        Не удалось загрузить статистику
      </div>
    );
  }

  const { info, training, matches } = stats;
  const hasAnyData = training.total > 0 || matches.length > 0;

  // Набор показателей выбирается по игровому амплуа участника в ЭТОЙ команде
  // (team_rosters.position), а не по фактическим строкам протокола: карточка
  // командная, и человек здесь ровно в одной роли.
  const isGoalie = info.position === 'goalie';
  const statTiles = isGoalie ? buildGoalieTiles(playerStats) : buildSkaterTiles(playerStats);
  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (label) => !searchLower || label.toLowerCase().includes(searchLower);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto scrollbar-hide p-4 gap-3"
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : undefined}
    >
      {/* КАРТОЧКА ШАПКИ ИГРОКА — тот же вид, что и в UserDetails.jsx, но без
          редактирования, статуса «в ростере» и капитанских нашивок. */}
      <div className="flex items-center gap-4 p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm">
        <div
          className="rounded-3xl bg-surface-base border border-surface-border p-0.5 shadow-sm flex items-center justify-center overflow-hidden shrink-0"
          style={{ width: uiFixed(80), height: uiFixed(80) }}
        >
          <Avatar photoUrl={info.avatar_url} firstName={info.first_name} lastName={info.last_name} className="w-full h-full rounded-3xl" />
        </div>
        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="font-bold text-content-main uppercase whitespace-nowrap leading-tight" style={{ fontSize: uiFixed(16) }}>{info.last_name}</h2>
          <h3 className="text-[12px] font-bold text-content-muted mt-0.5 capitalize">{info.first_name}</h3>
          {info.middle_name && <h4 className="text-[12px] font-medium text-content-muted truncate opacity-60">{info.middle_name}</h4>}
        </div>
      </div>

      {hasAnyData ? (
        <>
          {/* БЛОК 1: ТРЕНИРОВКИ */}
          <AttendanceCard title="Тренировки" total={training.total} attended={training.attended} percent={training.percent} />

          {/* БЛОК 2: МАТЧИ — посещение и результаты в одной карточке, один фильтр на оба */}
          <AttendanceCard
            title="Матчи"
            total={games.total}
            attended={games.attended}
            percent={games.percent}
            action={
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                className="flex items-center gap-1 min-w-0 text-brand cursor-pointer active:opacity-70"
              >
                <span className="text-[12px] font-bold truncate max-w-[140px]">{currentFilterLabel}</span>
                <Icon name="chevron" className="w-3 h-3 shrink-0" />
              </button>
            }
          >
            <div className="flex flex-col gap-3 pt-3 border-t border-surface-border">
              <div className="flex items-stretch justify-between">
                <ResultStat label="Победы" value={matchResults.wins} percent={matchResults.winPercent} />
                <ResultStat label="Ничьи" value={matchResults.draws} percent={matchResults.drawPercent} />
                <ResultStat label="Поражения" value={matchResults.losses} percent={matchResults.lossPercent} />
              </div>
              <MatchResultsChart games={matchResults.recentGames} />
            </div>

            {/* ПОЛНЫЙ БОКССКОР ИГРОКА по матчам текущего фильтра. Мини-тайлы — как в
                «Статистике в турнирах»; тап по любому открывает описание показателя.
                Раздела нет вовсе, если ни по одному матчу выборки боксскора нет. */}
            {playerStats.hasRows && (
              <div className="flex flex-col gap-3 pt-3 border-t border-surface-border">
                <SectionLabel>{isGoalie ? 'Статистика вратаря' : 'Статистика игрока'}</SectionLabel>

                <div className="grid grid-cols-3 gap-1.5">
                  {statTiles.map(t => (
                    <StatTile key={t.label} label={t.label} value={t.value} title={t.title} hint={t.hint} />
                  ))}
                </div>

                <div className="flex flex-col gap-3 pt-3 border-t border-surface-border">
                  <SectionLabel>Послематчевые буллиты</SectionLabel>
                  {isGoalie ? (
                    <ShootoutRow
                      attempts={{
                        label: 'Буллиты', value: playerStats.goalieSoAgainst,
                        title: 'Количество послематчевых буллитов',
                        hint: 'Сколько буллитов послематчевой серии пробили по этому вратарю.'
                      }}
                      made={{
                        label: 'Отражено', value: playerStats.goalieSoSaves,
                        title: 'Отражённые послематчевые буллиты',
                        hint: 'Сколько буллитов послематчевой серии вратарь отразил.'
                      }}
                      percent={playerStats.goalieSoPercent}
                      percentTitle="Процент отражённых буллитов"
                      percentHint="Доля отражённых послематчевых буллитов от всех, пробитых по вратарю."
                    />
                  ) : (
                    <ShootoutRow
                      attempts={{
                        label: 'Попытки', value: playerStats.soAttempts,
                        title: 'Попытки послематчевых буллитов',
                        hint: 'Сколько буллитов послематчевой серии игрок пробил — реализованные и нереализованные вместе.'
                      }}
                      made={{
                        label: 'Забито', value: playerStats.soGoals,
                        title: 'Реализованные послематчевые буллиты',
                        hint: 'Сколько буллитов послематчевой серии игрок реализовал. В заброшенные шайбы они не идут — по правилам это не гол игрока.'
                      }}
                      percent={playerStats.soPercent}
                      percentTitle="Процент реализации буллитов"
                      percentHint="Доля реализованных послематчевых буллитов от всех попыток игрока."
                    />
                  )}
                </div>
              </div>
            )}
          </AttendanceCard>
        </>
      ) : (
        <div className="text-center text-[12px] font-bold uppercase tracking-widest text-content-subtle py-10 bg-surface-level1 rounded-2xl border border-dashed border-surface-border">
          Нет данных
        </div>
      )}

      {/* ШТОРКА ВЫБОРА ФИЛЬТРА МАТЧЕЙ — тот же стиль, что и выбор состава в
          CreateApplicationPanel.jsx (Турниры/лиги): поиск + плоский список
          строк с чекбоксами, множественный выбор. */}
      <BottomSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-black tracking-widest text-content-main uppercase">Фильтр матчей</h3>

          {showFilterSearch && (
            <TextInputLP
              placeholder="Лига, дивизион, турнир..."
              value={search}
              onChange={setSearch}
              activeColor={activeBrandColor}
            />
          )}

          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide">
            {matchesSearch('Все матчи') && (
              <FilterOptionRow
                icon="matches"
                line1="Все матчи"
                checked={selectedKeys.size === 0}
                onToggle={() => setSelectedKeys(new Set())}
                activeBrandColor={activeBrandColor}
              />
            )}
            {hasFriendly && matchesSearch('Товарищеские') && (
              <FilterOptionRow
                icon="handshake"
                line1="Товарищеские"
                checked={selectedKeys.has(FILTER_FRIENDLY)}
                onToggle={() => toggleFilterKey(FILTER_FRIENDLY)}
                activeBrandColor={activeBrandColor}
              />
            )}
            {filterOptions
              .filter(o => matchesSearch(`${o.line1} ${o.line2 || ''}`))
              .map(o => (
                <FilterOptionRow
                  key={o.key}
                  logo={o.logo}
                  icon="trophy"
                  line1={o.line1}
                  line2={o.line2}
                  checked={selectedKeys.has(o.key)}
                  onToggle={() => toggleFilterKey(o.key)}
                  activeBrandColor={activeBrandColor}
                />
              ))}
          </div>

          <ButtonLP onClick={() => setIsFilterOpen(false)} activeColor={activeBrandColor}>
            Готово
          </ButtonLP>
        </div>
      </BottomSheet>
    </div>
  );
}
