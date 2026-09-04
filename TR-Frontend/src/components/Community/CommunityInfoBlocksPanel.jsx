import React, { useState, useEffect, useCallback } from 'react';
import { ButtonLP } from '../../ui/Button-LP';
import { TextInputLP } from '../../ui/Input-LP';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { PanelBlock, AddRowButton } from './CommunityPanelBlock';
import { getAuthHeaders } from '../../utils/helpers';

// =============================================================================
// БЛОКИ ВКЛАДКИ «ИНФО»
//
// Отдельный подраздел, а не хвост профиля: блоков может быть сколько угодно,
// и вместе с логотипом и цветами они превращали панель профиля в свалку.
//
// Заводится блок одной формой — название и текст сразу, — а правится карандашом
// в шапке блока, как в карточке участника.
// =============================================================================
export function CommunityInfoBlocksPanel({
  communityId, activeBrandColor, onSaved,
}) {
  // Панель открыта на весь экран и живёт дольше одного сохранения, поэтому
  // список держит у себя: снимок, переданный при открытии, устарел бы после
  // первой же правки.
  const [blocks, setBlocks] = useState([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/details`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setBlocks(json.info_blocks || []);
    } catch { /* оставляем прежний список: панель не должна падать из-за сети */ }
  }, [communityId]);

  useEffect(() => { reload(); }, [reload]);

  // После правки обновляем и свой список, и страницу под панелью
  const refresh = useCallback(async () => {
    await reload();
    await onSaved?.();
  }, [reload, onSaved]);
  const accentColor = activeBrandColor || null;
  const base = `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/info-blocks`;

  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [blockToDelete, setBlockToDelete] = useState(null);
  const [error, setError] = useState('');

  // Новый блок: форма появляется по кнопке и живёт до сохранения или отмены
  const [isAdding, setIsAdding] = useState(false);
  const [newBlock, setNewBlock] = useState({ title: '', content: '' });

  const draftOf = (block) => drafts[block.id] || { title: block.title, content: block.content || '' };
  const patchDraft = (blockId, patch) => {
    setDrafts(prev => ({ ...prev, [blockId]: { ...prev[blockId], ...patch } }));
  };

  const startEdit = (block) => {
    if (editingId === block.id) { setEditingId(null); return; }
    setDrafts(prev => ({ ...prev, [block.id]: { title: block.title, content: block.content || '' } }));
    setEditingId(block.id);
  };

  const createBlock = async () => {
    const title = newBlock.title.trim();
    if (!title) return;
    setSavingId('new');
    setError('');
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title, content: newBlock.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось добавить блок');
      setNewBlock({ title: '', content: '' });
      setIsAdding(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const saveBlock = async (block) => {
    const draft = draftOf(block);
    if (!draft.title.trim()) return;
    setSavingId(block.id);
    setError('');
    try {
      const res = await fetch(`${base}/${block.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: draft.title, content: draft.content }),
      });
      if (!res.ok) throw new Error('Не удалось сохранить блок');
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const deleteBlock = async () => {
    const block = blockToDelete;
    setBlockToDelete(null);
    if (!block) return;
    try {
      const res = await fetch(`${base}/${block.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Не удалось удалить блок');
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-hide text-left">
      <div className="flex flex-col gap-3 px-3 py-4 pb-32">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[14px] font-semibold">
            {error}
          </div>
        )}

        <p className="text-[11px] text-content-subtle leading-relaxed px-1">
          Блоки показываются во вкладке «Инфо» аккордеонами. Порядок меняется
          стрелками там же — так видно, что получилось.
        </p>

        {blocks.map(block => (
          <PanelBlock
            key={block.id}
            title={block.title}
            icon="roster"
            accentColor={accentColor}
            canEdit
            isEditing={editingId === block.id}
            onToggleEdit={() => startEdit(block)}
            isSaving={savingId === block.id}
          >
            {editingId === block.id ? (
              <div className="flex flex-col gap-3 pt-1">
                <TextInputLP
                  label="Название"
                  value={draftOf(block).title}
                  onChange={val => patchDraft(block.id, { title: val })}
                  size="sm"
                  maxLength={100}
                  activeColor={accentColor}
                />
                <TextInputLP
                  type="textarea"
                  rows={5}
                  label="Текст"
                  value={draftOf(block).content}
                  onChange={val => patchDraft(block.id, { content: val })}
                  size="sm"
                  activeColor={accentColor}
                />
                <ButtonLP
                  onClick={() => saveBlock(block)}
                  disabled={savingId === block.id}
                  activeColor={accentColor}
                  className="w-full py-2.5"
                >
                  Сохранить
                </ButtonLP>
                <button
                  type="button"
                  onClick={() => setBlockToDelete(block)}
                  className="text-[10px] font-bold text-danger uppercase tracking-widest py-1 outline-none self-center"
                >
                  Удалить блок
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-content-main leading-relaxed whitespace-pre-line line-clamp-4">
                {block.content || <span className="text-content-subtle italic">Блок пока пустой</span>}
              </p>
            )}
          </PanelBlock>
        ))}

        {isAdding ? (
          <PanelBlock
            title="Новый блок"
            icon="plus"
            accentColor={accentColor}
            canEdit
            isEditing
            onToggleEdit={() => { setIsAdding(false); setNewBlock({ title: '', content: '' }); }}
            isSaving={savingId === 'new'}
          >
            <div className="flex flex-col gap-3 pt-1">
              <TextInputLP
                label="Название"
                value={newBlock.title}
                onChange={val => setNewBlock(prev => ({ ...prev, title: val }))}
                placeholder="Правила, Полезное…"
                size="sm"
                maxLength={100}
                activeColor={accentColor}
              />
              <TextInputLP
                type="textarea"
                rows={5}
                label="Текст"
                value={newBlock.content}
                onChange={val => setNewBlock(prev => ({ ...prev, content: val }))}
                size="sm"
                activeColor={accentColor}
              />
              <ButtonLP
                onClick={createBlock}
                disabled={!newBlock.title.trim() || savingId === 'new'}
                activeColor={accentColor}
                className="w-full py-2.5"
              >
                Сохранить
              </ButtonLP>
            </div>
          </PanelBlock>
        ) : (
          <AddRowButton label="Добавить блок" accentColor={accentColor} onClick={() => setIsAdding(true)} />
        )}
      </div>

      <ConfirmSheet
        isOpen={!!blockToDelete}
        onClose={() => setBlockToDelete(null)}
        onConfirm={deleteBlock}
        title="Удалить блок?"
        description={blockToDelete ? `«${blockToDelete.title}» исчезнет из вкладки «Инфо» вместе с текстом.` : ''}
        confirmLabel="Удалить"
        variant="danger"
      />
    </div>
  );
}
