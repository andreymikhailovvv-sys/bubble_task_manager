/**
 * Generate small, search-friendly favicon variants from the existing brand PNG.
 * This runs AFTER Vite has populated dist. No source image or app icon is changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const root = fileURLToPath(new URL('../', import.meta.url));
const original = PNG.sync.read(fs.readFileSync(path.join(root, 'public', 'favicon.png')));
const out = path.join(root, 'dist');

if (!fs.existsSync(out)) throw new Error('Client dist directory missing; run Vite build first.');
if (original.width < 16 || original.height < 16 || original.width > 8192 || original.height > 8192) {
  throw new Error('Unexpected original favicon dimensions');
}

function drawableBounds(image) {
  let minX = image.width, minY = image.height, maxX = -1, maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] < 24) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('Original favicon is fully transparent');

  // Only remove substantial, fully transparent padding. Never crop artwork.
  const emptyLeft = minX / image.width;
  const emptyRight = (image.width - maxX - 1) / image.width;
  const emptyTop = minY / image.height;
  const emptyBottom = (image.height - maxY - 1) / image.height;
  if (Math.min(emptyLeft, emptyRight, emptyTop, emptyBottom) < 0.12) {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }
  const margin = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.065);
  const x = Math.max(0, minX - margin);
  const y = Math.max(0, minY - margin);
  return {
    x, y,
    width: Math.min(image.width - x, maxX + margin + 1 - x),
    height: Math.min(image.height - y, maxY + margin + 1 - y)
  };
}

const crop = drawableBounds(original);

function resize(size) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  png.data.fill(0);
  const ratio = Math.min(size / crop.width, size / crop.height);
  const targetWidth = crop.width * ratio;
  const targetHeight = crop.height * ratio;
  const left = (size - targetWidth) / 2;
  const top = (size - targetHeight) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dest = (y * size + x) * 4;
      if (x + 0.5 < left || x + 0.5 >= left + targetWidth
        || y + 0.5 < top || y + 0.5 >= top + targetHeight) continue;
      const sx = crop.x + (x + 0.5 - left) / ratio - 0.5;
      const sy = crop.y + (y + 0.5 - top) / ratio - 0.5;
      const x0 = Math.max(0, Math.min(original.width - 1, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(original.height - 1, Math.floor(sy)));
      const x1 = Math.min(original.width - 1, x0 + 1);
      const y1 = Math.min(original.height - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));

      // Interpolate premultiplied alpha to avoid halos around translucent edges.
      let a = 0, r = 0, g = 0, b = 0;
      const samples = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy]
      ];
      for (const [px, py, weight] of samples) {
        const src = (py * original.width + px) * 4;
        const alpha = original.data[src + 3] / 255;
        const weighted = alpha * weight;
        a += weighted;
        r += original.data[src] * weighted;
        g += original.data[src + 1] * weighted;
        b += original.data[src + 2] * weighted;
      }
      png.data[dest] = a ? Math.round(r / a) : 0;
      png.data[dest + 1] = a ? Math.round(g / a) : 0;
      png.data[dest + 2] = a ? Math.round(b / a) : 0;
      png.data[dest + 3] = Math.round(a * 255);
    }
  }
  return PNG.sync.write(png);
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size;
    header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

const small16 = resize(16);
const small32 = resize(32);
const standard120 = resize(120);
const touch180 = resize(180);
const outputs = new Map([
  ['favicon.png', standard120], // Conventional URL: now a true 120x120 PNG.
  ['favicon-120.png', standard120], // New URL also avoids stale browser/CDN caches.
  ['favicon-32.png', small32],
  ['favicon.ico', ico([{ size: 16, data: small16 }, { size: 32, data: small32 }])],
  ['apple-touch-icon.png', touch180]
]);
for (const [name, data] of outputs) {
  fs.writeFileSync(path.join(out, name), data);
  console.log('[Favicon]', name, data.length, 'bytes');
}
console.log('[Favicon] source', original.width + 'x' + original.height,
  'crop', crop.width + 'x' + crop.height);
