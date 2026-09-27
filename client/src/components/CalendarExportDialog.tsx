import { CalendarPlus, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { buildGoogleCalendarMobileWebUrl, buildGoogleCalendarWebUrl, buildOutlookCalendarUrl, type CalendarDurationMinutes, type CalendarExportProvider } from '../lib/calendar';
import type { Task } from '../lib/types';
import { CustomSelect } from './CustomSelect';
import { DateTimePickerWithApply } from './DateTimePickerWithApply';

export type CalendarExportItem = Pick<Task, 'id' | 'title' | 'description' | 'location' | 'dueDate'>;

type Props = {
  item: CalendarExportItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveBeforeExport: () => Promise<boolean | void>;
  openExternalUrl: (url: string) => void;
  providers?: CalendarExportProvider[];
  timeZone?: string;
  googleUrlMode?: 'web' | 'mobile-web';
  timelineTasks?: Array<{ id: string; title: string; dueDate?: string | null; isSubtask?: boolean; sphereColor?: string | null }>;
  variant?: 'web' | 'miniapp';
};

const providerLabels: Record<CalendarExportProvider, { title: string; subtitle: string }> = {
  google: { title: 'Google Calendar', subtitle: 'Открыть готовое событие' },
  outlook: { title: 'Outlook Web', subtitle: 'Открыть готовое событие' },
  ics: { title: 'Системный / другой календарь', subtitle: 'Универсальный файл .ics' },
};

export function CalendarExportDialog({ item, isOpen, onClose, onSaveBeforeExport, openExternalUrl, providers = ['google', 'outlook', 'ics'], timeZone = 'Europe/Moscow', googleUrlMode = 'web', timelineTasks = [], variant = 'web' }: Props) {
  const [startAt, setStartAt] = useState<string | null>(item.dueDate ?? null);
  const [durationMinutes, setDurationMinutes] = useState<CalendarDurationMinutes>(60);
  const [reminderMinutes, setReminderMinutes] = useState<10 | 30 | 60 | null>(30);
  const [loadingProvider, setLoadingProvider] = useState<CalendarExportProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStartAt(item.dueDate ?? null);
    setDurationMinutes(60);
    setReminderMinutes(30);
    setLoadingProvider(null);
    setError(null);
    setPrepared(false);
  }, [isOpen, item.id]);

  if (!isOpen) return null;

  const exportTo = async (provider: CalendarExportProvider) => {
    if (!startAt || loadingProvider) return;
    setLoadingProvider(provider);
    setError(null);
    setPrepared(false);
    try {
      const saved = await onSaveBeforeExport();
      if (saved === false) throw new Error('Не удалось сохранить актуальные данные. Исправьте ошибку сохранения и попробуйте снова.');
      let url: string;
      if (provider === 'google') {
        const buildGoogleUrl = googleUrlMode === 'mobile-web' ? buildGoogleCalendarMobileWebUrl : buildGoogleCalendarWebUrl;
        url = buildGoogleUrl(item, startAt, durationMinutes, timeZone || 'Europe/Moscow');
      }
      else if (provider === 'outlook') url = buildOutlookCalendarUrl(item, startAt, durationMinutes);
      else url = (await api.createTaskCalendarIcsLink(item.id, { startAt: new Date(startAt).toISOString(), durationMinutes, reminderMinutes })).url;
      openExternalUrl(url);
      setPrepared(true);
    } catch (caught) {
      setError(caught instanceof Error && caught.message.trim() ? caught.message : 'Не удалось подготовить событие календаря.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const mini = variant === 'miniapp';
  return (
    <div className={`${mini ? 'miniapp-calendar-export-backdrop' : 'modal-backdrop'} fixed inset-0 z-[220] flex items-end bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4`} onClick={() => { if (!loadingProvider) onClose(); }}>
      <div className={`${mini ? 'miniapp-focus-panel miniapp-calendar-export-panel' : 'focused-task-editor-shell bg-white'} w-full rounded-t-[2rem] border p-5 shadow-2xl sm:max-w-md sm:rounded-[2rem]`} role="dialog" aria-modal="true" aria-labelledby={`calendar-export-title-${item.id}`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`calendar-export-title-${item.id}`} className="text-lg font-bold">Добавить в календарь</h2>
          <button type="button" className={mini ? 'miniapp-focus-icon-button' : 'focused-task-ai-icon-button'} disabled={Boolean(loadingProvider)} onClick={onClose} aria-label="Закрыть окно добавления в календарь"><X size={16} /></button>
        </div>
        <p className="mt-2 break-words text-sm font-semibold text-violet-600">{item.title.trim() || 'Без названия'}</p>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-slate-500"><span className="mb-1.5 block">Дата и время</span><DateTimePickerWithApply value={startAt} onChange={setStartAt} title="Выбрать дату и время события" timelineTasks={timelineTasks} detachedPopup buttonClassName={mini ? 'miniapp-calendar-export-field' : 'form-field w-full rounded-xl'} /></label>
          <label className="block text-xs font-semibold text-slate-500"><span className="mb-1.5 block">Продолжительность</span><CustomSelect value={String(durationMinutes)} onChange={(value) => setDurationMinutes(Number(value) as CalendarDurationMinutes)} ariaLabel="Продолжительность события" buttonClassName={mini ? 'miniapp-calendar-export-field' : 'form-field w-full rounded-xl'} options={[{ value: '30', label: '30 минут' }, { value: '60', label: '1 час' }, { value: '90', label: '1 час 30 минут' }, { value: '120', label: '2 часа' }]} /></label>
          <label className="block text-xs font-semibold text-slate-500"><span className="mb-1.5 block">Напоминание</span><CustomSelect value={reminderMinutes === null ? 'none' : String(reminderMinutes)} onChange={(value) => setReminderMinutes(value === 'none' ? null : Number(value) as 10 | 30 | 60)} ariaLabel="Напоминание календаря" buttonClassName={mini ? 'miniapp-calendar-export-field' : 'form-field w-full rounded-xl'} options={[{ value: 'none', label: 'Без напоминания' }, { value: '10', label: 'За 10 минут' }, { value: '30', label: 'За 30 минут' }, { value: '60', label: 'За 1 час' }]} /></label>
        </div>
        <div className="mt-5 grid gap-2">
          {providers.map((provider) => <button key={provider} type="button" className={`${mini ? 'miniapp-focus-success-button' : 'secondary-button'} flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left disabled:opacity-60`} disabled={!startAt || Boolean(loadingProvider)} onClick={() => void exportTo(provider)}>
            {loadingProvider === provider ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <CalendarPlus size={17} className="shrink-0" />}
            <span><strong className="block text-sm">{providerLabels[provider].title}</strong><span className="block text-xs opacity-70">{providerLabels[provider].subtitle}</span></span>
          </button>)}
        </div>
        <p className="mt-3 text-xs text-slate-500">Для Google и Outlook напоминание будет использовать настройки выбранного календаря. Выбранное напоминание записывается в .ics.</p>
        {error ? <p className="mt-3 text-sm font-medium text-rose-600" role="alert">{error}</p> : null}
        {prepared ? <p className="mt-3 text-sm font-medium text-emerald-600" role="status">Событие подготовлено. Подтвердите добавление в календаре.</p> : null}
      </div>
    </div>
  );
}
