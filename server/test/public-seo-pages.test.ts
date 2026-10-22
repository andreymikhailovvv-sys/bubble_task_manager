import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import express from 'express';
import { createPublicSeoPagesMiddleware } from '../src/lib/public-seo-pages.js';

const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
let server: ReturnType<ReturnType<typeof express>['listen']>;
let baseUrl: string;

before(async () => {
  for (const file of ['index.html', 'seo-pages.css', 'task-manager/index.html', 'ai-planner/index.html']) {
    assert.ok(existsSync(path.join(clientDist, file)), `Run the client build before this test (missing ${file})`);
  }

  const app = express();
  app.use(createPublicSeoPagesMiddleware(clientDist));
  app.use(express.static(clientDist, { index: false }));
  app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('public task-manager URL serves complete static HTML rather than SPA', async () => {
  const response = await fetch(`${baseUrl}/task-manager/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(body, /<h1>Таск-менеджер/);
  assert.match(body, /rel="canonical" href="https:\/\/planirovych\.ru\/task-manager\/"/);
  assert.doesNotMatch(body, /<div id="root">/);
  assert.doesNotMatch(body, /<script[^>]*type="module"/);
});

test('public ai-planner URL serves complete static HTML rather than SPA', async () => {
  const response = await fetch(`${baseUrl}/ai-planner/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /<h1>Планировщик задач с ИИ/);
  assert.match(body, /rel="canonical" href="https:\/\/planirovych\.ru\/ai-planner\/"/);
  assert.doesNotMatch(body, /<div id="root">/);
});

test('SEO styles resolve as a tiny independent stylesheet', async () => {
  const response = await fetch(`${baseUrl}/seo-pages.css`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/css/);
  assert.match(await response.text(), /\.hero/);
});

test('non-canonical SEO paths redirect and preserve query string', async () => {
  const response = await fetch(`${baseUrl}/task-manager?utm_source=yandex`, { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), '/task-manager/?utm_source=yandex');
});

test('regular workspace and other SPA paths keep the existing fallback', async () => {
  for (const url of ['/', '/workspace-non-seo-route']) {
    const response = await fetch(`${baseUrl}${url}`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /<div id="root"><\/div>/);
  }
});
