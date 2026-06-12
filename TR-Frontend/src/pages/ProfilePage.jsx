import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken, getAuthHeaders, getImageUrl } from '../utils/helpers';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { TextInputLP, PhoneInputLP, PasswordInputLP } from '../ui/Input-LP';
import { ButtonLP } from '../ui/Button-LP';
import { SegmentedControl } from '../ui/SegmentedControl';
import { FadeIn, StaggerContainer } from '../ui/FadeIn'; // Импортируем оба компонента анимации
import { PageLoader } from '../ui/Loader';
import { ImageUploaderLP } from '../ui/ImageUploaderLP';
import { Icon } from '../ui/Icon';
import { Toast } from '../ui/Toast';

// Хелпер форматирования телефонов для красивого отображения в режиме просмотра
const formatPhoneNumber = (phoneStr) => {
  if (!phoneStr) return '—';
  const cleaned = String(phoneStr).replace(/\D/g, '');
  const last10 = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  if (last10.length === 10) {
    return `+7 (${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6, 8)}-${last10.slice(8, 10)}`;
  }
  return phoneStr;
};

// Унифицированная строка вывода информации в стиле гейм-центра
const InfoRow = ({ label, value, highlight = false }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-surface-border last:border-0">
    <span className="text-[11px] font-bold text-content-muted uppercase tracking-wider">{label}</span>
    <span className={`text-xs font-black ${highlight ? 'text-brand' : 'text-content-main'}`}>
      {value || '—'}
    </span>
  </div>
);

// Переиспользуемый кастомный матовый блок с поддержкой индивидуального редактирования и лоадера сохранения
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
            {isEditing ? (
              <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <Icon name="edit" className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      <div className="flex flex-col text-left">{children}</div>
    </div>
  );
};

export function ProfilePage() {
  const navigate = useNavigate();

  // Системные состояния
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');

  // Состояние лоадера сохранения конкретного блока
  const [savingBlock, setSavingBlock] = useState(null);

  // Состояние кастомного Toast-компонента
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  // Состояния полей анкеты профиля
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [grip, setGrip] = useState('left');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  // Состояния полей вкладки Безопасность
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pinCode, setPinCode] = useState('');

  // Индивидуальные режимы редактирования блоков (карандашики)
  const [isEditPersonal, setIsEditPersonal] = useState(false);
  const [isEditHockey, setIsEditHockey] = useState(false);
  const [isEditContacts, setIsEditContacts] = useState(false);
  const [isEditPassword, setIsEditPassword] = useState(false);
  const [isEditPin, setIsEditPin] = useState(false);

  // Черновики блоков — независимые копии значений на время редактирования.
  // Благодаря ним сохранение одного блока не затирает несохранённые правки другого.
  const [draftPersonal, setDraftPersonal] = useState({ firstName: '', lastName: '', middleName: '', birthDate: '' });
  const [draftHockey, setDraftHockey] = useState({ height: '', weight: '', grip: 'left' });
  const [draftContacts, setDraftContacts] = useState({ email: '', phone: '' });

  // Ref-флаги режимов редактирования — всегда актуальны внутри async-функций (нет stale closure).
  const editingRef = useRef({ personal: false, hockey: false, contacts: false });

  // Хелпер вызова тоста
  const triggerToast = (message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  };

  // Нормализация телефона из базы в формат PhoneInputLP (10 цифр, маска "XXX XXX XX XX")
  const normalizePhoneForInput = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    const d = digits.length >= 10 ? digits.slice(-10) : digits;
    let f = '';
    if (d.length > 0) f += d.substring(0, 3);
    if (d.length >= 4) f += ` ${d.substring(3, 6)}`;
    if (d.length >= 7) f += ` ${d.substring(6, 8)}`;
    if (d.length >= 9) f += ` ${d.substring(8, 10)}`;
    return f;
  };

  // Загрузка данных профиля с сервера.
  // useCallback без зависимостей — функция стабильна, editingRef читается по ссылке (всегда актуален).
  const loadProfileData = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/profile`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (json.success && json.user) {
        const u = json.user;

        const serverEmail      = u.email || '';
        const serverFirstName  = u.first_name || '';
        const serverLastName   = u.last_name || '';
        const serverMiddleName = u.middle_name || '';
        const serverBirthDate  = u.birth_date ? u.birth_date.split('T')[0] : '';
        const serverHeight     = u.height ? String(u.height) : '';
        const serverWeight     = u.weight ? String(u.weight) : '';
        const serverGrip       = u.grip === 'right' ? 'right' : 'left';
        const serverPhone      = normalizePhoneForInput(u.phone);

        // Стейты просмотра обновляем всегда — они нужны для InfoRow
        setEmail(serverEmail);
        setPhone(serverPhone);
        setFirstName(serverFirstName);
        setLastName(serverLastName);
        setMiddleName(serverMiddleName);
        setBirthDate(serverBirthDate);
        setHeight(serverHeight);
        setWeight(serverWeight);
        setGrip(serverGrip);
        setAvatarUrl(u.avatar_url || '');

        // Черновики обновляем только для блоков, НЕ открытых на редактирование.
        // editingRef.current читается здесь напрямую — нет stale closure.
        if (!editingRef.current.personal) {
          setDraftPersonal({ firstName: serverFirstName, lastName: serverLastName, middleName: serverMiddleName, birthDate: serverBirthDate });
        }
        if (!editingRef.current.hockey) {
          setDraftHockey({ height: serverHeight, weight: serverWeight, grip: serverGrip });
        }
        if (!editingRef.current.contacts) {
          setDraftContacts({ email: serverEmail, phone: serverPhone });
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки профиля:', err);
      triggerToast('Ошибка при загрузке анкеты', 'danger');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadProfileData();
  }, []);

  useFocusRevalidate(() => {
    loadProfileData();
  });

  // Атомарное сохранение конкретного блока личных данных
  const handleSaveBlock = async (blockKey, payload) => {
    setSavingBlock(blockKey);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        triggerToast('Данные успешно синхронизированы', 'success');
        
        if (blockKey === 'personal') setIsEditPersonal(false);
        if (blockKey === 'hockey') setIsEditHockey(false);
        if (blockKey === 'contacts') setIsEditContacts(false);
        
        await loadProfileData();
      } else {
        triggerToast(json.error || 'Ошибка обновления полей', 'danger');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка соединения с базой', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  // Мгновенная загрузка аватарки в S3 при изменении медиа
  const handleAvatarChange = async (file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    setSavingBlock('avatar');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/profile/avatar`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setAvatarUrl(json.avatar_url);
        setCacheBuster(Date.now());
        triggerToast('Фотография профиля обновлена', 'success');
        window.dispatchEvent(new CustomEvent('tr-user-updated'));
      } else {
        triggerToast(json.error || 'Не удалось загрузить медиафайл', 'danger');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка отправки файла', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  // Смена системного пароля доступа
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      triggerToast('Заполните все поля паролей', 'danger');
      return;
    }
    setSavingBlock('password');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/profile/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const json = await res.json();
      if (json.success) {
        triggerToast('Пароль успешно переустановлен', 'success');
        setOldPassword('');
        setNewPassword('');
        setIsEditPassword(false);
      } else {
        triggerToast(json.error || 'Не удалось обновить пароль', 'danger');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка сервера авторизации', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  // Активация 4-значного ПИН-кода цифровой подписи
  const handleSavePin = async (e) => {
    e.preventDefault();
    if (pinCode.length !== 4 || /\D/.test(pinCode)) {
      triggerToast('ПИН-код должен состоять из 4 цифр', 'danger');
      return;
    }
    setSavingBlock('pin');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/profile/pin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ pinCode }),
      });
      const json = await res.json();
      if (json.success) {
        triggerToast('Судейский ПИН-код сохранен', 'success');
        setPinCode('');
        setIsEditPin(false);
      } else {
        triggerToast(json.error || 'Ошибка активации ПИН-кода', 'danger');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Системный сбой записи кода', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  if (loading) {
    return <div className="py-24"><PageLoader /></div>;
  }

  const displayAvatarUrl = avatarUrl ? `${avatarUrl}?v=${cacheBuster}` : '';

  return (
    <FadeIn className="flex flex-col h-full overflow-hidden">
      
      {/* Навигационные вкладки */}
      <div className="px-4 pb-3 shrink-0 shadow-lg">
        <SegmentedControl 
          options={[
            { value: 'general', label: 'Анкета' },
            { value: 'security', label: 'Безопасность' }
          ]} 
          value={activeTab} 
          onChange={setActiveTab} 
        />
      </div>

      {/* Основная скролл-зона матовых блоков с каскадным контейнером */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-24 space-y-3">
        
        {/* Ключ по activeTab перезапускает поочередную анимацию при смене вкладок */}
        <StaggerContainer key={activeTab}>
          
          {activeTab === 'general' ? (
            <>
              {/* БЛОК 1: ХОККЕЙНАЯ КАРТОЧКА АВАТАРА */}
              <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl flex items-center gap-5 shadow-md relative overflow-hidden text-left mb-3">
                {savingBlock === 'avatar' && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center animate-fade-in">
                    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <ImageUploaderLP 
                  currentImageUrl={displayAvatarUrl}
                  onChange={handleAvatarChange}
                  onDelete={null}
                  showDelete={false} 
                  sizeClass="w-20 h-20 bg-surface-level2 border border-surface-border rounded-2xl"
                />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[12px] text-content-muted font-medium leading-normal">
                    Нажмите на иконку/фото для загрузки фотографии профиля экосистемы HockeyEco.
                  </span>
                </div>
              </div>

              {/* БЛОК 2: ЛИЧНАЯ ИНФОРМАЦИЯ */}
              <CustomBlock 
                title="Личная информация" 
                icon="player"
                isEditing={isEditPersonal}
                isSaving={savingBlock === 'personal'}
                onAction={() => {
                  if (isEditPersonal) {
                    editingRef.current.personal = false;
                    handleSaveBlock('personal', { first_name: draftPersonal.firstName, last_name: draftPersonal.lastName, middle_name: draftPersonal.middleName, birth_date: draftPersonal.birthDate || null });
                  } else {
                    setDraftPersonal({ firstName, lastName, middleName, birthDate });
                    editingRef.current.personal = true;
                    setIsEditPersonal(true);
                  }
                }}
              >
                {isEditPersonal ? (
                  <div className="space-y-3 pt-1">
                    <TextInputLP label="Фамилия" value={draftPersonal.lastName} onChange={(v) => setDraftPersonal(p => ({ ...p, lastName: v }))} placeholder="Введите фамилию" />
                    <TextInputLP label="Имя" value={draftPersonal.firstName} onChange={(v) => setDraftPersonal(p => ({ ...p, firstName: v }))} placeholder="Введите имя" />
                    <TextInputLP label="Отчество" value={draftPersonal.middleName} onChange={(v) => setDraftPersonal(p => ({ ...p, middleName: v }))} placeholder="Введите отчество" />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Дата рождения</span>
                      <input 
                        type="date" 
                        value={draftPersonal.birthDate} 
                        onChange={(e) => setDraftPersonal(p => ({ ...p, birthDate: e.target.value }))}
                        className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-sm font-bold text-content-main outline-none focus:border-brand/40 transition-colors"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <InfoRow label="Фамилия" value={lastName} />
                    <InfoRow label="Имя" value={firstName} />
                    <InfoRow label="Отчество" value={middleName} />
                    <InfoRow label="Дата рождения" value={birthDate ? birthDate.split('-').reverse().join('.') : null} />
                  </div>
                )}
              </CustomBlock>

              {/* БЛОК 3: АНТРОПОМЕТРИЯ (РОСТ, ВЕС, ХВАТ) */}
              <CustomBlock 
                title="Параметры и игровой хват" 
                icon="jersey"
                isEditing={isEditHockey}
                isSaving={savingBlock === 'hockey'}
                onAction={() => {
                  if (isEditHockey) {
                    editingRef.current.hockey = false;
                    handleSaveBlock('hockey', { 
                      height: draftHockey.height ? parseInt(draftHockey.height, 10) : null, 
                      weight: draftHockey.weight ? parseInt(draftHockey.weight, 10) : null, 
                      grip: draftHockey.grip
                    });
                  } else {
                    setDraftHockey({ height, weight, grip });
                    editingRef.current.hockey = true;
                    setIsEditHockey(true);
                  }
                }}
              >
                {isEditHockey ? (
                  <div className="space-y-3 pt-1">
                    <TextInputLP 
                      label="Текущий рост (см)" 
                      value={draftHockey.height} 
                      onChange={(val) => setDraftHockey(p => ({ ...p, height: val.replace(/\D/g, '') }))} 
                      placeholder="Например: 182" 
                    />
                    <TextInputLP 
                      label="Текущий вес (кг)" 
                      value={draftHockey.weight} 
                      onChange={(val) => setDraftHockey(p => ({ ...p, weight: val.replace(/\D/g, '') }))} 
                      placeholder="Например: 85" 
                    />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Игровой хват клюшки</span>
                      <SegmentedControl 
                        options={[
                          { value: 'left', label: 'Левый хват (L)' },
                          { value: 'right', label: 'Правый хват (R)' }
                        ]} 
                        value={draftHockey.grip} 
                        onChange={(v) => setDraftHockey(p => ({ ...p, grip: v }))} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <InfoRow label="Текущий рост" value={height ? `${height} см` : null} />
                    <InfoRow label="Текущий вес" value={weight ? `${weight} кг` : null} />
                    <InfoRow label="Игровой хват" value={grip === 'left' ? 'Левый (L)' : grip === 'right' ? 'Правый (R)' : null} />
                  </div>
                )}
              </CustomBlock>

              {/* БЛОК 4: КОНТАКТЫ УЧЕТНОЙ ЗАПИСИ */}
              <CustomBlock 
                title="Контакты учетной записи" 
                icon="users"
                isEditing={isEditContacts}
                isSaving={savingBlock === 'contacts'}
                onAction={() => {
                  if (isEditContacts) {
                    // Нормализуем телефон обратно: убираем пробелы, шлём только 10 цифр с префиксом 7
                    editingRef.current.contacts = false;
                    const cleanPhone = draftContacts.phone.replace(/\D/g, '');
                    handleSaveBlock('contacts', { email: draftContacts.email, phone: cleanPhone ? `+7${cleanPhone}` : undefined });
                  } else {
                    setDraftContacts({ email, phone });
                    editingRef.current.contacts = true;
                    setIsEditContacts(true);
                  }
                }}
              >
                {isEditContacts ? (
                  <div className="space-y-3 pt-1">
                    <TextInputLP label="Почта" value={draftContacts.email} onChange={(v) => setDraftContacts(p => ({ ...p, email: v }))} placeholder="example@mail.ru" />
                    <PhoneInputLP label="Телефон" value={draftContacts.phone} onChange={(v) => setDraftContacts(p => ({ ...p, phone: v }))} placeholder="900 000 00 00" />
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <InfoRow label="Почта" value={email} />
                    <InfoRow label="Телефон" value={formatPhoneNumber(phone)} />
                  </div>
                )}
              </CustomBlock>
            </>
          ) : (
            <>
              {/* БЛОК 5: ИЗМЕНЕНИЕ ПАРОЛЯ */}
              <CustomBlock 
                title="Авторизация и доступ" 
                icon="lock"
                isEditing={isEditPassword}
                isSaving={savingBlock === 'password'}
                onAction={() => setIsEditPassword(!isEditPassword)}
              >
                {isEditPassword ? (
                  <form onSubmit={handleChangePassword} className="space-y-6 pt-2 pb-2">
                    <PasswordInputLP label="Текущий пароль" value={oldPassword} onChange={setOldPassword} placeholder="••••••••" />
                    <PasswordInputLP label="Новый пароль" value={newPassword} onChange={setNewPassword} placeholder="••••••••" />
                    <ButtonLP type="submit" variant="primary" className="!py-2.5 !h-11 text-xs" disabled={!oldPassword || !newPassword}>
                      Обновить пароль
                    </ButtonLP>
                  </form>
                ) : (
                  <div className="text-xs font-semibold text-content-muted py-1 leading-relaxed">
                    Пароль учетной записи зашифрован. Для изменения параметров безопасности откройте режим редактирования блока.
                  </div>
                )}
              </CustomBlock>

              {/* БЛОК 6: ПИН-КОД ПОДПИСИ */}
              <CustomBlock 
                title="Электронная цифровая подпись" 
                icon="save"
                isEditing={isEditPin}
                isSaving={savingBlock === 'pin'}
                onAction={() => setIsEditPin(!isEditPin)}
              >
                {isEditPin ? (
                  <form onSubmit={handleSavePin} className="space-y-3 pt-1">
                    <PasswordInputLP
                      label="Четырехзначный ПИН-код"
                      value={pinCode}
                      onChange={(val) => setPinCode(val.replace(/\D/g, '').slice(0, 4))}
                      placeholder="1717"
                    />
                    <ButtonLP type="submit" variant="primary" className="!py-2.5 !h-11 text-xs" disabled={pinCode.length !== 4}>
                      Установить ПИН-код подписи
                    </ButtonLP>
                  </form>
                ) : (
                  <div className="text-xs font-semibold text-content-muted py-1 leading-relaxed">
                    ПИН-код быстрой подписи протоколов матчей для руководителей, администраторов и тренеров команд. Скрыт в целях безопасности.
                  </div>
                )}
              </CustomBlock>
            </>
          )}

          {/* Системная кнопка выхода, которая теперь органично завершает каскад */}
          <div className="pt-2">
            <button 
              type="button"
              onClick={handleLogout} 
              className="w-full py-3 bg-white text-danger font-bold text-sm transition-all rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Выйти из аккаунта
            </button>
          </div>

        </StaggerContainer>
      </div>

      <Toast 
        isOpen={toast.isOpen} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))} 
      />
    </FadeIn>
  );
}