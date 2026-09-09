import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Avatar } from '../../../ui/Avatar';
import { PaperDocTile } from '../../../ui/PaperDocTile';
import { NativeDateInputLP, TextInputLP } from '../../../ui/Input-LP';
import { CheckboxLP } from '../../../ui/Checkbox-LP';
import { ButtonLP } from '../../../ui/Button-LP';
import { ConfirmSheet } from '../../../ui/ConfirmSheet';
import { getAuthHeaders } from '../../../utils/helpers';

// Заголовки, пояснения и подписи состояния по типу документа. Пояснение объясняет главное:
// справка одна на всех, но в системе она разложится копиями по карточкам игроков —
// «командного документа» как отдельной сущности у заявки нет.
//
// Согласия здесь нет намеренно: его подписывает каждый лично, общего согласия не бывает.
export const TEAM_DOC_META = {
  medical: {
    title: 'Мед. справка команды',
    // Флаг дивизиона, включающий этот документ, и короткая подпись строки в карточке заявки
    reqKey: 'req_med_cert',
    rowHint: 'Общая справка команды',
    hint: 'Общая медицинская справка на команду. Добавится всем отмеченным ирокам.',
    fileLabel: 'Файл справки',
    uploadLabel: 'Загрузить справку',
    empty: 'Справка не загружена',
    loaded: 'Справка загружена',
    replaced: 'Справка будет заменена',
  },
  insurance: {
    title: 'Полис команды',
    reqKey: 'req_insurance',
    rowHint: 'Общий полис команды',
    hint: 'Общий страховой полис на команду. Добавится всем отмеченным ирокам.',
    fileLabel: 'Файл полиса',
    uploadLabel: 'Загрузить полис',
    empty: 'Полис не загружен',
    loaded: 'Полис загружен',
    replaced: 'Полис будет заменён',
  },
};

const toDateInputValue = (value) => (value ? String(value).slice(0, 10) : '');

const formatDate = (value) => {
  const iso = toDateInputValue(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const fullName = (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim();

// Одна справка сразу нескольким людям заявки. Отмечает их менеджер сам: в списке справки
// есть не все — кого-то допустили по личной, кого-то заявили уже после её выдачи.
//
// В списке и состав, и штаб: документы лежат на человеке в заявке, и играющий тренер в
// бумажной справке обычно идёт общей строкой. Такой человек в списке ровно один — иначе
// он получил бы две отметки на один комплект документов.
export function TeamDocsBulkModal({ data, onClose }) {
  const { teamId, appId, roster = [], staff = [], docType = 'medical', activeBrandColor, loadData, onApplied } = data || {};

  const meta = TEAM_DOC_META[docType] || TEAM_DOC_META.medical;
  const urlKey = `${docType}_url`;
  const expiresKey = `${docType}_expires_at`;

  const players = useMemo(() => {
    const byUser = new Map();
    // В строке состава человек опознаётся по player_id, в строке штаба — по user_id
    [...roster.map(p => ({ ...p, user_id: p.player_id })), ...staff].forEach(p => {
      const key = String(p.user_id);
      if (!byUser.has(key)) byUser.set(key, p);
    });
    return [...byUser.values()].sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru'));
  }, [roster, staff]);

  const [file, setFile] = useState(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [search, setSearch] = useState('');
  // По умолчанию отмечены те, у кого документа ещё нет: обычный случай — справка на всю
  // команду, а тем, у кого файл уже лежит, замену менеджер отмечает осознанно.
  const [selectedIds, setSelectedIds] = useState(() => new Set(players.filter(p => !p[urlKey]).map(p => String(p.user_id))));
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const filtered = players.filter(p => fullName(p).toLowerCase().includes(search.trim().toLowerCase()));
  const filledCount = players.filter(p => p[urlKey]).length;
  const replacedCount = players.filter(p => selectedIds.has(String(p.user_id)) && p[urlKey]).length;

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const setAll = (checked) => setSelectedIds(checked ? new Set(players.map(p => String(p.user_id))) : new Set());

  const apply = async () => {
    setIsSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);
      formData.append('expires_at', expiresAt || '');
      formData.append('userIds', JSON.stringify([...selectedIds].map(Number)));

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}/docs/bulk`,
        { method: 'POST', headers: getAuthHeaders(), body: formData }
      );
      const json = await res.json();

      if (json.success) {
        setConfirmOpen(false);
        if (loadData) await loadData();
        onApplied?.(json.updated ?? selectedIds.size);
        onClose?.();
      } else {
        setConfirmOpen(false);
        setError(json.error || 'Не удалось применить документ');
      }
    } catch (err) {
      console.error('Ошибка массовой загрузки документа:', err);
      setConfirmOpen(false);
      setError('Ошибка соединения с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  // Замена файла безвозвратна (прежний удаляется из хранилища) — спрашиваем, только если
  // под замену действительно кто-то попал.
  const handleSubmit = () => {
    if (!file || selectedIds.size === 0 || isSaving) return;
    if (replacedCount > 0) setConfirmOpen(true);
    else apply();
  };

  if (!appId) return null;

  return (
    <div className="flex flex-col h-full bg-surface-level2 text-left overflow-hidden">
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-surface-border">
        <span className="text-[18px] font-black text-content-main block">{meta.title}</span>
        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">
          Загружено {filledCount} из {players.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 flex flex-col gap-3">
        <p className="text-[13px] font-medium text-content-muted leading-relaxed">{meta.hint}</p>

        <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex flex-col gap-3">
          <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">{meta.fileLabel}</span>
          <PaperDocTile
            pendingLabel={file?.name}
            emptyLabel={meta.uploadLabel}
            editable
            onUpload={setFile}
            onDeleteClick={() => setFile(null)}
            activeBrandColor={activeBrandColor}
          />
          <NativeDateInputLP
            label="Действует до"
            value={expiresAt}
            onChange={setExpiresAt}
            activeColor={activeBrandColor}
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">
            Кому применить · {selectedIds.size}
          </span>
          <button
            type="button"
            onClick={() => setAll(selectedIds.size !== players.length)}
            className="text-[12px] font-bold text-content-muted active:opacity-70 transition-opacity"
            style={activeBrandColor ? { color: activeBrandColor } : {}}
          >
            {selectedIds.size === players.length ? 'Снять всё' : 'Выбрать всех'}
          </button>
        </div>

        <TextInputLP placeholder="Фамилия или имя..." value={search} onChange={setSearch} activeColor={activeBrandColor} />

        {/* Список алфавитный и общий, без разбивки по амплуа: его сверяют построчно с бумажной
            справкой, где фамилии идут одним столбцом. */}
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="text-center py-6 text-[14px] font-bold text-content-muted opacity-60">Ничего не найдено</div>
          ) : filtered.map(player => {
            const checked = selectedIds.has(String(player.user_id));
            const hasDoc = !!player[urlKey];
            const expires = formatDate(player[expiresKey]);

            return (
              <div
                key={player.user_id}
                onClick={() => toggle(String(player.user_id))}
                className="w-full py-3 px-4 border border-surface-border rounded-xl flex items-center justify-between gap-3 bg-surface-level2 select-none cursor-pointer active:scale-[0.995] transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    photoUrl={player.team_member_photo_url || player.user_avatar_url}
                    firstName={player.first_name}
                    lastName={player.last_name}
                    className="w-10 h-10 rounded-xl bg-surface-level1"
                  />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-[14px] font-bold text-content-main truncate">{player.last_name} {player.first_name}</span>
                    <span className={clsx(
                      "text-[11px] font-medium mt-0.5 leading-tight truncate",
                      checked && hasDoc ? "text-danger font-bold" : "text-content-muted"
                    )}>
                      {checked && hasDoc
                        ? meta.replaced
                        : hasDoc
                          ? (expires ? `Действует до ${expires}` : meta.loaded)
                          : meta.empty}
                    </span>
                  </div>
                </div>

                {/* Клик обрабатывает строка целиком — на телефоне попасть в чекбокс сложнее,
                    чем в строку, поэтому сам чекбокс здесь только показывает состояние. */}
                <div className="pointer-events-none shrink-0">
                  <CheckboxLP checked={checked} onChange={() => {}} activeColor={activeBrandColor} />
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="text-[14px] font-medium text-danger">{error}</div>}
      </div>

      <div className="p-4 shrink-0 border-t border-surface-border bg-surface-level2">
        <ButtonLP
          onClick={handleSubmit}
          isLoading={isSaving}
          disabled={!file || selectedIds.size === 0 || isSaving}
          activeColor={activeBrandColor}
          className={clsx((!file || selectedIds.size === 0) && "opacity-50")}
        >
          {!file
            ? 'Выберите файл'
            : selectedIds.size === 0
              ? 'Отметьте людей'
              : `Применить ${selectedIds.size} ${selectedIds.size === 1 ? 'человеку' : 'людям'}`}
        </ButtonLP>
      </div>

      <ConfirmSheet
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={apply}
        isLoading={isSaving}
        title="Заменить загруженные файлы?"
        description={
          <>
            У <span className="font-bold text-content-main">{replacedCount}</span> из отмеченных игроков файл уже загружен.
            Он будет заменён этой справкой и удалён из хранилища безвозвратно.
          </>
        }
        confirmLabel="Да, применить"
        variant="danger"
      />
    </div>
  );
}
