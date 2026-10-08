import { Download, FileText } from 'lucide-react';
import type { GeneratedDocument } from '../lib/types';
import { api } from '../lib/api';

export function AiGeneratedDocumentButton({ document }: { document?: GeneratedDocument | null }) {
  if (!document) return null;
  return (
    <a
      href={api.getAiGeneratedDocumentDownloadUrl(document.id)}
      download={document.fileName}
      className="ai-generated-document-button mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition"
      title={`Скачать ${document.fileName}`}
    >
      <span className="ai-generated-document-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <FileText size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate">{document.fileName}</span>
      <Download size={14} className="shrink-0" />
    </a>
  );
}
