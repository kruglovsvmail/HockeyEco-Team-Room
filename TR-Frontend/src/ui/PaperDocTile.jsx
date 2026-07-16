import React from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import { getImageUrl } from '../utils/helpers';

// Единая "плитка" одного файла-документа — используется и в заявке на сезон (скан заявки/решение лиги,
// см. SeasonRosterDetails.jsx), и в панели документов игрока (мед.справка/страховка/согласие,
// см. PlayerDocsModal.jsx). Внешний вид один и тот же во всех статусах: плоская карточка с иконкой
// и подписью. editable добавляет только загрузку (когда файла и локального выбора ещё нет) и крестик
// удаления (когда есть) — сама рамка никогда не превращается в дропзону.
export function PaperDocTile({
  url,
  pendingLabel, // имя локально выбранного файла, ещё не сохранённого на сервере
  doneLabel = 'Открыть файл',
  emptyLabel = 'Файл не загружен',
  tone = 'brand',
  editable = false,
  onUpload,
  onDeleteClick,
  uploading = false,
  activeBrandColor, // явный цвет команды — переопределяет bg-brand/text-brand иконки, если задан
}) {
  const toneClass = tone === 'success' ? 'bg-success/15 text-success' : 'bg-brand/15 text-brand';
  const hasContent = !!url || !!pendingLabel;
  const canUpload = editable && !hasContent && !!onUpload;
  const canDelete = editable && hasContent && !!onDeleteClick;

  // 15%-альфа тон иконки под цвет команды (тот же приём, что и в ButtonLP), если включено цветовое кодирование
  const iconStyle = (hasContent && tone !== 'success' && activeBrandColor)
    ? { backgroundColor: `${activeBrandColor}26`, color: activeBrandColor }
    : undefined;

  return (
    <div className="relative flex items-center gap-3 p-3 rounded-xl border border-surface-border bg-surface-level1">
      {canUpload && !uploading && (
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => { const file = e.target.files[0]; if (file) onUpload(file); }}
          className="absolute inset-0 opacity-0 cursor-pointer z-10"
        />
      )}
      <div
        className={clsx("shrink-0 w-9 h-9 rounded-lg flex items-center justify-center", hasContent ? toneClass : "text-content-muted")}
        style={iconStyle}
      >
        <Icon name={hasContent ? 'file' : (canUpload ? 'upload' : 'clock')} className="w-4.5 h-4.5" />
      </div>
      <div className={clsx("flex-1 min-w-0 text-left", canDelete && "pr-8")}>
        {url ? (
          <a href={getImageUrl(url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={clsx("text-[14px] font-bold truncate block hover:opacity-80 relative z-20", tone === 'success' ? 'text-success' : 'text-content-main')}>
            {doneLabel}
          </a>
        ) : pendingLabel ? (
          <span className="text-[14px] font-bold text-content-main truncate block">{pendingLabel}</span>
        ) : (
          <span className="text-[14px] font-medium text-content-muted">{uploading ? 'Загрузка…' : emptyLabel}</span>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-danger rounded-full flex items-center justify-center shadow-md z-20 hover:scale-110 active:scale-90 transition-transform cursor-pointer border-none outline-none"
          >
            <Icon name="close" className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
          </button>
        )}
      </div>
    </div>
  );
}
