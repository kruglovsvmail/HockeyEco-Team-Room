// TR-Frontend/src/ui/Toggle.jsx
import React from 'react';

const Toggle = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
        transition-colors duration-200 ease-in-out focus:outline-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${checked ? 'bg-brand' : 'bg-surface-level3'}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 
          transition duration-200 ease-in-out
          ${checked ? 'translate-x-7' : 'translate-x-0'}
        `}
      />
    </button>
  );
};

export default Toggle;