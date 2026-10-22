import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const rootHtml = await readFile(new URL('../../client/index.html', import.meta.url), 'utf8');
const welcomeHtml = await readFile(new URL('../../client/public/welcome/index.html', import.meta.url), 'utf8');
const welcomeJs = await readFile(new URL('../../client/public/welcome/welcome.js', import.meta.url), 'utf8');

const gateScript = rootHtml.match(/<script>\s*(\/\/ First-time visitors[\s\S]*?)<\/script>/)?.[1] ?? '';
assert.ok(gateScript.includes("location.replace('/welcome/' + location.search)"), 'root must redirect before the heavy SPA is requested');

type GateOptions = {
  pathname?: string;
  search?: string;
  hash?: string;
  cookie?: string;
  stored?: Record<string, string>;
  blockStorage?: boolean;
};

function navigate(options: GateOptions = {}) {
  const redirects: string[] = [];
  const stored = options.stored ?? {};
  const keys = Object.keys(stored);
  const storage = {
    get length() { return keys.length; },
    getItem(key: string) {
      if (options.blockStorage) throw new Error('Storage denied');
      return Object.hasOwn(stored, key) ? stored[key] : null;
    },
    key(index: number) {
      if (options.blockStorage) throw new Error('Storage denied');
      return keys[index] ?? null;
    }
  };
  vm.runInNewContext(gateScript, {
    location: {
      pathname: options.pathname ?? '/',
      search: options.search ?? '',
      hash: options.hash ?? '',
      replace(next: string) { redirects.push(next); }
    },
    document: { cookie: options.cookie ?? '' },
    URLSearchParams,
    localStorage: storage
  }, { timeout: 1000 });
  return redirects;
}

test('first-time homepage visitor sees lightweight welcome immediately', () => {
  assert.deepEqual(navigate(), ['/welcome/']);
  assert.deepEqual(navigate({ search: '?utm_source=yandex&yclid=123' }), ['/welcome/?utm_source=yandex&yclid=123']);
});

test('repeat visits and preexisting planner sessions bypass the welcome', () => {
  assert.deepEqual(navigate({ cookie: 'some=1; planirovych_welcome_seen=1' }), []);
  assert.deepEqual(navigate({ stored: { planirovych_welcome_seen_v1: '1' } }), []);
  assert.deepEqual(navigate({ stored: { planirovych_cookie_consent: 'v1' } }), []);
  assert.deepEqual(navigate({ stored: { 'btm:miniapp-theme-mode': 'dark' } }), []);
  assert.deepEqual(navigate({ stored: { 'btm:any-existing-setting': '1' } }), []);
});

test('deep links, Mini App, login callbacks and explicit enter bypass welcome', () => {
  assert.deepEqual(navigate({ pathname: '/miniapp' }), []);
  assert.deepEqual(navigate({ pathname: '/about' }), []);
  assert.deepEqual(navigate({ hash: '#project=42' }), []);
  assert.deepEqual(navigate({ search: '?enter=1' }), []);
  assert.deepEqual(navigate({ search: '?code=oauth-callback' }), []);
  assert.deepEqual(navigate({ search: '?tgWebAppData=abc' }), []);
  assert.deepEqual(navigate({ blockStorage: true }), []);
});

test('root remains crawlable with the original canonical and SEO title', () => {
  assert.match(rootHtml, /<title>Планировыч AI<\/title>/);
  assert.match(rootHtml, /<link rel="canonical" href="https:\/\/planirovych\.ru\/"/);
  assert.ok(rootHtml.indexOf('// First-time visitors') < rootHtml.indexOf('telegram-web-app.js'));
  assert.ok(rootHtml.indexOf('// First-time visitors') < rootHtml.indexOf('<script type="module"'));
});

test('welcome HTML has meaningful headings, native navigation and functional app entry links', () => {
  assert.match(welcomeHtml, /<h1>/);
  assert.match(welcomeHtml, /<h2>/);
  assert.match(welcomeHtml, /<a[^>]+data-enter-app[^>]+href="\/\?enter=1"/);
  assert.match(welcomeHtml, /href="\/legal\/privacy"/);
  assert.match(welcomeHtml, /href="\/task-manager\/"/);
  assert.match(welcomeHtml, /href="\/ai-planner\/"/);
  assert.match(welcomeHtml, /rel="canonical" href="https:\/\/planirovych\.ru\/"/);
  assert.doesNotMatch(welcomeHtml, /<script[^>]*type="module"/);
  assert.match(welcomeJs, /localStorage\.setItem\('planirovych_welcome_seen_v1', '1'\)/);
  assert.match(welcomeJs, /planirovych_welcome_seen=1/);
});
