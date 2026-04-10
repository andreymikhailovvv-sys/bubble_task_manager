import { DateTimePickerWithApply } from './DateTimePickerWithApply';

type Props = {
  value?: string | null;
  title?: string;
  className?: string;
  onChange: (value: string | null) => void | Promise<void>;
};

export function InlineDateTimePickerIcon({ value, title = 'Изменить срок', className = '', onChange }: Props) {
  return (
    <DateTimePickerWithApply
      value={value}
      title={title}
      className={className}
      popupAlign="right"
      iconOnly
      buttonClassName="w-auto min-w-0 bg-transparent p-0 hover:bg-transparent"
      onChange={onChange}
    />
  );
}
