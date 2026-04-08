import { CalendarDays } from 'lucide-react';
import { useRef } from 'react';

type Props = {
  value?: string | null;
  title?: string;
  className?: string;
  onChange: (value: string | null) => void | Promise<void>;
};

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function InlineDateTimePickerIcon({ value, title = 'Изменить срок', className = '', onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        className="cursor-pointer text-cyan-300 hover:text-cyan-200"
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          openPicker();
        }}
      >
        <CalendarDays size={14} />
      </button>
      <input
        ref={inputRef}
        type="datetime-local"
        defaultValue={toDateTimeLocal(value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          event.stopPropagation();
          void onChange(event.target.value ? new Date(event.target.value).toISOString() : null);
        }}
      />
    </span>
  );
}
