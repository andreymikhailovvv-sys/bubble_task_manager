import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Mini App and mobile website share one fluid active bottom tab indicator', async () => {
  const [mini, css, entry] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/main.tsx', import.meta.url), 'utf8')
  ]);

  // The two mobile runtimes must use the same component and animation.
  assert.match(entry, /<MiniApp runtime="telegram"/);
  assert.match(entry, /<MiniApp runtime="web"/);
  assert.match(mini, /const activeBottomNavigationTab = isStandaloneNotesOpen \? 'notes' : isAiChatOpen \? 'ai' : displayMode === 'timeline' \? 'timeline' : 'list'/);
  assert.match(mini, /aria-label="Разделы Планировыча" data-active-tab=\{activeBottomNavigationTab\}/);
  assert.match(mini, /<span className="miniapp-bottom-navigation-indicator" aria-hidden="true">\s*<span className="miniapp-bottom-navigation-indicator-pill" \/>\s*<\/span>/);
  assert.equal((mini.match(/<MiniNavigationControl/g) ?? []).length, 4);
  // Existing tab actions and their dedicated state transitions are preserved.
  assert.match(mini, /setDisplayMode\('list'\)/);
  assert.match(mini, /setDisplayMode\('timeline'\)/);
  assert.match(mini, /setIsAiChatOpen\(true\)/);
  assert.match(mini, /setIsStandaloneNotesOpen\(true\)/);

  const indicator = css.match(/\.miniapp-shell \.miniapp-bottom-navigation-indicator \{([^}]+)\}/)?.[1] ?? '';
  assert.match(indicator, /position: absolute;/);
  assert.match(indicator, /pointer-events: none;/);
  assert.match(indicator, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  const glide = css.match(/\.miniapp-shell \.miniapp-bottom-navigation-indicator-pill \{([^}]+)\}/)?.[1] ?? '';
  assert.match(glide, /transition: transform \.46s cubic-bezier/);
  for (const state of ['timeline', 'ai', 'notes']) {
    assert.match(css, new RegExp("data-active-tab='" + state + "'"));
  }
  assert.match(css, /\.miniapp-shell\.miniapp-light \.miniapp-bottom-navigation-indicator-pill::before/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
