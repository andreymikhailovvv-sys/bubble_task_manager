/**
 * The chat accepts GIF attachments, but the Images edit API accepts only
 * PNG/JPEG/WebP source pixels. For AI chat ONLY, send the first GIF frame as PNG.
 * Regular task file uploads still preserve the original GIF and filename.
 */
export async function prepareAiChatImageFile(file: File): Promise<File> {
  if (file.type.toLowerCase() !== 'image/gif' && !/\.gif$/i.test(file.name)) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не удалось прочитать GIF. Сохраните его как PNG или JPEG.'));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 16_000_000) {
      throw new Error('Слишком большое GIF-изображение. Сохраните уменьшенную версию в PNG.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить GIF для редактирования.');
    context.drawImage(image, 0, 0);
    const converted = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Не удалось преобразовать GIF. Сохраните его как PNG.'));
      }, 'image/png');
    });
    if (converted.size > 8 * 1024 * 1024) {
      throw new Error('После преобразования GIF превышает 8 МБ. Уменьшите изображение.');
    }
    return new File([converted], file.name.replace(/\.gif$/i, '') + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
