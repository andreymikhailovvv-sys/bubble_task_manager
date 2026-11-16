import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

function inlineScriptContaining(marker: string): string {
  const where = html.indexOf(marker);
  assert.ok(where >= 0, 'script marker absent: ' + marker);
  const start = html.lastIndexOf('<script>', where);
  const end = html.indexOf('</script>', where);
  assert.ok(start >= 0 && end > where);
  return html.slice(start + '<script>'.length, end);
}

test('Telegram SDK never blocks the ordinary site, only Telegram-specific routes', () => {
  const sdkScript = inlineScriptContaining('var path = location.pathname;');
  const load = (pathname: string) => {
    const writes: string[] = [];
    const data: Record<string, string> = {};
    runInNewContext(sdkScript, {
      location: { pathname },
      document: {
        documentElement: { dataset: data },
        write(value: string) { writes.push(value); }
      },
      window: { addEventListener() {} }
    });
    return writes;
  };
  for (const url of ['/', '/about', '/economic', '/android-planik', '/legal/privacy']) {
    assert.deepEqual(load(url), [], url + ' must not request Telegram SDK');
  }
  for (const url of ['/miniapp', '/miniapp/', '/miniapp/launch', '/telegram-auth']) {
    assert.equal(load(url).length, 1);
    assert.match(load(url)[0], /telegram\.org\/js\/telegram-web-app\.js/);
  }
});

test('desktop splash produces an actionable error after 15 seconds instead of looping forever', () => {
  const preloadScript = inlineScriptContaining("var bootClass = isWork ?");
  const classes = new Set<string>();
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const caption = { textContent: '' };
  const progress = { style: { display: '' } };
  const core = { retry: null as { textContent: string; className: string } | null, appendChild(button: { textContent: string; className: string }) { this.retry = button; } };
  const splash = { querySelector(selector: string) {
    if (selector === '.boot-retry') return core.retry;
    if (selector === '.boot-caption') return caption;
    if (selector === '.boot-loader') return progress;
    if (selector === '.boot-core') return core;
    return null;
  } };
  runInNewContext(preloadScript, {
    location: { hostname: 'planirovych.ru', pathname: '/' },
    matchMedia: () => ({ matches: true }),
    document: {
      documentElement: { classList: { add: (name: string) => classes.add(name), contains: (name: string) => classes.has(name) } },
      getElementById: (id: string) => id === 'workspace-boot-splash' ? splash : null,
      createElement: () => ({ textContent: '', className: '', type: '', addEventListener() {} })
    },
    window: {
      setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); },
      addEventListener() {}
    }
  });
  assert.ok(classes.has('web-workspace-preload'));
  const timeout = timers.find(t => t.delay === 15000);
  assert.ok(timeout, 'splash must have a bounded recovery');
  timeout.callback();
  assert.match(caption.textContent, /не запустилось/i);
  assert.equal(progress.style.display, 'none');
  assert.equal(core.retry?.textContent, 'Повторить загрузку');
  timeout.callback();
  assert.equal(core.retry?.className, 'boot-retry');
});

test('React render errors unmask personal and Work splash overlays', () => {
  assert.match(bootstrap, /classList\.remove\('web-workspace-preload', 'work-workspace-preload'\)/);
  assert.match(bootstrap, /vite:preloadError/);
});
