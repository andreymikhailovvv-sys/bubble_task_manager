import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Option = { value: string; label: string };

type Props = {
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export function CustomSelect({ value, options, onChange, className = '', buttonClassName = '', menuClassName = '', ariaLabel, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className={`custom-select relative ${className}`}>
      <button
        type="button"
        className={`custom-select-trigger flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm transition ${buttonClassName}`}
        onClick={() => { if (!disabled) setOpen((prev) => !prev); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={16} className={`custom-select-chevron shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled ? (
        <div className={`custom-select-menu absolute left-0 top-[calc(100%+6px)] z-[170] w-full rounded-xl border p-1.5 shadow-2xl backdrop-blur ${menuClassName}`} role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`custom-select-option block w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${option.value === value ? 'custom-select-option-active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={option.value === value}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
