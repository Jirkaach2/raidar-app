import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Custom styled toggle switch replacing all native checkboxes.
 * Pill-shaped track with a sliding knob + optional label.
 */
const Toggle = React.memo(function Toggle({ checked, onChange, label, disabled, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 28 : 34;
  const h = size === 'sm' ? 14 : 18;
  const knob = size === 'sm' ? 10 : 14;
  const pad = 1;

  return (
    <label
      className={`rust-toggle ${checked ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
    >
      {/* Hidden native input for accessibility */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { if (!disabled) onChange(e.target.checked); }}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />

      {/* Track */}
      <span
        className="rust-toggle-track"
        style={{
          position: 'relative',
          display: 'inline-block',
          width: w,
          height: h,
          borderRadius: h / 2,
          background: checked
            ? 'linear-gradient(135deg, var(--color-accent), #d4533a)'
            : 'rgba(255,255,255,0.08)',
          border: `1px solid ${checked ? 'rgba(206,66,43,0.6)' : 'rgba(255,255,255,0.12)'}`,
          transition: 'all 0.2s ease',
          flexShrink: 0,
          boxShadow: checked ? '0 0 8px rgba(206,66,43,0.35)' : 'none',
        }}
      >
        {/* Knob */}
        <span
          className="rust-toggle-knob"
          style={{
            position: 'absolute',
            top: 0,
            left: checked ? w - knob - pad - 2 : pad,
            width: knob,
            height: knob,
            borderRadius: '50%',
            background: checked ? '#fff' : 'rgba(255,255,255,0.45)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </span>

      {label && (
        <span style={{
          fontSize: size === 'sm' ? 10 : 11,
          color: checked ? 'var(--color-text)' : 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.3px',
          transition: 'color 0.15s',
        }}>
          {label}
        </span>
      )}
    </label>
  );
});

export default Toggle;
