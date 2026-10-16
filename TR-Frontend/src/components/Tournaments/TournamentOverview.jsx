// TournamentOverview.jsx
import React, { useMemo } from 'react';
import { Icon } from '../../ui/Icon';
import { pluralRu } from '../../utils/helpers';

/**
 * Разбор описания дивизиона на блоки для читаемой вёрстки.
 *
 * Лига пишет описание в LMS простым текстом, как документ: строка-заголовок с двоеточием
 * в конце, ниже пункты через «;», иногда маркеры «-», «•» или номера «1.». Показывать это
 * сплошным абзацем — нечитаемо, поэтому раскладываем строки:
 *  • «…:» в конце            → подзаголовок;
 *  • маркер «-», «–», «•», «*» → пункт списка (маркер убираем — рисуем свой);
 *  • «1.» / «1)» в начале     → нумерованный пункт;
 *  • «…;» в конце            → пункт списка, и следующая строка после такого пункта тоже
 *                               пункт (последний в перечне обычно кончается точкой);
 *  • пустая строка           → граница абзаца;
 *  • остальное               → абзац.
 * Текст лиги не правим: знаки препинания остаются как написаны.
 */
const parseDescription = (text) => {
  const blocks = [];
  let list = null;
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .forEach((line) => {
      if (!line) {
        flushList();
        return;
      }

      const bullet = line.match(/^[-–—•*·]\s*(.+)$/);
      const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
      // Строка с двоеточием в конце — заголовок следующего перечня, а не хвост этого
      const continuesList = list && !line.endsWith(':')
        && list.items[list.items.length - 1].text.endsWith(';');

      if (bullet || numbered || line.endsWith(';') || continuesList) {
        if (!list) list = { type: 'list', items: [] };
        list.items.push({
          marker: numbered ? `${numbered[1]}.` : null,
          text: bullet ? bullet[1] : numbered ? numbered[2] : line,
        });
        return;
      }

      flushList();
      blocks.push({ type: line.endsWith(':') ? 'heading' : 'paragraph', text: line });
    });

  flushList();
  return blocks;
};

// Ссылки в описании (регламент, чат лиги) делаем нажимаемыми
const URL_RE = /(https?:\/\/[^\s<>«»"]+[^\s<>«»".,;:!?)])/g;

const Linkified = ({ text }) => {
  const parts = text.split(URL_RE);
  return parts.map((part, idx) => (
    idx % 2 === 1 ? (
      <a
        key={idx}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline decoration-dotted underline-offset-4 break-all"
      >
        {part}
      </a>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  ));
};

function StatTile({ icon, value, label, caption }) {
  return (
    <div className="bg-surface-level1 rounded-2xl shadow-md p-4 flex flex-col gap-2 min-w-0">
      {/* Подпись плитки со значком — цветом бренда, цифра под ней — основным цветом */}
      <div className="flex items-center gap-2 text-brand">
        <Icon name={icon} className="w-4 h-4 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[32px] leading-none font-black text-content-main tabular-nums">{value}</span>
        {caption && (
          <span className="text-[12px] font-semibold text-content-muted truncate">{caption}</span>
        )}
      </div>
    </div>
  );
}

export function TournamentOverview({ overview }) {
  const blocks = useMemo(() => parseDescription(overview?.description), [overview?.description]);

  if (!overview) return null;

  const { teamsCount, playersCount, gamesPlayed, goalsScored } = overview;
  // Среднее за матч — только когда есть из чего считать
  const goalsPerGame = gamesPlayed > 0 ? (goalsScored / gamesPlayed).toFixed(1).replace('.', ',') : null;

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon="matches"
          label="Сыграно матчей"
          value={gamesPlayed}
        />
        <StatTile
          icon="puck"
          label="Заброшено шайб"
          value={goalsScored}
          caption={goalsPerGame ? `≈ ${goalsPerGame} за матч` : null}
        />
        <StatTile
          icon="team"
          label={pluralRu(teamsCount, 'Команда', 'Команды', 'Команд')}
          value={teamsCount}
        />
        <StatTile
          icon="users"
          label={pluralRu(playersCount, 'Игрок', 'Игрока', 'Игроков')}
          value={playersCount}
        />
      </div>

      {blocks.length > 0 && (
        <div className="bg-surface-level1 rounded-2xl shadow-md px-5 py-5 flex flex-col gap-3">
          <div className="text-[12px] font-black uppercase tracking-widest text-content-muted">
            О дивизионе
          </div>

          {blocks.map((block, idx) => {
            if (block.type === 'heading') {
              return (
                <p key={idx} className="text-[15px] font-bold leading-snug text-content-main pt-1">
                  <Linkified text={block.text} />
                </p>
              );
            }
            if (block.type === 'paragraph') {
              return (
                <p key={idx} className="text-[15px] font-normal leading-relaxed text-content-main">
                  <Linkified text={block.text} />
                </p>
              );
            }
            return (
              <ul key={idx} className="flex flex-col gap-2.5">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex gap-3 text-[15px] font-normal leading-relaxed text-content-main">
                    {item.marker ? (
                      <span className="shrink-0 min-w-[1.25rem] font-bold text-brand tabular-nums">{item.marker}</span>
                    ) : (
                      <span className="shrink-0 w-1.5 h-1.5 mt-[0.6em] rounded-full bg-brand" />
                    )}
                    <span className="min-w-0">
                      <Linkified text={item.text} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          })}
        </div>
      )}
    </div>
  );
}
