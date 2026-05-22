import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from './Icon';

const BottomActionContext = createContext(null);

export const BottomActionProvider = ({ children }) => {
  const [config, setConfig] = useState({ visible: false, actions: [] });
  const [layoutVisible, setLayoutVisible] = useState(false);
  
  // Изначально по умолчанию монтируемся в body
  const [portalTarget, setPortalTarget] = useState(() => 
    typeof document !== 'undefined' ? document.body : null
  );

  const setBottomBar = useCallback((newConfig) => {
    setConfig((prev) => ({
      ...prev,
      ...newConfig,
    }));
  }, []);

  const resetBottomBar = useCallback(() => {
    setConfig({ visible: false, actions: [] });
  }, []);

  const updateLayoutVisibility = useCallback((isVisible) => {
    setLayoutVisible(isVisible);
  }, []);

  // Динамически пересчитываем цель портала после монтирования разметки макета
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('bottom-bar-portal-container');
    if (container) {
      setPortalTarget(container);
    } else {
      setPortalTarget(document.body);
    }
  }, [config.visible, config.actions]); // Срабатывает при обновлении кнопок со страницы

  const isBarActive = config.visible && config.actions.length > 0 && layoutVisible;
  const isAbsolute = portalTarget && portalTarget.id === 'bottom-bar-portal-container';

  return (
    <BottomActionContext.Provider value={{ config, setBottomBar, resetBottomBar, updateLayoutVisibility }}>
      {children}
      
      {/* Рендеринг нижней панели действий напрямую в целевой контейнер */}
      {portalTarget && createPortal(
        <div
          className={clsx(
            isAbsolute ? "absolute" : "fixed",
            "-bottom-1 left-1/2 -translate-x-1/2 z-[95] flex items-center justify-center gap-8 pb-2",
            "rounded-t-2xl bg-surface-base w-full shadow-[0_-6px_16px_rgba(0,0,0,0.1)] pb-[calc(12px+env(safe-area-inset-bottom))]",
            "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
            isBarActive
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "translate-y-[150%] opacity-0 pointer-events-none"
          )}
        >
          {config.actions.map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              disabled={action.disabled || action.isLoading}
              className={clsx(
                "flex flex-col items-center justify-center transition-all active:scale-90 relative outline-none min-w-[72px]",
                action.disabled ? "opacity-30 cursor-not-allowed active:scale-100" : "hover:scale-105"
              )}
            >
              {/* Круглая подложка для иконки */}
              <div className={clsx(
                "w-11 h-11 rounded-full flex items-center justify-center transition-colors",
                action.className || "text-content-main"
              )}>
                {action.isLoading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Icon name={action.icon} className="w-4 h-4" />
                )}
              </div>
              
              {/* Подпись кнопки */}
              {action.label && (
                <span className="text-[8px] font-bold uppercase tracking-widest text-content-main block text-center truncate w-full select-none -mt-1">
                  {action.label}
                </span>
              )}
            </button>
          ))}
        </div>,
        portalTarget
      )}
    </BottomActionContext.Provider>
  );
};

export const useBottomBar = () => {
  const context = useContext(BottomActionContext);
  if (!context) {
    throw new Error('useBottomBar must be used within a BottomActionProvider');
  }
  return context;
};