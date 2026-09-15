import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { ImageUploaderLP } from '../../ui/ImageUploaderLP';
import { Icon } from '../../ui/Icon';
import { FadeIn, StaggerContainer } from '../../ui/FadeIn';
import { getAuthHeaders, getTeamUiColor } from '../../utils/helpers';

// Логотип грузится отдельным multipart-запросом (поле logo), teamId — в адресе:
// multer разбирает тело уже после проверки прав, и из body его там не достать.
const logoEndpoint = (opponentId, teamId) =>
  `${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents/${opponentId}/logo?teamId=${teamId}`;

const uploadOpponentLogo = async (opponentId, teamId, file) => {
  const body = new FormData();
  body.append('logo', file);
  const res = await fetch(logoEndpoint(opponentId, teamId), { method: 'POST', headers: getAuthHeaders(), body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'Не удалось загрузить логотип');
  return json.logo_url;
};

// Переиспользуемый матовый блок с поддержкой индивидуального редактирования и лоадера сохранения
const CustomBlock = ({ title, icon, isEditing, onAction, isSaving, children }) => {
  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mb-3 relative overflow-hidden">
      
      {/* Оверлей блокировки контента при активном сохранении */}
      {isSaving && (
        <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
            <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Сохранение...</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
            {title}
          </span>
        </div>
        {onAction && (
          <button 
            type="button"
            onClick={onAction} 
            className="transition-colors p-1 text-content-subtle hover:text-brand outline-none cursor-pointer flex items-center justify-center rounded-lg hover:bg-surface-level2"
          >
            {/* Крестик — отмена правки, черновик откатывается; сохранение — кнопкой
                внизу блока, как в остальных панелях с карандашиком. */}
            <Icon name={isEditing ? 'close' : 'edit'} className={clsx('w-4 h-4', isEditing && 'text-brand')} />
          </button>
        )}
      </div>
      <div className="flex flex-col text-left">{children}</div>
    </div>
  );
};

// Кнопка сохранения блока — та же, что в остальных панелях с карандашиком.
const SaveButton = ({ onClick, disabled, activeColor }) => (
  <ButtonLP
    variant="primary"
    onClick={onClick}
    disabled={disabled}
    activeColor={activeColor}
    className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
  >
    <span>Сохранить</span>
  </ButtonLP>
);

export function OpponentHandbookPanel({ data, onClose }) {
  const { editingOpponent, loadData, onInitiateDelete, selectedTeam } = data;

  const [oppName, setOppName] = useState('');
  const [oppShort, setOppShort] = useState('');
  const [oppCity, setOppCity] = useState('');
  const [oppIsActive, setOppIsActive] = useState(true);
  // Сохранённые значения: к ним откатывается черновик по крестику, и из них берутся
  // поля, которые сейчас не правятся, когда сохраняется один блок.
  const [saved, setSaved] = useState({ name: '', short: '', city: '', isActive: true });
  // Текущий логотип (ссылка в S3) и файл, выбранный до создания карточки: у нового
  // соперника ещё нет id, куда грузить, — файл ждёт, пока POST его не вернёт.
  const [oppLogoUrl, setOppLogoUrl] = useState(null);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [logoError, setLogoError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingBlock, setSavingBlock] = useState(null); // 'name' | 'city' | 'short' | 'status' | 'logo'

  // Режимы редактирования блоков (карандашики)
  const [isEditName, setIsEditName] = useState(!editingOpponent);
  const [isEditCity, setIsEditCity] = useState(!editingOpponent);
  const [isEditShort, setIsEditShort] = useState(!editingOpponent);
  const [isEditStatus, setIsEditStatus] = useState(!editingOpponent);

  // Вычисление динамического командного цвета
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  // Кэш команды парсится один раз на ключ, а не на каждый рендер: в нём лежат состав,
  // ростер и штаб целиком, и синхронный JSON.parse такого объёма посреди анимации
  // перехода — это заметный фриз на телефоне.
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedDetails = useMemo(() => {
    if (!teamCacheKey) return null;
    try {
      const raw = localStorage.getItem(teamCacheKey);
      return raw ? JSON.parse(raw)?.fullDetails ?? null : null;
    } catch { return null; }
  }, [teamCacheKey]);

  const teamColorSource = getTeamUiColor(cachedDetails) || getTeamUiColor(selectedTeam);
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  useEffect(() => {
    if (editingOpponent) {
      setOppName(editingOpponent.name || '');
      setOppShort(editingOpponent.short_name || '');
      setOppCity(editingOpponent.city || '');
      setOppIsActive(editingOpponent.status !== 'archive');
      setSaved({
        name: editingOpponent.name || '',
        short: editingOpponent.short_name || '',
        city: editingOpponent.city || '',
        isActive: editingOpponent.status !== 'archive',
      });
      setOppLogoUrl(editingOpponent.logo_url || null);
      setIsEditName(false);
      setIsEditCity(false);
      setIsEditShort(false);
      setIsEditStatus(false);
    } else {
      setOppName('');
      setOppShort('');
      setOppCity('');
      setOppIsActive(true);
      setSaved({ name: '', short: '', city: '', isActive: true });
      setOppLogoUrl(null);
      setIsEditName(true);
      setIsEditCity(true);
      setIsEditShort(true);
      setIsEditStatus(true);
    }
    setPendingLogoFile(null);
    setLogoError('');
  }, [editingOpponent]);

  // Логотип у существующего соперника сохраняется сразу, без карандашика: выбрал
  // файл — улетел. У нового — только запоминаем, зальём после создания.
  const handleLogoPick = async (file) => {
    setLogoError('');
    if (!editingOpponent) {
      setPendingLogoFile(file);
      return;
    }
    setSavingBlock('logo');
    try {
      const url = await uploadOpponentLogo(editingOpponent.id, selectedTeam.id, file);
      setOppLogoUrl(url);
      loadData();
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setSavingBlock(null);
    }
  };


  useEffect(() => {
    const handleClosePanel = () => onClose();
    window.addEventListener('close-manager-right-panel', handleClosePanel);
    return () => window.removeEventListener('close-manager-right-panel', handleClosePanel);
  }, [onClose]);

  // Черновики, их сеттеры и флаги правки по ключу блока — сохранение и откат
  // одним кодом на все четыре блока.
  const FIELD_OF = { name: 'name', city: 'city', short: 'short', status: 'isActive' };
  const draftByKey = { name: oppName, city: oppCity, short: oppShort, status: oppIsActive };
  const setDraftByKey = { name: setOppName, city: setOppCity, short: setOppShort, status: setOppIsActive };
  const setEditByKey = { name: setIsEditName, city: setIsEditCity, short: setIsEditShort, status: setIsEditStatus };

  // Сохранение одного блока: в запрос уходит его черновик плюс сохранённые значения
  // остальных полей — незакрытые правки соседних блоков в базу не утекают.
  const handleSaveField = async (blockKey) => {
    if (!selectedTeam?.id) return;
    const next = { ...saved, [FIELD_OF[blockKey]]: draftByKey[blockKey] };
    if (!String(next.name).trim() || !String(next.city).trim()) return;
    setSavingBlock(blockKey);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents/${editingOpponent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          name: String(next.name).trim(),
          short_name: String(next.short).trim().toUpperCase(),
          city: String(next.city).trim(),
          status: next.isActive ? 'active' : 'archive'
        })
      });

      if (res.ok) {
        setSaved(next);
        setEditByKey[blockKey](false);
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBlock(null);
    }
  };

  // Крестик в шапке блока: черновик откатывается к сохранённому значению.
  const handleCancelField = (blockKey) => {
    setDraftByKey[blockKey](saved[FIELD_OF[blockKey]]);
    setEditByKey[blockKey](false);
  };

  // Метод создания новой карточки соперника (POST)
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!oppName.trim() || !oppCity.trim() || !selectedTeam?.id) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/handbooks/external-opponents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ 
          teamId: selectedTeam.id, 
          name: oppName.trim(), 
          short_name: oppShort.trim().toUpperCase(), 
          city: oppCity.trim(),
          status: oppIsActive ? 'active' : 'archive'
        })
      });

      if (res.ok) {
        // Карточка уже создана — логотип докидываем к ней отдельным запросом.
        // Не получилось залить — соперник всё равно есть, логотип добавят позже.
        if (pendingLogoFile) {
          const json = await res.json().catch(() => ({}));
          const newId = json?.opponent?.id;
          if (newId) {
            try { await uploadOpponentLogo(newId, selectedTeam.id, pendingLogoFile); } catch (err) { console.error(err); }
          }
        }
        loadData();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeleteDisabled = editingOpponent?.games_count > 0;

  return (
    <div 
      className="flex flex-col h-full bg-surface-level2 text-left justify-between overflow-hidden"
      style={{ ...(hasTeamColor ? { '--color-brand': activeBrandColor } : {}) }}
    >
      <form 
        onSubmit={editingOpponent ? (e) => e.preventDefault() : handleCreateSubmit} 
        className="flex-1 overflow-y-auto scrollbar-hide p-5 pb-24"
      >
        <StaggerContainer key={editingOpponent ? "edit_opponent" : "create_opponent"}>
          
          {/* БЛОК 1: НАЗВАНИЕ КОМАНДЫ */}
          <CustomBlock 
            title="Название команды" 
            icon="team"
            isEditing={isEditName}
            isSaving={savingBlock === 'name'}
            onAction={editingOpponent ? () => {
              if (isEditName) handleCancelField('name');
              else setIsEditName(true);
            } : null}
          >
            {isEditName ? (
              <>
                <TextInputLP
                  placeholder="Например: Динамо"
                  value={oppName}
                  onChange={setOppName}
                  activeColor={activeBrandColor}
                />
                {editingOpponent && (
                  <SaveButton onClick={() => handleSaveField('name')} disabled={!oppName.trim() || savingBlock === 'name'} activeColor={activeBrandColor} />
                )}
              </>
            ) : (
              <div className="text-[18px] font-black text-brand tracking-wide pt-1">
                {oppName || '—'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК 2: ГОРОД КОМАНДЫ */}
          <CustomBlock 
            title="Город команды" 
            icon="arena"
            isEditing={isEditCity}
            isSaving={savingBlock === 'city'}
            onAction={editingOpponent ? () => {
              if (isEditCity) handleCancelField('city');
              else setIsEditCity(true);
            } : null}
          >
            {isEditCity ? (
              <>
                <TextInputLP
                  placeholder="Введите город команды"
                  value={oppCity}
                  onChange={setOppCity}
                  activeColor={activeBrandColor}
                />
                {editingOpponent && (
                  <SaveButton onClick={() => handleSaveField('city')} disabled={!oppCity.trim() || savingBlock === 'city'} activeColor={activeBrandColor} />
                )}
              </>
            ) : (
              <div className="text-[14px] font-black text-content-main tracking-wide pt-1">
                {oppCity || '—'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК 3: АББРЕВИАТУРА КОМАНДЫ */}
          <CustomBlock 
            title="Аббревиатура" 
            icon="jersey"
            isEditing={isEditShort}
            isSaving={savingBlock === 'short'}
            onAction={editingOpponent ? () => {
              if (isEditShort) handleCancelField('short');
              else setIsEditShort(true);
            } : null}
          >
            {isEditShort ? (
              <>
                <TextInputLP
                  maxLength={4}
                  placeholder="например: ДИН"
                  value={oppShort}
                  onChange={(val) => setOppShort(val.toUpperCase())}
                  activeColor={activeBrandColor}
                />
                {editingOpponent && (
                  <SaveButton onClick={() => handleSaveField('short')} disabled={savingBlock === 'short'} activeColor={activeBrandColor} />
                )}
              </>
            ) : (
              <div className="text-[14px] font-black text-content-main tracking-wide pt-1">
                {oppShort || '—'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК 4: ЛОГОТИП — без карандашика, сохраняется при выборе файла;
              удаления нет, только замена. Показывается в календаре, карточке
              матча и шторках выбора соперника. */}
          <CustomBlock
            title="Логотип"
            icon="shield_alert"
            isSaving={savingBlock === 'logo'}
          >
            <div className="flex items-center gap-4 pt-1">
              <ImageUploaderLP
                currentImageUrl={oppLogoUrl}
                onChange={handleLogoPick}
                showDelete={false}
                sizeClass="w-[72px] h-[72px]"
              />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[14px] font-bold text-content-main">
                  {oppLogoUrl || pendingLogoFile ? 'Логотип выбран' : 'Логотипа нет'}
                </span>
                <span className="text-[11px] text-content-subtle leading-relaxed">
                  PNG или WebP. Нажмите на квадрат, чтобы выбрать файл.
                </span>
                {logoError && <span className="text-[11px] font-bold text-danger">{logoError}</span>}
              </div>
            </div>
          </CustomBlock>

          {/* БЛОК 5: СТАТУС СОПЕРНИКА В БАЗЕ ДАННЫХ */}
          <CustomBlock
            title="Статус соперника"
            icon="calendar"
            isEditing={isEditStatus}
            isSaving={savingBlock === 'status'}
            onAction={editingOpponent ? () => {
              if (isEditStatus) handleCancelField('status');
              else setIsEditStatus(true);
            } : null}
          >
            {isEditStatus ? (
              <div className="pt-1">
                <CheckboxLP
                  checked={oppIsActive}
                  onChange={setOppIsActive}
                  label="Активный соперник"
                  activeColor={activeBrandColor}
                />
                {editingOpponent && (
                  <SaveButton onClick={() => handleSaveField('status')} disabled={savingBlock === 'status'} activeColor={activeBrandColor} />
                )}
              </div>
            ) : (
              <div className="text-[14px] font-black text-content-main tracking-wide pt-1 flex items-center gap-1.5">
                <div className={clsx("w-2 h-2 rounded-full", oppIsActive ? "bg-brand animate-pulse" : "bg-content-muted")} />
                {oppIsActive ? 'Доступен (Активен)' : 'В архиве'}
              </div>
            )}
          </CustomBlock>

          {/* БЛОК СТАТИСТИКИ */}
          {editingOpponent && (
            <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex flex-col gap-1 my-6">
              <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Статистическая сводка</span>
              <span className="text-[14px] text-content-main font-medium">
                Матчей сыграно: <strong className="text-brand">{editingOpponent.games_count || 0}</strong>
              </span>
            </div>
          )}

          {/* НИЖНИЙ БЛОК ДЕЙСТВИЙ */}
          <div className="pt-4 shrink-0 flex flex-col gap-2">
            {!editingOpponent ? (
              <ButtonLP 
                type="submit" 
                variant="primary" 
                disabled={!oppName.trim() || !oppCity.trim() || isSubmitting}
                className="rounded-xl font-bold uppercase tracking-wider text-[14px] !py-3.5 !h-12"
                activeColor={activeBrandColor}
              >
                Создать соперника
              </ButtonLP>
            ) : (
              <>
                <ButtonLP
                  variant="outline"
                  disabled={isDeleteDisabled}
                  onClick={() => onInitiateDelete(editingOpponent.id, editingOpponent.name)}
                  className="w-full py-3 text-danger normal-case font-bold text-[14px] rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Удалить соперника
                </ButtonLP>
                {isDeleteDisabled && (
                  <p className="text-[14px] text-content-muted font-medium leading-relaxed text-center mt-1 px-1">
                    Удаление невозможно: ваша команда уже сыграла или планирует сыграть матч с этим соперником.
                  </p>
                )}
              </>
            )}
          </div>

        </StaggerContainer>
      </form>
    </div>
  );
}