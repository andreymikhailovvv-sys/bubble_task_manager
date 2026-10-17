import { useEffect, useState } from 'react';
import { FileImage, FileSpreadsheet, FileText, FileType2, File, X } from 'lucide-react';

export type AiAttachmentKind = 'image' | 'word' | 'excel' | 'pdf' | 'file';

export function getAiAttachmentKind(name: string, mime = ''): AiAttachmentKind {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'].includes(ext ?? '') ||
      (!ext && mime.startsWith('image/'))) return 'image';
  if (['doc', 'docx'].includes(ext ?? '') || mime.includes('wordprocessingml')) return 'word';
  if (['xls', 'xlsx', 'xlsm'].includes(ext ?? '') || mime.includes('spreadsheetml')) return 'excel';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  return 'file';
}

type TileProps = {
  file: File;
  busy?: boolean;
  uploadProgress?: number | null;
  onRemove?: (file: File) => void;
};

/**
 * Preview URLs exist only while the tile is mounted, and are always revoked.
 * FileReader progress describes LOCAL file preparation. During upload the ring
 * describes the whole HTTP request, not a fabricated individual-file percentage.
 */
function AiAttachmentTile({ file, busy = false, uploadProgress, onRemove }: TileProps) {
  const kind = getAiAttachmentKind(file.name, file.type);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [reading, setReading] = useState<number | null>(0);

  useEffect(() => {
    if (kind !== 'image') return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => { URL.revokeObjectURL(url); setImageUrl(null); };
  }, [file, kind]);

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (active && event.lengthComputable) setReading(Math.min(100, Math.round(event.loaded * 100 / event.total)));
    };
    reader.onload = () => { if (active) setReading(100); };
    reader.onerror = () => { if (active) setReading(null); };
    reader.readAsArrayBuffer(file);
    return () => { active = false; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [file]);

  const busyPreparing = reading !== null && reading < 100;
  const showingProgress = busy || busyPreparing;
  const percent = busy ? uploadProgress : reading;
  const safePercent = typeof percent === 'number' && Number.isFinite(percent)
    ? Math.max(0, Math.min(100, Math.round(percent))) : null;
  const circumference = 2 * Math.PI * 15;

  return (
    <div className={`ai-attachment-tile ai-attachment-kind-${kind}${showingProgress ? ' is-loading' : ''}`} title={file.name}>
      <div className="ai-attachment-tile-visual">
        {kind === 'image' && imageUrl
          ? <img src={imageUrl} alt="" className="ai-attachment-tile-image" />
          : <span className="ai-attachment-tile-file-icon" aria-hidden="true">
            {kind === 'word' ? <FileText size={27} /> : kind === 'excel' ? <FileSpreadsheet size={27} /> :
              kind === 'pdf' ? <FileType2 size={27} /> : kind === 'image' ? <FileImage size={27} /> : <File size={27} />}
            <span>{kind === 'word' ? 'W' : kind === 'excel' ? 'X' : kind === 'pdf' ? 'PDF' : kind === 'image' ? 'IMG' : 'FILE'}</span>
          </span>}
        {showingProgress ? <div className="ai-attachment-tile-progress" role="progressbar"
          aria-label={busy ? 'Отправка файлов' : 'Подготовка файла'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={safePercent ?? undefined}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="15" className="ai-attachment-ring-track" />
            <circle cx="20" cy="20" r="15" className={safePercent === null ? 'ai-attachment-ring-indeterminate' : 'ai-attachment-ring-value'}
              strokeDasharray={circumference} strokeDashoffset={safePercent === null ? undefined : circumference * (1 - safePercent / 100)} />
          </svg>
          {safePercent !== null ? <span>{safePercent}%</span> : null}
        </div> : null}
        {onRemove && !busy ? <button type="button" className="ai-attachment-tile-remove" aria-label={`Убрать ${file.name}`} onClick={() => onRemove(file)}><X size={13} /></button> : null}
      </div>
      <span className="ai-attachment-tile-name">{file.name}</span>
    </div>
  );
}

export function AiAttachmentTiles({ files, onRemove, busy, uploadProgress }: {
  files: File[];
  onRemove: (file: File) => void;
  busy?: boolean;
  uploadProgress?: number | null;
}) {
  if (!files.length) return null;
  return <div className="ai-attachment-tiles" aria-label="Прикреплённые файлы">
    {files.map((file, i) => <AiAttachmentTile key={`${file.name}:${file.size}:${file.lastModified}:${i}`}
      file={file} busy={busy} uploadProgress={uploadProgress} onRemove={onRemove} />)}
  </div>;
}

/** Legacy chat history contains filenames as text, not image bytes.
 * Display appropriately styled file cards rather than pretending those bytes
 * are available after a reload. Never turn an untrusted filename into a URL.
 */
export function AiMessageAttachments({ names }: { names: string[] }) {
  if (!names.length) return null;
  return <div className="ai-attachment-tiles ai-attachment-tiles-history" aria-label="Вложения сообщения">
    {names.map((name, i) => {
      const kind = getAiAttachmentKind(name);
      return <div key={`${name}:${i}`} className={`ai-attachment-tile ai-attachment-kind-${kind}`} title={name}>
        <div className="ai-attachment-tile-visual">
          <span className="ai-attachment-tile-file-icon" aria-hidden="true">
            {kind === 'image' ? <FileImage size={26} /> : kind === 'word' ? <FileText size={26} /> :
              kind === 'excel' ? <FileSpreadsheet size={26} /> : kind === 'pdf' ? <FileType2 size={26} /> : <File size={26} />}
            <span>{kind === 'image' ? 'IMG' : kind === 'word' ? 'W' : kind === 'excel' ? 'X' : kind === 'pdf' ? 'PDF' : 'FILE'}</span>
          </span>
        </div>
        <span className="ai-attachment-tile-name">{name}</span>
      </div>;
    })}
  </div>;
}

export function splitAiMessageAttachments(content: string): { text: string; names: string[] } {
  const match = content.match(/(?:^|\n\n)📎 Файлы: ([^\n]+)\s*$/u);
  if (!match || !match[1]) return { text: content, names: [] };
  return { text: content.slice(0, match.index).trimEnd(), names: match[1].split(', ').map((name) => name.trim()).filter(Boolean).slice(0, 3) };
}
