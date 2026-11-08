import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createPublicSeoPagesMiddleware } from '../src/lib/public-seo-pages.js';

const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
let server: ReturnType<ReturnType<typeof express>['listen']>;
let baseUrl: string;

before(async () => {
  for (const file of ['index.html', 'seo-pages.css', 'task-manager/index.html', 'ai-planner/index.html', 'welcome/index.html', 'welcome/welcome.css', 'welcome/welcome.js', 'android/index.html', 'android/android.css', 'android/android.js', 'android/qr.svg']) {
    assert.ok(existsSync(path.join(clientDist, file)), `Run the client build before this test (missing ${file})`);
  }

  const app = express();
  app.use(cookieParser());
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

test('welcome URL serves a fully rendered lightweight landing page', async () => {
  const response = await fetch(`${baseUrl}/welcome/`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(body, /Хаоса больше нет/);
  assert.match(body, /rel="canonical" href="https:\/\/planirovych\.ru\/"/);
  assert.match(body, /data-enter-app/);
  assert.doesNotMatch(body, /<div id="root">/);
  assert.doesNotMatch(body, /<script[^>]*type="module"/);
  assert.doesNotMatch(body, /telegram\.org\/js/);
});

test('welcome stylesheet and small behavior script are served without SPA fallback', async () => {
  for (const [resource, contentType, pattern] of [
    ['/welcome/welcome.css', /text\/css/, /\.hero-layout/],
    ['/welcome/welcome.js', /javascript/, /planirovych_welcome_seen_v1/]
  ] as const) {
    const response = await fetch(baseUrl + resource);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', contentType);
    assert.match(await response.text(), pattern);
  }
});

test('welcome canonical URL and UTM query preserved in 301 redirect', async () => {
  const response = await fetch(baseUrl + '/welcome?utm_source=yandex', { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), '/welcome/?utm_source=yandex');
});

test('existing authenticated or guest session receives a welcome-skip cookie', async () => {
  for (const cookie of ['btm_auth=placeholder-token', 'btm_device=placeholder-device']) {
    const response = await fetch(baseUrl + '/', { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /planirovych_welcome_seen=1/);
    assert.match(response.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
  }
  const fresh = await fetch(baseUrl + '/');
  assert.equal(fresh.headers.get('set-cookie'), null);
});

test('Android download is a standalone static HTML entry at the existing deep link', async () => {
  const response = await fetch(baseUrl + '/android?utm_source=qr');
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.ok((response.headers.get('content-type') ?? '').includes('text/html'));
  assert.ok((response.headers.get('cache-control') ?? '').includes('no-store'));
  for (const fragment of [
    'Планировыч всегда под рукой',
    'href="https://planirovych.ru/android"',
    'src="/android/qr.svg"',
    'src="/android/android.js"',
    'href="/android/android.css"'
  ]) assert.ok(body.includes(fragment), fragment);
  for (const forbidden of [
    '<div id="root">', 'type="module"', 'src="/assets/', 'telegram.org/js'
  ]) assert.ok(!body.includes(forbidden), forbidden);
});

test('Android page redirects trailing slash to stable canonical without losing query parameters', async () => {
  const response = await fetch(baseUrl + '/android/?utm_campaign=scan', { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), '/android?utm_campaign=scan');
});

test('Android standalone assets do not include or trigger the main application', async () => {
  const expectations = [
    ['/android/android.css', 'text/css', '.qr-card'],
    ['/android/android.js', 'javascript', "fetch('/api/android/latest'"],
    ['/android/qr.svg', 'image/svg+xml', 'viewBox="0 0 37 37"']
  ] as const;
  for (const [url, type, fragment] of expectations) {
    const response = await fetch(baseUrl + url);
    const body = await response.text();
    assert.equal(response.status, 200, url);
    assert.ok((response.headers.get('content-type') ?? '').includes(type), url);
    assert.ok(body.includes(fragment), url);
    assert.ok(!body.includes('telegram.org/js'), url);
  }
  const script = await (await fetch(baseUrl + '/android/android.js')).text();
  assert.ok(script.includes("getElementById('download-link')"));
  assert.ok(!script.includes("from 'react'"));
  assert.ok(!script.includes('import('));
});
