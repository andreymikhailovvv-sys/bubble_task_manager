import { useEffect, useRef, useState } from 'react';
import { Download, ImageOff } from 'lucide-react';
import type { GeneratedDocument } from '../lib/types';
import { api } from '../lib/api';

type Props = {
  document: GeneratedDocument;
  onDownload?: (document: GeneratedDocument) => void | Promise<void>;
};

/**
 * Obtain a fresh 5-minute signed URL per mounted preview. The signed image is
 * served inline only with ?preview=1; regular download remains an attachment.
 * Works in Telegram WebViews without relying on <img> cookie credentials.
 * No image bytes or long-lived tokens go into the conversation history.
 */
export function AiGeneratedImageCard({ document, onDownload }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let requested = false;
    setPreviewUrl(null);
    setPreviewError(false);
    const loadPreview = () => {
      if (requested) return;
      requested = true;
      // Don't mint expiring signed links for older, offscreen images until
      // they're near the viewport. Otherwise lazy images may expire unseen.
      void api.createAiGeneratedDocumentDownloadLink(document.id)
        .then(({ url }) => {
          if (!active) return;
          const signedUrl = new URL(url, window.location.origin);
          signedUrl.searchParams.set('preview', '1');
          setPreviewUrl(signedUrl.toString());
        })
        .catch(() => { if (active) setPreviewError(true); });
    };
    const element = previewRef.current;
    let observer: IntersectionObserver | null = null;
    if (!element || !('IntersectionObserver' in window)) {
      loadPreview();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadPreview();
          observer?.disconnect();
        }
      }, { rootMargin: '350px' });
      observer.observe(element);
    }
    return () => { active = false; observer?.disconnect(); };
  }, [document.id]);

  const downloadLabel = (
    <>
      <Download size={15} aria-hidden="true" />
      <span>Скачать</span>
    </>
  );
  return (
    <figure className="ai-generated-image-card">
      <div ref={previewRef} className="ai-generated-image-preview">
        {previewUrl && !previewError ? (
          <img
            src={previewUrl}
            alt="Изображение, созданное ИИ"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPreviewError(true)}
          />
        ) : previewError ? (
          <div className="ai-generated-image-fallback" role="status">
            <ImageOff size={26} aria-hidden="true" />
            <span>Не удалось загрузить превью</span>
          </div>
        ) : (
          <div className="ai-generated-image-loading" role="status" aria-label="Загружаю превью изображения" />
        )}
      </div>
      <figcaption className="ai-generated-image-footer">
        <span className="ai-generated-image-name" title={document.fileName}>{document.fileName}</span>
        {onDownload ? (
          <button className="ai-generated-image-download" type="button" onClick={() => void onDownload(document)} title={`Скачать ${document.fileName}`}>
            {downloadLabel}
          </button>
        ) : (
          <a className="ai-generated-image-download" href={api.getAiGeneratedDocumentDownloadUrl(document.id)} download={document.fileName} title={`Скачать ${document.fileName}`}>
            {downloadLabel}
          </a>
        )}
      </figcaption>
    </figure>
  );
}
