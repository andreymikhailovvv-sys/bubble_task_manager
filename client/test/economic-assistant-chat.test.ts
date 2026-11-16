import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEconomicSseFrames, validateEconomicFiles } from '../src/lib/economicAssistantStream.ts';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const source=read('../src/EconomicApp.tsx');
const backend=read('../../server/src/services/economic-assistant.service.ts');
const route=read('../../server/src/routes/economic.ts');

test('SSE parser correctly handles split event frames',()=>{
  const first=parseEconomicSseFrames('event: status\ndata: {"stage":"reading_fin');
  assert.equal(first.frames.length,0);
  const rest=parseEconomicSseFrames(first.remainder+'ances"}\n\nevent: result\ndata: {"answer":"ok","creditsSpentMilli":19}\n\n');
  assert.equal(rest.frames.length,2);
  assert.equal(rest.frames[0].data.stage,'reading_finances');
  assert.equal(rest.frames[1].data.creditsSpentMilli,19);
  assert.equal(parseEconomicSseFrames('event: result\ndata: invalid\n\n').frames.length,0);
});

test('file picker rejects count and unsupported file formats',()=>{
  const file=new File(['x'],'one.txt',{type:'text/plain'});
  assert.equal(validateEconomicFiles([file]),null);
  assert.match(validateEconomicFiles([file,file,file,file])||'',/три/);
  assert.match(validateEconomicFiles([new File(['x'],'evil.exe')])||'',/не поддерживается/);
});

test('sending an optimistic bubble immediately scrolls to the bottom',()=>{
  assert.match(source,/useLayoutEffect\(\(\) => \{[\s\S]*?node\.scrollTop = node\.scrollHeight/);
  assert.match(source,/const optimistic: ChatMessage/);
  assert.match(source,/assistantMessages: \[\.\.\.prev\.assistantMessages, optimistic\]/);
  assert.match(source,/ref=\{assistantScrollRef\}/);
});

test('Economic voice is only Planik transcription without Realtime mode',()=>{
  assert.match(source,/VoiceInputButton'\)\.then/);
  assert.match(source,/<EconomicVoiceInput activationMode="transcription"/);
  assert.match(source,/onTranscript=\{voiceTranscript\}/);
});

test('Economic chat shares real token-billing and history lookup without financial writes',()=>{
  assert.match(backend,/runDynamicResponsesCall/);
  assert.match(backend,/settleDynamicResponsesCall/);
  assert.match(backend,/search_economic_history/);
  assert.match(backend,/selectEconomicHistory/);
  assert.match(backend,/creditsSpentMilli/);
  assert.match(route,/text\/event-stream/);
  assert.doesNotMatch(backend,/economicOperation\.create\(/);
});
