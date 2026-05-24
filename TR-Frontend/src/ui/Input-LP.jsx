import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { twMerge } from 'tailwind-merge';
import { IMaskInput, IMask } from 'react-imask';

const baseWrapperStyles = "border-b border-surface-border focus-within:border-brand transition-colors duration-300 py-0 relative group";
const baseLabelStyles = "text-[10px] text-content-muted uppercase tracking-widest font-bold block mb-1 group-focus-within:text-brand transition-colors";
const baseInputStyles = "w-full py-2 bg-transparent outline-none text-content-main placeholder-content-subtle text-lg transition-all";

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

  // Динамические стили рамки и лейбла при фокусе в цвет команды
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
        <span className="text-content-main text-lg select-none">+7</span>
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

export function TextInputLP({ value, onChange, disabled, error, className, label, placeholder, type = "text" , activeColor }) {
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
          type={currentType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="nope"
          className={twMerge(
            baseInputStyles,
            type === 'date' && "h-11 py-0"
          )}
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