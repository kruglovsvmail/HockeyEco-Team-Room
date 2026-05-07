import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import clsx from 'clsx';
import { Share, PlusSquare, Download, AlertCircle } from 'lucide-react';
import { PhoneInputLP, PasswordInputLP, EmailInputLP, TextInputLP, DateMaskInputLP } from '../ui/Input-LP';
import { ButtonLP } from '../ui/Button-LP';
import { CheckboxLP } from '../ui/Checkbox-LP';
import { BottomSheet } from '../ui/BottomSheet';
import { getToken } from '../utils/helpers';

export default function LoginPage() {
  const navigate = useNavigate();

  // Основной вход
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [activeSheet, setActiveSheet] = useState(null);
  
  const [firstName, setFirstName] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [errors, setErrors] = useState({ phone: '', password: '', email: '' });
  const [generalError, setGeneralError] = useState('');
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);

  // Состояния процесса регистрации
  const [regStep, setRegStep] = useState(1); // 1: телефон, 2: код, 3: форма, 4: успех
  const [regPhone, setRegPhone] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regData, setRegData] = useState({ firstName: '', lastName: '', middleName: '', email: '', birthDate: '' });
  const [regError, setRegError] = useState('');
  const [isRegLoading, setIsRegLoading] = useState(false);
  const [regType, setRegType] = useState(null); // 'new' или 'virtual'

  // PWA states
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /ipad|iphone|ipod/.test(ua);
  const isSafari = isIos && /safari/.test(ua) && !/crios|fxios/.test(ua);
  const isChrome = /chrome|crios/.test(ua) && !/opr|edg|brave|yabrowser|samsungbrowser|ucbrowser/.test(ua);

  useEffect(() => {
    const checkInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        setIsInstalled(true);
      }
    };
    checkInstalled();

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setActiveSheet(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setActiveSheet(null);
    }
  };

  useEffect(() => {
    if (recoveryCooldown > 0) {
      const timer = setTimeout(() => setRecoveryCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [recoveryCooldown]);

  useEffect(() => {
    const cleanPhone = `+7${phone.replace(/\D/g, '')}`;

    if (cleanPhone.length === 12) {
      const fetchUserName = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/check-phone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: cleanPhone }),
          });
          const data = await response.json();

          if (response.ok && data.success && data.firstName) {
            setFirstName(data.firstName);
          } else {
            setFirstName('');
          }
        } catch (err) {
          setFirstName('');
        }
      };

      const timeoutId = setTimeout(fetchUserName, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setFirstName('');
    }
  }, [phone]);

  if (getToken()) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrors({ phone: '', password: '', email: '' });
    setGeneralError('');

    const cleanPhone = `+7${phone.replace(/\D/g, '')}`;
    if (cleanPhone.length !== 12) {
      return setErrors(prev => ({ ...prev, phone: 'Некорректный номер' }));
    }
    if (!password) {
      return setErrors(prev => ({ ...prev, password: 'Введите пароль' }));
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        // Проверяем специальную ошибку сброса аккаунта
        if (data.error === 'ACCOUNT_RESET') {
          throw new Error(`RESET:${data.message}`);
        }
        throw new Error(data.error || data.message || 'Ошибка авторизации');
      }

      const storage = rememberMe ? localStorage : sessionStorage;
      localStorage.removeItem('teampwa_token');
      sessionStorage.removeItem('teampwa_token');
      localStorage.removeItem('teampwa_user');
      sessionStorage.removeItem('teampwa_user');

      storage.setItem('teampwa_token', data.token);
      storage.setItem('teampwa_user', JSON.stringify(data.user));

      navigate('/');
    } catch (err) {
      const msg = err.message.toLowerCase();
      // Обработка сообщения о сбросе статуса в виртуальный
      if (err.message.startsWith('RESET:')) {
        setGeneralError(err.message.replace('RESET:', ''));
      } else if (err.name === 'TypeError' || msg.includes('failed to fetch') || msg.includes('network error')) {
        setGeneralError('Ошибка сети. Проверьте подключение к интернету или сервер недоступен.');
      } else if (msg.includes('пароль')) {
        setErrors(prev => ({ ...prev, password: err.message }));
      } else if (msg.includes('телефон') || msg.includes('номер') || msg.includes('пользователь не найден')) {
        setErrors(prev => ({ ...prev, phone: err.message }));
      } else {
        setGeneralError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecovery = async (e) => {
    e.preventDefault();
    setErrors({ phone: '', password: '', email: '' });
    setGeneralError('');
    setSuccessMsg('');

    const cleanPhone = `+7${phone.replace(/\D/g, '')}`;
    
    if (cleanPhone.length !== 12) {
      return setErrors(prev => ({ ...prev, phone: 'Некорректный номер' }));
    }
    if (!email) {
      return setErrors(prev => ({ ...prev, email: 'Введите Email' }));
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, email }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.error === 'ACCOUNT_RESET') {
          throw new Error(`RESET:${data.message}`);
        }
        throw new Error(data.error || data.message || 'Ошибка отправки');
      }

      setSuccessMsg('Новый пароль отправлен на почту!');
      setRecoveryCooldown(30);
    } catch (err) {
      const msg = err.message.toLowerCase();
      if (err.message.startsWith('RESET:')) {
        setGeneralError(err.message.replace('RESET:', ''));
      } else if (err.name === 'TypeError' || msg.includes('failed to fetch') || msg.includes('network error')) {
        setGeneralError('Ошибка сети. Проверьте подключение к интернету или сервер недоступен.');
      } else if (msg.includes('телефон')) {
        setErrors(prev => ({ ...prev, phone: err.message }));
      } else {
        setErrors(prev => ({ ...prev, email: err.message }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (isRecovery) => {
    setIsRecoveryMode(isRecovery);
    setErrors({ phone: '', password: '', email: '' });
    setGeneralError('');
    setSuccessMsg('');
  };

  // --- ЛОГИКА РЕГИСТРАЦИИ ---
  const resetReg = () => {
    setRegStep(1);
    setRegPhone('');
    setRegCode('');
    setRegData({ firstName: '', lastName: '', middleName: '', email: '', birthDate: '' });
    setRegError('');
    setRegType(null);
  };

  const handleRegCheckPhone = async () => {
    setRegError('');
    const cleanPhone = `+7${regPhone.replace(/\D/g, '')}`;
    if (cleanPhone.length !== 12) return setRegError('Некорректный номер телефона');
    
    setIsRegLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/reg-check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ошибка проверки номера');
      }

      if (data.status === 'exists') {
        throw new Error('Этот номер телефона уже зарегистрирован.');
      }

      setRegType(data.status); // 'new' | 'virtual'
      setRegStep(data.status === 'virtual' ? 2 : 3);
    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegLoading(false);
    }
  };

  const handleRegVerifyCode = async () => {
    setRegError('');
    if (!regCode.trim()) return setRegError('Введите код');
    const cleanPhone = `+7${regPhone.replace(/\D/g, '')}`;
    setIsRegLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/reg-verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, code: regCode }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Неверный секретный код от руководителя команда или клуба');
      }

      let bDate = '';
      if (data.user.birth_date) {
        const d = new Date(data.user.birth_date);
        if (!isNaN(d)) {
          // Конвертируем формат базы данных в формат маски ДД.ММ.ГГГГ для UI
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          bDate = `${day}.${month}.${year}`;
        }
      }

      setRegData(prev => ({
        ...prev,
        firstName: data.user.first_name || '',
        lastName: data.user.last_name || '',
        middleName: data.user.middle_name || '',
        birthDate: bDate
      }));
      setRegStep(3); // Переход к заполнению формы

    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    if (!regData.lastName || !regData.firstName || !regData.email) {
      return setRegError('Фамилия, Имя и Email обязательны');
    }

    const cleanPhone = `+7${regPhone.replace(/\D/g, '')}`;
    
    // --- НОВАЯ ЛОГИКА КОНВЕРТАЦИИ ДАТЫ ДЛЯ БЭКЕНДА ---
    let finalBirthDate = null;
    if (regData.birthDate) {
       // Проверяем, что нет нижних подчеркиваний (незавершенный ввод маски) и длина корректная
       if (regData.birthDate.includes('_') || regData.birthDate.length !== 10) {
          return setRegError('Введите полную дату рождения');
       }
       const [day, month, year] = regData.birthDate.split('.');
       finalBirthDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD для PGSQL
    }

    setIsRegLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          virtualCode: regType === 'virtual' ? regCode : null,
          firstName: regData.firstName,
          lastName: regData.lastName,
          middleName: regData.middleName,
          email: regData.email,
          birthDate: finalBirthDate // Передаем перевернутую дату
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ошибка при регистрации');
      }

      setRegStep(4); // Успех
    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegLoading(false);
    }
  };

  return (
    <div className="w-full h-full max-w-md mx-auto flex flex-col flex-1 px-6 py-10 relative z-10">
  
      <div className="relative mt-1 mb-16 shrink-0">
        <h1 className="text-4xl font-bold uppercase tracking-widest mb-1 text-content-main">
          Hockey<span className="text-brand">Eco</span>
        </h1>
        <p className="text-content-muted text-xs tracking-[0.2em] uppercase font-semibold">
          Кабинет команды
        </p>

        <div className="absolute -bottom-12 left-0 w-full h-10 flex items-end overflow-visible pointer-events-none">
          <div
            className={clsx(
              "transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] origin-left",
              firstName && !isRecoveryMode ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
            )}
          >
            <p className="text-lg text-content-main tracking-wide">
              Привет, <span className="text-brand font-bold drop-shadow-sm">{firstName}</span>!
            </p>
          </div>
        </div>
      </div>

      <div className="grid shrink-0">
        
        {/* Форма Логина */}
        <form 
          onSubmit={handleLogin} 
          className={clsx(
            "col-start-1 row-start-1 space-y-6 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isRecoveryMode ? "opacity-0 pointer-events-none -translate-x-8" : "opacity-100 pointer-events-auto translate-x-0"
          )}
        >
          {generalError && !isRecoveryMode && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-sm p-4 rounded-xl font-medium leading-relaxed">
              {generalError}
            </div>
          )}

          <div className="space-y-4">
            <PhoneInputLP 
              value={phone} 
              onChange={(val) => {
                setPhone(val);
                setErrors(prev => ({ ...prev, phone: '' }));
                setGeneralError('');
              }} 
              disabled={isLoading}
              error={errors.phone}
              label=""
              placeholder="000 000 00 00"
            />
            <PasswordInputLP 
              value={password} 
              onChange={(val) => {
                setPassword(val);
                setErrors(prev => ({ ...prev, password: '' }));
                setGeneralError('');
              }} 
              disabled={isLoading}
              error={errors.password}
              label=""
              placeholder="Пароль"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <CheckboxLP 
              checked={rememberMe} 
              onChange={setRememberMe} 
              label="Запомнить меня" 
            />
  
            <button 
              type="button" 
              onClick={() => switchMode(true)}
              className="text-sm text-brand hover:text-brand-hover transition-colors font-medium outline-none"
            >
              Восстановить
            </button>
          </div>

          <div className="pt-6">
            <ButtonLP type="submit" isLoading={isLoading} variant="primary">
              Войти
            </ButtonLP>
          </div>
        </form>

        {/* Форма Восстановления пароля */}
        <form 
          onSubmit={handleRecovery} 
          className={clsx(
            "col-start-1 row-start-1 space-y-6 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            !isRecoveryMode ? "opacity-0 pointer-events-none translate-x-8" : "opacity-100 pointer-events-auto translate-x-0"
          )}
        >
          {generalError && isRecoveryMode && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-sm p-4 rounded-xl font-medium leading-relaxed">
              {generalError}
            </div>
          )}

          <div className="space-y-4">
            <PhoneInputLP 
              value={phone} 
              onChange={(val) => {
                setPhone(val);
                setErrors(prev => ({ ...prev, phone: '' }));
                setGeneralError('');
                setSuccessMsg('');
              }} 
              disabled={isLoading}
              error={errors.phone}
              label=""
              placeholder="000 000 00 00"
            />
            <EmailInputLP 
              value={email} 
              onChange={(val) => {
                setEmail(val);
                setErrors(prev => ({ ...prev, email: '' }));
                setGeneralError('');
                setSuccessMsg('');
              }} 
              disabled={isLoading}
              error={errors.email}
              label=""
              placeholder="Ваш Email"
            />
          </div>
          <p className="text-content-muted/50 text-sm font-normal mb-0">Введите данные, чтобы получить пароль на почту</p>

          <div className="pt-8 relative">
            <div className={clsx(
              "absolute top-2 left-0 w-full text-center text-[10px] font-bold uppercase tracking-widest text-brand transition-all duration-300",
              successMsg && isRecoveryMode ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
            )}>
              {successMsg}
            </div>

            <ButtonLP 
              type="submit" 
              isLoading={isLoading} 
              disabled={recoveryCooldown > 0} 
              variant="primary"
            >
              {recoveryCooldown > 0 ? `Повторить через ${recoveryCooldown}с` : 'Отправить пароль'}
            </ButtonLP>
          </div>
        </form>
      </div>

      <div className="mt-auto pt-8 pb-safe relative z-10 shrink-0 grid">
        <div className={clsx(
          "col-start-1 row-start-1 flex flex-col gap-4 transition-all duration-500",
          isRecoveryMode ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 pointer-events-auto translate-y-0"
        )}>
          <ButtonLP variant="outline" onClick={() => setActiveSheet('reg')}>
            Создать аккаунт
          </ButtonLP>
          <ButtonLP 
            variant="text" 
            onClick={() => setActiveSheet('pwa')}
            disabled={isInstalled}
          >
            {isInstalled ? 'Приложение установлено' : 'Установить PWA (Приложение)'}
          </ButtonLP>
        </div>

        <div className={clsx(
          "col-start-1 row-start-1 flex flex-col gap-4 transition-all duration-500",
          !isRecoveryMode ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 pointer-events-auto translate-y-0"
        )}>
          <ButtonLP variant="outline" onClick={() => switchMode(false)}>
            Назад ко входу
          </ButtonLP>
        </div>
      </div>

      {/* Шторка установки PWA */}
      <BottomSheet isOpen={activeSheet === 'pwa'} onClose={() => setActiveSheet(null)}>
        {!isSafari && !isChrome ? (
          <div className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-level2 text-brand shadow-sm">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-content-main mb-3">Браузер не поддерживается</h2>
            <p className="text-content-muted text-sm leading-relaxed mb-8 px-2">
              Установка PWA-приложения доступна только в браузерах <b className="text-content-main">Google Chrome</b> и <b className="text-content-main">Safari</b>. <br className="hidden sm:block"/>
              Пожалуйста, откройте этот сайт в одном из них.
            </p>
           </div>
        ) : isSafari ? (
          <div className="pb-2">
            <div className="mb-12 flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-level2 shadow-sm overflow-hidden">
                <img src="/apple-touch-icon.png" alt="App Icon" className="h-full w-full object-cover" onError={(e) => e.target.style.display='none'} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-content-main mb-1">Установка на iPhone</h2>
                <p className="text-sm text-content-muted">Добавьте на экран «Домой»</p>
              </div>
            </div>
            <ul className="space-y-4 text-sm text-content-main bg-surface-level2/40 p-5 rounded-2xl border border-surface-border/50">
              <li className="flex gap-4 items-center">
                <div className="w-8 h-8 shrink-0 bg-surface-base rounded-full flex items-center justify-center font-bold text-brand shadow-sm">1</div>
                <p>Нажмите <b>Поделиться</b> <Share size={16} className="inline text-brand mx-0.5 relative -top-[1px]" /> в меню браузера снизу.</p>
              </li>
              <li className="flex gap-4 items-center">
                <div className="w-8 h-8 shrink-0 bg-surface-base rounded-full flex items-center justify-center font-bold text-brand shadow-sm">2</div>
                <p>Выберите <b>На экран «Домой»</b> <PlusSquare size={16} className="inline text-content-main mx-0.5 relative -top-[1px]" />.</p>
              </li>
              <li className="flex gap-4 items-center">
                <div className="w-8 h-8 shrink-0 bg-surface-base rounded-full flex items-center justify-center font-bold text-brand shadow-sm">3</div>
                <p>Нажмите <b>Добавить</b> в правом верхнем углу.</p>
              </li>
            </ul>
          </div>
        ) : (
          <div className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-level2 text-brand shadow-sm">
              <Download size={28} />
            </div>
            <h2 className="text-xl font-bold text-content-main mb-3">Установить приложение</h2>
            <p className="text-content-muted text-sm mb-8 px-2 leading-relaxed">
              Установите HockeyEco на ваше устройство для быстрого доступа, работы оффлайн и получения уведомлений.
            </p>
            <ButtonLP 
              variant="primary" 
              onClick={handleInstallClick} 
              disabled={!deferredPrompt}
              className="mt-24 mb-12"
            >
              Установить сейчас
            </ButtonLP>
          </div>
        )}
      </BottomSheet>

      {/* Шторка Регистрации и Присвоения аккаунта */}
      <BottomSheet isOpen={activeSheet === 'reg'} onClose={() => { setActiveSheet(null); setTimeout(resetReg, 300); }}>
        
        {/* Шаг 1: Проверка телефона */}
        {regStep === 1 && (
          <div>
            <h2 className="text-xl font-bold text-content-main mb-2">Создать аккаунт</h2>
            <p className="text-content-muted text-sm mb-6">Введите номер телефона для регистрации.</p>
            
            <PhoneInputLP 
              value={regPhone} 
              onChange={(val) => { setRegPhone(val); setRegError(''); }} 
              error={regError} 
              disabled={isRegLoading} 
            />
            
            <ButtonLP 
              onClick={handleRegCheckPhone} 
              isLoading={isRegLoading} 
              className="mt-24 mb-12"
            >
              Далее
            </ButtonLP>
          </div>
        )}

        {/* Шаг 2: Ввод кода виртуального игрока */}
        {regStep === 2 && (
          <div>
            <h2 className="text-xl font-bold text-content-main mb-2">Профиль найден</h2>
            <p className="text-content-muted text-sm mb-6">Введите секретный код от руководителя команды или клуба для подтверждения аккаунта.</p>
            
            <TextInputLP 
              label=""
              placeholder="Например, UGPWB"
              value={regCode} 
              onChange={(val) => { setRegCode(val); setRegError(''); }} 
              error={regError} 
              disabled={isRegLoading} 
            />
            
            <ButtonLP 
              onClick={handleRegVerifyCode} 
              isLoading={isRegLoading} 
              className="mt-24 mb-12"
            >
              Подтвердить
            </ButtonLP>
          </div>
        )}

        {/* Шаг 3: Полная форма */}
        {regStep === 3 && (
          <form onSubmit={handleRegisterSubmit}>
            <h2 className="text-xl font-bold text-content-main mb-2">
              {regType === 'virtual' ? `Привет, ${regData.firstName}! ` : 'Заполнение данных'}
            </h2>
            <p className="text-content-muted text-sm mb-6">
              {regType === 'virtual' ? 'Проверьте и дополните ваши данные.' : 'Введите ваши данные для создания профиля.'}
            </p>
            
            <div className="space-y-4">
                <TextInputLP 
                  label="" 
                  placeholder="Фамилия"
                  value={regData.lastName} 
                  onChange={v => setRegData({...regData, lastName: v})} 
                  disabled={isRegLoading}
                />
                <TextInputLP 
                  label="" 
                  placeholder="Имя"
                  value={regData.firstName} 
                  onChange={v => setRegData({...regData, firstName: v})} 
                  disabled={isRegLoading}
                />
                <TextInputLP 
                  label="" 
                  placeholder="Отчество"
                  value={regData.middleName} 
                  onChange={v => setRegData({...regData, middleName: v})} 
                  disabled={isRegLoading}
                />
                
                {/* НОВОЕ ПОЛЕ С МАСКОЙ */}
                <DateMaskInputLP 
                  label=""
                  placeholder="Дата рождения (дд.мм.гггг)" 
                  value={regData.birthDate} 
                  onChange={v => setRegData({...regData, birthDate: v})} 
                  disabled={isRegLoading}
                />

                <EmailInputLP 
                  label=""
                  value={regData.email} 
                  placeholder="Электронная почта"
                  onChange={v => setRegData({...regData, email: v})} 
                  disabled={isRegLoading}
                />
            </div>

            {regError && <div className="text-danger font-medium text-sm mt-4">{regError}</div>}
            
            <ButtonLP 
              type="submit" 
              isLoading={isRegLoading} 
              className="mt-24 mb-12"
            >
              Зарегистрироваться
            </ButtonLP>
          </form>
        )}

        {/* Шаг 4: Успех */}
        {regStep === 4 && (
          <div className="text-center py-4">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand shadow-sm">
              <Check size={32} strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-bold text-content-main mb-3">Отлично!</h2>
            <p className="text-content-muted text-sm leading-relaxed mb-8 px-2">
              Ваш аккаунт готов. Пароль для входа в приложение был отправлен на вашу почту <b className="text-content-main">{regData.email}</b>.
            </p>
            <ButtonLP onClick={() => { setActiveSheet(null); setTimeout(resetReg, 300); }}>
              Перейти ко входу
            </ButtonLP>
          </div>
        )}

      </BottomSheet>

    </div>
  );
}

// Мини-компонент галочки для шага успеха
function Check(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  )
}