import { useEffect, useState } from 'react';
import type { GeneratedDocument } from '../lib/types';
import { api } from '../lib/api';
import { generatedFileReferenceId } from '../lib/ai-generated-file-references';
import { AiGeneratedDocumentButton } from './AiGeneratedDocumentButton';

type Props = {
  content: string;
  document?: GeneratedDocument | null;
  onDownload?: (document: GeneratedDocument) => void | Promise<void>;
};

/**
 * Structured metadata is authoritative for new replies. Historic messages
 * containing only [[file_ref=...]] may still recover a card without rerunning
 * image generation. The API verifies ownership and collaborative task access.
 */
export function AiResolvedGeneratedDocument({ content, document, onDownload }: Props) {
  const reference = generatedFileReferenceId(content);
  const [lookup, setLookup] = useState<{
    id: string; document?: GeneratedDocument; error?: boolean;
  } | null>(null);

  useEffect(() => {
    if (document || !reference) return;
    let active = true;
    setLookup(null);
    void api.getAiGeneratedDocumentMetadata(reference)
      .then((found) => {
        if (active) setLookup({ id: reference, document: found });
      })
      .catch(() => {
        if (active) setLookup({ id: reference, error: true });
      });
    return () => { active = false; };
  }, [document, reference]);

  const resolved = document ?? (lookup?.id === reference ? lookup.document : null);
  if (resolved) return <AiGeneratedDocumentButton document={resolved} onDownload={onDownload} />;
  if (!reference) return null;
  if (lookup?.id === reference && lookup.error) {
    return <p role="status" className="mt-2 text-xs text-slate-400">
      Файл недоступен. Возможно, изображение было удалено.
    </p>;
  }
  return <p role="status" className="mt-2 text-xs text-slate-400">Загружаю созданное изображение…</p>;
}
