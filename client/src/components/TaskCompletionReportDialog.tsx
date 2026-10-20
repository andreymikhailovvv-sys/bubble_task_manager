import { useState } from 'react';
import { CheckCircle2, FileText, Loader2, X } from 'lucide-react';
import { api } from '../lib/api';

export function TaskCompletionReportDialog(props: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onNeverShow?: () => Promise<void>;
  onGenerated?: () => void;
}) {
  const [neverShow, setNeverShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<{ url: string; fileName: string; credits: number } | null>(null);
  const finish = async () => {
    if (neverShow && props.onNeverShow) {
      try { await props.onNeverShow(); }
      catch (error) { setError(error instanceof Error ? error.message : 'Не удалось сохранить настройку'); return; }
    }
    props.onClose();
  };
  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const report = await api.generateTaskCompletionReport(props.taskId);
      props.onGenerated?.();
      const download = await api.createAiGeneratedDocumentDownloadLink(report.document.id);
      setDocument({ url: download.url, fileName: download.fileName, credits: report.creditsSpentMilli });
      if (neverShow && props.onNeverShow) await props.onNeverShow();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось подготовить отчёт');
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) void finish(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="task-report-dialog-title"
        className="surface-popover relative w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-6">
        <button type="button" onClick={() => void finish()} disabled={loading} className="absolute right-4 top-4 rounded-xl p-2 text-muted transition hover:bg-violet-500/10"
          aria-label="Закрыть"><X size={18} /></button>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-500">
          {document ? <CheckCircle2 size={24} /> : <FileText size={24} />}
        </div>
        <h2 id="task-report-dialog-title" className="pr-8 text-lg font-bold text-primary">
          {document ? 'Отчёт готов' : 'Подготовить отчёт выполнения задачи?'}
        </h2>
        <p className="mt-2 break-words text-sm font-semibold text-primary">{props.taskTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ИИ Luna 6 соберёт историю выполнения в Word: этапы и обсуждения, подзадачи с доступными датами, вложения и зафиксированные решения. Отсутствующие исторические данные не будут выдумываться.
        </p>
        {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-500">{error}</p> : null}
        {!document ? (
          <>
            {props.onNeverShow ? <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-primary">
              <input type="checkbox" checked={neverShow} onChange={event => setNeverShow(event.target.checked)} />
              Больше не показывать предложение
            </label> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => void finish()} disabled={loading}
                className="surface-muted flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary">Не сейчас</button>
              <button type="button" onClick={() => void generate()} disabled={loading}
                className="primary-button inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {loading ? 'Готовлю…' : 'Подготовить Word'}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5 space-y-2">
            <a href={document.url} download={document.fileName}
              className="primary-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
              <FileText size={16} /> Скачать {document.fileName}
            </a>
            <p className="text-center text-xs text-muted">Списано {Math.round(document.credits) / 1000} ИИ-кредитов. Word также добавлен в чат задачи.</p>
            <button type="button" onClick={() => props.onClose()} className="surface-muted w-full rounded-xl px-4 py-2 text-sm text-primary">Закрыть</button>
          </div>
        )}
      </section>
    </div>
  );
}
