import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../src/EconomicApp.tsx'),chip=read('../src/components/EconomicAiProposalCard.tsx');
const css=read('../src/components/EconomicAiProposalCard.css');

test('assistant messages use a separate billing footer below bubble and chips',()=>{
  assert.match(app,/className=\{'econ-chat-message '/);
  assert.match(app,/className="econ-message-credits" aria-label="Стоимость ответа ИИ"/);
  assert.match(app,/formatCreditsSpent\(m\.creditsSpentMilli\)/);
  assert.match(app,/<EconomicAiProposalCard key=\{item\.id\}/);
  const message=app.slice(app.indexOf('snapshot.assistantMessages.map(m =>'));
  assert.ok(message.indexOf('className="econ-message-credits"')>message.indexOf('<EconomicAiProposalCard'));
});

test('finance chips offer confirm, reject, undo and persisted off-by-default preference',()=>{
  assert.match(chip,/act\('approve'\)/);
  assert.match(chip,/act\('reject'\)/);
  assert.match(chip,/act\('undo'\)/);
  assert.match(chip,/\/proposals\/.*encodeURIComponent/);
  assert.match(chip,/type="checkbox" checked=\{autoApply\}/);
  assert.match(app,/\/api\/economic\/assistant\/preferences/);
  assert.match(css,/econ-finance-proposal-actions/);
});

test('chat renders proposal chips after AI reply with no direct model-side writes',()=>{
  assert.match(app,/proposals: reply\.proposals \?\? \[\]/);
  assert.match(app,/onRefresh=\{refresh\}/);
  assert.match(app,/assistantMessages: \[\.\.\.prev\.assistantMessages, optimistic\]/);
  assert.match(app,/node\.scrollTop = node\.scrollHeight/);
});
