import assert from 'node:assert/strict';
import test from 'node:test';
import { readTaskAssistantNdjson, type TaskAiProgressStatus } from './api';

test('NDJSON parser собирает события, разрезанные между сетевыми chunks', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    '{"type":"sta',
    'tus","status":"reading_file"}\n{"type":"res',
    'ult","result":{"answer":"Готово","model":"test","actionReports":[],"billing":{"mode":"dynamic","creditsSpentMilli":18}}}\n'
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  const statuses: TaskAiProgressStatus[] = [];
  const result = await readTaskAssistantNdjson(stream, (status) => statuses.push(status));
  assert.deepEqual(statuses, ['reading_file']);
  assert.equal(result.answer, 'Готово');
  assert.equal(result.billing?.creditsSpentMilli, 18);
});

test('NDJSON parser игнорирует ping и передаёт server error', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('{"type":"ping"}\n{"type":"error","message":"Ошибка workflow"}\n')); controller.close(); } });
  await assert.rejects(() => readTaskAssistantNdjson(stream), /Ошибка workflow/);
});
