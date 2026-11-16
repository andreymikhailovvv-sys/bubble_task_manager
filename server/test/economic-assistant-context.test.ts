import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEconomicAttachments, searchEconomicHistoryTerm, selectEconomicHistory } from '../src/services/economic-assistant-context.service.js';

const file = (name: string, mimeType: string, raw: Buffer) => ({
  name,mimeType,size:raw.length,contentBase64:raw.toString('base64')
});
const pdf=Buffer.from('%PDF-1.7\nhello finance world','ascii');
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(100)]);

test('Economic accepts independently validated text, PDF and image attachments', () => {
  const files=prepareEconomicAttachments([
    file('budget.txt','text/plain',Buffer.from('income 1000')),
    file('report.pdf','application/pdf',pdf),
    file('photo.png','image/png',png)
  ]);
  assert.deepEqual(files.names,['budget.txt','report.pdf','photo.png']);
  assert.equal(files.content[0].type,'input_text');
  assert.equal(files.content[1].type,'input_file');
  assert.equal(files.content[2].type,'input_image');
  assert.ok(files.totalBytes>0);
});

test('Economic rejects spoofed files, traversal, and oversized or inconsistent metadata', () => {
  assert.throws(()=>prepareEconomicAttachments([file('../budget.txt','text/plain',Buffer.from('ok'))]));
  assert.throws(()=>prepareEconomicAttachments([{...file('bad.pdf','application/pdf',png)}]),/формат документа/i);
  assert.throws(()=>prepareEconomicAttachments([{...file('one.pdf','application/pdf',pdf),size:999}]),/Размер файла не совпадает/);
  assert.throws(()=>prepareEconomicAttachments(Array(4).fill(file('ok.txt','text/plain',Buffer.from('ok')))),/трёх/);
  assert.throws(()=>prepareEconomicAttachments([file('evil.exe','application/octet-stream',pdf)]),/Неподдерживаемое/);
  assert.throws(()=>prepareEconomicAttachments([file('bad.png','image/png',pdf)]),/изображения/);
});

test('Dynamic history window is bounded, ordered, and does not leak older content', () => {
  const rows=Array.from({length:60},(_,i)=>({
    role:i%2===0?'user':'assistant',
    content:'Message '+i+' '+('x'.repeat(100)),
    createdAt:new Date(2026,0,1,i)
  }));
  const selected=selectEconomicHistory(rows,240,4);
  assert.ok(selected.messages.length>0);
  assert.ok(selected.messages.length<=4);
  assert.ok(selected.estimatedTokens<=240);
  assert.equal(selected.messages.at(-1)?.content,rows.at(-1)?.content);
  assert.ok(!selected.messages.some(m=>m.content===rows[0].content));
  assert.equal(searchEconomicHistoryTerm('  Бюджет 2025  '),'Бюджет 2025');
  assert.equal(searchEconomicHistoryTerm(''),null);
});
