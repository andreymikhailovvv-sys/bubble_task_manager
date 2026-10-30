/** Consistent task automation indicator for timeline, list, hover and focus. */
export function TaskMonitoringBadge({ className = '', title = 'Дедлайн управляется автомониторингом' }: {
  className?: string;
  title?: string;
}) {
  return <span title={title} aria-label="Автомониторинг включён"
    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-extrabold leading-none text-white shadow-sm ${className}`}>A</span>;
}
