import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import clsx from 'clsx';
import { Share, PlusSquare, Download, AlertCircle } from 'lucide-react';
import { PhoneInputLP, PasswordInputLP, EmailInputLP, TextInputLP } from '../ui/Input-LP';
import { ButtonLP } from '../ui/Button-LP';
import { CheckboxLP } from '../ui/Checkbox-LP';
import { BottomSheet } from '../ui/BottomSheet';
import { PolicySheet } from '../ui/PolicySheet';
import { Icon } from '../ui/Icon';
import { getToken, getImageUrl } from '../utils/helpers';

// Ключ, под которым мастер регистрации переживает перезагрузку страницы во время звонка
const REG_STORAGE_KEY = 'hockeyeco_reg_wizard';

// Номер с сервера приходит в каноническом виде +79001234567 — для показа человеку
// разбиваем его на привычные группы
const formatPhoneNumber = (phoneStr) => {
  const digits = String(phoneStr || '').replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  if (last10.length !== 10) return phoneStr;
  return `+7 (${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6, 8)}-${last10.slice(8, 10)}`;
};

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
  // Мастер регистрации. Шаги: 1 — анкета, 2 — похожие карточки, 3 — секретный код,
  // 4 — телефон, 5 — ожидание звонка, 6 — готово.
  //
  // Шаги 2 и 3 пропускает тот, кого в базе нет: для него шаг 5 создаёт нового
  // пользователя, а не активирует существующую карточку.
  const [regStep, setRegStep] = useState(1);
  const [regPhone, setRegPhone] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regData, setRegData] = useState({ firstName: '', lastName: '', middleName: '', email: '', birthDate: '' });
  const [regError, setRegError] = useState('');
  const [isRegLoading, setIsRegLoading] = useState(false);

  // Подписанный билет, которым сервер связывает шаги между собой: эндпоинты регистрации
  // анонимные, серверной сессии для них нет.
  const [regTicket, setRegTicket] = useState('');
  const [regCandidates, setRegCandidates] = useState([]);
  const [regSelected, setRegSelected] = useState(null);
  const [regCall, setRegCall] = useState(null);     // { callPhone, callPhonePretty, expiresAt }
  const [regSeconds, setRegSeconds] = useState(0);
  const [regResult, setRegResult] = useState(null); // { email, isActivation, emailSent }

  // Согласие с политикой обработки ПД при активации аккаунта + шторка с её текстом
  const [policyChecked, setPolicyChecked] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

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

  // На ПК оболочка приложения сужена до 800px, и рядом с узкой формой входа фон
  // распадался на три вертикальные полосы разного цвета. Класс на <html> включает
  // правила в global.css, которые красят оболочку и поля в цвет самой формы.
  useEffect(() => {
    document.documentElement.classList.add('page-login');
    return () => document.documentElement.classList.remove('page-login');
  }, []);

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

      // Самый первый вход после активации — просим лейаут показать приветственное окно.
      // Флаг живёт в хранилище, а не в состоянии роутера: если пользователь перезагрузит
      // страницу, не закрыв окно, приветствие не потеряется.
      localStorage.removeItem('teampwa_welcome_trial');
      sessionStorage.removeItem('teampwa_welcome_trial');
      if (data.isFirstLogin) {
        storage.setItem('teampwa_welcome_trial', '1');
      }

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
    setPolicyChecked(false);
    setRegTicket('');
    setRegCandidates([]);
    setRegSelected(null);
    setRegCall(null);
    setRegResult(null);
    try { sessionStorage.removeItem(REG_STORAGE_KEY); } catch { /* хранилище может быть недоступно */ }
  };

  // Все эндпоинты регистрации отвечают одинаково, поэтому вызов у них общий
  const regFetch = async (path, body) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/reg/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Не удалось выполнить запрос');
    }
    return data;
  };

  // Шаг 1 → 2: ищем, не заведён ли человек в системе заранее.
  // Это главный барьер против дублей: почти каждый новый пользователь уже есть в базе
  // как виртуальная карточка, заведённая руководителем.
  const handleRegStart = async (e) => {
    e.preventDefault();
    setRegError('');

    if (!regData.lastName.trim() || !regData.firstName.trim()) return setRegError('Укажите фамилию и имя');
    if (!regData.birthDate) return setRegError('Укажите дату рождения');
    if (!regData.email.trim()) return setRegError('Укажите электронную почту');

    setIsRegLoading(true);
    try {
      const data = await regFetch('start', {
        lastName: regData.lastName.trim(),
        firstName: regData.firstName.trim(),
        middleName: regData.middleName.trim(),
        birthDate: regData.birthDate,
        email: regData.email.trim(),
      });

      setRegTicket(data.ticket);
      setRegCandidates(data.candidates || []);
      // Похожих не нашли — спрашивать «это вы?» не о ком, сразу к телефону
      setRegStep(data.candidates && data.candidates.length ? 2 : 4);
    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegLoading(false);
    }
  };

  // Выбор своей карточки из списка похожих
  const handleRegPickCandidate = (candidate) => {
    setRegError('');
    setRegCode('');
    setRegSelected(candidate);
    setRegStep(3);
  };

  // «Меня нет в списке» — регистрируем нового человека, шаг с кодом пропускаем
  const handleRegSkipCandidates = () => {
    setRegError('');
    setRegSelected(null);
    setRegStep(4);
  };

  // Шаг 3: секретный код руководителя подтверждает право на выбранную карточку
  const handleRegClaim = async () => {
    setRegError('');
    if (!regCode.trim()) return setRegError('Введите секретный код');

    setIsRegLoading(true);
    try {
      const data = await regFetch('claim', {
        ticket: regTicket,
        userId: regSelected.id,
        code: regCode.trim(),
      });
      setRegTicket(data.ticket);
      setRegStep(4);
    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegLoading(false);
    }
  };

  // Шаг 4 → 5: заказываем звонок для подтверждения номера
  const handleRegRequestPhone = async () => {
    setRegError('');
    const cleanPhone = regPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) return setRegError('Введите номер телефона полностью');

    setIsRegLoading(true);
    try {
      const data = await regFetch('phone/request', {
        ticket: regTicket,
        phone: `+7${cleanPhone}`,
      });

      setRegTicket(data.ticket);
      const call = {
        phone: data.phone,
        callPhone: data.callPhone,
        callPhonePretty: data.callPhonePretty,
        expiresAt: data.expiresAt,
      };
      // Счётчик выставляем сразу, иначе на один кадр отрисуется «время истекло»
      setRegSeconds(Math.max(0, Math.round((new Date(data.expiresAt) - Date.now()) / 1000)));
      setRegCall(call);
      setRegStep(5);

      // Переход в звонилку уводит приложение в фон, а iOS в standalone-режиме нередко
      // перезагружает его целиком. Билет и данные звонка кладём в sessionStorage,
      // чтобы человек вернулся на тот же шаг, а не в начало анкеты.
      try {
        sessionStorage.setItem(REG_STORAGE_KEY, JSON.stringify({
          ticket: data.ticket, data: regData, call,
        }));
      } catch { /* приватный режим — переживём без восстановления */ }
    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegLoading(false);
    }
  };

  // Восстановление мастера после перезагрузки, случившейся пока человек был в звонилке
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(REG_STORAGE_KEY);
      if (!saved) return;

      const state = JSON.parse(saved);
      if (!state.ticket || !state.call || new Date(state.call.expiresAt) <= new Date()) {
        sessionStorage.removeItem(REG_STORAGE_KEY);
        return;
      }

      setRegTicket(state.ticket);
      setRegData(state.data);
      setRegCall(state.call);
      setRegSeconds(Math.max(0, Math.round((new Date(state.call.expiresAt) - Date.now()) / 1000)));
      setRegStep(5);
      setActiveSheet('reg');
    } catch {
      /* хранилище недоступно — мастер просто начнётся заново */
    }
  }, []);

  // Обратный отсчёт окна подтверждения
  useEffect(() => {
    if (regStep !== 5 || !regCall?.expiresAt) return;

    const tick = () => setRegSeconds(Math.max(0, Math.round((new Date(regCall.expiresAt) - Date.now()) / 1000)));
    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [regStep, regCall]);

  // Опрос подтверждения звонком. Как только звонок засчитан, сервер тем же запросом
  // создаёт или активирует аккаунт и высылает пароль — отдельного шага «завершить» нет.
  useEffect(() => {
    if (regStep !== 5 || !regTicket) return;

    let stopped = false;

    const checkStatus = async () => {
      if (stopped) return;
      try {
        const data = await regFetch('phone/status', { ticket: regTicket });
        if (stopped || !data.confirmed) return;

        stopped = true;
        try { sessionStorage.removeItem(REG_STORAGE_KEY); } catch { /* не критично */ }
        setRegResult({ email: data.email, isActivation: data.isActivation, emailSent: data.emailSent });
        setRegStep(6);
      } catch (err) {
        // Сеть могла моргнуть на переключении в звонилку — ждём следующего круга
        console.error('Ошибка проверки подтверждения номера:', err);
      }
    };

    checkStatus();
    const pollId = setInterval(checkStatus, 3000);
    return () => { stopped = true; clearInterval(pollId); };
  }, [regStep, regTicket]);

  return (
    <div className="w-full h-full max-w-md mx-auto flex bg-surface-base flex-col flex-1 px-6 py-10 relative z-10">
  
      <div className="relative mt-1 mb-16 shrink-0">
        <h1 className="text-[36px] font-bold uppercase tracking-widest mb-1 text-content-main">
          Hockey<span className="text-brand ">Eco</span>
        </h1>
        <p className="text-content-muted text-[14px] tracking-[0.2em] uppercase font-semibold mb-4">
          Кабинет команды
        </p>

        <div className="absolute -bottom-12 left-0 w-full h-10 flex items-end overflow-visible pointer-events-none">
          <div
            className={clsx(
              "transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] origin-left",
              firstName && !isRecoveryMode ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
            )}
          >
            <p className="text-[18px] text-content-main tracking-wide">
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
            <div className="bg-danger/10 border border-danger/20 text-danger text-[14px] p-4 rounded-xl font-medium leading-relaxed">
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
              className="text-[14px] text-brand hover:text-brand-hover transition-colors font-medium outline-none"
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
            <div className="bg-danger/10 border border-danger/20 text-danger text-[14px] p-4 rounded-xl font-medium leading-relaxed">
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
          <p className="text-content-muted text-[14px] font-normal mb-0">Введите данные, чтобы получить пароль</p>

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
          <ButtonLP variant="outline" onClick={() => setActiveSheet('reg')}
            className="tracking-widest">
            Регистрация
          </ButtonLP>
          <ButtonLP
            variant="text"
            onClick={() => setActiveSheet('pwa')}
            disabled={isInstalled}
          >
            {isInstalled ? 'Приложение установлено' : 'Установить PWA (Приложение)'}
          </ButtonLP>
          <button
            type="button"
            onClick={() => setIsPolicyOpen(true)}
            className="text-[10px] text-content-subtle hover:text-content-muted font-normal uppercase text-center underline underline-offset-4 outline-none cursor-pointer -mt-2"
          >
            Политика о персональных данных и контакты
          </button>
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
            <h2 className="text-[18px] font-bold text-content-main mb-3">Браузер не поддерживается</h2>
            <p className="text-content-muted text-[14px] leading-relaxed mb-8 px-2">
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
                <h2 className="text-[18px] font-bold text-content-main mb-1">Установка на iPhone</h2>
                <p className="text-[14px] text-content-muted">Добавьте на экран «Домой»</p>
              </div>
            </div>
            <ul className="space-y-4 text-[14px] text-content-main p-5 rounded-2xl border border-surface-level2">
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
            <h2 className="text-[18px] font-bold text-content-main mb-3">Установить приложение</h2>
            <p className="text-content-muted text-[14px] mb-8 px-2 leading-relaxed">
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

        {/* Шаг 1: анкета. Ищем человека в базе ДО того, как заводить нового */}
        {regStep === 1 && (
          <form onSubmit={handleRegStart}>
            <h2 className="text-[18px] font-bold text-content-main mb-2">Регистрация</h2>

            <div className="space-y-4">
              <TextInputLP label="" placeholder="Фамилия" value={regData.lastName}
                onChange={v => { setRegData({ ...regData, lastName: v }); setRegError(''); }} disabled={isRegLoading} />
              <TextInputLP label="" placeholder="Имя" value={regData.firstName}
                onChange={v => { setRegData({ ...regData, firstName: v }); setRegError(''); }} disabled={isRegLoading} />
              <TextInputLP label="" placeholder="Отчество (если есть)" value={regData.middleName}
                onChange={v => setRegData({ ...regData, middleName: v })} disabled={isRegLoading} />

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider pl-1">Дата рождения</span>
                <input
                  type="date"
                  value={regData.birthDate}
                  onChange={(e) => { setRegData({ ...regData, birthDate: e.target.value }); setRegError(''); }}
                  disabled={isRegLoading}
                  className="w-full p-4 bg-surface-level2 border border-surface-border rounded-xl text-[14px] font-bold text-content-main outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <EmailInputLP label="" placeholder="Электронная почта" value={regData.email}
                onChange={v => { setRegData({ ...regData, email: v }); setRegError(''); }} disabled={isRegLoading} />
            </div>

            {regError && <div className="text-danger font-medium text-[14px] mt-4">{regError}</div>}

            <div className="mt-6 mb-6 flex flex-col gap-2.5">
              <CheckboxLP
                checked={policyChecked}
                onChange={setPolicyChecked}
                label="Даю согласие на обработку персональных данных"
                className="items-start [&>span]:text-[12px] [&>span]:leading-snug"
              />
              <button type="button" onClick={() => setIsPolicyOpen(true)}
                className="text-[12px] text-brand hover:text-brand-hover font-medium text-left underline underline-offset-4 outline-none cursor-pointer pl-8">
                Политика обработки персональных данных
              </button>
            </div>

            <ButtonLP type="submit" isLoading={isRegLoading} disabled={!policyChecked} className="mb-12">
              Далее
            </ButtonLP>
          </form>
        )}

        {/* Шаг 2: похожие карточки. Команды с логотипами здесь не украшение —
            однофамильцы одного года рождения в детском хоккее обычное дело, и именно
            команда, а не отчество, позволяет человеку узнать себя */}
        {regStep === 2 && (
          <div>
            <h2 className="text-[18px] font-bold text-content-main mb-2">Это вы?</h2>
            <p className="text-content-muted text-[14px] mb-6">
              Мы нашли похожие записи. Если одна из них ваша — выберите её, чтобы сохранить всю
              статистику и команды.
            </p>

            <div className="space-y-2.5">
              {regCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleRegPickCandidate(candidate)}
                  className="w-full text-left p-4 bg-surface-level1 border border-surface-border rounded-2xl active:scale-[0.99] transition-transform outline-none"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-bold text-content-main">
                      {candidate.lastName} {candidate.firstName} {candidate.middleName || ''}
                    </span>
                    {candidate.birthYear && (
                      <span className="text-[12px] font-bold text-content-subtle shrink-0">{candidate.birthYear} г.р.</span>
                    )}
                  </div>

                  {candidate.teams.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      {candidate.teams.map((team, index) => (
                        <span key={index} className="flex items-center gap-1.5 px-2 py-1 bg-surface-level2 rounded-lg">
                          {team.logoUrl && (
                            <img src={getImageUrl(team.logoUrl)} alt="" className="w-4 h-4 rounded-full object-cover" />
                          )}
                          <span className="text-[11px] font-bold text-content-muted">{team.name}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {candidate.state === 'activated' && (
                    <div className="text-[11px] font-bold text-brand mt-2">Аккаунт уже активирован</div>
                  )}
                </button>
              ))}
            </div>

            <ButtonLP variant="outline" onClick={handleRegSkipCandidates} className="mt-6 mb-12">
              Меня нет в списке
            </ButtonLP>
          </div>
        )}

        {/* Шаг 3: секретный код. Именно он, а не выбор из списка, даёт право на карточку —
            поэтому список можно делать широким, не боясь ошибочного выбора */}
        {regStep === 3 && regSelected && (
          <div>
            {regSelected.state === 'activated' ? (
              <>
                <h2 className="text-[18px] font-bold text-content-main mb-2">Аккаунт уже активирован</h2>
                <p className="text-content-muted text-[14px] mb-6">
                  Регистрироваться заново не нужно — войдите по номеру телефона или восстановите пароль на экране входа. 
                  Если вы не можете зайти в электронную почту, которую использовали при регистрации, то напишите в поддержку платформы support@hockeyeco.ru
                </p>
                <ButtonLP onClick={() => { setActiveSheet(null); setTimeout(resetReg, 300); }} className="mb-3">
                  Перейти ко входу
                </ButtonLP>
                <ButtonLP variant="text" onClick={() => { setRegSelected(null); setRegStep(2); }} className="mb-12">
                  Назад к списку
                </ButtonLP>
              </>
            ) : (
              <>
                <h2 className="text-[18px] font-bold text-content-main mb-2">Ваш аккаунт уже создан</h2>
                <p className="text-content-muted text-[14px] mb-6">
                  Карточка <span className="font-bold text-content-main">{regSelected.lastName} {regSelected.firstName}</span> заведена,
                  но не активирована. Введите секретный код — его выдаёт руководитель вашей команды или клуба.
                </p>

                <TextInputLP
                  label=""
                  placeholder="Например, UGPWB"
                  value={regCode}
                  onChange={(val) => { setRegCode(val.toUpperCase()); setRegError(''); }}
                  error={regError}
                  disabled={isRegLoading}
                />

                <ButtonLP onClick={handleRegClaim} isLoading={isRegLoading} disabled={!regCode.trim()} className="mt-6 mb-3">
                  Подтвердить
                </ButtonLP>
                <ButtonLP variant="text" onClick={() => { setRegSelected(null); setRegError(''); setRegStep(2); }} className="mb-12">
                  Назад к списку
                </ButtonLP>
              </>
            )}
          </div>
        )}

        {/* Шаг 4: телефон. Он же логин, поэтому подтверждается звонком */}
        {regStep === 4 && (
          <div>
            <h2 className="text-[18px] font-bold text-content-main mb-2">Ваш номер телефона</h2>
            <p className="text-content-muted text-[14px] mb-6">
              По этому номеру вы будете входить в приложение. Его нужно подтвердить — мы попросим
              позвонить с него на номер, который укажем в следющем шаге, звонок бесплатный.
            </p>

            <PhoneInputLP
              value={regPhone}
              onChange={(val) => { setRegPhone(val); setRegError(''); }}
              error={regError}
              disabled={isRegLoading}
            />

            <ButtonLP onClick={handleRegRequestPhone} isLoading={isRegLoading} className="mt-24 mb-12">
              Далее
            </ButtonLP>
          </div>
        )}

        {/* Шаг 5: ожидание звонка */}
        {regStep === 5 && regCall && (
          <div>
            <h2 className="text-[18px] font-bold text-content-main mb-2">Подтвердите номер</h2>

            <p className="text-content-muted text-[14px] leading-relaxed mb-3">
              Позвоните на номер ниже <span className="font-bold text-brand">с телефона {formatPhoneNumber(regCall.phone)}</span> —
              именно с того, который подтверждаете. Звонок бесплатный: робот произнесёт короткое
              сообщение и сам завершит вызов, отвечать не нужно.
            </p>

            <a
              href={`tel:${regCall.callPhone}`}
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-surface-level2 border border-surface-border text-[20px] font-black tracking-wide text-content-main active:scale-[0.98] transition-transform"
            >
              <Icon name="phone" className="w-5 h-5 text-brand shrink-0" />
              {regCall.callPhonePretty || regCall.callPhone}
            </a>

            <p className="text-[13px] font-semibold text-content-muted leading-relaxed text-center mt-3">
              Как только звонок дойдёт, регистрация завершится сама — обновлять страницу не нужно.
            </p>

            {regSeconds > 0 ? (
              <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-content-subtle mt-4">
                <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span>Ожидаем звонок · {Math.floor(regSeconds / 60)}:{String(regSeconds % 60).padStart(2, '0')}</span>
              </div>
            ) : (
              <div className="text-[10px] font-bold uppercase tracking-wider text-center text-content-subtle mt-4">
                Время подтверждения истекло
              </div>
            )}

            <ButtonLP
              variant="text"
              onClick={() => { setRegCall(null); setRegError(''); setRegStep(4); }}
              className="mt-2 mb-12"
            >
              {regSeconds > 0 ? 'Изменить номер' : 'Попробовать заново'}
            </ButtonLP>
          </div>
        )}

        {/* Шаг 6: готово */}
        {regStep === 6 && regResult && (
          <div className="text-center py-4">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand shadow-sm">
              <Check size={32} strokeWidth={3} />
            </div>
            <h2 className="text-[28px] font-bold text-content-main mb-3">
              {regResult.isActivation ? 'Аккаунт активирован' : 'Аккаунт создан'}
            </h2>

            {regResult.emailSent ? (
              <p className="text-content-muted text-[14px] leading-relaxed mb-8 px-2">
                Пароль для входа отправлен на почту <b className="text-content-main">{regResult.email}</b>.
                Входить нужно по номеру телефона, который вы подтвердили.
              </p>
            ) : (
              <p className="text-content-muted text-[14px] leading-relaxed mb-8 px-2">
                Аккаунт готов, но письмо с паролем отправить не удалось. Воспользуйтесь
                восстановлением пароля на экране входа — оно пришлёт новый.
              </p>
            )}

            <ButtonLP onClick={() => { setActiveSheet(null); setTimeout(resetReg, 300); }}>
              Перейти ко входу
            </ButtonLP>
          </div>
        )}

      </BottomSheet>

      {/* Шторка с текстом политики — поверх всего, включая BottomSheet регистрации */}
      <PolicySheet isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />

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