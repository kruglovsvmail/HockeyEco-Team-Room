import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { getImageUrl } from '../utils/helpers';
import clsx from 'clsx';

// Аналог ImageUploaderLP, но для сканов/документов (PDF, изображения) — вместо превью показывает имя файла.
export const FileUploaderLP = ({ currentFileUrl, onChange, onDelete, showDelete = true, disabled = false, label }) => {
  const [fileName, setFileName] = useState(null);

  useEffect(() => {
    if (!currentFileUrl) setFileName(null);
  }, [currentFileUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      onChange(file);
    }
  };

  const handleClearFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFileName(null);
    if (onDelete) onDelete();
  };

  const hasFile = fileName || currentFileUrl;

  return (
    <div className="flex flex-col gap-2 w-full">
      {label && (
        <span className="text-[10px] text-content-subtle uppercase tracking-widest font-bold">{label}</span>
      )}
      <div className={clsx(
        "relative flex items-center gap-3 p-3 rounded-xl border transition-all group select-none",
        hasFile ? "border-brand/30 bg-surface-level2" : "border-surface-border bg-surface-level2 hover:border-brand/40"
      )}>
        {!disabled && (
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
          />
        )}

        <div className={clsx(
          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
          hasFile ? "bg-brand/10 text-brand" : "bg-surface-level1 text-content-muted"
        )}>
          <Icon name={hasFile ? 'file' : 'upload'} className="w-4.5 h-4.5" />
        </div>

        <div className="flex-1 min-w-0 text-left">
          {hasFile ? (
            currentFileUrl && !fileName ? (
              <a
                href={getImageUrl(currentFileUrl)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[14px] font-bold text-content-main truncate block hover:text-brand relative z-20"
              >
                Открыть файл
              </a>
            ) : (
              <span className="text-[14px] font-bold text-content-main truncate block">{fileName}</span>
            )
          ) : (
            <span className="text-[14px] font-medium text-content-muted">Загрузить файл</span>
          )}
        </div>

        {showDelete && hasFile && !disabled && (
          <button
            type="button"
            onClick={handleClearFile}
            className="shrink-0 w-6 h-6 bg-danger rounded-full flex items-center justify-center shadow-md z-20 hover:scale-110 active:scale-90 transition-transform cursor-pointer border-none outline-none"
          >
            <Icon name="close" className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
          </button>
        )}
      </div>
    </div>
  );
};
