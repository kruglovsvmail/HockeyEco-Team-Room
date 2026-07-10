// TrainingLinesShareCard.jsx
// Off-screen шаблон карточки расстановки тренировки для генерации картинки (html-to-image).
// Чисто презентационный: принимает готовые блоки и рисует. Монтируется за пределами экрана.
// Отличия от матча: нет соперника и формы (свет/тёмн) в шапке; у каждого блока — свой цвет джерси.
import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { getImageUrl } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';

const getInitials = (first, last) => {
  const f = first ? String(first).charAt(0).toUpperCase() : '';
  const l = last ? String(last).charAt(0).toUpperCase() : '';
  return `${l}${f}` || '?';
};

// Слот игрока/пустой позиции. crossOrigin на фото обязателен для чистого канваса.
function Slot({ player, label }) {
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

// Карточка одного блока (звено/группа/вратари) — в стиле ContainerContent.
// jerseyHex/jerseyPlural — цвет формы блока (для вратарей не передаём).
function BlockCard({ title, jerseyHex, jerseyPlural, children }) {
  return (
    <div className="bg-surface-level1 rounded-2xl p-3 flex flex-col shadow-md">
      <div className="flex items-center justify-between border-b border-surface-border pb-2 pl-2 pr-1 mb-4">
        <h4 className="text-[14px] font-bold text-content-muted uppercase tracking-wider">{title}</h4>
        {jerseyHex && (
          <div className="flex items-center gap-1.5 shrink-0">
            {jerseyPlural && (
              <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">{jerseyPlural}</span>
            )}
            <div className="w-4 h-4 rounded-full border border-surface-border shrink-0" style={{ backgroundColor: jerseyHex }} />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export const TrainingLinesShareCard = forwardRef(function TrainingLinesShareCard(
  { blocks = [], goalies = null, dateDisplay, timeDisplay, arenaDisplay, accent = 'var(--color-brand)' },
  ref
) {
  return (
    <div
      ref={ref}
      style={{ width: 760 }}
      className="bg-surface-base p-5 flex flex-col gap-4 box-border"
    >
      {/* ── ШАПКА (без соперника и формы) — на всю ширину ── */}
      <div className="bg-surface-level1 rounded-2xl p-4 flex items-start justify-between shadow-md">
        <span className="text-[36px] font-black uppercase leading-none" style={{ color: accent }}>
          Тренировка
        </span>

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
        </div>
      </div>

      {/* ── СЕТКА БЛОКОВ ЗВЕНЬЕВ / ГРУПП (2 колонки) ── */}
      <div className="grid grid-cols-2 gap-3 items-start">
        {blocks.map((block) => (
          <BlockCard
            key={`share-block-${block.num}`}
            title={block.title}
            jerseyHex={block.jerseyHex}
            jerseyPlural={block.jerseyPlural}
          >
            {block.mode === 'groups' ? (
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 justify-items-center">
                {block.slots.map((s, i) => (
                  <Slot key={`b${block.num}-${i}`} player={s.player} label={s.label} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="flex justify-center gap-3 mb-5">
                  {block.forwards.map((s, i) => (
                    <Slot key={`b${block.num}-f${i}`} player={s.player} label={s.label} />
                  ))}
                </div>
                <div className="flex justify-center gap-7">
                  {block.defense.map((s, i) => (
                    <Slot key={`b${block.num}-d${i}`} player={s.player} label={s.label} />
                  ))}
                </div>
              </div>
            )}
          </BlockCard>
        ))}

        {/* ── ВРАТАРИ — в той же сетке ── */}
        {goalies && goalies.slots.length > 0 && (
          <BlockCard title="Вратари">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-5">
              {goalies.slots.map((s, i) => (
                <Slot key={`g-${i}`} player={s.player} label={s.label} />
              ))}
            </div>
          </BlockCard>
        )}
      </div>
    </div>
  );
});
