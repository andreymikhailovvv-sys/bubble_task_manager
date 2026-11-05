import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const dist = new URL('../../client/dist/', import.meta.url);
const source = new URL('../../client/public/favicon.png', import.meta.url);
const htmlFiles = [
  new URL('../../client/dist/index.html', import.meta.url),
  new URL('../../client/dist/work.html', import.meta.url),
  new URL('../../client/dist/welcome/index.html', import.meta.url),
  new URL('../../client/dist/task-manager/index.html', import.meta.url),
  new URL('../../client/dist/ai-planner/index.html', import.meta.url)
];

function pngSize(buffer: Buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(buffer.subarray(12, 16).toString(), 'IHDR');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test('compiled frontend provides optimized, distinct favicon variants', async () => {
  const original = await readFile(source);
  const expected = [
    ['favicon.png', 120],
    ['favicon-120.png', 120],
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180]
  ] as const;
  for (const [filename, size] of expected) {
    const bytes = await readFile(new URL(filename, dist));
    assert.deepEqual(pngSize(bytes), [size, size]);
    assert.ok(bytes.byteLength < original.byteLength / 2, filename + ' must be smaller than source');
  }
  const main = await readFile(new URL('favicon.png', dist));
  const explicit = await readFile(new URL('favicon-120.png', dist));
  assert.deepEqual(main, explicit, 'conventional and named 120px favicon must match');
});

test('favicon.ico has two PNG icon frames of 16px and 32px', async () => {
  const ico = await readFile(new URL('favicon.ico', dist));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  let lastEnd = 6 + 16 * 2;
  for (const [index, expectedSize] of [16, 32].entries()) {
    const offset = 6 + index * 16;
    assert.equal(ico[offset], expectedSize);
    assert.equal(ico[offset + 1], expectedSize);
    const size = ico.readUInt32LE(offset + 8);
    const imageOffset = ico.readUInt32LE(offset + 12);
    assert.ok(size > 100);
    assert.equal(imageOffset, lastEnd);
    assert.deepEqual(pngSize(ico.subarray(imageOffset, imageOffset + size)), [expectedSize, expectedSize]);
    lastEnd += size;
  }
});

test('public entrypoints only select optimized, consistent favicons', async () => {
  for (const url of htmlFiles) {
    const html = await readFile(url, 'utf8');
    assert.match(html, /rel="icon" type="image\/png" sizes="120x120" href="\/favicon-120\.png"/);
    assert.match(html, /rel="shortcut icon" type="image\/x-icon" href="\/favicon\.ico"/);
    assert.doesNotMatch(html, /rel="icon" type="image\/png" href="\/favicon\.png"/);
  }
});
