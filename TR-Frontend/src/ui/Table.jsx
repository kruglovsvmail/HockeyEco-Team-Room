import React, { useState, useMemo } from 'react';
import clsx from 'clsx';

// Сортировка — опциональна per-колонка (col.sortable + необязательный col.sortValue(row)).
// Колонки без sortable ведут себя как раньше, ничего не ломает существующие таблицы.
export function Table({ columns, data, rowKey = 'id', onRowClick, className }) {
  const [sort, setSort] = useState({ key: null, order: 'asc' });

  const handleSort = (col) => {
    if (!col.sortable) return;
    setSort(prev => ({
      key: col.key,
      order: prev.key === col.key && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedData = useMemo(() => {
    if (!sort.key) return data;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return data;
    const getValue = col.sortValue || ((row) => row[col.key]);
    const withIndex = data.map((row, i) => ({ row, i }));
    withIndex.sort((a, b) => {
      const va = getValue(a.row);
      const vb = getValue(b.row);
      if (va == null && vb == null) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'ru');
      return cmp !== 0 ? cmp : a.i - b.i;
    });
    const sorted = withIndex.map(x => x.row);
    return sort.order === 'desc' ? sorted.reverse() : sorted;
  }, [data, sort, columns]);

  return (
    <div className={clsx("w-full overflow-x-auto scrollbar-hide bg-transparent", className)}>
      <table className="w-full border-collapse bg-transparent text-left">
        <thead>
          <tr className="border-b border-surface-border">
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                style={{ width: col.width || 'auto' }}
                onClick={() => handleSort(col)}
                className={clsx(
                  "pb-3 text-[10px] font-black text-content-muted uppercase tracking-widest px-2",
                  col.align === 'right' && "text-right",
                  col.align === 'center' && "text-center",
                  col.sortable && "cursor-pointer select-none active:opacity-60"
                )}
              >
                <span className="inline-flex items-center gap-0.5">
                  {col.title}
                  {col.sortable && (
                    sort.key === col.key
                      ? <span className="text-brand not-italic">{sort.order === 'desc' ? '↓' : '↑'}</span>
                      : <span className="opacity-20 not-italic">↕</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, rIdx) => (
            <tr 
              key={row[rowKey] || rIdx} 
              onClick={() => onRowClick && onRowClick(row)}
              className={clsx(
                "border-b border-surface-border last:border-b-0 transition-colors",
                onRowClick && "cursor-pointer active:bg-surface-level2/10"
              )}
            >
              {columns.map((col, cIdx) => (
                <td
                  key={col.key || cIdx}
                  className={clsx(
                    "py-3.5 px-2 text-[14px] text-content-main align-middle",
                    col.align === 'right' && "text-right",
                    col.align === 'center' && "text-center"
                  )}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}