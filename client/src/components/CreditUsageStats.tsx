import type { CreditUsageStatistics } from '../lib/api';

type CreditUsageStatsProps = {
  statistics: CreditUsageStatistics | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
};

export const formatCreditsMilli = (creditsMilli: number) => {
  const credits = creditsMilli / 1000;
  if (credits === 0) return '0';
  if (Number.isInteger(credits)) return credits.toLocaleString('ru-RU');
  return credits.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export function CreditUsageStats({ statistics, loading = false, error = null, compact = false }: CreditUsageStatsProps) {
  if (loading) return <div className="rounded-xl border border-slate-500/20 p-4 text-sm text-muted">Загружаем статистику…</div>;
  if (error) return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>;
  if (!statistics) return <div className="rounded-xl border border-slate-500/20 p-4 text-sm text-muted">Статистика пока недоступна.</div>;

  const summary = [
    ['Сегодня', statistics.todayCreditsMilli],
    ['7 дней', statistics.weekCreditsMilli],
    ['30 дней', statistics.monthCreditsMilli],
    ['В среднем / день', statistics.averageDailyCreditsMilli]
  ] as const;

  const renderBreakdown = (title: string, items: CreditUsageStatistics['byModel']) => (
    <section className="rounded-xl border border-slate-500/20 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {items.length ? (
        <div className="mt-2 space-y-1.5">
          {items.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-secondary">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-primary">{formatCreditsMilli(item.creditsMilli)}</span>
            </div>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-muted">Пока нет списаний.</p>}
    </section>
  );

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-2 gap-2">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-3">
            <div className="text-[11px] text-muted">{label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-primary">{formatCreditsMilli(value)}</div>
          </div>
        ))}
      </div>
      <div className={compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
        {renderBreakdown('По моделям', statistics.byModel)}
        {renderBreakdown('По ИИ-инструментам', statistics.byFeature)}
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        Учитываются подтверждённые списания, записанные после включения этой статистики.
      </p>
    </div>
  );
}
