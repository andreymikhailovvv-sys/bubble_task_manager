import assert from 'node:assert/strict';
import test from 'node:test';
import { supportsReasoningEffort } from '../src/lib/openai-model-capabilities.js';

test('явно определяет поддержку reasoning effort для продуктовых моделей', () => {
  for (const model of ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.1-sol', 'gpt-5-mini', 'gpt-5-nano']) {
    assert.equal(supportsReasoningEffort(model), true, model);
  }
  assert.equal(supportsReasoningEffort('gpt-4.1-mini'), false);
  assert.equal(supportsReasoningEffort('gpt-5-unknown'), false, 'префикс поколения не должен автоматически включать capability');
});
