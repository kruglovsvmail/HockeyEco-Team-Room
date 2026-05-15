import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

export function BottomSheet({ isOpen, onClose, children }) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState('auto');

  useEffect(() => {
    if (isOpen) setDragY(0);
  }, [isOpen]);

  useEffect(() => {
    if (!contentRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContentHeight(entry.target.offsetHeight);
      }
    });
    
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [children]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (dragY > 100) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  return (
    <>
      <div 
        className={clsx(
          "fixed inset-0 bg-overlay backdrop-blur-overlay z-[100] transition-opacity duration-500",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div 
        className={clsx(
          "fixed inset-x-0 bottom-0 z-[110] bg-sheet-bg backdrop-blur-sheet rounded-t-3xl border-t border-sheet-border shadow-sheet-top flex flex-col",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "translate-y-0" : "translate-y-[calc(100%+50px)]"
        )}
        style={{ 
          transform: isOpen && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : ''
        }}
      >
        {/* ИЗМЕНЕНО: touch-pan-y заменен на touch-none */}
        <div 
          className="p-5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-14 h-1.5 bg-sheet-border rounded-full pointer-events-none" />
        </div>

        <div 
          className="overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] max-h-[85dvh]"
          style={{ height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px` }}
        >
          {/* ИЗМЕНЕНО: Добавлен overscroll-none для защиты от отскока списка */}
          <div className="overflow-y-auto scrollbar-hide max-h-[85dvh] overscroll-none">
            <div ref={contentRef} className="px-6 pb-8 pb-safe">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}