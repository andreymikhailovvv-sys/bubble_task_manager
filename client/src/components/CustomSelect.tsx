import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string; label: string };
type MenuPosition = { top: number; left: number; width: number };

type Props = {
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  detachedPopup?: boolean;
};

export function CustomSelect({ value, options, onChange, className = '', buttonClassName = '', menuClassName = '', ariaLabel, disabled = false, detachedPopup = false }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open || !detachedPopup) return;

    const updatePosition = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [detachedPopup, open]);

  const shouldRenderMenu = open && !disabled && (!detachedPopup || menuPosition);

  const menu = shouldRenderMenu ? (
    <div
      ref={menuRef}
      className={`custom-select-menu ${detachedPopup ? 'custom-select-menu-detached fixed' : 'absolute left-0 top-[calc(100%+6px)] w-full'} z-[170] rounded-xl border p-1.5 shadow-2xl backdrop-blur ${menuClassName}`}
      role="listbox"
      style={detachedPopup && menuPosition ? { top: menuPosition.top, left: menuPosition.left, width: menuPosition.width } : undefined}
    >
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
  ) : null;

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
      {detachedPopup && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
