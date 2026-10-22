import { useState } from 'react';
import { CheckCircle2, FileText, Loader2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { GeneratedDocument } from '../lib/types';

export function TaskCompletionReportDialog(props: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onNeverShow?: () => Promise<void>;
  onGenerated?: () => void;
  /** Mini App uses Telegram.WebApp.downloadFile instead of an HTML download link. */
  onDownload?: (document: GeneratedDocument) => void | Promise<void>;
}) {
  const [neverShow, setNeverShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<{ file: GeneratedDocument; credits: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
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
      // Mint a fresh signed URL only when the user actually requests the file.
      // Telegram downloads must go through its WebApp bridge.
      setDocument({ file: report.document, credits: report.creditsSpentMilli });
      if (neverShow && props.onNeverShow) await props.onNeverShow();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось подготовить отчёт');
    } finally { setLoading(false); }
  };
  const downloadReport = async () => {
    if (!document || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      if (props.onDownload) {
        await props.onDownload(document.file);
      } else {
        // Refresh the short-lived signed URL if the dialog was left open.
        const { url } = await api.createAiGeneratedDocumentDownloadLink(document.file.id);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = document.file.fileName;
        link.rel = 'noopener';
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось скачать отчёт');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) void finish(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="task-report-dialog-title"
        className="surface-popover relative w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-6">
        <div className="mb-3 flex items-center gap-3 pr-10">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-500" aria-hidden="true">
            {document ? <CheckCircle2 size={23} /> : <FileText size={23} />}
          </span>
          <h2 id="task-report-dialog-title" className="min-w-0 text-base font-bold leading-snug text-primary sm:text-lg">
            {document ? 'Отчёт готов' : 'Подготовить отчёт выполнения задачи?'}
          </h2>
        </div>
        <button type="button" onClick={() => void finish()} disabled={loading} className="absolute right-4 top-4 rounded-xl p-2 text-muted transition hover:bg-violet-500/10"
          aria-label="Закрыть"><X size={18} /></button>
        <p className="mt-2 break-words text-sm font-semibold text-primary">{props.taskTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ИИ соберёт историю выполнения в Word: этапы и обсуждения, подзадачи с доступными датами, вложения и зафиксированные решения. Отсутствующие исторические данные не будут выдумываться.
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
                className="surface-muted flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary">Нет, спасибо</button>
              <button type="button" onClick={() => void generate()} disabled={loading}
                className="primary-button inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {loading ? 'Готовлю…' : 'Подготовить Word'}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5 space-y-2">
            <button type="button" disabled={downloading} onClick={() => void downloadReport()}
              className="primary-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              aria-label={`Скачать ${document.file.fileName}`}>
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              <span className="min-w-0 truncate">{downloading ? 'Скачиваем…' : `Скачать ${document.file.fileName}`}</span>
            </button>
            <p className="text-center text-xs text-muted">Списано {Math.round(document.credits) / 1000} ИИ-кредитов. Word также добавлен в чат задачи.</p>
            <button type="button" onClick={() => props.onClose()} className="surface-muted w-full rounded-xl px-4 py-2 text-sm text-primary">Закрыть</button>
          </div>
        )}
      </section>
    </div>
  );
}
