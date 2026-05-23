import React, { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { getImageUrl, getAuthHeaders } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { PageLoader } from '../../ui/Loader';
import { FadeIn } from '../../ui/FadeIn';
import { TextInputLP } from '../../ui/Input-LP';
import { CheckboxLP } from '../../ui/Checkbox-LP';
import { Icon } from '../../ui/Icon';

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

// Унифицированная строка вывода информации
const InfoRow = ({ label, value, highlight = false }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-surface-border last:border-0">
    <span className="text-[11px] font-bold text-content-muted uppercase tracking-wider">{label}</span>
    <span className={`text-xs font-black ${highlight ? 'text-brand' : 'text-content-main'}`}>{value || '—'}</span>
  </div>
);

// Кастомный матовый блок карточки
const CustomBlock = ({ title, icon, isEditing, isManager, onAction, children }) => (
  <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm mb-3">
    <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
      <div className="flex items-center gap-2">
        {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
        <span className="text-[10px] font-black text-brand uppercase tracking-widest">{title}</span>
      </div>
      {isManager && onAction && (
        <button onClick={onAction} className="text-content-subtle hover:text-brand transition-colors p-0.5">
          <Icon name={isEditing ? "close" : "edit"} className="w-4 h-4" />
        </button>
      )}
    </div>
    <div className="flex flex-col text-left">{children}</div>
  </div>
);

export const UserDetails = ({ data }) => {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isManager, setIsManager] = useState(false);
  // ДОБАВЛЕНО: Стейт проверки «своего» профиля для защиты от дурака
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  // Режимы редактирования блоков
  const [isEditHeader, setIsEditingHeader] = useState(false);
  const [isEditRoles, setIsEditingRoles] = useState(false);
  const [isEditGame, setIsEditingGame] = useState(false);

  // Ошибки лимитов ассистентов
  const [assistantError, setAssistantError] = useState('');

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
          setIsOwnProfile(!!resData.isOwnProfile); // Считываем фоновый маркер сессии
          setFormData({
            roles: resData.member.roles || '',
            jersey_number: resData.member.jersey_number || '',
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
    return exists ? `Номер уже занят: ${exists.last_name}` : '';
  }, [formData.jersey_number, currentRoster, userId]);

  const saveFieldToDB = async (updatedFields) => {
    if (updatedFields.jerseyNumber && jerseyError) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/members/${profile.member_id}/details`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: updatedFields.roles !== undefined ? updatedFields.roles : undefined,
          jerseyNumber: updatedFields.jerseyNumber !== undefined ? updatedFields.jerseyNumber : undefined,
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
        return;
      }

      setAssistantError('');
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
              is_captain: !!d.member.is_captain,
              is_assistant: !!d.member.is_assistant
            }));
            data?.onRefresh?.();
          }
        });
    } catch (err) {
      console.error('Ошибка автосейва:', err);
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

  const handleToggleCaptainCheckbox = () => {
    const nextVal = !formData.is_captain;
    setFormData(prev => ({ 
      ...prev, 
      is_captain: nextVal,
      is_assistant: nextVal ? false : prev.is_assistant 
    }));
    saveFieldToDB({ isCaptain: nextVal });
  };

  const handleToggleAssistantCheckbox = () => {
    const nextVal = !formData.is_assistant;
    setFormData(prev => ({ 
      ...prev, 
      is_assistant: nextVal,
      is_captain: nextVal ? false : prev.is_captain 
    }));
    saveFieldToDB({ isAssistant: nextVal });
  };

  const handleToggleRoleCheckbox = (roleId) => {
    // ЗАЩИТА ОТ ДУРАКА НА ФРОНТЕНДЕ: Если роль Руководитель и это свой профиль, прерываем выполнение
    if (roleId === 'team_manager' && isOwnProfile) return;

    let currentRolesArray = formData.roles ? formData.roles.split(',').map(r => r.trim()).filter(Boolean) : [];
    if (currentRolesArray.includes(roleId)) {
      currentRolesArray = currentRolesArray.filter(r => r !== roleId);
    } else {
      currentRolesArray.push(roleId);
    }
    const updatedRolesString = currentRolesArray.join(', ');
    setFormData(prev => ({ ...prev, roles: updatedRolesString }));
    saveFieldToDB({ roles: updatedRolesString });
  };

  const handleSelectPositionCheckbox = (posId) => {
    setFormData(prev => ({ ...prev, position: posId }));
    saveFieldToDB({ position: posId });
  };

  const handleJerseyBlur = () => {
    if (!jerseyError) {
      saveFieldToDB({ jerseyNumber: formData.jersey_number });
    }
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

  return (
    <FadeIn className="h-full w-full">
      <div className="h-full w-full flex flex-col bg-surface-level2 overflow-y-auto scrollbar-hide p-4 pb-10">
        
        {/* КАРТОЧКА ШАПКИ */}
        <div className="flex flex-col p-4 mb-3 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm relative">
          {isManager && (
            <button 
              onClick={() => setIsEditingHeader(!isEditHeader)} 
              className="absolute top-4 right-4 text-content-subtle hover:text-brand transition-colors p-0.5 z-20"
            >
              <Icon name={isEditHeader ? "close" : "edit"} className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-4 w-full pr-1">
            <div className="w-20 h-20 rounded-3xl bg-surface-base border border-surface-border p-0.5 shadow-sm flex items-center justify-center overflow-hidden shrink-0 relative">
              <Avatar photoUrl={profile.avatar_url} firstName={profile.first_name} lastName={profile.last_name} className="w-full h-full rounded-3xl" />
              
              {isEditHeader && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-1 bg-black/60 rounded-[20px] transition-all">
                  <button 
                    onClick={() => document.getElementById('member-photo-file-input').click()}
                    className="text-[9px] font-black text-white bg-brand px-1.5 py-3 rounded-xl uppercase tracking-wider w-full text-center"
                  >
                    Заменить
                  </button>
                  {profile.team_photo_url && (
                    <button 
                      onClick={handlePhotoDelete}
                      className="text-[9px] font-black text-white bg-danger px-1.5 py-3 rounded-xl uppercase tracking-wider w-full text-center"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              )}
              <input type="file" id="member-photo-file-input" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
            </div>

            <div className="flex flex-col text-left flex-1 min-w-0">
              <span className={`text-[8px] font-black uppercase tracking-widest mb-1 block ${profile.roster_id ? 'text-success' : 'text-content-subtle'}`}>
                {profile.roster_id ? 'В ростере' : 'Не в ростере'}
              </span>
              
              <h2 className="text-[15px] font-black text-content-main uppercase truncate leading-tight">{profile.last_name}</h2>
              <h3 className="text-[11px] font-bold text-content-muted mt-0.5 capitalize">{profile.first_name}</h3>
              {profile.middle_name && <h4 className="text-[11px] font-medium text-content-muted truncate opacity-60">{profile.middle_name}</h4>}
              
              {!isEditHeader && (profile.is_captain || profile.is_assistant) && (
                <div className="mt-2 self-start px-2 py-0.5 bg-brand text-white text-[9px] font-black uppercase rounded-md shadow-sm">
                  {profile.is_captain ? 'Капитан (C)' : 'Ассистент (A)'}
                </div>
              )}
            </div>
          </div>

          {isEditHeader && (
            <div className="flex flex-col gap-2.5 mt-4 pt-3 border-t border-surface-border animate-fade-in">
              {profile.roster_id ? (
                <>
                  <span className="text-[10px] font-black text-content-muted uppercase tracking-wider mb-0.5">Спортивный статус:</span>
                  <CheckboxLP checked={formData.is_captain} onChange={handleToggleCaptainCheckbox} label="Капитан команды (C)" className="py-0.5" />
                  <CheckboxLP checked={formData.is_assistant} onChange={handleToggleAssistantCheckbox} label="Ассистент капитана (A)" className="py-0.5" />
                  {assistantError && <span className="text-[10px] text-danger font-bold mt-1 animate-pulse">{assistantError}</span>}
                </>
              ) : (
                <span className="text-[11px] text-content-subtle italic mt-1">Капитанские нашивки доступны только для игроков в ростере</span>
              )}
            </div>
          )}
        </div>

        {/* БЛОК 1: АДМИНИСТРАТИВНЫЙ СТАТУС (Интерактивная защита) */}
        <CustomBlock 
          title="Роли в команде" 
          icon="gear"
          isEditing={isEditRoles}
          isManager={isManager}
          onAction={() => setIsEditingRoles(!isEditRoles)}
        >
          {isEditRoles ? (
            <div className="flex flex-col gap-2.5 pt-1">
              {AVAILABLE_ROLES.map(role => {
                const isChecked = formData.roles.split(',').map(r => r.trim()).includes(role.id);
                // Если чекбокс принадлежит роли руководителя и это профиль текущего менеджера — включаем блокировку
                const isSelfManagerLock = role.id === 'team_manager' && isOwnProfile;
                return (
                  <CheckboxLP 
                    key={role.id} 
                    checked={isChecked} 
                    onChange={() => !isSelfManagerLock && handleToggleRoleCheckbox(role.id)} 
                    label={role.label + (isSelfManagerLock ? ' (Вы — нельзя снять)' : '')} 
                    className={`py-0.5 ${isSelfManagerLock ? 'opacity-60 cursor-not-allowed text-brand' : ''}`} 
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.roles ? profile.roles.split(',').map((r, i) => (
                <span key={i} className="text-[10px] font-bold text-content-main bg-surface-level2 px-2.5 py-1 rounded-lg border border-surface-border shadow-sm">
                  {roleDict[r.trim()] || r.trim()}
                </span>
              )) : <span className="text-xs text-content-subtle italic">Нет назначенных ролей</span>}
            </div>
          )}
        </CustomBlock>

        {/* БЛОК 2: ИГРОВОЙ ПРОФИЛЬ */}
        {profile.roster_id && (
          <CustomBlock 
            title="Игровой профиль" 
            icon="jersey"
            isEditing={isEditGame}
            isManager={isManager}
            onAction={() => setIsEditingGame(!isEditGame)}
          >
            {isEditGame ? (
              <div className="flex flex-col gap-3 pt-1">
                <TextInputLP 
                  label="Игровой номер" 
                  value={formData.jersey_number} 
                  error={jerseyError}
                  maxLength={2}
                  onBlur={handleJerseyBlur}
                  onChange={(val) => setFormData(p => ({...p, jersey_number: val.replace(/\D/g, '')}))}
                />
                <div className="flex flex-col gap-2.5 mt-1 border-t border-surface-border pt-2">
                  <span className="text-[10px] font-black text-content-muted uppercase tracking-wider mb-1">Игровое амплуа:</span>
                  {AVAILABLE_POSITIONS.map(pos => {
                    const isSelected = formData.position === pos.id;
                    return (
                      <CheckboxLP key={pos.id} checked={isSelected} onChange={() => handleSelectPositionCheckbox(pos.id)} label={pos.label} className="py-0.5" />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <InfoRow label="Игровой номер" value={profile.jersey_number ? `# ${profile.jersey_number}` : null} highlight />
                <InfoRow label="Игровое амплуа" value={
                  profile.position === 'goalie' ? 'Вратарь' : 
                  profile.position === 'defense' ? 'Защитник' : 
                  profile.position === 'forward' ? 'Нападающий' : null
                } />
              </div>
            )}
          </CustomBlock>
        )}

        {/* БЛОК 3: ФИЗИЧЕСКИЕ ДАННЫЕ */}
        <CustomBlock title="Физические данные" icon="player" isEditing={false} isManager={isManager} onAction={null}>
          <InfoRow label="Рост" value={profile.height ? `${profile.height} см` : null} />
          <InfoRow label="Вес" value={profile.weight ? `${profile.weight} кг` : null} />
          <InfoRow label="Хват клюшки" value={profile.grip === 'left' ? 'Левый (L)' : profile.grip === 'right' ? 'Правый (R)' : null} />
        </CustomBlock>

        {/* БЛОК 4: ЛИЧНАЯ ИНФОРМАЦИЯ */}
        <CustomBlock title="Личная информация" icon="calendar" isEditing={false} isManager={isManager} onAction={null}>
          <InfoRow label="Номер тел." value={formatPhoneNumber(profile.phone)} />
          <InfoRow label="Дата рожд." value={profile.birth_date ? dayjs(profile.birth_date).format('DD.MM.YYYY') : null} />
          <InfoRow label="Возраст" value={age ? `${age} лет` : null} />
        </CustomBlock>

        {/* ЗЕЛЕНЫЙ БЛОК ДЛЯ РУКОВОДИТЕЛЯ */}
        {profile.virtual_code && (
          <div className="p-4 bg-surface-level1 border border-success rounded-2xl shadow-sm animate-fade-in mt-1">
            <div className="flex items-center justify-between">
              <div className="flex flex-col text-left flex-1 min-w-0">
                <span className="text-[10px] font-black text-success uppercase tracking-widest">Виртуальный профиль</span>
                <span className="text-[11px] font-medium text-content-muted mt-0.5">Доступно только руководителю</span>
              </div>
              <span className="font-mono text-xs font-black bg-surface-level2 px-2.5 py-1.5 rounded-xl border border-surface-border text-content-main shadow-inner select-all">
                {profile.virtual_code}
              </span>
            </div>
          </div>
        )}
      </div>
    </FadeIn>
  );
};