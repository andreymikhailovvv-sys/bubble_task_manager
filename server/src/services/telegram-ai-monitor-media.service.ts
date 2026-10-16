import { Api, type TelegramClient } from 'teleproto';

// Monitor only: no public media URL, file persistence or attachment export.
// Preview-size downloads keep recurring scans predictable for wallet preflight.
export const MONITOR_MEDIA_MAX_ITEMS = 4;
export const MONITOR_MEDIA_MAX_BYTES = 3_000_000;
export const MONITOR_MEDIA_MAX_TOTAL_BYTES = 7_000_000;
export const MONITOR_MEDIA_MAX_TEXT_BYTES = 120_000;
export const MONITOR_MEDIA_MAX_TEXT_CHARS = 12_000;
export const MONITOR_MEDIA_DOWNLOAD_TIMEOUT_MS = 20_000;

export type TelegramMonitorMedia = {
  kind: 'image' | 'pdf' | 'text';
  mimeType: string;
  filename: string;
  dataUrl?: string;
  text?: string;
};

export type TelegramMonitorMediaResult = {
  media?: TelegramMonitorMedia;
  mediaNote: string;
  bytesDownloaded: number;
};

const SUPPORTED_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SUPPORTED_TEXT = new Set(['text/plain', 'text/csv', 'application/json']);
const SUPPORTED_MIME = new Set([...SUPPORTED_IMAGES, ...SUPPORTED_TEXT, 'application/pdf']);

export function telegramMonitorFileName(original: string, mimeType: string): string {
  const ext = mimeType === 'application/pdf' ? '.pdf'
    : mimeType === 'image/png' ? '.png'
    : mimeType === 'image/webp' ? '.webp'
    : mimeType === 'image/jpeg' ? '.jpg'
    : mimeType === 'text/csv' ? '.csv'
    : mimeType === 'application/json' ? '.json' : '.txt';
  const safe = original.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 65) || 'telegram_attachment';
  const withoutExt = safe.replace(/\.[^.]+$/, '');
  return (withoutExt || 'telegram_attachment') + ext;
}

export function telegramMonitorFileSignature(mimeType: string, data: Buffer): boolean {
  if (!data.length) return false;
  if (mimeType === 'application/pdf') return data.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') return data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mimeType === 'image/webp') return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  if (SUPPORTED_TEXT.has(mimeType)) return !data.includes(0);
  return false;
}

function photoEstimate(photo: Api.Photo): { thumb: number; bytes: number } | null {
  const options = photo.sizes.map((size, index) => {
    const item = size as { size?: number; sizes?: number[] };
    const bytes = typeof item.size === 'number' ? item.size
      : Array.isArray(item.sizes) ? Math.max(0, ...item.sizes) : 0;
    return { thumb: index, bytes };
  }).filter(item => item.bytes > 0 && item.bytes <= MONITOR_MEDIA_MAX_BYTES);
  if (!options.length) return null;
  options.sort((a, b) => b.bytes - a.bytes);
  return options[0];
}

export function telegramMonitorMediaCategory(message: Api.Message): {
  kind: 'photo' | 'document' | 'unsupported' | 'none';
  mimeType: string;
  filename: string;
  expectedBytes: number;
  photoThumb?: number;
} {
  if (!message.media) return { kind: 'none', mimeType: '', filename: '', expectedBytes: 0 };
  if (message.media instanceof Api.MessageMediaPhoto && message.media.photo instanceof Api.Photo) {
    const choice = photoEstimate(message.media.photo);
    return choice
      ? { kind: 'photo', mimeType: 'image/jpeg', filename: 'telegram_photo.jpg', expectedBytes: choice.bytes, photoThumb: choice.thumb }
      : { kind: 'unsupported', mimeType: '', filename: '', expectedBytes: 0 };
  }
  if (message.media instanceof Api.MessageMediaDocument && message.media.document instanceof Api.Document) {
    const doc = message.media.document;
    const mimeType = (doc.mimeType || '').toLowerCase();
    const size = typeof doc.size === 'number' && Number.isSafeInteger(doc.size) ? doc.size : 0;
    if (!SUPPORTED_MIME.has(mimeType) || !size || size > (SUPPORTED_TEXT.has(mimeType) ? MONITOR_MEDIA_MAX_TEXT_BYTES : MONITOR_MEDIA_MAX_BYTES)) {
      return { kind: 'unsupported', mimeType: '', filename: '', expectedBytes: 0 };
    }
    const attribute = doc.attributes.find(item => item instanceof Api.DocumentAttributeFilename) as Api.DocumentAttributeFilename | undefined;
    const filename = telegramMonitorFileName(attribute?.fileName || '', mimeType);
    return { kind: 'document', mimeType, filename, expectedBytes: size };
  }
  return { kind: 'unsupported', mimeType: '', filename: '', expectedBytes: 0 };
}

export async function downloadTelegramMonitorMedia(
  client: TelegramClient, message: Api.Message, remainingBytes: number
): Promise<TelegramMonitorMediaResult> {
  const category = telegramMonitorMediaCategory(message);
  if (category.kind === 'none') return { mediaNote: '', bytesDownloaded: 0 };
  if (category.kind === 'unsupported') {
    return { mediaNote: 'Вложение неподдерживаемого типа или слишком большого размера; содержимое не прочитано', bytesDownloaded: 0 };
  }
  if (category.expectedBytes > remainingBytes) {
    return { mediaNote: 'Превышен лимит медиа одного цикла; вложение не прочитано', bytesDownloaded: 0 };
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    const response = await Promise.race([
      client.downloadMedia(message, category.kind === 'photo' ? { thumb: category.photoThumb } : {}),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Telegram media download timeout')), MONITOR_MEDIA_DOWNLOAD_TIMEOUT_MS);
        timeout.unref();
      })
    ]);
    if (!Buffer.isBuffer(response) || !response.length || response.length > MONITOR_MEDIA_MAX_BYTES ||
        response.length > remainingBytes || !telegramMonitorFileSignature(category.mimeType, response)) {
      return { mediaNote: 'Вложение не удалось безопасно прочитать', bytesDownloaded: 0 };
    }
    const base = { mimeType: category.mimeType, filename: category.filename };
    if (SUPPORTED_TEXT.has(category.mimeType)) {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(response);
      return {
        media: { ...base, kind: 'text', text: decoded.slice(0, MONITOR_MEDIA_MAX_TEXT_CHARS) },
        mediaNote: decoded.length > MONITOR_MEDIA_MAX_TEXT_CHARS ? 'Текстовый документ частично сокращён' : 'Текстовый документ прочитан',
        bytesDownloaded: response.length
      };
    }
    const kind = category.mimeType === 'application/pdf' ? 'pdf' : 'image';
    return {
      media: { ...base, kind, dataUrl: 'data:' + category.mimeType + ';base64,' + response.toString('base64') },
      mediaNote: kind === 'pdf' ? 'PDF передан для анализа' : 'Изображение передано для анализа',
      bytesDownloaded: response.length
    };
  } catch {
    // A failed or slow download must not disclose media or fail the whole scan.
    return { mediaNote: 'Вложение недоступно для скачивания; содержимое не прочитано', bytesDownloaded: 0 };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
