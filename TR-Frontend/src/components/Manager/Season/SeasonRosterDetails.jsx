import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Icon } from '../../../ui/Icon';
import { Avatar } from '../../../ui/Avatar';
import { Table } from '../../../ui/Table';
import { ContainerContent } from '../../../ui/ContainerContent';
import { ButtonLP } from '../../../ui/Button-LP';
import { CheckboxLP } from '../../../ui/Checkbox-LP';
import { TextInputLP } from '../../../ui/Input-LP';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ConfirmSheet } from '../../../ui/ConfirmSheet';
import { PaperDocTile } from '../../../ui/PaperDocTile';
import { Toast } from '../../../ui/Toast';
import { PageLoader } from '../../../ui/Loader';
import { getAuthHeaders, getImageUrl } from '../../../utils/helpers';
import {
  STATUS_META, ROLE_OPTIONS, ROLE_LABELS,
  POSITION_OPTIONS_SHORT, POSITION_LABELS_SHORT,
  ROSTER_VERDICT_META, getDocsSummary, apiCall
} from './seasonUtils';

// Общая "пилюльная" геометрия для колонок Док-ты и Допуск в таблице состава — единый визуальный стиль
// (радиус, высота, шрифт, тень), цвет/заливка и ширина настраиваются отдельно в каждой колонке.
const PILL_CLASS = "inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[12px] font-bold shadow-sm";

// Нижняя шторка редактирования игрока внутри заявки: амплуа, номер, капитанство, удаление.
// Документы допуска редактируются отдельно — из таблицы состава, правой панелью (см. handleOpenDocs).
function PlayerEditSheet({ isOpen, onClose, player, roster = [], canEdit, activeBrandColor, onSave, onRemove }) {
  const [position, setPosition] = useState('forward');
  const [jersey, setJersey] = useState('');
  const [isCaptain, setIsCaptain] = useState(false);
  const [isAssistant, setIsAssistant] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [displayedPlayer, setDisplayedPlayer] = useState(null);
  const [sheetError, setSheetError] = useState('');

  useEffect(() => {
    if (player) {
      setDisplayedPlayer(player);
      setPosition(player.position || 'forward');
      setJersey(player.jersey_number != null ? String(player.jersey_number) : '');
      setIsCaptain(!!player.is_captain);
      setIsAssistant(!!player.is_assistant);
      setSheetError('');
    }
  }, [player]);

  // Действующий капитан/ассистенты среди остальных игроков заявки (кроме текущего) —
  // нужно, чтобы предупредить менеджера, если роль уже занята
  const otherCaptain = displayedPlayer ? roster.find(p => p.id !== displayedPlayer.id && p.is_captain) : null;
  const otherAssistants = displayedPlayer ? roster.filter(p => p.id !== displayedPlayer.id && p.is_assistant) : [];

  const handleSave = async () => {
    if (!displayedPlayer) return;
    setSheetError('');

    if (isCaptain && otherCaptain) {
      setSheetError(`Капитан уже назначен: ${otherCaptain.last_name || ''} ${otherCaptain.first_name || ''}. Сначала снимите статус с него.`);
      return;
    }
    if (isAssistant && otherAssistants.length >= 2) {
      setSheetError('В заявке уже назначено 2 ассистента. Снимите статус с одного из них.');
      return;
    }

    setIsSaving(true);
    await onSave(displayedPlayer.id, {
      position,
      jersey_number: jersey === '' ? null : Number(jersey),
      is_captain: isCaptain,
      is_assistant: isAssistant,
    });
    setIsSaving(false);
    onClose();
  };

  const verdict = displayedPlayer ? (ROSTER_VERDICT_META[displayedPlayer.application_status] || ROSTER_VERDICT_META.draft) : null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {displayedPlayer && (
        <div className="flex flex-col gap-5 text-left">
          <div className="flex items-center gap-3 pb-4 border-b border-surface-border">
            <Avatar photoUrl={displayedPlayer.team_member_photo_url || displayedPlayer.user_avatar_url} firstName={displayedPlayer.first_name} lastName={displayedPlayer.last_name} className="w-14 h-14 rounded-2xl bg-surface-level2" />
            <div className="flex flex-col min-w-0">
              <span className="text-[18px] font-black text-content-main leading-tight truncate">{displayedPlayer.last_name}</span>
              <span className="text-[14px] text-content-muted font-bold truncate">{displayedPlayer.first_name}</span>
              <span className={clsx("text-[10px] font-black uppercase tracking-wider mt-1", verdict.className)}>{verdict.label}</span>
            </div>
          </div>

          {canEdit ? (
            <>
              {sheetError && (
                <div className="p-3 rounded-xl bg-danger/10 text-danger text-[14px] font-medium">
                  {sheetError}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-content-subtle uppercase tracking-widest">Амплуа</span>
                <SegmentedControl options={POSITION_OPTIONS_SHORT} value={position} onChange={setPosition} activeColor={activeBrandColor} />
              </div>
              <TextInputLP label="Игровой номер" value={jersey} onChange={(v) => setJersey(v.replace(/\D/g, '').slice(0, 3))} placeholder="Например: 17" activeColor={activeBrandColor} />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-6">
                  <CheckboxLP checked={isCaptain} onChange={(v) => { setSheetError(''); setIsCaptain(v); if (v) setIsAssistant(false); }} label="Капитан" activeColor={activeBrandColor} />
                  <CheckboxLP checked={isAssistant} onChange={(v) => { setSheetError(''); setIsAssistant(v); if (v) setIsCaptain(false); }} label="Ассистент" activeColor={activeBrandColor} />
                </div>
                {otherCaptain && !isCaptain && (
                  <span className="text-[12px] text-content-subtle">Капитан сейчас: {otherCaptain.last_name} {otherCaptain.first_name}</span>
                )}
                {otherAssistants.length >= 2 && !isAssistant && (
                  <span className="text-[12px] text-content-subtle">Ассистенты заняты: {otherAssistants.map(a => a.last_name).join(', ')}</span>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1 text-[14px] font-medium text-content-muted">
              <span>Амплуа: {POSITION_LABELS_SHORT[displayedPlayer.position] || '—'}</span>
              <span>Номер: {displayedPlayer.jersey_number ?? '—'}</span>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-col gap-2 pt-1">
              <ButtonLP onClick={handleSave} isLoading={isSaving} activeColor={activeBrandColor}>Сохранить</ButtonLP>
              <ButtonLP variant="outline" onClick={() => { onRemove(displayedPlayer.id); onClose(); }} className="!text-danger">Убрать из заявки</ButtonLP>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// Нижняя шторка редактирования роли сотрудника штаба внутри заявки
function StaffEditSheet({ isOpen, onClose, person, canEdit, activeBrandColor, onSave, onRemove }) {
  const [role, setRole] = useState('coach');
  const [isSaving, setIsSaving] = useState(false);
  const [displayedPerson, setDisplayedPerson] = useState(null);

  useEffect(() => {
    if (person) {
      setDisplayedPerson(person);
      setRole(person.role || 'coach');
    }
  }, [person]);

  const handleSave = async () => {
    if (!displayedPerson) return;
    setIsSaving(true);
    await onSave(displayedPerson.user_id, role);
    setIsSaving(false);
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {displayedPerson && (
        <div className="flex flex-col gap-5 text-left">
          <div className="flex items-center gap-3 pb-4 border-b border-surface-border">
            <Avatar photoUrl={displayedPerson.team_member_photo_url || displayedPerson.user_avatar_url} firstName={displayedPerson.first_name} lastName={displayedPerson.last_name} className="w-14 h-14 rounded-2xl bg-surface-level2" />
            <div className="flex flex-col min-w-0">
              <span className="text-[18px] font-black text-content-main leading-tight truncate">{displayedPerson.last_name}</span>
              <span className="text-[14px] text-content-muted font-bold truncate">{displayedPerson.first_name}</span>
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-content-subtle uppercase tracking-widest">Роль в заявке</span>
              {ROLE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setRole(o.value)}
                  style={role === o.value && activeBrandColor ? { borderColor: activeBrandColor, color: activeBrandColor, backgroundColor: `${activeBrandColor}1a` } : {}}
                  className={clsx(
                    "w-full p-3.5 rounded-xl text-left text-[14px] font-bold border transition-all",
                    role === o.value ? (!activeBrandColor && "border-brand text-brand bg-brand/10") : "border-surface-border text-content-muted"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[14px] font-medium text-content-muted">Роль: {ROLE_LABELS[displayedPerson.role] || displayedPerson.role}</span>
          )}

          {canEdit && (
            <div className="flex flex-col gap-2 pt-1">
              <ButtonLP onClick={handleSave} isLoading={isSaving} activeColor={activeBrandColor}>Сохранить</ButtonLP>
              <ButtonLP variant="outline" onClick={() => { onRemove(displayedPerson.user_id); onClose(); }} className="!text-danger">Убрать из заявки</ButtonLP>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// Нижняя шторка добавления игрока в заявку из активного состава команды
function AddPlayerSheet({ isOpen, onClose, teamId, appId, activeBrandColor, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSelectedIds(new Set());
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}/roster-picker`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success) setPlayers(json.players || []); })
      .catch(err => console.error('Ошибка загрузки состава команды:', err))
      .finally(() => setIsLoading(false));
  }, [isOpen, teamId, appId]);

  const filtered = players.filter(p => `${p.last_name} ${p.first_name}`.toLowerCase().includes(search.trim().toLowerCase()));

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || isSaving) return;
    setIsSaving(true);
    const json = await apiCall(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}/roster`, {
      method: 'POST', body: JSON.stringify({ playerIds: Array.from(selectedIds) })
    });
    setIsSaving(false);
    if (json.success) {
      await onSuccess();
      onClose();
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4 text-left">
        <h3 className="text-[18px] font-black text-content-main">Добавить игрока</h3>
        <TextInputLP placeholder="Фамилия или имя..." value={search} onChange={setSearch} activeColor={activeBrandColor} />
        {isLoading ? (
          <div className="py-8"><PageLoader /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-[14px] font-bold text-content-muted opacity-60">
            {players.length === 0 ? 'Все игроки состава уже добавлены в эту заявку' : 'Ничего не найдено'}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto scrollbar-hide">
            {filtered.map(player => (
              <div key={player.id} onClick={() => toggle(player.id)} className="w-full py-3 px-4 border border-surface-border rounded-xl flex items-center justify-between bg-surface-level2 cursor-pointer select-none active:scale-[0.995] transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar photoUrl={player.photo_url || player.avatar_url} firstName={player.first_name} lastName={player.last_name} className="w-10 h-10 rounded-xl" />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-[14px] font-bold text-content-main truncate">{player.last_name} {player.first_name}</span>
                    <span className="text-[10px] text-content-muted uppercase font-bold tracking-wider mt-0.5">{player.jersey_number ? `№${player.jersey_number}` : '—'}</span>
                  </div>
                </div>
                <CheckboxLP checked={selectedIds.has(player.id)} onChange={() => toggle(player.id)} activeColor={activeBrandColor} />
              </div>
            ))}
          </div>
        )}
        <ButtonLP onClick={handleSubmit} isLoading={isSaving} disabled={selectedIds.size === 0 || isSaving} activeColor={activeBrandColor} className="mt-1">
          Добавить {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}

// Нижняя шторка добавления сотрудника штаба в заявку
function AddStaffSheet({ isOpen, onClose, teamId, appId, activeBrandColor, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedRoles, setSelectedRoles] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSelectedRoles({});
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}/roster-picker`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success) setStaff(json.staff || []); })
      .catch(err => console.error('Ошибка загрузки штаба команды:', err))
      .finally(() => setIsLoading(false));
  }, [isOpen, teamId, appId]);

  const filtered = staff.filter(p => `${p.last_name} ${p.first_name}`.toLowerCase().includes(search.trim().toLowerCase()));

  const toggle = (person) => setSelectedRoles(prev => {
    const next = { ...prev };
    if (next[person.id]) {
      delete next[person.id];
    } else {
      const teamRoles = (person.roles || '').split(',').map(r => r.trim());
      next[person.id] = ROLE_OPTIONS.find(o => teamRoles.includes(o.value))?.value || ROLE_OPTIONS[0].value;
    }
    return next;
  });

  const selectedCount = Object.keys(selectedRoles).length;

  const handleSubmit = async () => {
    if (selectedCount === 0 || isSaving) return;
    setIsSaving(true);
    const results = await Promise.all(Object.entries(selectedRoles).map(([userId, role]) =>
      apiCall(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}/staff`, {
        method: 'POST', body: JSON.stringify({ userId: Number(userId), roles: [role] })
      })
    ));
    setIsSaving(false);
    if (!results.find(r => !r.success)) {
      await onSuccess();
      onClose();
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4 text-left">
        <h3 className="text-[18px] font-black text-content-main">Добавить сотрудника</h3>
        <TextInputLP placeholder="Фамилия или имя..." value={search} onChange={setSearch} activeColor={activeBrandColor} />
        {isLoading ? (
          <div className="py-8"><PageLoader /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-[14px] font-bold text-content-muted opacity-60">
            {staff.length === 0 ? 'Весь штаб команды уже добавлен в эту заявку' : 'Ничего не найдено'}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto scrollbar-hide">
            {filtered.map(person => {
              const isSelected = !!selectedRoles[person.id];
              return (
                <div key={person.id} className="w-full p-3 border border-surface-border rounded-xl bg-surface-level2 flex flex-col gap-3">
                  <div onClick={() => toggle(person)} className="flex items-center justify-between cursor-pointer select-none active:scale-[0.995] transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar photoUrl={person.photo_url || person.avatar_url} firstName={person.first_name} lastName={person.last_name} className="w-10 h-10 rounded-xl" />
                      <span className="text-[14px] font-bold text-content-main truncate">{person.last_name} {person.first_name}</span>
                    </div>
                    <CheckboxLP checked={isSelected} onChange={() => toggle(person)} activeColor={activeBrandColor} />
                  </div>
                  {isSelected && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {ROLE_OPTIONS.map(o => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setSelectedRoles(prev => ({ ...prev, [person.id]: o.value }))}
                          style={selectedRoles[person.id] === o.value && activeBrandColor ? { borderColor: activeBrandColor, color: activeBrandColor, backgroundColor: `${activeBrandColor}1a` } : {}}
                          className={clsx(
                            "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border",
                            selectedRoles[person.id] === o.value ? (!activeBrandColor && "border-brand text-brand bg-brand/10") : "border-surface-border text-content-muted"
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <ButtonLP onClick={handleSubmit} isLoading={isSaving} disabled={selectedCount === 0 || isSaving} activeColor={activeBrandColor} className="mt-1">
          Добавить {selectedCount > 0 ? `(${selectedCount})` : ''}
        </ButtonLP>
      </div>
    </BottomSheet>
  );
}

// Содержательная часть экрана деталей заявки — карточка-сводка, бумажный блок, состав/штаб,
// действия и все шторки редактирования. Рендерится внутри SeasonRostersDetailsPage.jsx (pages/).
export function SeasonRosterDetails({ app, teamId, onClose, activeBrandColor, openRightPanel, loadData }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPaper, setIsUploadingPaper] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePaperConfirmOpen, setDeletePaperConfirmOpen] = useState(false);
  const [isDeletingPaper, setIsDeletingPaper] = useState(false);
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  const triggerToast = (message, type = 'success') => setToast({ isOpen: true, message, type });
  const notifyError = (message) => triggerToast(message, 'danger');

  const baseUrl = `${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${app.id}`;

  const statusMeta = STATUS_META[app.status] || STATUS_META.draft;
  const isPaperBlocked = !app.digital_applications_only && !app.paper_roster_league_url;
  const canEdit = ['draft', 'revision'].includes(app.status) && !isPaperBlocked;
  const canDeleteApp = ['draft', 'rejected'].includes(app.status);

  const handleSendReview = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const json = await apiCall(`${baseUrl}/send-review`, { method: 'POST' });
      if (json.success) {
        await loadData();
        triggerToast('Заявка отправлена на проверку', 'success');
      } else {
        notifyError(json.error || 'Не удалось отправить заявку');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePlayer = async (rosterId, patch) => {
    const json = await apiCall(`${baseUrl}/roster/${rosterId}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (json.success) { await loadData(); } else notifyError(json.error || 'Не удалось сохранить изменения');
  };

  const handleRemovePlayer = async (rosterId) => {
    const json = await apiCall(`${baseUrl}/roster/${rosterId}`, { method: 'DELETE' });
    if (json.success) { await loadData(); } else notifyError(json.error || 'Не удалось убрать игрока из заявки');
  };

  const handleSaveStaff = async (userId, role) => {
    const json = await apiCall(`${baseUrl}/staff`, { method: 'POST', body: JSON.stringify({ userId, roles: [role] }) });
    if (json.success) { await loadData(); } else notifyError(json.error || 'Не удалось изменить роль сотрудника');
  };

  const handleRemoveStaff = async (userId) => {
    const json = await apiCall(`${baseUrl}/staff/${userId}`, { method: 'DELETE' });
    if (json.success) { await loadData(); } else notifyError(json.error || 'Не удалось убрать сотрудника из заявки');
  };

  const handleUploadPaper = async (file) => {
    setIsUploadingPaper(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const json = await apiCall(`${baseUrl}/paper`, { method: 'POST', body: formData });
      if (json.success) { await loadData(); } else notifyError(json.error || 'Не удалось загрузить скан заявки');
    } finally {
      setIsUploadingPaper(false);
    }
  };

  const handleDelete = async () => {
    const json = await apiCall(baseUrl, { method: 'DELETE' });
    if (json.success) {
      setDeleteConfirmOpen(false);
      onClose();
    } else {
      notifyError(json.error || 'Не удалось удалить заявку');
    }
  };

  const handleDeletePaper = async () => {
    setIsDeletingPaper(true);
    try {
      const json = await apiCall(`${baseUrl}/paper`, { method: 'DELETE' });
      if (json.success) {
        setDeletePaperConfirmOpen(false);
        await loadData();
      } else {
        notifyError(json.error || 'Не удалось удалить скан заявки');
      }
    } finally {
      setIsDeletingPaper(false);
    }
  };

  const handleOpenDocs = (player, e) => {
    if (e) e.stopPropagation();
    openRightPanel('playerDocs', { teamId, appId: app.id, player, division: app, editable: canEdit, loadData, activeBrandColor }, 'Документы игрока');
  };

  const rosterColumns = [
    {
      key: 'photo', title: '№', width: '48px', align: 'center', sortable: true,
      sortValue: (p) => p.jersey_number,
      render: (p) => (
        <div className="relative w-9 h-9 shrink-0 mx-auto">
          <Avatar
            photoUrl={p.team_member_photo_url || p.user_avatar_url}
            firstName={p.first_name}
            lastName={p.last_name}
            className="w-10 h-10 rounded-lg bg-surface-level2"
          />
          {p.jersey_number != null && (
            <span className="absolute -bottom-2 -left-1 min-w-[22px] min-h-[15px] p-0.5 rounded-full bg-content-main text-content-dark text-[10px] font-black flex items-center justify-center border border-surface-level1 leading-none tabular-nums z-10">
              {p.jersey_number}
            </span>
          )}
          {(p.is_captain || p.is_assistant) && (
            <span
              className="absolute -top-1.5 -right-2.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm z-20"
              style={{ backgroundColor: activeBrandColor || 'var(--color-brand)' }}
            >
              {p.is_captain ? 'К' : 'А'}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'name', title: 'Игрок', sortable: true,
      sortValue: (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim().toLowerCase(),
      render: (p) => (
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-bold text-content-main truncate">{p.last_name}</span>
          <span className="text-[12px] text-content-muted font-normal truncate">{p.first_name}</span>
        </div>
      )
    },
    {
      key: 'docs', title: 'Док-ты', width: '68px', align: 'center',
      render: (p) => {
        const summary = getDocsSummary(p, app);
        if (!summary) return <span className="text-content-subtle">—</span>;
        return (
          <button
            type="button"
            onClick={(e) => handleOpenDocs(p, e)}
            className={clsx(PILL_CLASS, "gap-1.5 active:scale-95 transition-transform", summary.className)}
          >
            <Icon name="file" className="w-5.5 h-3.5" />
            {summary.label}
          </button>
        );
      }
    },
    {
      key: 'status', title: 'Допуск', width: '76px', align: 'center', sortable: true,
      sortValue: (p) => (p.application_status === 'approved' ? 0 : 1),
      render: (p) => {
        const admitted = p.application_status === 'approved';
        return (
          <span className={clsx(PILL_CLASS, "w-[74px]", admitted ? "bg-success text-white" : "bg-surface-level2 text-content-muted")}>
            {admitted ? 'Доп.' : 'Не доп.'}
          </span>
        );
      }
    },
  ];

  const staffColumns = [
    {
      key: 'photo', title: '', width: '52px',
      render: (s) => <Avatar photoUrl={s.team_member_photo_url || s.user_avatar_url} firstName={s.first_name} lastName={s.last_name} className="w-11 h-11 rounded-xl bg-surface-level2" />
    },
    {
      key: 'name', title: 'Сотрудник', sortable: true,
      sortValue: (s) => `${s.last_name || ''} ${s.first_name || ''}`.trim().toLowerCase(),
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-bold text-content-main leading-tight">{s.last_name}</span>
          <span className="text-[14px] text-content-muted mt-0.5">{s.first_name}</span>
        </div>
      )
    },
    {
      key: 'role', title: 'Роль', align: 'right', sortable: true,
      sortValue: (s) => ROLE_LABELS[s.role] || s.role || '',
      render: (s) => (
        <span className="text-[10px] font-black uppercase tracking-widest" style={activeBrandColor ? { color: activeBrandColor } : {}}>
          {ROLE_LABELS[s.role] || s.role}
        </span>
      )
    },
  ];

  return (
    <div className="p-3 flex flex-col gap-4 pb-24">

      <div className="w-full bg-surface-level1 rounded-3xl shadow-md p-5 flex flex-col gap-3">
        <span className="text-[16px] font-black text-content-main leading-snug line-clamp-2">{app.league_name}</span>

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
            <span className="text-[14px] font-bold text-content-main truncate">{app.division_name}</span>
            <span className={clsx("self-start mt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-surface-level2", statusMeta.text)}>
              <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", statusMeta.dot)} />
              {statusMeta.label}
            </span>
          </div>
        </div>
      </div>

      {isPaperBlocked && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded-2xl text-[14px] font-medium text-danger leading-relaxed">
          Ожидается проверка загруженного бумажного заявочного листа лигой. Редактирование состава и штаба будет доступно после публикации решения лиги.
        </div>
      )}

      {!app.digital_applications_only && (
        <div className="w-full bg-surface-level1 rounded-3xl shadow-md p-5 flex flex-col gap-3">
          <PaperDocTile
            url={app.paper_roster_team_url}
            doneLabel="Ваш скан"
            emptyLabel={canEdit ? 'Загрузить скан заявки' : 'Файл не загружен'}
            editable={canEdit}
            onUpload={handleUploadPaper}
            onDeleteClick={() => setDeletePaperConfirmOpen(true)}
            uploading={isUploadingPaper}
            activeBrandColor={activeBrandColor}
          />

          <PaperDocTile url={app.paper_roster_league_url} doneLabel="Скан лиги" emptyLabel="Ожидает лигу" tone="success" />
        </div>
      )}

      {[
        { key: 'goalie', label: 'Вратари', data: (app.roster || []).filter(p => p.position === 'goalie') },
        { key: 'defense', label: 'Защитники', data: (app.roster || []).filter(p => p.position === 'defense') },
        { key: 'forward', label: 'Нападающие', data: (app.roster || []).filter(p => p.position === 'forward') },
      ].map(group => (
        <ContainerContent
          key={group.key}
          title={group.label}
          count={group.data.length}
          activeBrandColor={activeBrandColor}
          action={canEdit ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsAddPlayerOpen(true); }} className="p-1 text-content-muted hover:opacity-80 transition-colors" style={activeBrandColor ? { color: activeBrandColor } : {}}>
              <Icon name="user_plus" className="w-5 h-5" />
            </button>
          ) : null}
        >
          {group.data.length > 0 ? (
            <Table columns={rosterColumns} data={group.data} rowKey="id" onRowClick={setSelectedPlayer} />
          ) : (
            <div className="text-center py-4 text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50">
              Игроки ещё не добавлены
            </div>
          )}
        </ContainerContent>
      ))}

      <ContainerContent
        title="Штаб"
        count={(app.staff || []).length}
        activeBrandColor={activeBrandColor}
        action={canEdit ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setIsAddStaffOpen(true); }} className="p-1 text-content-muted hover:opacity-80 transition-colors" style={activeBrandColor ? { color: activeBrandColor } : {}}>
            <Icon name="user_plus" className="w-5 h-5" />
          </button>
        ) : null}
      >
        {(app.staff || []).length > 0 ? (
          <Table columns={staffColumns} data={app.staff} rowKey="user_id" onRowClick={setSelectedStaff} />
        ) : (
          <div className="text-center py-4 text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50">
            Штаб ещё не добавлен
          </div>
        )}
      </ContainerContent>

      <div className="flex flex-col gap-2">
        {canEdit && (
          <ButtonLP onClick={handleSendReview} isLoading={isSubmitting} disabled={isSubmitting} activeColor={activeBrandColor} className="py-4 mt-6">
            Отправить на проверку
          </ButtonLP>
        )}
        {canDeleteApp && (
          <ButtonLP variant="outline" onClick={() => setDeleteConfirmOpen(true)} className="!text-danger">
            Удалить заявку
          </ButtonLP>
        )}
      </div>

      <PlayerEditSheet
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
        roster={app.roster || []}
        canEdit={canEdit}
        activeBrandColor={activeBrandColor}
        onSave={handleSavePlayer}
        onRemove={handleRemovePlayer}
      />

      <StaffEditSheet
        isOpen={!!selectedStaff}
        onClose={() => setSelectedStaff(null)}
        person={selectedStaff}
        canEdit={canEdit}
        activeBrandColor={activeBrandColor}
        onSave={handleSaveStaff}
        onRemove={handleRemoveStaff}
      />

      <AddPlayerSheet
        isOpen={isAddPlayerOpen}
        onClose={() => setIsAddPlayerOpen(false)}
        teamId={teamId}
        appId={app.id}
        activeBrandColor={activeBrandColor}
        onSuccess={loadData}
      />

      <AddStaffSheet
        isOpen={isAddStaffOpen}
        onClose={() => setIsAddStaffOpen(false)}
        teamId={teamId}
        appId={app.id}
        activeBrandColor={activeBrandColor}
        onSuccess={loadData}
      />

      <ConfirmSheet
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Удалить заявку?"
        description={<>Заявка в дивизион <span className="font-bold text-content-main">«{app.division_name}»</span> будет удалена безвозвратно.</>}
        confirmLabel="Да, удалить"
        variant="danger"
      />

      <ConfirmSheet
        isOpen={deletePaperConfirmOpen}
        onClose={() => setDeletePaperConfirmOpen(false)}
        onConfirm={handleDeletePaper}
        isLoading={isDeletingPaper}
        title="Удалить скан?"
        description="Загруженный вами скан бумажной заявки будет удалён. Вы сможете загрузить его заново."
        confirmLabel="Да, удалить"
        variant="danger"
      />

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
        activeColor={activeBrandColor}
      />
    </div>
  );
}
