import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { getImageUrl } from '../utils/helpers';
import clsx from 'clsx';

export const ImageUploaderLP = ({ currentImageUrl, onChange, onDelete, sizeClass = "w-20 h-20" }) => {
  const [preview, setPreview] = useState(null);

  // Сбрасываем локальное превью при изменении внешней ссылки (например, при очистке стейта формы)
  useEffect(() => {
    if (!currentImageUrl) {
      setPreview(null);
    }
  }, [currentImageUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      onChange(file);
    }
  };

  const handleClearFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPreview(null);
    onDelete();
  };

  const hasImage = preview || currentImageUrl;

  return (
    <div className={clsx(
      "relative flex items-center justify-center transition-all group hover:border-brand select-none shrink-0",
      sizeClass
    )}>
      {/* Скрытый нативный инпут выбора файлов поверх всей площади */}
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleFileChange} 
        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
      />

      {hasImage ? (
        <>
          {/* Отображение загруженного изображения / превью */}
          <img 
            src={preview || getImageUrl(currentImageUrl)} 
            alt="Загруженное медиа" 
            className="w-full h-full object-contain p-1.5 drop-shadow-sm rounded-3xl" 
          />

          {/* Бейдж УДАЛЕНИЯ (Справа сверху) */}
          <button
            type="button"
            onClick={handleClearFile}
            className="absolute -top-0 -right-0 w-6 h-6 bg-danger rounded-full flex items-center justify-center shadow-md z-20 hover:scale-110 active:scale-90 transition-transform cursor-pointer border-none outline-none"
          >
            <Icon name="close" className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
          </button>

        </>
      ) : (
        /* Пустое состояние: Новая иконка ЗАГРУЗКИ (upload) во всю площадь превью квадрата */
        <div className="text-content-muted border border-surface-border border rounded-2xl group-hover:text-brand transition-colors pointer-events-none flex items-center justify-center w-full h-full">
          <Icon name="upload" className="w-7 h-7" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
};