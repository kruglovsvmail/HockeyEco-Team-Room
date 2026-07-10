import React, { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { getImageUrl, getAuthHeaders, getContrastTextColor } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { PageLoader } from '../../ui/Loader';
import { FadeIn } from '../../ui/FadeIn';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Icon } from '../../ui/Icon';
import { useAccess } from '../../hooks/useAccess';
import { HintPopover } from '../../ui/HintPopover';
import { Toast } from '../../ui/Toast';

// Форматирование телефонных номеров по маске +7 (000) 000-00-00
const formatPhoneNumber = (phoneStr) => {
  if (!phoneStr) return '—';
  const cleaned = String(phoneStr).replace(/\D/g, '');
  const last10 = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  if (last10.length === 10) {
    return `+7 (${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6, 8)}-${last10.slice(8, 10)}`;
  }
  return phoneStr;
};

// Унифицированная строка вывода информации с динамической подкраской бренда хоккейной команды
const InfoRow = ({ label, value, highlight = false, activeBrandColor }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-surface-border last:border-0">
    <span className="text-[12px] font-bold text-content-muted uppercase tracking-wider">{label}</span>
    <span 
      className={`text-[14px] font-black ${highlight ? '' : 'text-content-main'}`}
      style={highlight ? { color: activeBrandColor || 'var(--color-brand)' } : {}}
    >
      {value || '—'}
    </span>
  </div>
);

// Кастомный матовый блок карточки с адаптивным брендированием и сквозной Portal-проверкой подписок
const CustomBlock = ({ title, icon, isEditing, isManager, hasAccess = true, popoverStatus = "no_subscription", onAction, activeBrandColor, isSaving, children }) => {
  const accentColor = activeBrandColor || 'var(--color-brand)';
  
  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm mb-3 relative">

      {/* Оверлей сохранения — как в ProfilePage */}
      {isSaving && (
        <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center animate-fade-in rounded-2xl">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
            <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Сохранение...</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5" style={{ color: accentColor }} />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
            {title}
          </span>
        </div>
        {isManager && onAction && (
          hasAccess ? (
            /* Есть подписка и выполнены условия: кнопка переключения режима редактирования */
            <button 
              onClick={onAction} 
              className="transition-colors p-0.5 hover:opacity-80 outline-none cursor-pointer flex items-center justify-center"
              style={{ color: accentColor }}
            >
              <Icon name={isEditing ? "close" : "edit"} className="w-4 h-4" />
            </button>
          ) : (
            /* Ограничено тарифом или регламентом ростера: кнопка «потухла» и вызывает поповер с нужным статусом */
            <HintPopover status={popoverStatus}>
              <div className="transition-colors p-0.5 opacity-30 flex items-center justify-center cursor-pointer" style={{ color: accentColor }}>
                <Icon name="edit" className="w-4 h-4" />
              </div>
            </HintPopover>
          )
        )}
      </div>
      <div className="flex flex-col text-left">{children}</div>
    </div>
  );
};

export const UserDetails = ({ data }) => {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isManager, setIsManager] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  // Режимы редактирования блоков
  const [isEditHeader, setIsEditingHeader] = useState(false);
  const [isEditRoles, setIsEditingRoles] = useState(false);
  const [isEditGame, setIsEditingGame] = useState(false);

  // Ошибки лимитов ассистентов
  const [assistantError, setAssistantError] = useState('');

  // Состояние лоадера сохранения конкретного блока (как в ProfilePage)
  const [savingBlock, setSavingBlock] = useState(null);

  // Состояние Toast-уведомления
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  // Хелпер вызова тоста
  const triggerToast = (message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  };

  const [formData, setFormData] = useState({
    roles: '',
    jersey_number: '',
    position: '',
    is_captain: false,
    is_assistant: false
  });

  const teamId = data?.team_id;
  const userId = data?.user_id;
  const currentRoster = data?.currentRoster || [];
  const activeBrandColor = data?.activeBrandColor;

  // Извлекаем переданные из MyTeamPage объекты авторизации (так как панель живет вне Outlet дерева)
  const currentUser = data?.user;
  const currentTeam = data?.selectedTeam;

  // Подключаем наш хук доступов к операционной In-Memory матрицы прав
  const { checkAccess } = useAccess(currentUser, currentTeam);
  
  // КЛИЕНТСКИЙ ГАРАНТ: Рассчитываем полный статус руководителя на клиенте для защиты от багов роли в БД
  const frontendIsManager = useMemo(() => {
    if (!currentUser || !currentTeam) return false;
    const isTeamOwner = String(currentTeam.owner_id) === String(currentUser.id);
    const teamRoles = currentTeam.user_role?.split(',').map(r => r.trim()) || [];
    return isTeamOwner || teamRoles.some(r => ['team_manager', 'team_admin', 'head_coach', 'coach'].includes(r));
  }, [currentUser, currentTeam]);

  // Разбираем массив ролей текущего менеджера для точечных проверок видимости
  const currentTeamRoles = useMemo(() => {
    if (!currentTeam?.user_role) return [];
    return currentTeam.user_role.split(',').map(r => r.trim());
  }, [currentTeam]);

  const isTeamOwner = useMemo(() => {
    if (!currentUser || !currentTeam) return false;
    return String(currentTeam.owner_id) === String(currentUser.id);
  }, [currentUser, currentTeam]);

  // Объединяем оба источника: если хоть один подтверждает, что юзер админ — выкатываем карандаши
  const showAdminControls = isManager || frontendIsManager;

  // ЖЕСТКИЙ РОЛЕВОЙ ЗАСЛОН: Карандаш роли видят ТОЛЬКО Owner и Team Manager. Остальные не видят вообще
  const canSeeRolesEditBlock = isTeamOwner || currentTeamRoles.includes('team_manager') || currentUser?.global_role === 'admin' || currentUser?.globalRole === 'admin';

  // Проверка: находится ли просматриваемый игрок в ростере турнира
  const isUserInRoster = useMemo(() => !!profile?.roster_id, [profile?.roster_id]);

  // Рассчитываем гранулярные права на редактирование разделов по подписке
  const hasHeaderBlockAccess = checkAccess('EDIT_USER_BLOCK_BASE', teamId);
  const hasRolesBlockAccess = checkAccess('EDIT_USER_BLOCK_ROLES', teamId);
  const hasHockeyBlockAccess = checkAccess('EDIT_USER_BLOCK_HOCKEY', teamId);

  // Финальный допуск игрового профиля: право по EDIT_USER_BLOCK_HOCKEY + игрок физически в ростере.
  // Намеренно не используем отдельный TEAM_MANAGE_TAB_ROSTER — у него другой набор ролей,
  // что приводило к потухшему карандашу у ролей из allowedRoles (например HEAD_COACH).
  const hasGameBlockAccessFinal = isUserInRoster && hasHockeyBlockAccess;
  const gameBlockPopoverStatus = isUserInRoster ? "no_subscription" : "not_in_roster";

  const AVAILABLE_ROLES = [
    { id: 'team_manager', label: 'Руководитель' },
    { id: 'team_admin', label: 'Администратор' },
    { id: 'head_coach', label: 'Главный тренер' },
    { id: 'coach', label: 'Тренер' }
  ];

  const AVAILABLE_POSITIONS = [
    { id: 'goalie', label: 'Вратарь' },
    { id: 'defense', label: 'Защитник' },
    { id: 'forward', label: 'Нападающий' }
  ];

  const fetchDetails = () => {
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${userId}`, {
      headers: getAuthHeaders()
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          setProfile(resData.member);
          setIsManager(!!resData.isManager);
          setIsOwnProfile(!!resData.isOwnProfile); 
          setFormData({
            roles: resData.member.roles || '',
            jersey_number: resData.member.jersey_number ?? '',
            position: resData.member.position || '',
            is_captain: !!resData.member.is_captain,
            is_assistant: !!resData.member.is_assistant
          });
          setAssistantError('');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (teamId && userId) fetchDetails();
  }, [teamId, userId]);

  const jerseyError = useMemo(() => {
    if (!formData.jersey_number) return '';
    const exists = currentRoster.find(
      p => String(p.jersey_number) === String(formData.jersey_number) && p.user_id !== userId
    );
    return exists ? `Номер уже занят: ${exists.last_name || exists.lastName || ''}` : '';
  }, [formData.jersey_number, currentRoster, userId]);

  const saveFieldToDB = async (updatedFields, blockKey = null) => {
    const safeJerseyNumber = updatedFields.jerseyNumber !== undefined
      ? (updatedFields.jerseyNumber === '' ? null : parseInt(updatedFields.jerseyNumber, 10))
      : undefined;

    if (blockKey) setSavingBlock(blockKey);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${profile.member_id}/details`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: updatedFields.roles !== undefined ? updatedFields.roles : undefined,
          jerseyNumber: safeJerseyNumber,
          position: updatedFields.position !== undefined ? updatedFields.position : undefined,
          isCaptain: updatedFields.isCaptain !== undefined ? updatedFields.isCaptain : undefined,
          isAssistant: updatedFields.isAssistant !== undefined ? updatedFields.isAssistant : undefined,
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (updatedFields.isAssistant !== undefined) {
          setAssistantError(errorData.error || 'Ошибка сохранения');
          setFormData(prev => ({ ...prev, is_assistant: !updatedFields.isAssistant }));
        }
        triggerToast(errorData.error || 'Ошибка сохранения', 'danger');
        return;
      }

      setAssistantError('');
      triggerToast('Данные успешно сохранены', 'success');

      fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${userId}`, {
        headers: getAuthHeaders()
      })
        .then(r => r.json())
        .then(d => { 
          if (d.success) {
            setProfile(d.member);
            setIsManager(!!d.isManager);
            setIsOwnProfile(!!d.isOwnProfile);
            setFormData(prev => ({
              ...prev,
              roles: d.member.roles || '',
              jersey_number: d.member.jersey_number ?? '',
              position: d.member.position || '',
              is_captain: !!d.member.is_captain,
              is_assistant: !!d.member.is_assistant
            }));
            data?.onRefresh?.();
          }
        });
    } catch (err) {
      console.error('Ошибка автосейва:', err);
      triggerToast('Ошибка соединения с сервером', 'danger');
    } finally {
      if (blockKey) setSavingBlock(null);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileData = new FormData();
    fileData.append('photo', file);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${profile.member_id}/photo`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: fileData
      });

      if (res.ok) {
        fetchDetails();
        data?.onRefresh?.();
      }
    } catch (err) {
      console.error('Ошибка загрузки фото:', err);
    }
  };

  const handlePhotoDelete = async () => {
    if (!profile?.team_photo_url) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${profile.member_id}/photo`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        fetchDetails();
        data?.onRefresh?.();
      }
    } catch (err) {
      console.error('Ошибка удаления фото:', err);
    }
  };

  // ── Локальные переключатели (без API-вызова) ─────────────────────────────
  const handleToggleCaptainCheckbox = () => {
    const nextVal = !formData.is_captain;
    setFormData(prev => ({
      ...prev,
      is_captain: nextVal,
      is_assistant: nextVal ? false : prev.is_assistant
    }));
    setAssistantError('');
  };

  const handleToggleAssistantCheckbox = () => {
    const nextVal = !formData.is_assistant;

    if (nextVal) {
      const assistantCount = currentRoster.filter(
        p => p.is_assistant && p.user_id !== userId
      ).length;
      if (assistantCount >= 2) {
        setAssistantError('В команде уже 2 ассистента — сначала снимите нашивку с другого игрока');
        return;
      }
    }

    setAssistantError('');
    setFormData(prev => ({
      ...prev,
      is_assistant: nextVal,
      is_captain: nextVal ? false : prev.is_captain
    }));
  };

  const handleToggleRoleCheckbox = (roleId) => {
    if (roleId === 'team_manager' && isOwnProfile) return;

    let currentRolesArray = formData.roles ? formData.roles.split(',').map(r => r.trim()).filter(Boolean) : [];
    if (currentRolesArray.includes(roleId)) {
      currentRolesArray = currentRolesArray.filter(r => r !== roleId);
    } else {
      currentRolesArray.push(roleId);
    }
    setFormData(prev => ({ ...prev, roles: currentRolesArray.join(', ') }));
  };

  const handleSelectPositionCheckbox = (posId) => {
    setFormData(prev => ({ ...prev, position: posId }));
  };

  // ── Сохранение по блокам (по аналогии с EditEventPanel) ─────────────────
  const saveHeaderBlock = async () => {
    await saveFieldToDB({
      isCaptain:   formData.is_captain,
      isAssistant: formData.is_assistant,
    }, 'header');
    setIsEditingHeader(false);
  };

  const saveRolesBlock = async () => {
    await saveFieldToDB({ roles: formData.roles }, 'roles');
    setIsEditingRoles(false);
  };

  const saveGameBlock = async () => {
    if (jerseyError) return;
    await saveFieldToDB({
      jerseyNumber: formData.jersey_number,
      position:     formData.position,
    }, 'game');
    setIsEditingGame(false);
  };

  if (isLoading) return <div className="w-full h-full flex items-center justify-center p-5 bg-surface-level2"><PageLoader /></div>;
  if (error || !profile) return <div className="p-5 text-danger font-bold text-center bg-surface-level2">Ошибка загрузки данных</div>;

  const age = profile.birth_date ? dayjs().diff(dayjs(profile.birth_date), 'year') : null;

  const roleDict = {
    'team_manager': 'Руководитель',
    'team_admin': 'Администратор',
    'coach': 'Тренер',
    'head_coach': 'Главный тренер'
  };

  const brandColor = activeBrandColor || 'var(--color-brand)';

  return (
    <FadeIn className="h-full w-full">
      <div className="h-full w-full flex flex-col bg-surface-level2 overflow-y-auto scrollbar-hide p-4 pb-10">
        
        {/* КАРТОЧКА ШАПКИ ИГРОКА */}
        <div className="flex flex-col p-4 mb-3 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm relative">
          {/* Оверлей сохранения шапки */}
          {savingBlock === 'header' && (
            <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center animate-fade-in rounded-2xl">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
                <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: activeBrandColor || 'var(--color-brand)', borderTopColor: 'transparent' }} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Сохранение...</span>
              </div>
            </div>
          )}
          {hasHeaderBlockAccess && (
            <button 
              onClick={() => setIsEditingHeader(!isEditHeader)} 
              className="absolute top-4 right-4 text-content-subtle hover:text-brand transition-colors p-0.5 z-20 outline-none cursor-pointer flex items-center justify-center"
              style={activeBrandColor ? { color: activeBrandColor } : {}}
            >
              <Icon name={isEditHeader ? "close" : "edit"} className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-4 w-full pr-1">
            <div className="w-20 h-20 rounded-3xl bg-surface-base border border-surface-border p-0.5 shadow-sm flex items-center justify-center overflow-hidden shrink-0 relative">
              <Avatar photoUrl={profile.avatar_url} firstName={profile.first_name} lastName={profile.last_name} className="w-full h-full rounded-3xl" />
              
              {isEditHeader && hasHeaderBlockAccess && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-1 bg-black/60 rounded-[20px] transition-all">
                  <button 
                    onClick={() => document.getElementById('member-photo-file-input').click()}
                    className="text-[10px] font-bold text-white px-1.5 py-3.5 uppercase tracking-wider w-[200px] text-center outline-none cursor-pointer"
                  >
                    Заменить
                  </button>

                </div>
              )}
              <input type="file" id="member-photo-file-input" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
            </div>

            <div className="flex flex-col text-left flex-1 min-w-0">
              <span 
                className="text-[10px] font-black uppercase tracking-widest mb-1 block"
                style={{ color: profile.roster_id ? 'var(--color-success)' : 'var(--color-content-subtle)' }}
              >
                {profile.roster_id ? 'В ростере' : 'Не в ростере'}
              </span>
              
              <h2 className="text-[16px] font-bold text-content-main uppercase truncate leading-tight">{profile.last_name}</h2>
              <h3 className="text-[12px] font-bold text-content-muted mt-0.5 capitalize">{profile.first_name}</h3>
              {profile.middle_name && <h4 className="text-[12px] font-medium text-content-muted truncate opacity-60">{profile.middle_name}</h4>}
              
              {!isEditHeader && (profile.is_captain || profile.is_assistant) && (
                <div 
                  className={`mt-2 self-start px-2 py-0.5 text-[10px] font-black uppercase rounded-md shadow-sm ${getContrastTextColor(brandColor)}`}
                  style={{ backgroundColor: brandColor }}
                >
                  {profile.is_captain ? 'Капитан (C)' : 'Ассистент (A)'}
                </div>
              )}
            </div>
          </div>

          {isEditHeader && hasHeaderBlockAccess && (
            <div className="flex flex-col gap-2.5 mt-4 pt-3 border-t border-surface-border animate-fade-in">
              {profile.roster_id ? (
                <>
                  <span className="text-[10px] font-black text-content-muted uppercase tracking-wider mb-0.5">Спортивный статус:</span>
                  <CheckboxLP checked={formData.is_captain} onChange={handleToggleCaptainCheckbox} label="Капитан команды (C)" className="py-0.5" activeColor={activeBrandColor} />
                  <CheckboxLP checked={formData.is_assistant} onChange={handleToggleAssistantCheckbox} label="Ассистент капитана (A)" className="py-0.5" activeColor={activeBrandColor} />
                  {assistantError && <span className="text-[10px] text-danger font-bold mt-1 animate-pulse">{assistantError}</span>}
                  <ButtonLP
                    variant="primary"
                    onClick={saveHeaderBlock}
                    disabled={savingBlock === 'header' || !!assistantError}
                    activeColor={activeBrandColor}
                    className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
                  >
                    <span>Сохранить</span>
                  </ButtonLP>
                </>
              ) : (
                <span className="text-[10px] text-content-subtle italic mt-1">Капитанские нашивки доступны только для игроков в ростере</span>
              )}
            </div>
          )}
        </div>

        {/* БЛОК 1: АДМИНИСТРАТИВНЫЙ СТАТУС РОЛЕЙ (Карандаш строго привязан к canSeeRolesEditBlock) */}
        <CustomBlock 
          title="Роли в команде" 
          icon="gear"
          isEditing={isEditRoles}
          isManager={showAdminControls && canSeeRolesEditBlock}
          hasAccess={hasRolesBlockAccess}
          popoverStatus="no_subscription"
          onAction={() => setIsEditingRoles(!isEditRoles)}
          activeBrandColor={activeBrandColor}
          isSaving={savingBlock === 'roles'}
        >
          {isEditRoles && hasRolesBlockAccess ? (
            <div className="flex flex-col gap-2.5 pt-1">
              {AVAILABLE_ROLES.map(role => {
                const isChecked = formData.roles.split(',').map(r => r.trim()).includes(role.id);
                const isSelfManagerLock = role.id === 'team_manager' && isOwnProfile;
                return (
                  <CheckboxLP
                    key={role.id}
                    checked={isChecked}
                    onChange={() => !isSelfManagerLock && handleToggleRoleCheckbox(role.id)}
                    label={role.label + (isSelfManagerLock ? ' (Вы — нельзя снять)' : '')}
                    className={`py-0.5 ${isSelfManagerLock ? 'opacity-60 cursor-not-allowed' : ''}`}
                    activeColor={activeBrandColor}
                  />
                );
              })}
              <ButtonLP
                variant="primary"
                onClick={saveRolesBlock}
                disabled={savingBlock === 'roles'}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
              >
                <span>Сохранить</span>
              </ButtonLP>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.roles ? profile.roles.split(',').map((r, i) => (
                <span key={i} className="text-[10px] font-bold text-content-main bg-surface-level2 px-2.5 py-1 rounded-lg border border-surface-border shadow-sm">
                  {roleDict[r.trim()] || r.trim()}
                </span>
              )) : <span className="text-[14px] text-content-subtle italic">Нет назначенных ролей</span>}
            </div>
          )}
        </CustomBlock>

        {/* БЛОК 2: ИГРОВОЙ ПРОФИЛЬ (Блокируется регламентным HintPopover, если игрок вне ростера турнира) */}
        <CustomBlock 
          title="Игровой профиль" 
          icon="jersey"
          isEditing={isEditGame}
          isManager={hasHockeyBlockAccess}
          hasAccess={hasGameBlockAccessFinal}
          popoverStatus={gameBlockPopoverStatus}
          onAction={() => setIsEditingGame(!isEditGame)}
          activeBrandColor={activeBrandColor}
          isSaving={savingBlock === 'game'}
        >
          {isEditGame && hasGameBlockAccessFinal ? (
            <div className="flex flex-col gap-3 pt-1">
              <TextInputLP
                label="Игровой номер"
                value={formData.jersey_number}
                error={jerseyError}
                maxLength={2}
                onChange={(val) => setFormData(p => ({...p, jersey_number: val.replace(/\D/g, '')}))}
                activeColor={activeBrandColor}
              />
              <div className="flex flex-col gap-2.5 mt-1 border-t border-surface-border pt-2">
                <span className="text-[10px] font-black text-content-muted uppercase tracking-wider mb-1">Игровое амплуа:</span>
                {AVAILABLE_POSITIONS.map(pos => {
                  const isSelected = formData.position === pos.id;
                  return (
                    <CheckboxLP key={pos.id} checked={isSelected} onChange={() => handleSelectPositionCheckbox(pos.id)} label={pos.label} className="py-0.5" activeColor={activeBrandColor} />
                  );
                })}
              </div>
              <ButtonLP
                variant="primary"
                onClick={saveGameBlock}
                disabled={savingBlock === 'game' || !!jerseyError}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
              >
                <span>Сохранить</span>
              </ButtonLP>
            </div>
          ) : (
            <div className="flex flex-col">
              <InfoRow label="Игровой номер" value={profile.jersey_number ? `# ${profile.jersey_number}` : null} highlight activeBrandColor={activeBrandColor} />
              <InfoRow label="Игровое амплуа" value={
                profile.position === 'goalie' ? 'Вратарь' : 
                profile.position === 'defense' ? 'Защитник' : 
                profile.position === 'forward' ? 'Нападающий' : null
              } />
            </div>
          )}
        </CustomBlock>

        {/* БЛОК 3: ФИЗИЧЕСКИЕ ДАННЫЕ */}
        <CustomBlock title="Физические данные" icon="player" isEditing={false} isManager={showAdminControls} onAction={null} activeBrandColor={activeBrandColor}>
          <InfoRow label="Рост" value={profile.height ? `${profile.height} см` : null} />
          <InfoRow label="Вес" value={profile.weight ? `${profile.weight} кг` : null} />
          <InfoRow label="Хват клюшки" value={profile.grip === 'left' ? 'Левый (L)' : profile.grip === 'right' ? 'Правый (R)' : null} />
        </CustomBlock>

        {/* БЛОК 4: ЛИЧНАЯ ИНФОРМАЦИЯ */}
        <CustomBlock title="Личная информация" icon="roster" isEditing={false} isManager={showAdminControls} onAction={null} activeBrandColor={activeBrandColor}>
          <InfoRow label="Номер тел." value={formatPhoneNumber(profile.phone)} />
          <InfoRow label="Дата рожд." value={profile.birth_date ? dayjs(profile.birth_date).format('DD.MM.YYYY') : null} />
          <InfoRow label="Возраст" value={age ? `${age} лет` : null} />
        </CustomBlock>

        {/* ЗЕЛЕНЫЙ БЛОК ВИРТУАЛЬНОГО ПРОФИЛЯ РУКОВОДИТЕЛЯ */}
        {profile.virtual_code && (
          <div className="p-4 bg-surface-level1 border-2 rounded-2xl shadow-sm animate-fade-in mt-1"
          style={{ borderColor: activeBrandColor || 'var(--color-success)' }}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col text-left flex-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: activeBrandColor || 'var(--color-success)' }}
                >Виртуальный профиль</span>
                <span className="text-[10px] font-medium text-content-muted mt-0.5">Для активации аккаунта</span>
              </div>
              <span className="font-mono text-[14px] font-black bg-surface-level2 px-2.5 py-1.5 rounded-xl border border-surface-border text-content-main shadow-inner select-all">
                {profile.virtual_code}
              </span>
            </div>
          </div>
        )}
      </div>

      <Toast 
        isOpen={toast.isOpen} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))} 
      />
    </FadeIn>
  );
};