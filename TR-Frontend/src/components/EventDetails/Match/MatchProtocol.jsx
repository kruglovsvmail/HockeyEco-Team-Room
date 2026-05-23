import React from 'react';
import { FadeIn } from '../../../ui/FadeIn';

export const MatchProtocol = ({ event }) => {
  return (
    <FadeIn>
      <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
        Протокол матча
      </div>
    </FadeIn>
  );
};