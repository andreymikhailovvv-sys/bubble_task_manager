/**
 * Validates a current-message image before it is sent to the Images API.
 * Never trust the uploaded extension, MIME type, size, or base64 alone.
 */
export type UploadedImage = { name: string; mimeType: string; size: number; contentBase64: string };
export type ValidatedImage = { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; contentBase64: string };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;

function isImageCandidate(value: UploadedImage): boolean {
  // File extension wins over a mistaken image/* MIME declared by a client.
  // A Word/Excel document must never reach the Images edit API.
  if (/\.(?:docx?|xlsx?|xlsm|pdf)$/i.test(value.name ?? '')) return false;
  return value.mimeType?.toLowerCase().startsWith('image/') || IMAGE_RE.test(value.name ?? '');
}

export function validateUploadedImage(value: UploadedImage): ValidatedImage {
  if (typeof value.contentBase64 !== 'string' ||
      value.contentBase64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.contentBase64)) {
    throw new TypeError('Повреждённое изображение или превышен лимит 8 МБ.');
  }
  const bytes = Buffer.from(value.contentBase64, 'base64');
  if (bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES ||
      value.size !== bytes.length) throw new TypeError('Недопустимый размер изображения (до 8 МБ).');
  let mimeType: ValidatedImage['mimeType'] | null = null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType = 'image/png';
  else if (bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) &&
           bytes.subarray(-2).equals(Buffer.from([255,217]))) mimeType = 'image/jpeg';
  else if (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' &&
           ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii',12,16))) mimeType = 'image/webp';
  if (!mimeType) {
    // Telegram and web chats also accept GIF files. The browser converts GIF
    // first frames to PNG when sending to AI; direct API requests must instead
    // receive a clear, actionable error, not a mysterious generic TypeError.
    if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) {
      throw new TypeError('Этот GIF нельзя напрямую редактировать. Перезагрузите страницу и попробуйте снова: чат преобразует первый кадр GIF в PNG. Либо прикрепите PNG, JPEG или WebP.');
    }
    throw new TypeError('Прикреплённый файл не распознан как PNG, JPEG или WebP. Сохраните картинку в одном из этих форматов и прикрепите заново.');
  }
  const advertised = value.mimeType?.toLowerCase();
  if (advertised && advertised !== 'application/octet-stream' && advertised !== mimeType &&
      !(advertised === 'image/jpg' && mimeType === 'image/jpeg')) {
    throw new TypeError('Формат изображения не соответствует содержимому файла.');
  }
  return { mimeType, contentBase64: bytes.toString('base64') };
}

export function selectUploadedImageForEdit(attachments: UploadedImage[] | undefined, shouldEdit: boolean): ValidatedImage | null {
  if (!shouldEdit || !attachments?.length) return null;
  const images = attachments.filter(isImageCandidate);
  if (!images.length) return null;
  if (images.length > 1) throw new TypeError('Прикреплено несколько изображений. Оставьте одно, которое нужно отредактировать.');
  try {
    return validateUploadedImage(images[0]);
  } catch (error) {
    // Metadata only. Never log image pixels, base64, filenames or private chat text.
    console.warn('[AI image edit] uploaded image rejected', {
      mimeType: images[0].mimeType,
      declaredBytes: images[0].size,
      reason: error instanceof Error ? error.message : 'unknown'
    });
    throw error;
  }
}
