// MatchLinesShareCard.jsx
// Презентационный off-screen шаблон карточки составов для генерации картинки (html-to-image).
// Ничего не грузит и не вычисляет логику матча — принимает готовые данные и рисует.
// Используется только как источник для скриншота: монтируется за пределами экрана.
import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';

// Порядок и подписи позиций — как в живой раскладке звеньев (renderLineBlock)
const FORWARDS = [
  { pos: 'LW', label: 'ЛН' },
  { pos: 'C',  label: 'ЦН' },
  { pos: 'RW', label: 'ПН' },
];
const DEFENSE = [
  { pos: 'LD', label: 'ЛЗ' },
  { pos: 'RD', label: 'ПЗ' },
];
const GOALIES = [
  { line: 5, label: 'Осн' },
  { line: 6, label: 'Зап' },
  { line: 7, label: 'Рез' },
];

const getInitials = (first, last) => {
  const f = first ? String(first).charAt(0).toUpperCase() : '';
  const l = last ? String(last).charAt(0).toUpperCase() : '';
  return `${l}${f}` || '?';
};

// Слот игрока/пустой позиции. crossOrigin на фото обязателен для чистого канваса.
function Slot({ player, label, accent }) {
  return (
    <div className="flex flex-col items-center" style={{ width: 84 }}>
      <div
        className={clsx(
          'relative flex items-center justify-center rounded-2xl shrink-0 box-border',
          player
            ? 'border border-surface-border bg-surface-level3 shadow-lg'
            : 'bg-surface-base border border-dashed border-content-muted'
        )}
        style={{ width: 60, height: 60 }}
      >
        {player ? (
          <>
            {(player.team_photo || player.avatar_url) ? (
              <img
                src={getImageUrl(player.team_photo || player.avatar_url)}
                alt=""
                crossOrigin="anonymous"
                className="w-full h-full object-cover rounded-2xl pointer-events-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center rounded-2xl bg-surface-level3 text-brand font-black text-[16px]">
                {getInitials(player.first_name, player.last_name)}
              </div>
            )}

            {(player.is_captain || player.is_assistant) && (
              <div
                className="absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm"
                style={{ backgroundColor: accent }}
              >
                {player.is_captain ? 'К' : 'А'}
              </div>
            )}

            <div className="absolute -bottom-2 bg-surface-level2 rounded-md px-1.5 py-0.5 border border-surface-border shadow-sm">
              <span className="text-[10px] font-black text-content-muted uppercase tracking-widest leading-none block">
                {label}
              </span>
            </div>
          </>
        ) : (
          <span className="text-[14px] font-black text-content-muted uppercase tracking-widest select-none">
            {label}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col items-center justify-start h-8 w-full overflow-visible">
        {player ? (
          <>
            <span className="text-[12px] font-bold text-content-main leading-tight text-center whitespace-nowrap">
              {player.last_name}
            </span>
            <span className="text-[10px] font-medium text-content-muted leading-tight text-center whitespace-nowrap">
              {player.first_name}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

// Карточка одного звена — в стиле ContainerContent
function LineCard({ title, children }) {
  return (
    <div className="bg-surface-level1 rounded-2xl p-3 flex flex-col shadow-md">
      <div className="border-b border-surface-border pb-2 pl-2 mb-4">
        <h4 className="text-[14px] font-bold text-content-muted uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </div>
  );
}

export const MatchLinesShareCard = forwardRef(function MatchLinesShareCard(
  { lines = [], accent = 'var(--color-brand)', opponentName, dateDisplay, timeDisplay, arenaDisplay, jerseyLabel },
  ref
) {
  const findPlayer = (lineNum, pos) =>
    lines.find((l) => l.line_number === lineNum && l.position_in_line === pos) || null;

  // Показываем только звенья, где есть хотя бы один игрок
  const activeLines = [1, 2, 3, 4].filter((n) =>
    lines.some((l) => l.line_number === n && l.position_in_line !== 'G')
  );

  return (
    <div
      ref={ref}
      style={{ width: 600 }}
      className="bg-surface-base p-5 flex flex-col gap-4 box-border"
    >
      {/* ── ШАПКА ── */}
      <div className="bg-surface-level1 rounded-2xl p-4 flex items-start justify-between shadow-md">
        <div className="flex flex-col min-w-0">
          <span className="text-[36px] font-black uppercase leading-none" style={{ color: accent }}>
            МАТЧ
          </span>
          {opponentName && (
            <span className="mt-2 text-[16px] font-bold text-content-muted uppercase tracking-wide truncate">
              против {opponentName}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 text-right shrink-0 pl-3">
          {dateDisplay && (
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold text-content-main leading-none">{dateDisplay}</span>
              <Icon name="calendar" className="w-4 h-4 text-content-main shrink-0" />
            </div>
          )}
          {(arenaDisplay || timeDisplay) && (
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold leading-none" style={{ color: accent }}>
                {[arenaDisplay, timeDisplay].filter(Boolean).join(' · ')}
              </span>
              <Icon name="location_pin" className="w-4 h-4 shrink-0" style={{ color: accent }} />
            </div>
          )}
          {jerseyLabel && (
            <span className="text-[14px] font-medium text-content-muted leading-none mt-0.5">
              Форма: {jerseyLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── СЕТКА ЗВЕНЬЕВ ── */}
      <div className="grid grid-cols-2 gap-3">
        {activeLines.map((lineNum) => (
          <LineCard key={`share-line-${lineNum}`} title={`Звено #${lineNum}`}>
            <div className="flex justify-center gap-3 mb-5">
              {FORWARDS.map(({ pos, label }) => (
                <Slot key={pos} player={findPlayer(lineNum, pos)} label={label} accent={accent} />
              ))}
            </div>
            <div className="flex justify-center gap-7">
              {DEFENSE.map(({ pos, label }) => (
                <Slot key={pos} player={findPlayer(lineNum, pos)} label={label} accent={accent} />
              ))}
            </div>
          </LineCard>
        ))}

        {/* Вратари */}
        <LineCard title="Вратари">
          <div className="flex justify-center gap-3">
            {GOALIES.map(({ line, label }) => (
              <Slot key={`g-${line}`} player={findPlayer(line, 'G')} label={label} accent={accent} />
            ))}
          </div>
        </LineCard>
      </div>
    </div>
  );
});
