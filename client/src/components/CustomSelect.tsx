import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string; label: string; color?: string };
type MenuPosition = { top: number; left: number; width: number };
type PopupPlacement = 'bottom' | 'top';

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
  popupPlacement?: PopupPlacement;
};

export function CustomSelect({ value, options, onChange, className = '', buttonClassName = '', menuClassName = '', ariaLabel, disabled = false, detachedPopup = false, popupPlacement = 'bottom' }: Props) {
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
        top: popupPlacement === 'top' ? rect.top - 6 : rect.bottom + 6,
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
  }, [detachedPopup, open, popupPlacement]);

  const shouldRenderMenu = open && !disabled && (!detachedPopup || menuPosition);

  const menu = shouldRenderMenu ? (
    <div
      ref={menuRef}
      className={`custom-select-menu ${detachedPopup ? 'custom-select-menu-detached fixed' : 'absolute left-0 top-[calc(100%+6px)] w-full'} z-[170] rounded-xl border p-1.5 shadow-2xl backdrop-blur ${menuClassName}`}
      role="listbox"
      style={detachedPopup && menuPosition ? { top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, transform: popupPlacement === 'top' ? 'translateY(-100%)' : undefined } : undefined}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`custom-select-option block w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${option.value === value ? 'custom-select-option-active' : ''}`}
          onClick={() => {
            setOpen(false);
            onChange(option.value);
          }}
          role="option"
          aria-selected={option.value === value}
        >
          <span className="flex min-w-0 items-center gap-2">
            {option.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} /> : null}
            <span className="truncate">{option.label}</span>
          </span>
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
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} /> : null}
          <span className="truncate">{selected?.label}</span>
        </span>
        <ChevronDown size={16} className={`custom-select-chevron shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {detachedPopup && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
