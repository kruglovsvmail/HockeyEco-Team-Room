import React from 'react';
import clsx from 'clsx';

export function Table({ columns, data, rowKey = 'id', onRowClick, className }) {
  return (
    <div className={clsx("w-full overflow-x-auto scrollbar-hide bg-transparent", className)}>
      <table className="w-full border-collapse bg-transparent text-left">
        <thead>
          <tr className="border-b border-surface-border0">
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                style={{ width: col.width || 'auto' }}
                className={clsx(
                  "pb-3 text-[10px] font-black text-content-muted uppercase tracking-widest px-2",
                  col.align === 'right' && "text-right",
                  col.align === 'center' && "text-center"
                )}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rIdx) => (
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
                    "py-3.5 px-2 text-sm text-content-main align-middle",
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