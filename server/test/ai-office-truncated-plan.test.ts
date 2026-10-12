import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  OfficeEditPlanResponseError, parseOfficeEditPlanResponse
} from '../src/services/ai-user-document-edit.service.js';
import { createOpenAiResponsesRequestPayload } from '../src/services/dynamic-responses-billing.service.js';

const validPlan = {
  summary: 'Исправлена опечатка.',
  edits: [{ kind: 'replace_text', target: 'отчет', value: 'отчёт', sheet: '', valueType: 'text' }]
};

test('complete structured Office response can be parsed from output content', () => {
  const response = {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validPlan) }] }],
    usage: { input_tokens: 2842, output_tokens: 150 }
  };
  assert.deepEqual(parseOfficeEditPlanResponse(response), validPlan);
  assert.deepEqual(parseOfficeEditPlanResponse({ output_text: JSON.stringify(validPlan) }), validPlan);
});

test('truncated JSON cannot leak SyntaxError or trigger edits', () => {
  const truncated = '{"summary":"Начал изменения","edits":[{"kind":"replace_text","target":"дата"';
  assert.throws(
    () => parseOfficeEditPlanResponse({ status: 'completed', output_text: truncated, usage: { output_tokens: 4096 } }),
    (error: unknown) => error instanceof OfficeEditPlanResponseError
      && error.reason === 'invalid_json'
      && !error.message.includes(truncated)
  );
  assert.throws(
    () => parseOfficeEditPlanResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: JSON.stringify(validPlan) }),
    (error: unknown) => error instanceof OfficeEditPlanResponseError && error.reason === 'incomplete'
  );
  assert.throws(
    () => parseOfficeEditPlanResponse({ output: [] }),
    (error: unknown) => error instanceof OfficeEditPlanResponseError && error.reason === 'empty'
  );
  assert.throws(
    () => parseOfficeEditPlanResponse({ output_text: '[]' }),
    (error: unknown) => error instanceof OfficeEditPlanResponseError && error.reason === 'invalid_json'
  );
});

test('larger output cap remains opt-in for Office editing and keeps response tool schema unchanged', async () => {
  assert.equal(createOpenAiResponsesRequestPayload({ model: 'gpt-6.1-sol' }, 8192).max_output_tokens, 8192);
  const [billing, edit] = await Promise.all([
    readFile(new URL('../src/services/dynamic-responses-billing.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-user-document-edit.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(billing, /maxOutputTokensCap\?: number/);
  assert.match(billing, /Math\.min\(8192/);
  assert.match(edit, /maxOutputTokensCap: 8192/);
  assert.match(edit, /for \(let attempt = 1; attempt <= 2;/);
  assert.match(edit, /await refundDynamicResponsesCall\(responseCall\)/);
  assert.match(edit, /pendingCalls\.pop\(\)/);
  assert.match(edit, /parseOfficeEditPlanResponse\(responseCall\.responseJson\)/);
  assert.match(edit, /applyOfficeEdits\(sourceBuffer,format,edits\)/);
});

test('original Office document is not mutated by malformed edits', async () => {
  const { buildWordDocumentBuffer } = await import('../src/services/word-document.service.js');
  const { applyOfficeEdits } = await import('../src/services/ooxml-document-editor.js');
  const original = buildWordDocumentBuffer({ fileName: 'source.docx',
    blocks: [{ type: 'paragraph', text: 'Важный документ' }] }).buffer;
  const copy = Buffer.from(original);
  assert.throws(() => parseOfficeEditPlanResponse({ output_text: '{"edits": [' }), OfficeEditPlanResponseError);
  assert.equal(original.equals(copy), true);
  assert.throws(() => applyOfficeEdits(original, 'docx', [{kind:'replace_text',target:'нет такого',value:'ok',sheet:'',valueType:'text'}]));
  assert.equal(original.equals(copy), true);
});
