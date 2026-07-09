import React, { useState, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { ButtonLP } from '../ui/Button-LP';

export function UpdatePromptModal({ isOpen, onUpdate, onLater }) {
  const [changelog, setChangelog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = () => {
    setIsUpdating(true);
    setTimeout(() => {
      onUpdate();
    }, 3000);
  };

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    fetch(`/version.json?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Не удалось получить актуальный манифест версии');
        return res.json();
      })
      .then((data) => {
        if (isMounted && data && Array.isArray(data.changelog)) {
          setChangelog(data.changelog);
        }
      })
      .catch((err) => {
        console.error('Ошибка чтения свежего чейнджлога с сервера:', err);
        if (isMounted) {
          setChangelog(["Доступна новая версия с исправлениями стабильности и производительности интерфейса."]);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
      {/* Оверлей без onClick — окно закрывается только кнопкой */}
      <div className="absolute inset-0 bg-overlay backdrop-blur-md" />
      
      <div className="bg-surface-level1 border border-surface-border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 flex flex-col gap-5 animate-scale-in text-left">
        
        <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Icon name="refresh" className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-[14px] font-black text-content-main uppercase tracking-wider leading-none">
              Доступно обновление
            </h3>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-1 block">
              Новая версия приложения
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 max-h-[30vh] overflow-y-auto scrollbar-hide py-1">
          <span className="text-[10px] font-black text-brand uppercase tracking-widest block">
            Что нового:
          </span>
          
          {isLoading ? (
            <div className="py-2 flex flex-col gap-2 animate-pulse">
              <div className="h-3 bg-surface-level2 rounded w-3/4" />
              <div className="h-3 bg-surface-level2 rounded w-5/6" />
              <div className="h-3 bg-surface-level2 rounded w-2/3" />
            </div>
          ) : (
            <ul className="flex flex-col gap-2 pl-1">
              {changelog.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-[14px] text-content-main font-medium leading-relaxed">
                  <span className="text-brand shrink-0 mt-1.5 select-none text-[8px]">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 w-full pt-5 border-t border-surface-level2">
          <ButtonLP 
            variant="primary" 
            onClick={handleUpdate}
            isLoading={isUpdating}
            disabled={isUpdating}
            className="flex-1 !h-11 !text-[10px] !font-black !uppercase !tracking-widest shadow-md"
          >
            {isUpdating ? 'Обновление...' : 'Обновить'}
          </ButtonLP>
        </div>

      </div>
    </div>
  );
}
