import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateCompanyCreditAmount, CompanyInsufficientCreditsError } from '../src/services/work-ai-wallet.service.js';
import { workDeadlineEventKey } from '../src/services/work-ai-monitoring.service.js';
import { readWorkAiAnswer } from '../src/services/work-ai-assistant.service.js';
const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('company credits accept only safe integer positive amounts and never share personal wallet',()=>{
  assert.equal(validateCompanyCreditAmount(10),10000);
  assert.equal(validateCompanyCreditAmount(100000),100000000);
  for(const input of [-10,0,0.5,100001,Number.MAX_SAFE_INTEGER,'10',null,NaN])
    assert.equal(validateCompanyCreditAmount(input),null);
  assert.match(new CompanyInsufficientCreditsError().message,/организации/);
});

test('AI reader consumes official Responses output text and does not invent usage',()=>{
  const answer=readWorkAiAnswer({output:[{type:'message',content:[
    {type:'output_text',text:'Первый шаг'},{type:'output_text',text:'Второй шаг'}]}]});
  assert.equal(answer,'Первый шаг\nВторой шаг');
  assert.equal(readWorkAiAnswer({}), '');
});

test('work AI wallet uses atomic conditional reservation and usage-based finalization',async()=>{
  const [wallet,ai,monitor,router,admin]=await Promise.all([
    read('../src/services/work-ai-wallet.service.ts'),
    read('../src/services/work-ai-assistant.service.ts'),
    read('../src/services/work-ai-monitoring.service.ts'),
    read('../src/routes/business-ai.ts'),
    read('../src/routes/api.ts')
  ]);
  assert.match(wallet,/aiCreditsMilli:\{gte:amountMilli\}/);
  assert.match(wallet,/aiCreditsMilli:\{decrement:amountMilli\}/);
  assert.match(wallet,/calculateMaximumRequestCreditsMilli/);
  assert.match(wallet,/calculateOpenAiUsageCost/);
  assert.match(wallet,/state:'UNKNOWN_USAGE'/);
  assert.match(wallet,/state:reason==='failed'\?'REFUNDED':'SETTLED'/);
  assert.match(wallet,/organizationAiCreditLedger\.create/);
  assert.doesNotMatch(wallet,/reserveAiCreditsMilli\(/);
  assert.match(ai,/estimatedInputUpperBound/);
  assert.match(ai,/reserveCompanyCredits\(/);
  assert.match(ai,/settleCompanyCredits\(/);
  assert.doesNotMatch(ai,/reserveAiCreditsMilli\(/);
  assert.match(ai,/project:\{organizationId\}/);
  assert.match(router,/await check\(req,res\)/);
  assert.match(router,/await scopedTask\(req,res,member\)/);
  assert.match(router,/if\(!manager\(member\.role\)\)/);
  assert.match(monitor,/state:'PENDING'/);
  assert.match(monitor,/state:'PROCESSING'/);
  assert.match(admin,/requireAdminPassword\(req,res\)/);
  assert.match(admin,/validateCompanyCreditAmount/);
});
test('scheduler revision invalidates stale jobs and personal task code stays unchanged',async()=>{
  const [schema,migration,worker,route]=await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261031200000_work_ai_wallet_monitoring/migration.sql'),
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../src/routes/business-projects.ts')
  ]);
  assert.equal(workDeadlineEventKey('task1',4),'work:deadline:task1:4');
  assert.notEqual(workDeadlineEventKey('task1',4),workDeadlineEventKey('task1',5));
  assert.match(schema,/model OrganizationAiReservation \{/);
  assert.match(schema,/model OrganizationAiCreditLedger \{/);
  assert.match(schema,/model OrganizationAiMonitoringJob \{/);
  assert.doesNotMatch(migration,/ALTER TABLE "Task"/);
  assert.doesNotMatch(migration,/ALTER TABLE "User"/);
  assert.match(worker,/pollCorporateMonitoring/);
  assert.match(worker,/recoverCorporateMonitoring/);
  assert.match(route,/rescheduleWorkMonitoringAfterTaskChange/);
});
test('UI separates admin organizations from users and Work AI from personal chats',async()=>{
  const [admin,work,company,task]=await Promise.all([
    read('../../client/src/AdminPage.tsx'),
    read('../../client/src/WorkAiPanel.tsx'),
    read('../../client/src/WorkCompanyView.tsx'),
    read('../../client/src/WorkProjectsView.tsx')
  ]);
  assert.match(admin,/Организации/);
  assert.match(admin,/adminGrantWorkCredits/);
  assert.match(work,/Баланс организации/);
  assert.match(work,/workMonitoringSet/);
  assert.match(company,/WorkAiPanel/);
  assert.match(task,/WorkAiPanel/);
});
