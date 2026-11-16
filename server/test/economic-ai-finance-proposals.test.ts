import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalEconomicAction, parseEconomicToolActions } from '../src/services/economic-ai-action-validation.service.js';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const service=read('../src/services/economic-ai-proposals.service.ts');
const assistant=read('../src/services/economic-assistant.service.ts');
const router=read('../src/routes/economic.ts');
const schema=read('../prisma/schema.prisma');
const migration=read('../prisma/migrations/20261116213000_economic_ai_finance_proposals/migration.sql');

test('only allowlisted finance entities and safe user-intended fields are accepted',()=>{
  const account=canonicalEconomicAction({entity:'account',action:'create',targetId:null,payload:{name:'Накопления',openingBalanceMinor:'12345'}});
  assert.equal(account.payload.openingBalanceMinor,'12345');
  assert.throws(()=>canonicalEconomicAction({entity:'account',action:'create',payload:{name:'x',userId:'victim'}}),/недопустимые/i);
  assert.throws(()=>canonicalEconomicAction({entity:'account',action:'update',targetId:'elsewhere',payload:{isPrimary:true}}),/недопустимые/i);
  assert.throws(()=>canonicalEconomicAction({entity:'operation',action:'create',payload:{kind:'TRANSFER',title:'Перевод',amountMinor:'30000',sourceAccountId:'c123456789',targetAccountId:'c123456789'}}),/разных/);
  assert.throws(()=>canonicalEconomicAction({entity:'debt',action:'create',payload:{direction:'OWE',counterparty:'Коля',amountMinor:'100',paidMinor:'200'}}),/превышать/);
  assert.throws(()=>canonicalEconomicAction({entity:'loan',action:'create',payload:{name:'Кредит',principalMinor:'100000',annualRateBps:150000,termMonths:12,startDate:'2026-11-20'}}),/процент/);
  assert.throws(()=>canonicalEconomicAction({entity:'category',action:'update',targetId:'c123456789',payload:{kind:'EXPENSE'}}),/Тип категории/i);
});

test('up to five actions can be planned; model cannot directly delete records',()=>{
  const action={entity:'category',action:'create',targetId:null,payload:{name:'Командировки',kind:'EXPENSE'}};
  assert.equal(parseEconomicToolActions(JSON.stringify([action])).length,1);
  assert.throws(()=>parseEconomicToolActions(JSON.stringify(Array(6).fill(action))),/1 до 5/);
  assert.throws(()=>canonicalEconomicAction({...action,action:'delete'}),/Неизвестный/);
  assert.equal(canonicalEconomicAction({entity:'loan',action:'update',targetId:'c123456789',
    payload:{monthlyPaymentOverrideMinor:null,paidMinor:'2000'}}).payload.paidMinor,'2000');
});

test('apply and undo are scoped, serialized and compare snapshots before editing',()=>{
  assert.match(service,/where:\{id,userId:owner,status:'PENDING'\}/);
  assert.match(service,/where:\{id,userId:owner,status:'APPLIED'\}/);
  assert.match(service,/TransactionIsolationLevel\.Serializable/);
  assert.match(service,/!same\(before,row\.before\)/);
  assert.match(service,/!same\(current,row\.after\)/);
  assert.match(service,/economicOperation\.count\(\{where:\{userId:owner/);
  assert.match(service,/debtOperationKind\(direction,'FUNDING'\)/);
  assert.match(service,/debtOperationKind\(direction,'SETTLEMENT'\)/);
  assert.match(service,/readEconomicEntity\(tx,owner,action\.entity/);
  assert.match(router,/economicRouter\.post\('\/assistant\/proposals\/:id\/undo'/);
  assert.match(router,/economicRouter\.post\('\/assistant\/proposals\/:id\/approve'/);
  assert.match(router,/economicRouter\.post\('\/assistant\/proposals\/:id\/reject'/);
});

test('finance proposals are durable and auto-apply opt-in is false by default',()=>{
  assert.match(schema,/economicAiAutoApply Boolean @default\(false\)/);
  assert.match(schema,/model EconomicAiProposal \{/);
  assert.match(schema,/messageId\s+String\?/);
  assert.match(migration,/"economicAiAutoApply" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration,/FOREIGN KEY \("userId"\)/);
  assert.match(assistant,/prepareEconomicProposals\(/);
  assert.match(assistant,/saveEconomicProposals\(/);
  assert.match(assistant,/applyEconomicProposal\(/);
  assert.match(router,/economicRouter\.put\('\/assistant\/preferences'/);
});

test('assistant messages have explicit user-before-assistant timestamps',()=>{
  assert.match(assistant,/const assistantAt = new Date\(userAt\.getTime\(\) \+ 1\)/);
  assert.match(assistant,/role: 'user'[\s\S]*?createdAt: userAt/);
  assert.match(assistant,/role: 'assistant'[\s\S]*?createdAt: assistantAt/);
  assert.match(router,/orderBy: \[\{ createdAt: 'desc' \}, \{ role: 'asc' \}, \{ id: 'desc' \}\]/);
});
