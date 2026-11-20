import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalEconomicAction, EconomicActionError } from '../src/services/economic-ai-action-validation.service.js';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

test('account current balance is allowed for finance AI without mixing old baseline',()=>{
  assert.deepEqual(canonicalEconomicAction({entity:'account',action:'update',
    targetId:'existing_account_123',payload:{balanceMinor:'-75000'}}).payload,
    {balanceMinor:'-75000'});
  assert.throws(()=>canonicalEconomicAction({entity:'account',action:'update',
    targetId:'existing_account_123',
    payload:{balanceMinor:'10000',openingBalanceMinor:'10000'}}),EconomicActionError);
});

test('financial account balance edits never overwrite existing operations',()=>{
  const routes=read('../src/routes/economic.ts');
  const helper=read('../src/services/economic-account-balance.service.ts');
  const ui=read('../../client/src/EconomicApp.tsx');
  assert.match(routes,/recordEconomicBalanceAdjustment\(tx, owner, found\.id/);
  assert.match(routes,/TransactionIsolationLevel\.Serializable/);
  assert.match(helper,/economicSourceDelta\(row\.kind/);
  assert.match(helper,/kind: 'TRANSFER', targetAccountId: accountId/);
  assert.match(ui,/payload = \{ name: form\.name, balanceMinor: parseMoney\(form\.balance, true\)/);
  assert.match(ui,/Баланс, ₽/);
  assert.doesNotMatch(ui,/Начальный остаток, ₽/);
});

test('shared Planner assistant can read, search and propose owner-scoped finances',()=>{
  const chatTools=read('../src/services/ai-chat-tools.service.ts');
  const chatPrompt=read('../src/services/ai-assistant.service.ts');
  const readOnly=read('../src/services/planner-economic-overview.service.ts');
  const economic=read('../../client/src/EconomicApp.tsx');
  for(const tool of ['read_economic_overview','find_economic_records','propose_economic_changes'])
    assert.match(chatTools,new RegExp(tool));
  assert.match(chatTools,/observedFinancialVersions/);
  assert.match(chatTools,/prepareEconomicProposals\(input\.userId,actions\)/);
  assert.match(chatTools,/saveEconomicProposals\(tx,input\.userId,message\.id,preparedFinancialActions\)/);
  assert.match(chatTools,/applyEconomicProposal\(input\.userId,proposal\.id,true\)/);
  assert.match(chatPrompt,/Ты также управляешь финансами пользователя из модуля Экономыч/);
  assert.match(readOnly,/where:\{userId:owner\}/);
  // The overview is data-only: approvals remain inline in their original chats.
  assert.doesNotMatch(economic,/Подтверждение финансовых изменений/);
  assert.doesNotMatch(economic,/econ-planner-proposals/);
  assert.match(economic,/EconomicAiProposalCard key=\{item\.id\}/);
});

test('light page fills the WebView and balance cards have no orange stripe',()=>{
  const economic=read('../../client/src/EconomicApp.tsx');
  const css=read('../../client/src/EconomicApp.css');
  assert.match(css,/html:has\(\.econ-root\.econ-light\)/);
  assert.match(css,/\.econ-root\.econ-mobile-workspace\{min-height:100dvh\}/);
  assert.match(css,/@keyframes econ-dialog-in/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(economic,/<article className="econ-stat featured"><div className="econ-stat-label"/);
});
