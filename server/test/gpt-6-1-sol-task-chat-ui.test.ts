import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateOpenAiUsageCost } from '../src/services/ai-usage-metering.service.js';

test('GPT-6.1 Sol использует актуальную цену cached input', () => {
  const cost = calculateOpenAiUsageCost('gpt-6.1-sol', {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 1000 },
    output_tokens: 0,
    total_tokens: 1000
  });
  assert.equal(cost.providerCostNanoUsd, 100_000n);
  assert.equal(cost.estimatedCreditsMilli, 167);
});

test('продуктовые селекторы и сервер используют GPT-6.1 Sol вместо GPT-6 Sol', async () => {
  const files = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/types.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8')
  ]);
  for (const source of files) {
    assert.match(source, /gpt-6\.1-sol/);
    assert.doesNotMatch(source, /gpt-6-sol/);
  }
  assert.match(files[0], /GPT-6\.1 Sol/);
  assert.match(files[1], /GPT-6\.1 Sol/);
});

test('устаревший env override GPT-6 Sol нормализуется на GPT-6.1 Sol', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  assert.match(source, /configuredAiChatFullModel === 'gpt-6-sol'/);
  assert.match(source, /\? 'gpt-6\.1-sol'/);
});

test('существующая подзадача открывается с кареткой без выделения всего названия', async () => {
  const source = await readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('window.requestAnimationFrame(() => {');
  const end = source.indexOf('autosaveSignatureRef.current', start);
  const focusBlock = source.slice(start, end);

  assert.match(focusBlock, /if \(task\?\.parentTaskId\)/);
  assert.match(focusBlock, /setSelectionRange\(caret, caret\)/);
  assert.match(focusBlock, /else \{[\s\S]*titleInput\.select\(\)/);
});

test('task AI chat принимает drop файлов и использует плавающий composer', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(app, /onDrop=\{\(event\) => \{ event\.preventDefault\(\); setIsFocusedAiDragActive\(false\); addFocusedAiFiles/);
  assert.match(app, /focused-task-ai-drop-overlay/);
  assert.match(app, /focused-task-ai-thread-through/);
  assert.match(app, /focused-task-ai-composer-layer/);
  assert.match(app, /focused-task-ai-attach-button/);

  assert.match(styles, /\.focused-task-ai-composer-layer \{/);
  assert.match(styles, /backdrop-filter: blur\(10px\)/);
  assert.match(styles, /\.focused-task-ai-thread-through \{/);
  assert.match(styles, /body\[data-theme='dark'\] \.focused-task-ai-attach-button/);
});
