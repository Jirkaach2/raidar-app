import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './Select.css';

export type SelectValue = string | number;

export interface SelectOption {
  value: SelectValue;
  label: string;
  /** Optional optgroup heading. Options sharing a group render under one header. */
  group?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: SelectValue;
  onChange: (value: SelectValue) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

interface RenderRow {
  type: 'group' | 'option';
  /** group label (for both header rows and option membership) */
  group?: string;
  option?: SelectOption;
  /** index into the flat list of selectable options (option rows only) */
  optionIndex?: number;
}

/**
 * Controlled, fully custom dropdown matching the app's dark-glass design system.
 * Replaces native <select>. Supports optgroup-style grouping, keyboard navigation
 * (Up/Down/Home/End/Enter/Space/Escape), click-outside-to-close, and an absolutely
 * positioned popover that won't be clipped by parents.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  // Flat list of selectable options (used for keyboard navigation + active tracking).
  const flatOptions = useMemo(() => options, [options]);

  // Build the render rows, inserting group headers when the group label changes.
  const rows = useMemo<RenderRow[]>(() => {
    const out: RenderRow[] = [];
    let lastGroup: string | undefined;
    let optionIndex = 0;
    for (const opt of options) {
      if (opt.group && opt.group !== lastGroup) {
        out.push({ type: 'group', group: opt.group });
        lastGroup = opt.group;
      } else if (!opt.group) {
        lastGroup = undefined;
      }
      out.push({ type: 'option', option: opt, optionIndex });
      optionIndex += 1;
    }
    return out;
  }, [options]);

  const selected = useMemo(
    () => flatOptions.find((o) => o.value === value),
    [flatOptions, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    // Decide whether to drop down or up based on available space.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setOpenUp(below < 240 && rect.top > below);
    }
    const sel = flatOptions.findIndex((o) => o.value === value);
    setActiveIndex(sel >= 0 ? sel : 0);
    setOpen(true);
  }, [disabled, flatOptions, value]);

  const pick = useCallback(
    (opt: SelectOption | undefined) => {
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-opt-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((cur) => {
        const n = flatOptions.length;
        if (n === 0) return cur;
        let next = cur;
        for (let i = 0; i < n; i += 1) {
          next = (next + dir + n) % n;
          if (!flatOptions[next]?.disabled) break;
        }
        return next;
      });
    },
    [flatOptions],
  );

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(flatOptions.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(flatOptions[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      className={`rust-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className ?? ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="rust-select__trigger"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? listboxId : undefined}
      >
        <span className={`rust-select__value ${selected ? '' : 'is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="rust-select__chev" aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={`rust-select__menu ${openUp ? 'opens-up' : ''}`}
        >
          {rows.map((row, i) => {
            if (row.type === 'group') {
              return (
                <li key={`g-${row.group}-${i}`} className="rust-select__group" role="presentation">
                  {row.group}
                </li>
              );
            }
            const opt = row.option!;
            const idx = row.optionIndex!;
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            return (
              <li
                key={`o-${opt.value}-${i}`}
                role="option"
                aria-selected={isSelected}
                data-opt-index={idx}
                className={`rust-select__option ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
                onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                <span className="rust-select__option-label">{opt.label}</span>
                {isSelected && <Check size={13} className="rust-select__check" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Select;
