import assert from 'node:assert/strict';
import test from 'node:test';
import { IncrementalJsonAnswer } from '../src/services/ai-stream-text.service.js';

test('streams a JSON-schema answer incrementally without exposing metadata', () => {
  const parser = new IncrementalJsonAnswer();
  const input = '{"answer":"Привет, мир!","actions":[{"type":"delete_task","taskId":"private"}],"document":null}';
  const deltas: string[] = [];
  for (const chunk of [input.slice(0, 13), input.slice(13, 22), input.slice(22, 35), input.slice(35)]) {
    deltas.push(parser.push(chunk));
  }
  assert.equal(deltas.join(''), 'Привет, мир!');
  assert.equal(parser.push(''), '');
});

test('JSON string escapes spanning SSE frames do not leak raw JSON', () => {
  const parser = new IncrementalJsonAnswer();
  const input = JSON.stringify({answer:'Строка "в кавычках"\nВторая строка',actions:[]});
  const deltas: string[] = [];
  for (const char of input) deltas.push(parser.push(char));
  assert.equal(deltas.join(''), 'Строка "в кавычках"\nВторая строка');
});

test('does not render tool arguments or non-answer JSON fields', () => {
  const parser = new IncrementalJsonAnswer();
  assert.equal(parser.push('{"actions":[{"arguments":"secret"}],"document":null}'), '');
});
