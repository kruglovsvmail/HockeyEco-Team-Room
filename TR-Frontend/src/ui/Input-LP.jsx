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

// inputMode — какую клавиатуру звать на телефоне. Для денег и прочих полей,
// где кроме цифр ничего не вводят, ставим "numeric": буквенная раскладка там
// только мешает. Сам type остаётся text — фильтрацию делает вызывающий код.
export function TextInputLP({ value, onChange, disabled, error, className, label, placeholder, type = "text", inputMode, activeColor, size = "md", rows = 4, maxLength, textAlign = "left" }) {
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
            inputMode={inputMode}
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
//
// inline     — подпись слева, степпер справа одной строкой: тот же ряд, что у
//              тумблера «Вратари бесплатно». Подчёркивания и мелкого лейбла нет.
// allowEmpty — перед минимумом появляется пустое значение «—»: там, где кроме
//              чисел нужен ещё и вариант «ограничения нет». Наружу оно уходит
//              пустой строкой, ряд читается как «—», 0, 1, 2 … (или «—», 1, 2 …,
//              если min = 1).
// steps      — готовый список допустимых значений вместо равномерного шага:
//              нужен неравномерной шкале (часы, где ниже часа осмысленны
//              четверти, а выше идут целые). min/max задают границы по
//              значению, max = null — без потолка. formatValue подписывает
//              значение (например «0,25»), ввод с клавиатуры принимает и
//              запятую, и точку.
export function StepperLP({
  value, onChange, min = 0, max = 99, step = 1,
  label, suffix, disabled, error, className, activeColor, size = 'md',
  inline = false, allowEmpty = false, emptyLabel = '—',
  steps = null, formatValue = String
}) {
  const [isFocused, setIsFocused] = useState(false);
  // Пока человек печатает, значение живёт в строке: иначе «1» на пути к «12»
  // тут же схлопнулась бы в ближайшую ступень и стёрла набранное.
  const [draft, setDraft] = useState(null);
  const isLg = size === 'lg';
  const wrapperStyle = isFocused && activeColor ? { borderColor: activeColor } : {};
  const labelStyle = isFocused && activeColor ? { color: activeColor } : {};
  const accentStyle = activeColor ? { color: activeColor } : {};

  const isEmpty = allowEmpty && (value === '' || value === null || value === undefined);
  const numeric = Math.floor(Number(value) || 0);

  const clamp = (n) => Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

  // ── Режим ступеней ──────────────────────────────────────────────────────
  const useSteps = Array.isArray(steps) && steps.length > 0;
  const snapToStep = (n) => steps.reduce(
    (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
    steps[0]
  );
  const currentStep = useSteps ? snapToStep(Number(value) || 0) : null;
  const stepIndex = useSteps ? steps.indexOf(currentStep) : -1;
  const minIndex = useSteps ? steps.indexOf(snapToStep(min ?? steps[0])) : -1;
  const maxIndex = useSteps
    ? (max === null || max === undefined ? steps.length - 1 : steps.indexOf(snapToStep(max)))
    : -1;
  const clampIndex = (i) => Math.min(maxIndex, Math.max(minIndex, i));

  const atMin = useSteps ? stepIndex <= minIndex : numeric <= min;
  const atMax = useSteps ? stepIndex >= maxIndex : numeric >= max;

  // Шаг вниз с минимума уводит в пустое значение, шаг вверх из пустого
  // возвращает на минимум — «—» стоит ровно одной позицией ниже min.
  const dec = () => {
    if (disabled || isEmpty) return;
    if (allowEmpty && atMin) return onChange('');
    if (useSteps) {
      const next = steps[clampIndex(stepIndex - 1)];
      if (next !== currentStep) onChange(next);
      return;
    }
    onChange(clamp(numeric - step));
  };
  const inc = () => {
    if (disabled) return;
    if (isEmpty) return onChange(useSteps ? steps[clampIndex(minIndex)] : min);
    if (useSteps) {
      const next = steps[clampIndex(stepIndex + 1)];
      if (next !== currentStep) onChange(next);
      return;
    }
    onChange(clamp(numeric + step));
  };

  // Набранное с клавиатуры приводим к ближайшей ступени — промежуточных
  // значений в такой шкале не бывает.
  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseFloat(String(draft).replace(',', '.'));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const next = steps[clampIndex(steps.indexOf(snapToStep(parsed)))];
    if (next !== currentStep) onChange(next);
  };

  const arrowStyles = twMerge(
    "shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90 outline-none cursor-pointer text-brand disabled:opacity-30 disabled:cursor-not-allowed",
    isLg ? "w-8 h-8" : "w-7 h-7"
  );
  const arrowIcon = isLg ? "w-5 h-5" : "w-4 h-4";

  const decButton = (
    <button
      type="button"
      disabled={disabled || isEmpty || (!allowEmpty && atMin)}
      onClick={dec}
      style={accentStyle}
      className={arrowStyles}
    >
      <Icon name="chevron_left" className={arrowIcon} />
    </button>
  );

  const incButton = (
    <button
      type="button"
      disabled={disabled || (!isEmpty && atMax)}
      onClick={inc}
      style={accentStyle}
      className={twMerge(arrowStyles, "rotate-180")}
    >
      <Icon name="chevron_left" className={arrowIcon} />
    </button>
  );

  // Ступени бывают дробными («0,25»), под них колонка чуть шире. Внутри одного
  // блока степперы однотипны, так что выравнивание чисел не страдает.
  const valueWidth = inline ? (useSteps ? "w-12 shrink-0" : "w-10 shrink-0") : "flex-1 min-w-0";

  const valueField = isEmpty ? (
    <span className={twMerge(
      "text-center text-content-subtle font-bold select-none text-[18px]",
      valueWidth
    )}>
      {emptyLabel}
    </span>
  ) : (
    <input
      inputMode={useSteps ? "decimal" : "numeric"}
      value={useSteps ? (draft ?? formatValue(currentStep)) : value}
      onChange={(e) => {
        if (useSteps) return setDraft(e.target.value);
        const raw = e.target.value.replace(/\D/g, '');
        onChange(allowEmpty && raw === '' ? '' : clamp(raw));
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => { setIsFocused(false); commitDraft(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      disabled={disabled}
      className={twMerge(
        "bg-transparent outline-none text-center text-content-main font-bold tabular-nums text-[18px]",
        valueWidth
      )}
    />
  );

  const suffixNode = suffix ? (
    <span className={twMerge(
      "shrink-0 text-content-subtle uppercase tracking-widest font-bold",
      isLg ? "text-[10px]" : "text-[10px]"
    )}>
      {suffix}
    </span>
  ) : null;

  // Суффикс в инлайне живёт в колонке постоянной ширины: «чел.» и «ч» разной
  // длины иначе сдвигали бы цифру, и у степперов, стоящих друг под другом,
  // числа не попадали бы в одну колонку. По той же причине слот остаётся на
  // месте пустым, когда значение пустое.
  const inlineSuffix = suffix ? (
    <span className="w-9 shrink-0 pl-1 text-left text-[10px] text-content-subtle uppercase tracking-widest font-bold">
      {isEmpty ? '' : suffix}
    </span>
  ) : null;

  if (inline) {
    return (
      <div className={twMerge("flex items-center justify-between gap-3 px-1", className)}>
        {label && (
          <span className="text-[14px] font-semibold text-content-main leading-tight min-w-0">
            {label}
          </span>
        )}
        <div className={twMerge("shrink-0 flex items-center gap-1", isLg ? "h-10" : "h-8")}>
          {decButton}
          {valueField}
          {inlineSuffix}
          {incButton}
        </div>
      </div>
    );
  }

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
        {decButton}
        {valueField}
        {suffixNode}
        {incButton}
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
