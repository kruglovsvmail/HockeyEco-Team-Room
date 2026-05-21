import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from './Icon';

const BottomActionContext = createContext(null);

export const BottomActionProvider = ({ children }) => {
  const [config, setConfig] = useState({ visible: false, actions: [] });
  const [layoutVisible, setLayoutVisible] = useState(false);

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

  // Панель отображается, только если её включил внутренний компонент И макет сейчас активен
  const isBarActive = config.visible && config.actions.length > 0 && layoutVisible;

  return (
    <BottomActionContext.Provider value={{ config, setBottomBar, resetBottomBar, updateLayoutVisibility }}>
      {children}
      
      {/* Автономный рендеринг панели управления напрямую в body */}
      {createPortal(
        <div
          className={clsx(
            "fixed -bottom-1 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-5 pt-2 pb-2 ",
            "rounded-t-3xl border border-white/40 bg-brand-glow backdrop-blur-md shadow-2xl pb-[calc(12px+env(safe-area-inset-bottom))]",
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
                "flex flex-col items-center justify-center gap-1.5 transition-all active:scale-90 relative outline-none",
                action.disabled ? "opacity-30 cursor-not-allowed active:scale-100" : "hover:scale-105"
              )}
            >
              {/* Круглая подложка для иконки */}
              <div className={clsx(
                "w-11 h-11 rounded-full flex items-center justify-center shadow-md border transition-colors mx-8",
                action.className || "bg-surface-level2 text-content-main border-surface-border"
              )}>
                {action.isLoading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name={action.icon} className="w-4 h-4" />
                )}
              </div>
              
              {/* Подпись кнопки */}
              {action.label && (
                <span className="text-[8px] font-bold uppercase tracking-widest text-content-main block text-center truncate w-full select-none">
                  {action.label}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body
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