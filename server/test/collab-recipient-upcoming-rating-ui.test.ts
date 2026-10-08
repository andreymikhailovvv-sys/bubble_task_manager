import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('выбор получателя показывается только при работе с composer и сохраняется отдельно для пользователя', async () => {
  const [web, mini, storage] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/taskAiRecipientStorage.ts', import.meta.url), 'utf8')
  ]);

  assert.match(storage, /TASK_AI_RECIPIENT_STORAGE_PREFIX = 'btm:task-ai-recipient:v1'/);
  assert.match(storage, /getStorageKey = \(userId: string\) =>/);
  assert.match(storage, /localStorage\.getItem\(getStorageKey\(userId\)\)/);
  assert.match(storage, /localStorage\.setItem\(getStorageKey\(userId\), JSON\.stringify\(selection\)\)/);

  for (const source of [web, mini]) {
    assert.match(source, /loadTaskAiRecipientSelection\(userId\)/);
    assert.match(source, /saveTaskAiRecipientSelection\(userId, aiRecipientByTaskId\)/);
    assert.match(source, /selectedRecipientId === 'ai'/);
    assert.match(source, /collaborationMembers\?\.some/);
    assert.match(source, /onFocusCapture=\{\(\) => setIs.*RecipientPickerVisible\(true\)\}/);
    assert.match(source, /onBlurCapture=\{\(event\) =>/);
  }

  assert.match(web, /isAiRecipientPickerVisible \? renderTaskAiRecipientPicker\(focusedTask\) : null/);
  assert.match(mini, /isTaskAiRecipientPickerVisible && openedTask\.isCollaborative/);
});

test('ближайшие подзадачи ограничивают не только карточку, но и внутреннюю область текста', async () => {
  const [web, styles] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(web, /upcoming-subtask-copy/);
  assert.match(web, /upcoming-subtask-description/);
  assert.match(web, /upcoming-subtask-deadline/);
  assert.match(styles, /\.upcoming-subtask-copy \{[\s\S]*height: 5\.5rem;[\s\S]*overflow: hidden;/);
  assert.match(styles, /\.upcoming-subtask-description \{[\s\S]*max-height: 2rem;[\s\S]*-webkit-line-clamp: 2;/);
  assert.match(styles, /\.upcoming-subtask-description > \*,[\s\S]*display: inline;/);
});

test('рейтинг Mini App использует тот же яркий визуальный набор, что и web', async () => {
  const [web, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  for (const className of [
    'efficiency-details-popover-modern',
    'efficiency-score-hero',
    'efficiency-detail-row',
    'efficiency-detail-row-focus'
  ]) {
    assert.ok(web.includes(className), `web должен использовать ${className}`);
    assert.ok(mini.includes(className), `Mini App должен использовать ${className}`);
  }
});
