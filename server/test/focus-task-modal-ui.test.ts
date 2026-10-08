import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Mini App collaborative focus uses compact creator badges without shortening member filters', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /title=\\{subtask\\.creatorName\\}\\>\\{getCreatorInitial\\(subtask\\.creatorName\\)\\}/);
  assert.match(source, /\\{member\\.name\\}/);
});

test('mobile web focus reaches both sides and bottom while preserving the top inset', async () => {
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  const start = css.indexOf('@media (max-width: 639px) {\\n  .miniapp-web-task-backdrop');
  assert.ok(start >= 0);
  const section = css.slice(start, css.indexOf('\\n}', start) + 2);
  assert.match(section, /padding-top: max\\(0\\.5rem, env\\(safe-area-inset-top\\)\\)/);
  for (const side of ['right', 'bottom', 'left']) assert.match(section, new RegExp(`padding-${side}: 0;`));
  assert.match(section, /border-radius: 2rem 2rem 0 0/);
});

test('desktop general AI launcher moves to the right of the task focus when open', async () => {
  const app = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /focusedTask \\? 'ai-chat-launcher-task-open' : ''/);
  assert.match(css, /\\.ai-chat-launcher\\.ai-chat-launcher-task-open \\{\\s*right: max\\(0\\.75rem, env\\(safe-area-inset-right\\)\\)/);
});
