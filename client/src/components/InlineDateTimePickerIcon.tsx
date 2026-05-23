import { DateTimePickerWithApply } from './DateTimePickerWithApply';

type Props = {
  value?: string | null;
  title?: string;
  className?: string;
  detachedPopup?: boolean;
  timelineTasks?: Array<{ id: string; title: string; dueDate?: string | null }>;
  onChange: (value: string | null) => void | Promise<void>;
  onOpenChange?: (isOpen: boolean) => void;
};

export function InlineDateTimePickerIcon({
  value,
  title = 'Изменить срок',
  className = '',
  detachedPopup = false,
  timelineTasks,
  onChange,
  onOpenChange
}: Props) {
  return (
    <DateTimePickerWithApply
      value={value}
      title={title}
      className={className}
      popupAlign="right"
      iconOnly
      detachedPopup={detachedPopup}
      buttonClassName="w-auto min-w-0 bg-transparent p-0 hover:bg-transparent"
      onChange={onChange}
      onOpenChange={onOpenChange}
      timelineTasks={timelineTasks}
    />
  );
}
