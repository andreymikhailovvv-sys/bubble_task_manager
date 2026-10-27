/**
 * Browsers do not expose screenshots as files in all clipboard representations.
 * Accept only real image blobs, preserving ordinary Ctrl+V of text.
 */
export function clipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const entries = Array.from(data.items ?? []);
  const images: File[] = [];
  for (const item of entries) {
    if (item.kind !== 'file' || !/^image\/(png|jpeg|webp|gif)$/i.test(item.type)) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const extension = item.type === 'image/jpeg' ? 'jpg' : item.type.split('/')[1].toLowerCase();
    const filename = file.name && /\.(png|jpe?g|webp|gif)$/i.test(file.name)
      ? file.name : `clipboard-${Date.now()}-${images.length + 1}.${extension}`;
    images.push(new File([file], filename, { type: file.type || item.type, lastModified: Date.now() }));
  }
  return images;
}
