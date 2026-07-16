import React from 'react';
import clsx from 'clsx';
import { Icon } from '../../../ui/Icon';
import { getImageUrl } from '../../../utils/helpers';
import { STATUS_META } from './seasonUtils';

// Карточка заявки в списке раздела «Заявки на сезон» — только сводка, клик ведёт на страницу деталей.
// Название лиги часто длинное, поэтому идёт отдельной строкой (до 3 строк) над логотипом,
// чтобы не спорить с ним за ширину.
export function ApplicationCard({ app, onClick }) {
  const statusMeta = STATUS_META[app.status] || STATUS_META.draft;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-surface-level1 rounded-3xl shadow-md p-5 flex flex-col gap-3 text-left outline-none cursor-pointer active:scale-[0.99] transition-all"
    >
      <span className="text-[16px] font-black text-content-main leading-snug line-clamp-3">{app.league_name}</span>

      <div className="flex items-center gap-4">
        {app.league_logo ? (
          <img src={getImageUrl(app.league_logo)} alt="" className="w-16 h-16 rounded-2xl object-contain shrink-0 bg-surface-level2 p-1.5" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-surface-level2 flex items-center justify-center shrink-0">
            <Icon name="trophy" className="w-6 h-6 text-content-subtle" />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider truncate">{app.season_name}</span>
          <span className="text-[14px] font-bold text-content-main truncate">{app.division_short_name || app.division_name}</span>
          <span className={clsx("self-start mt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-surface-level2", statusMeta.text)}>
            <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", statusMeta.dot)} />
            {statusMeta.label}
          </span>
        </div>

        <Icon name="chevron_right" className="w-5 h-5 text-content-subtle shrink-0" />
      </div>
    </button>
  );
}
