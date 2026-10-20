import { ChevronDown, Coins } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string; label: string; color?: string; creditsCost?: number };
type MenuPosition = { top: number; left: number; width: number; maxHeight: number; above: boolean };
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
  /** Render menu above settings dialogs while preserving the dialog's theme. */
  popupVariant?: 'settings';
};

export function CustomSelect({ value, options, onChange, className = '', buttonClassName = '', menuClassName = '', ariaLabel, disabled = false, detachedPopup = false, popupPlacement = 'bottom', popupVariant }: Props) {
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
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const below = Math.max(0, viewportHeight - rect.bottom - 12);
      const above = Math.max(0, rect.top - 12);
      const wantedHeight = Math.min(360, options.length * 44 + 12);
      const openAbove = popupPlacement === 'top'
        ? above >= Math.min(wantedHeight, 120) || above > below
        : below < Math.min(wantedHeight, 120) && above > below;
      const available = openAbove ? above : below;
      const width = Math.min(rect.width, Math.max(0, viewportWidth - 16));
      setMenuPosition({
        top: openAbove ? rect.top - 6 : rect.bottom + 6,
        left: Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8)),
        width,
        maxHeight: Math.max(48, Math.min(wantedHeight, available)),
        above: openAbove
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [detachedPopup, open, options.length, popupPlacement]);

  const shouldRenderMenu = open && !disabled && (!detachedPopup || menuPosition);
  const settingsTheme = popupVariant === 'settings'
    ? ref.current?.closest('[data-theme]')?.getAttribute('data-theme') ?? document.body.dataset.theme
    : undefined;

  const menu = shouldRenderMenu ? (
    <div
      ref={menuRef}
      className={`custom-select-menu ${detachedPopup ? 'custom-select-menu-detached fixed' : 'absolute left-0 top-[calc(100%+6px)] w-full'} ${popupVariant === 'settings' ? 'settings-select-menu' : 'z-[170]'} overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-2xl backdrop-blur ${menuClassName}`}
      role="listbox"
      data-theme={settingsTheme}
      data-miniapp-popover={popupVariant === 'settings' ? 'settings' : undefined}
      onTouchMove={popupVariant === 'settings' ? (event) => event.stopPropagation() : undefined}
      style={detachedPopup && menuPosition ? { top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, maxHeight: menuPosition.maxHeight, transform: menuPosition.above ? 'translateY(-100%)' : undefined } : undefined}
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
            {typeof option.creditsCost === 'number' ? <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-rose-400"><span>{option.creditsCost}</span><Coins size={12} /></span> : null}
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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} /> : null}
          <span className="truncate">{selected?.label}</span>
          {typeof selected?.creditsCost === 'number' ? <span className="inline-flex shrink-0 items-center gap-1 text-rose-400"><span>{selected.creditsCost}</span><Coins size={12} /></span> : null}
        </span>
        <ChevronDown size={16} className={`custom-select-chevron shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {detachedPopup && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
