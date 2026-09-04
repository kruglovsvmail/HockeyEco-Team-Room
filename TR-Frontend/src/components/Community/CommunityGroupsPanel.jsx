import React, { useState, useEffect, useCallback } from 'react';
import { ButtonLP } from '../../ui/Button-LP';
import { TextInputLP } from '../../ui/Input-LP';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { PanelBlock, AddRowButton } from './CommunityPanelBlock';
import { getAuthHeaders } from '../../utils/helpers';

// =============================================================================
// ТРЕНИРОВОЧНЫЕ ГРУППЫ
//
// Устроены так же, как блоки вкладки «Инфо»: заводятся одной формой, правятся
// карандашом. У группы есть описание — «начинающие, учимся кататься» объясняет
// участнику больше, чем одно название, а штабу помогает не перепутать группы.
// =============================================================================
export function CommunityGroupsPanel({
  communityId, activeBrandColor, onSaved,
}) {
  // Панель открыта на весь экран и живёт дольше одного сохранения, поэтому
  // список держит у себя: снимок, переданный при открытии, устарел бы после
  // первой же правки.
  const [groups, setGroups] = useState([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/details`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setGroups(json.groups || []);
    } catch { /* оставляем прежний список: панель не должна падать из-за сети */ }
  }, [communityId]);

  useEffect(() => { reload(); }, [reload]);

  // После правки обновляем и свой список, и страницу под панелью
  const refresh = useCallback(async () => {
    await reload();
    await onSaved?.();
  }, [reload, onSaved]);
  const accentColor = activeBrandColor || null;
  const base = `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/groups`;

  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [error, setError] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  const draftOf = (group) => drafts[group.id] || { name: group.name, description: group.description || '' };
  const patchDraft = (groupId, patch) => {
    setDrafts(prev => ({ ...prev, [groupId]: { ...prev[groupId], ...patch } }));
  };

  const startEdit = (group) => {
    if (editingId === group.id) { setEditingId(null); return; }
    setDrafts(prev => ({ ...prev, [group.id]: { name: group.name, description: group.description || '' } }));
    setEditingId(group.id);
  };

  const createGroup = async () => {
    const name = newGroup.name.trim();
    if (!name) return;
    setSavingId('new');
    setError('');
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name, description: newGroup.description, sort_order: groups.length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось создать группу');
      setNewGroup({ name: '', description: '' });
      setIsAdding(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const saveGroup = async (group) => {
    const draft = draftOf(group);
    if (!draft.name.trim()) return;
    setSavingId(group.id);
    setError('');
    try {
      const res = await fetch(`${base}/${group.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: draft.name, description: draft.description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить группу');
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const deleteGroup = async () => {
    const group = groupToDelete;
    setGroupToDelete(null);
    if (!group) return;
    try {
      const res = await fetch(`${base}/${group.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Не удалось удалить группу');
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
          Группа решает, какие тренировки человек видит в календаре и на какие
          может отметиться. Удаление группы никого не исключает — люди просто
          остаются без группы.
        </p>

        {groups.map(group => (
          <PanelBlock
            key={group.id}
            title={`${group.name} · ${group.members_count} чел.`}
            icon="users"
            accentColor={accentColor}
            canEdit
            isEditing={editingId === group.id}
            onToggleEdit={() => startEdit(group)}
            isSaving={savingId === group.id}
          >
            {editingId === group.id ? (
              <div className="flex flex-col gap-3 pt-1">
                <TextInputLP
                  label="Название"
                  value={draftOf(group).name}
                  onChange={val => patchDraft(group.id, { name: val })}
                  size="sm"
                  maxLength={100}
                  activeColor={accentColor}
                />
                <TextInputLP
                  type="textarea"
                  rows={4}
                  label="Описание"
                  value={draftOf(group).description}
                  onChange={val => patchDraft(group.id, { description: val })}
                  placeholder="Начинающие: учимся кататься и держать клюшку"
                  size="sm"
                  activeColor={accentColor}
                />
                <ButtonLP
                  onClick={() => saveGroup(group)}
                  disabled={savingId === group.id}
                  activeColor={accentColor}
                  className="w-full py-2.5"
                >
                  Сохранить
                </ButtonLP>
                <button
                  type="button"
                  onClick={() => setGroupToDelete(group)}
                  className="text-[10px] font-bold text-danger uppercase tracking-widest py-1 outline-none self-center"
                >
                  Удалить группу
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-content-main leading-relaxed whitespace-pre-line">
                {group.description || <span className="text-content-subtle italic">Описания нет</span>}
              </p>
            )}
          </PanelBlock>
        ))}

        {isAdding ? (
          <PanelBlock
            title="Новая группа"
            icon="plus"
            accentColor={accentColor}
            canEdit
            isEditing
            onToggleEdit={() => { setIsAdding(false); setNewGroup({ name: '', description: '' }); }}
            isSaving={savingId === 'new'}
          >
            <div className="flex flex-col gap-3 pt-1">
              <TextInputLP
                label="Название"
                value={newGroup.name}
                onChange={val => setNewGroup(prev => ({ ...prev, name: val }))}
                placeholder="Начинающие"
                size="sm"
                maxLength={100}
                activeColor={accentColor}
              />
              <TextInputLP
                type="textarea"
                rows={4}
                label="Описание"
                value={newGroup.description}
                onChange={val => setNewGroup(prev => ({ ...prev, description: val }))}
                placeholder="Кому подходит эта группа"
                size="sm"
                activeColor={accentColor}
              />
              <ButtonLP
                onClick={createGroup}
                disabled={!newGroup.name.trim() || savingId === 'new'}
                activeColor={accentColor}
                className="w-full py-2.5"
              >
                Сохранить
              </ButtonLP>
            </div>
          </PanelBlock>
        ) : (
          <AddRowButton label="Добавить группу" accentColor={accentColor} onClick={() => setIsAdding(true)} />
        )}
      </div>

      <ConfirmSheet
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onConfirm={deleteGroup}
        title="Удалить группу?"
        description={groupToDelete
          ? (groupToDelete.members_count > 0
              ? `В группе «${groupToDelete.name}» ${groupToDelete.members_count} чел. Они останутся в сообществе, но без группы — и будут видеть только тренировки, открытые для всех.`
              : `Группа «${groupToDelete.name}» пуста, удаление никого не заденет.`)
          : ''}
        confirmLabel="Удалить"
        variant="danger"
      />
    </div>
  );
}
