import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareStreamingAiInlineMarkup } from '../../client/src/lib/streamingAiMarkdown.js';

test('streaming Markdown formats an unfinished bold span immediately', () => {
  assert.equal(prepareStreamingAiInlineMarkup('**Важный'), '**Важный**');
  assert.equal(prepareStreamingAiInlineMarkup('**Важный текст'), '**Важный текст**');
});

test('complete bold spans remain untouched while new spans stream', () => {
  assert.equal(prepareStreamingAiInlineMarkup('**Готово** и **начало'), '**Готово** и **начало**');
  assert.equal(prepareStreamingAiInlineMarkup('**Готово**'), '**Готово**');
  assert.equal(prepareStreamingAiInlineMarkup('Обычный текст'), 'Обычный текст');
});

test('single asterisk waiting for the next packet is not displayed raw', () => {
  assert.equal(prepareStreamingAiInlineMarkup('*'), '');
  assert.equal(prepareStreamingAiInlineMarkup('Текст *'), 'Текст ');
  assert.equal(prepareStreamingAiInlineMarkup('**Работ*'), '**Работ**');
});
