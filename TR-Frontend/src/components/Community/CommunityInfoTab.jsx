import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Icon } from '../../ui/Icon';
import { getAuthHeaders } from '../../utils/helpers';

// =============================================================================
// ВКЛАДКА «ИНФО»
//
// Всё, что сообщество хочет сказать участникам, лежит здесь одинаковыми
// аккордеонами: описание и любое число собственных блоков — правила, что взять
// с собой, как оплачивать. Свёрнутый вид важнее развёрнутого: заголовков может
// быть много, и человек должен видеть их список, а не простыню текста.
//
// Порядок блоков меняют стрелками, а не перетаскиванием: список короткий,
// живёт в прокручиваемой странице, и перетаскивание на телефоне конфликтовало бы
// со скроллом.
// =============================================================================

const AccordionItem = ({
  title, isOpen, onToggle, accentColor,
  canReorder, isFirst, isLast, onMoveUp, onMoveDown,
  children,
}) => (
  <div className="bg-surface-level1 border border-surface-border rounded-2xl shadow-sm overflow-hidden">
    <div className="flex items-center">
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 flex items-center justify-between gap-3 p-4 outline-none text-left cursor-pointer min-w-0"
      >
        <span className="text-[10px] font-black text-content-main uppercase tracking-widest truncate">
          {title}
        </span>
        <Icon
          name="chevron_left"
          className={clsx(
            'w-4 h-4 shrink-0 transition-transform duration-200',
            isOpen ? 'rotate-90' : '-rotate-90'
          )}
          style={{ color: accentColor }}
        />
      </button>

      {canReorder && (
        <div className="flex items-center gap-1 pr-3 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="w-7 h-7 rounded-lg bg-surface-level2 flex items-center justify-center outline-none active:scale-90 transition-transform disabled:opacity-30"
          >
            <Icon name="chevron_left" className="w-3.5 h-3.5 text-content-muted rotate-90" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="w-7 h-7 rounded-lg bg-surface-level2 flex items-center justify-center outline-none active:scale-90 transition-transform disabled:opacity-30"
          >
            <Icon name="chevron_left" className="w-3.5 h-3.5 text-content-muted -rotate-90" />
          </button>
        </div>
      )}
    </div>

    {/* Плавное раскрытие без замера высоты: grid-строка едет от 0fr к 1fr,
        и содержимое любого размера открывается одинаково ровно */}
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
        <div className="px-4 pb-4 -mt-1">
          {children}
        </div>
      </div>
    </div>
  </div>
);

export function CommunityInfoTab({
  communityId, community, blocks = [], canReorder,
  activeBrandColor, onReordered, notify,
}) {
  const accentColor = activeBrandColor || 'var(--color-brand)';
  const [openKeys, setOpenKeys] = useState(() => new Set(['description']));
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (key) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Описание идёт первым и порядку не подчиняется: это не блок, который завели,
  // а поле профиля сообщества.
  const hasDescription = !!(community?.description || '').trim();

  const ordered = useMemo(
    () => [...blocks].sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id)),
    [blocks]
  );

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length || isSaving) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];

    setIsSaving(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/info-blocks/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ order: next.map(b => b.id) }),
        }
      );
      if (!res.ok) throw new Error('failed');
      await onReordered?.();
    } catch {
      notify?.('Не удалось изменить порядок', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasDescription && ordered.length === 0) {
    return (
      <div className="text-center py-10 text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
        Сообщество пока ничего о себе не написало
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasDescription && (
        <AccordionItem
          title="О сообществе"
          isOpen={openKeys.has('description')}
          onToggle={() => toggle('description')}
          accentColor={accentColor}
        >
          <p className="text-[13px] text-content-main leading-relaxed whitespace-pre-line">
            {community.description}
          </p>
        </AccordionItem>
      )}

      {ordered.map((block, index) => (
        <AccordionItem
          key={block.id}
          title={block.title}
          isOpen={openKeys.has(block.id)}
          onToggle={() => toggle(block.id)}
          accentColor={accentColor}
          canReorder={canReorder && ordered.length > 1}
          isFirst={index === 0}
          isLast={index === ordered.length - 1}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
        >
          {block.content ? (
            <p className="text-[13px] text-content-main leading-relaxed whitespace-pre-line">
              {block.content}
            </p>
          ) : (
            <span className="text-[11px] text-content-subtle italic">Блок пока пустой</span>
          )}
        </AccordionItem>
      ))}
    </div>
  );
}
