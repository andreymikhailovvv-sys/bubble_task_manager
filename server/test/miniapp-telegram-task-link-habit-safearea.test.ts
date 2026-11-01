import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Telegram task deep link opens only once and is removed when the task closes', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const launchEffectStart = source.indexOf('if (handledTaskDeepLinkRef.current || !launchParams.taskId');
  assert.ok(launchEffectStart > 0, 'launch effect must guard already handled links');
  const launchEffect = source.slice(launchEffectStart, source.indexOf('  }, [launchParams, loading, openedTaskId, tasks]);', launchEffectStart));
  assert.ok(launchEffect.indexOf('handledTaskDeepLinkRef.current = true;') < launchEffect.indexOf('openTaskModal(requestedTask);'));

  const closeStart = source.indexOf('const closeTaskModal = () => {');
  const closeBody = source.slice(closeStart, source.indexOf('setOpenedTaskId(null);', closeStart));
  assert.ok(closeBody.includes('window.history.replaceState('), 'task close must consume stale URL parameters');
  for (const key of ['taskId', 'openAi', 'commentTaskId', 'chatRecipientUserId']) {
    assert.ok(closeBody.includes("'"+key+"'"), 'close should remove the ' + key + ' parameter');
  }
});

test('Telegram habit sheets protect their top controls from Android system UI', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.equal((source.match(/miniapp-slide-backdrop miniapp-habit-backdrop fixed/g) ?? []).length, 2);
  const stylesStart = css.indexOf('.miniapp-shell:not(.miniapp-web-runtime) .miniapp-slide-backdrop.miniapp-habit-backdrop {');
  assert.ok(stylesStart >= 0);
  const safeAreaStyles = css.slice(stylesStart, css.indexOf('\n}', stylesStart));
  assert.ok(safeAreaStyles.includes('--miniapp-top-inset'));
  assert.ok(safeAreaStyles.includes('env(safe-area-inset-top'));
  assert.ok(safeAreaStyles.includes('max-height: 100%'));
});
