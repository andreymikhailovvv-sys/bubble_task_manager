import { Sparkles } from 'lucide-react';

export function TaskMonitoringActionBadge({ content }: { content: string }) {
  return <span className="inline-flex max-w-full items-start gap-1.5 rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-violet-500">
    <Sparkles size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
    <span className="break-words">{content}</span>
  </span>;
}
