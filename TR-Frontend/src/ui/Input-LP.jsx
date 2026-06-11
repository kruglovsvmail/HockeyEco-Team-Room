import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { twMerge } from 'tailwind-merge';
import { IMaskInput, IMask } from 'react-imask';

const baseWrapperStyles = "border-b border-content-subtle focus-within:border-brand transition-colors duration-300 py-0 relative group";
const baseLabelStyles = "text-[10px] text-content-subtle uppercase tracking-widest font-bold block  group-focus-within:text-brand transition-colors";
const baseInputStyles = "w-full pt-2 pb-0.5 bg-transparent outline-none text-content-main placeholder-content-subtle placeholder:opacity-60 placeholder:italic placeholder:font-normal  text-lg transition-all";

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
        <span className="text-content-main text-[17px] select-none -mb-1.5">+7</span>
        <input
          type="tel"
          value={value}
          onChange={handlePhoneChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="nope"
          className={baseInputStyles}
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
          className={twMerge(baseInputStyles, "pr-10")}
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
          className={baseInputStyles}
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
            isSm && "text-[9px] mb-0.5", 
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
              isSm ? "text-xs placeholder:text-[11px]" : "text-sm"
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
              isSm ? "text-xs py-1 placeholder:text-[11px]" : "text-lg",
              type === 'date' && (isSm ? "h-8 py-0" : "h-11 py-0")
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
            "h-11 py-0 text-sm pr-8",
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
export function NativeTimeInputLP({ value, onChange, disabled, error, className, label, activeColor }) {
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
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          autoComplete="nope"
          className={twMerge(
            baseInputStyles,
            "h-11 py-0 text-sm pr-8",
            "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          )}
        />
        {/* Кастомная иконка поверх нативного триггера */}
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
          style={{ color: iconColor }}
        >
          <Icon name="clock" className="w-4 h-4" />
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
          className={baseInputStyles}
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