import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { twMerge } from 'tailwind-merge';
import { IMaskInput, IMask } from 'react-imask';

const baseWrapperStyles = "border-b border-content-subtle focus-within:border-brand transition-colors duration-300 py-0 relative group";
const baseLabelStyles = "text-[10px] text-content-subtle uppercase tracking-widest font-bold block group-focus-within:text-brand transition-colors";
const baseInputStyles = "w-full pt-2 pb-0.5 bg-transparent outline-none text-content-main placeholder-content-subtle placeholder:opacity-60 placeholder:italic placeholder:font-normal transition-all appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function PhoneInputLP({ value, onChange, disabled, error, className, label = "", placeholder = "000 000 00 00", activeColor }) {
  const [isFocused, setIsFocused] = useState(false);

  const handlePhoneChange = (e) => {
    let input = e.target.value.replace(/\D/g, '');
    if (input.startsWith('7') || input.startsWith('8')) input = input.substring(1);
    input = input.substring(0, 10);

    let formatted = '';
    if (input.length > 0) formatted += `${input.substring(0, 3)}`;
    if (input.length >= 4) formatted += ` ${input.substring(3, 6)}`;
    if (input.length >= 7) formatted += ` ${input.substring(6, 8)}`;
    if (input.length >= 9) formatted += ` ${input.substring(8, 10)}`;
    
    onChange(formatted);
  };

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};

  return (
    <div 
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label 
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger group-focus-within:text-danger")}
        >
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <span className="text-content-main text-[18px] select-none -mb-1.5">+7</span>
        <input
          type="tel"
          value={value}
          onChange={handlePhoneChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="nope"
          className={twMerge(baseInputStyles, "text-[18px]")}
        />
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

export function PasswordInputLP({ value, onChange, disabled, error, className, label = "Пароль", placeholder = "••••••••", activeColor }) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isEyeHovered, setIsEyeHovered] = useState(false);

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};
  const eyeIconStyle = (isEyeHovered || isFocused) && activeColor ? { color: activeColor } : {};

  return (
    <div 
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label 
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger group-focus-within:text-danger")}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="new-password"
          className={twMerge(baseInputStyles, "text-[18px] pr-10")}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          onMouseEnter={() => setIsEyeHovered(true)}
          onMouseLeave={() => setIsEyeHovered(false)}
          disabled={disabled}
          style={eyeIconStyle}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-content-subtle hover:text-brand transition-colors p-2 outline-none"
        >
          <Icon 
            name={showPassword ? "view_off" : "view"} 
            className="w-5 h-5" 
          />
        </button>
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

export function EmailInputLP({ value, onChange, disabled, error, className, label = "Email", placeholder = "mail@example.com", activeColor }) {
  const [isFocused, setIsFocused] = useState(false);

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};

  return (
    <div 
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label 
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger group-focus-within:text-danger")}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="nope"
          className={twMerge(baseInputStyles, "text-[18px]")}
        />
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextInputLP({ value, onChange, disabled, error, className, label, placeholder, type = "text", activeColor, size = "md", rows = 4, maxLength, textAlign = "left" }) {
  const [currentType, setCurrentType] = useState(type === 'date' && !value ? 'text' : type);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (type === 'date') {
      setCurrentType(value ? 'date' : 'text');
    }
  }, [value, type]);

  const handleFocus = () => {
    setIsFocused(true);
    if (type === 'date') setCurrentType('date');
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (type === 'date' && !value) setCurrentType('text');
  };

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};

  // Флаг компактного отображения элементов формы
  const isSm = size === "sm";

  return (
    <div 
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label 
          style={labelStyle}
          className={twMerge(
            baseLabelStyles, 
            isSm && "text-[10px] mb-0.5", 
            error && "text-danger group-focus-within:text-danger"
          )}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {type === 'textarea' ? (
          /* МОДИФИКАЦИЯ: Если передан тип textarea, отрисовываем многострочный блок ввода с rows={4} */
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder}
            maxLength={maxLength}
            rows={rows}
            autoComplete="nope"
            style={{ textAlign }}
            className={twMerge(
              baseInputStyles,
              "resize-none leading-normal py-1",
              isSm ? "text-[14px] placeholder:text-[10px]" : "text-[14px]"
            )}
          />
        ) : (
          /* ИСПРАВЛЕНО: Добавлен динамический расчет размера шрифта и высоты при size="sm" */
          <input
            type={currentType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder}
            maxLength={maxLength}
            autoComplete="nope"
            style={{ textAlign }}
            className={twMerge(
              baseInputStyles,
              isSm ? "text-[14px] py-1 placeholder:text-[10px]" : "text-[18px]",
              type === 'date' && "h-8 py-0 [&::-webkit-calendar-picker-indicator]:hidden"
            )}
          />
        )}
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

// Нативный пикер даты — всегда открывает системный календарь.
// Нативная иконка скрыта через [&::-webkit-calendar-picker-indicator]:opacity-0,
// поверх неё рендерится своя Icon с activeColor (pointer-events-none, клик проходит насквозь к инпуту).
export function NativeDateInputLP({ value, onChange, disabled, error, className, label, activeColor }) {
  const [isFocused, setIsFocused] = useState(false);

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};
  const iconColor = activeColor || 'var(--color-content-subtle)';

  return (
    <div
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger group-focus-within:text-danger")}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          autoComplete="nope"
          className={twMerge(
            baseInputStyles,
            "h-8 py-0 text-[14px] ",
            "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          )}
        />
        {/* Кастомная иконка поверх нативного триггера */}
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
          style={{ color: iconColor }}
        >
          <Icon name="calendar" className="w-4 h-4" />
        </span>
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

// Нативный пикер времени — всегда открывает системный тайм-пикер.
// Та же схема: нативная иконка скрыта, своя Icon с activeColor сверху.
export function NativeTimeInputLP({ value, onChange, disabled, error, className, label, activeColor, size = 'md' }) {
  const [isFocused, setIsFocused] = useState(false);

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};
  const iconColor = activeColor || 'var(--color-content-subtle)';
  const isLg = size === 'lg';

  return (
    <div
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger group-focus-within:text-danger")}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          autoComplete="nope"
          className={twMerge(
            baseInputStyles,
            "py-0 ",
            isLg ? "h-10 text-[18px] font-bold" : "h-8 text-[14px]",
            "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          )}
        />
        {/* Кастомная иконка поверх нативного триггера */}
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
          style={{ color: iconColor }}
        >
          <Icon name="clock" className={isLg ? "w-5 h-5" : "w-4 h-4"} />
        </span>
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

// Селектор-выпадашка в стиле Input-LP (underline + label).
// options: [{ value, label }], size: 'md' (default) | 'lg'
export function SelectInputLP({ value, onChange, options, label, disabled, error, className, activeColor, size = 'md' }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const isLg = size === 'lg';
  const selected = (options || []).find(o => o.value === value) || (options || [])[0];

  useEffect(() => {
    const onDoc = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const wrapperStyle = isOpen && activeColor ? { borderColor: activeColor } : {};
  const labelStyle   = isOpen && activeColor ? { color: activeColor } : {};
  const iconColor    = activeColor || 'var(--color-content-subtle)';

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger")}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(o => !o)}
          className={twMerge(
            "w-full  flex items-center bg-transparent text-content-main outline-none text-left truncate",
            isLg ? "h-10 text-[18px] font-bold" : "h-8 text-[14px]"
          )}
        >
          <span className="truncate">{selected?.label}</span>
        </button>
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
          style={{ color: iconColor }}
        >
          <Icon
            name="chevron_right"
            className={twMerge(
              "transition-transform duration-200",
              isLg ? "w-5 h-5" : "w-4 h-4",
              isOpen ? "-rotate-90" : "rotate-90"
            )}
          />
        </span>
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-surface-level1 border border-surface-border shadow-2xl rounded-xl overflow-hidden z-50">
            {(options || []).map(opt => {
              const isSel = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => { onChange(opt.value); setIsOpen(false); }}
                  className={twMerge(
                    "w-full text-left px-3 py-2.5 text-[14px] font-bold uppercase tracking-wide transition-colors outline-none",
                    isSel ? "bg-brand text-white" : "text-content-muted active:bg-surface-level2 hover:text-content-main"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

export function DateMaskInputLP({ value, onChange, disabled, error, className, label, placeholder = "дд.мм.гггг", activeColor }) {
  const [isFocused, setIsFocused] = useState(false);

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};

  return (
    <div 
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label 
          style={labelStyle}
          className={twMerge(baseLabelStyles, error && "text-danger group-focus-within:text-danger")}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <IMaskInput
          mask="d.m.Y"
          blocks={{
            d: { mask: IMask.MaskedRange, from: 1, to: 31, maxLength: 2 },
            m: { mask: IMask.MaskedRange, from: 1, to: 12, maxLength: 2 },
            Y: { mask: IMask.MaskedRange, from: 1930, to: new Date().getFullYear() }
          }}
          lazy={true}
          value={value}
          unmask={false} 
          onAccept={(val) => onChange(val)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          inputMode="numeric" 
          placeholder={placeholder}
          autoComplete="nope"
          className={twMerge(baseInputStyles, "text-[18px]")}
        />
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}
// ─────────────────────────── Числовой степпер в стиле Input-LP ─────────────
// value (number), onChange(number), min/max/step, label, suffix (например "мин"),
// size: 'md' (default) | 'lg', activeColor для подсветки рамки и +/− кнопок.
export function StepperLP({
  value, onChange, min = 0, max = 99, step = 1,
  label, suffix, disabled, error, className, activeColor, size = 'md'
}) {
  const [isFocused, setIsFocused] = useState(false);
  const isLg = size === 'lg';
  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};
  const accentStyle = activeColor ? { color: activeColor } : {};

  const clamp = (n) => Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));
  const dec = () => !disabled && onChange(clamp(Number(value) - step));
  const inc = () => !disabled && onChange(clamp(Number(value) + step));

  return (
    <div
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label style={labelStyle} className={twMerge(baseLabelStyles, error && "text-danger")}>
          {label}
        </label>
      )}
      <div className={twMerge("flex items-center justify-between gap-2", isLg ? "h-10" : "h-8")}>
        <button
          type="button"
          disabled={disabled || Number(value) <= min}
          onClick={dec}
          style={accentStyle}
          className={twMerge(
            "shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90 outline-none cursor-pointer text-brand disabled:opacity-30 disabled:cursor-not-allowed",
            isLg ? "w-8 h-8" : "w-7 h-7"
          )}
        >
          <Icon name="chevron_left" className={isLg ? "w-5 h-5" : "w-4 h-4"} />
        </button>

        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(clamp(e.target.value.replace(/\D/g, '')))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          className={twMerge(
            "flex-1 min-w-0 bg-transparent outline-none text-center text-content-main font-bold tabular-nums",
            isLg ? "text-[18px]" : "text-[18px]"
          )}
        />

        {suffix && (
          <span className={twMerge(
            "shrink-0 text-content-subtle uppercase tracking-widest font-bold",
            isLg ? "text-[10px]" : "text-[10px]"
          )}>
            {suffix}
          </span>
        )}

        <button
          type="button"
          disabled={disabled || Number(value) >= max}
          onClick={inc}
          style={accentStyle}
          className={twMerge(
            "shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90 outline-none cursor-pointer text-brand disabled:opacity-30 disabled:cursor-not-allowed rotate-180",
            isLg ? "w-8 h-8" : "w-7 h-7"
          )}
        >
          <Icon name="chevron_left" className={isLg ? "w-5 h-5" : "w-4 h-4"} />
        </button>
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────── Поле MM:SS (без нативного пикера, MM 0-99) ───
// value (string "MM:SS"), onChange(string). Нужно потому, что <input type="time">
// нативно ограничивает MM до 23 — нельзя ввести «24:35» и т.п.
export function TimeMMSSInputLP({ value, onChange, label, disabled, error, className, activeColor, size = 'md' }) {
  const [isFocused, setIsFocused] = useState(false);
  const isLg = size === 'lg';
  const pad = (n) => String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, '0');
  const [mmProp = '00', ssProp = '00'] = String(value || '00:00').split(':');
  const ssRef = useRef(null);

  // Локальный буфер ввода — НЕ padded во время набора, иначе maxLength=2
  // ловит уже «02» после первой цифры и блокирует вторую.
  const [mm, setLocalMM] = useState(mmProp);
  const [ss, setLocalSS] = useState(ssProp);

  // Подтягиваем из пропсов только когда поле не в фокусе (внешний reset/prefill).
  useEffect(() => {
    if (!isFocused) {
      setLocalMM(mmProp);
      setLocalSS(ssProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmProp, ssProp]);

  const emit = (newMM, newSS) => {
    const numM = Math.min(99, parseInt(newMM || '0', 10) || 0);
    const numS = Math.min(59, parseInt(newSS || '0', 10) || 0);
    onChange(`${pad(numM)}:${pad(numS)}`);
  };

  const setMM = (raw) => {
    const cleaned = String(raw).replace(/\D/g, '').slice(0, 2);
    setLocalMM(cleaned);
    emit(cleaned, ss);
    // Авто-перевод фокуса на секунды, как только в минутах набрано 2 цифры.
    if (cleaned.length === 2 && ssRef.current) {
      ssRef.current.focus();
      ssRef.current.select();
    }
  };
  const setSS = (raw) => {
    const cleaned = String(raw).replace(/\D/g, '').slice(0, 2);
    setLocalSS(cleaned);
    emit(mm, cleaned);
  };

  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};

  const inputBase = twMerge(
    "bg-transparent outline-none text-content-main font-medium tabular-nums w-9",
    isLg ? "text-[18px]" : "text-[18px]"
  );

  return (
    <div
      style={wrapperStyle}
      className={twMerge(baseWrapperStyles, error && "border-danger focus-within:border-danger", className)}
    >
      {label && (
        <label style={labelStyle} className={twMerge(baseLabelStyles, error && "text-danger")}>
          {label}
        </label>
      )}
      <div className={twMerge("relative flex items-center", isLg ? "h-10" : "h-8")}>
        <input
          inputMode="numeric"
          value={mm}
          onChange={(e) => setMM(e.target.value)}
          onFocus={(e) => { setIsFocused(true); e.target.select(); }}
          onBlur={() => {
            setIsFocused(false);
            // Functional update — иначе при авто-переходе на секунды closure видит
            // старое значение `mm` (до второй цифры) и затирает поле.
            setLocalMM(prev => pad(parseInt(prev, 10) || 0));
          }}
          disabled={disabled}
          maxLength={2}
          className={twMerge(inputBase, "text-right pr-0.5")}
        />
        <span className={twMerge("text-content-subtle font-medium px-0.5", isLg ? "text-[18px]" : "text-[18px]")}>:</span>
        <input
          ref={ssRef}
          inputMode="numeric"
          value={ss}
          onChange={(e) => setSS(e.target.value)}
          onFocus={(e) => { setIsFocused(true); e.target.select(); }}
          onBlur={() => {
            setIsFocused(false);
            setLocalSS(prev => pad(parseInt(prev, 10) || 0));
          }}
          disabled={disabled}
          maxLength={2}
          className={twMerge(inputBase, "text-left pl-0.5")}
        />
      </div>
      {typeof error === 'string' && error !== '' && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-danger font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300">
          {error}
        </span>
      )}
    </div>
  );
}
