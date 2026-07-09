import React, { useState } from 'react';
import { PaperDocTile } from '../../../ui/PaperDocTile';
import { NativeDateInputLP } from '../../../ui/Input-LP';
import { ConfirmSheet } from '../../../ui/ConfirmSheet';
import { getAuthHeaders } from '../../../utils/helpers';

// Postgres date -> "YYYY-MM-DD" для <input type="date">
const toDateInputValue = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const DOC_LABELS = {
  medical: 'медицинскую справку',
  insurance: 'страховой полис',
  consent: 'согласие',
};

function DocBlock({ title, fileUrl, expiresAt, editable, uploading, onFileChange, onDeleteClick, onExpiryChange, activeBrandColor }) {
  return (
    <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex flex-col gap-3">
      <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">{title}</span>
      <PaperDocTile
        url={fileUrl}
        doneLabel="Открыть файл"
        emptyLabel={editable ? 'Загрузить файл' : 'Файл не загружен'}
        editable={editable}
        uploading={uploading}
        onUpload={onFileChange}
        onDeleteClick={onDeleteClick}
        activeBrandColor={activeBrandColor}
      />
      {editable ? (
        <NativeDateInputLP label="Действует до" value={expiresAt} onChange={onExpiryChange} activeColor={activeBrandColor} />
      ) : (
        expiresAt && <span className="text-[10px] text-content-subtle uppercase tracking-wider">До {toDateInputValue(expiresAt)}</span>
      )}
    </div>
  );
}

// Каждое действие (загрузка/удаление файла, смена даты) сохраняется на сервер сразу же —
// отдельной кнопки «Сохранить» тут нет, панель ведёт себя как прямое редактирование.
export function PlayerDocsModal({ data }) {
  const { teamId, appId, player, division, editable, loadData, activeBrandColor } = data || {};

  const [medicalUrl, setMedicalUrl] = useState(player?.medical_url ?? null);
  const [medExp, setMedExp] = useState(toDateInputValue(player?.medical_expires_at));

  const [insuranceUrl, setInsuranceUrl] = useState(player?.insurance_url ?? null);
  const [insExp, setInsExp] = useState(toDateInputValue(player?.insurance_expires_at));

  const [consentUrl, setConsentUrl] = useState(player?.consent_url ?? null);
  const [consentExp, setConsentExp] = useState(toDateInputValue(player?.consent_expires_at));

  const [pendingDeleteKey, setPendingDeleteKey] = useState(null); // 'medical' | 'insurance' | 'consent' | null
  const [uploadingKey, setUploadingKey] = useState(null);
  const [error, setError] = useState('');

  if (!player || !division) return null;

  const URL_SETTERS = { medical: setMedicalUrl, insurance: setInsuranceUrl, consent: setConsentUrl };
  const EXP_SETTERS = { medical: setMedExp, insurance: setInsExp, consent: setConsentExp };

  const saveDoc = async (key, { file, cleared, expiresAt } = {}) => {
    setUploadingKey(key);
    setError('');
    try {
      const formData = new FormData();
      if (file) formData.append(key, file);
      if (cleared) formData.append(`${key}_cleared`, 'true');
      if (expiresAt !== undefined) formData.append(`${key}_expires_at`, expiresAt || '');

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications/${appId}/roster/${player.id}/docs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        const urlKey = `${key}_url`;
        if (json[urlKey] !== undefined) URL_SETTERS[key](json[urlKey]);
        if (loadData) loadData();
      } else {
        setError(json.error || 'Не удалось сохранить документ');
      }
    } catch (err) {
      console.error('Ошибка сохранения документа игрока:', err);
      setError('Ошибка соединения с сервером');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleConfirmDeleteDoc = async () => {
    const key = pendingDeleteKey;
    if (!key) return;
    await saveDoc(key, { cleared: true, expiresAt: '' });
    EXP_SETTERS[key]('');
    setPendingDeleteKey(null);
  };

  return (
    <div className="flex flex-col h-full bg-surface-level2 text-left overflow-hidden">
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-surface-border">
        <span className="text-[18px] font-black text-content-main block">{player.last_name} {player.first_name}</span>
        <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Документы допуска</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 flex flex-col gap-3">
        {division.req_med_cert && (
          <DocBlock
            title="Медицинская справка"
            fileUrl={medicalUrl}
            expiresAt={medExp}
            editable={editable}
            uploading={uploadingKey === 'medical'}
            onFileChange={(file) => saveDoc('medical', { file })}
            onDeleteClick={() => setPendingDeleteKey('medical')}
            onExpiryChange={(value) => { setMedExp(value); saveDoc('medical', { expiresAt: value }); }}
            activeBrandColor={activeBrandColor}
          />
        )}
        {division.req_insurance && (
          <DocBlock
            title="Страховой полис"
            fileUrl={insuranceUrl}
            expiresAt={insExp}
            editable={editable}
            uploading={uploadingKey === 'insurance'}
            onFileChange={(file) => saveDoc('insurance', { file })}
            onDeleteClick={() => setPendingDeleteKey('insurance')}
            onExpiryChange={(value) => { setInsExp(value); saveDoc('insurance', { expiresAt: value }); }}
            activeBrandColor={activeBrandColor}
          />
        )}
        {division.req_consent && (
          <DocBlock
            title="Согласие"
            fileUrl={consentUrl}
            expiresAt={consentExp}
            editable={editable}
            uploading={uploadingKey === 'consent'}
            onFileChange={(file) => saveDoc('consent', { file })}
            onDeleteClick={() => setPendingDeleteKey('consent')}
            onExpiryChange={(value) => { setConsentExp(value); saveDoc('consent', { expiresAt: value }); }}
            activeBrandColor={activeBrandColor}
          />
        )}

        {!division.req_med_cert && !division.req_insurance && !division.req_consent && (
          <div className="text-center py-8 text-[14px] font-bold text-content-muted opacity-60">
            Этот дивизион не требует загрузки документов
          </div>
        )}

        {error && <div className="text-[14px] font-medium text-danger">{error}</div>}
      </div>

      <ConfirmSheet
        isOpen={!!pendingDeleteKey}
        onClose={() => setPendingDeleteKey(null)}
        onConfirm={handleConfirmDeleteDoc}
        isLoading={uploadingKey === pendingDeleteKey}
        title="Удалить документ?"
        description={pendingDeleteKey && <>Файл — <span className="font-bold text-content-main">{DOC_LABELS[pendingDeleteKey]}</span> — будет удалён из заявки.</>}
        confirmLabel="Да, удалить"
        variant="danger"
      />
    </div>
  );
}
