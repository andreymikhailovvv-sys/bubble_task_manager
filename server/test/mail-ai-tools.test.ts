import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMailRecipients} from '../src/services/mail-smtp.service.js';
import {SEARCH_MAIL_TOOL,PREPARE_MAIL_TOOL} from '../src/services/ai-mail-tools.service.js';
const source=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

test('email recipient parser validates and deduplicates several addresses without header injection',()=>{
  assert.deepEqual(parseMailRecipients('first@example.com; second@example.com, first@example.com'),
    ['first@example.com','second@example.com']);
  for (const bad of ['','foo@example.com\nBcc:other@example.com','invalid address',
    'one@example.com,invalid',Array.from({length:11},(_,i)=>'t'+i+'@example.com').join(',')]){
    assert.equal(parseMailRecipients(bad),null);
  }
});
test('mail tool schema only allows read and prepare; SMTP requires owner click',()=>{
  assert.equal(SEARCH_MAIL_TOOL.name,'search_mailbox');
  assert.equal(PREPARE_MAIL_TOOL.name,'prepare_mail_send');
  const sourceText=source('../src/services/ai-mail-tools.service.ts');
  assert.match(sourceText,/where:\{userId/);
  assert.match(sourceText,/decryptMailPassword\(row\.passwordCipher,userId\)/);
  assert.match(sourceText,/status:'SENDING'/);
  assert.match(sourceText,/status:'PENDING'/);
  assert.match(sourceText,/started\?'UNKNOWN':'FAILED'/);
  assert.match(sourceText,/return \{ok:true,draft/);
  const controller=source('../src/routes/api.ts');
  assert.match(controller,/mail-assistant\/drafts\/:id\/send/);
  assert.match(controller,/mailOrigin/);
});
test('mail reading stays owner-only even in collaborative task chat history',()=>{
  const tools=source('../src/services/ai-chat-tools.service.ts');
  const service=source('../src/services/ai-assistant.service.ts');
  const controller=source('../src/controllers/ai.controller.ts');
  assert.match(tools,/SEARCH_MAIL_TOOL/);
  assert.match(tools,/PREPARE_MAIL_TOOL/);
  assert.match(tools,/mailReadUsed = true/);
  assert.match(service,/createTaskChatOpenAiPayload/);
  assert.match(service,/mailReadUsed = true/);
  assert.match(controller,/result\.mailReadUsed/);
  assert.match(controller,/telegramReadOwnerId/);
  assert.match(service,/telegramReadOwnerId: null/);
});
test('mail monitoring bills exactly the analyzed provider response, summaries/tasks reuse the same JSON',()=>{
  const service=source('../src/services/mail-assistant.service.ts');
  const analysis=service.slice(service.indexOf('async function analyze('),service.indexOf('async function processMessage('));
  const publish=service.slice(service.indexOf('async function publishPending('),service.indexOf('async function scan('));
  assert.match(analysis,/calculateOpenAiUsageCost\(account\.monitorModel, data\.usage\)/);
  assert.match(analysis,/settleAiCreditReservation\(reservation, cost\)/);
  assert.match(analysis,/recordOpenAiUsageShadow/);
  assert.match(analysis,/recordAiCreditCharge/);
  assert.match(analysis,/creditsSpentMilli: settlement\.chargedMilli/);
  assert.doesNotMatch(publish,/openAiFetch|reserveAiCreditsMilli|recordAiCreditCharge/);
  assert.match(publish,/row\.summary/);
  assert.match(publish,/prepareTaskProposal/);
  assert.match(publish,/emailDigest\.create/);
  const stats=source('../src/services/ai-credit-statistics.service.ts');
  assert.match(stats,/billingMode: CHARGE_BILLING_MODE/);
  assert.match(stats,/email_monitor: 'Почтовый ассистент/);
  assert.match(stats,/mail_quick_rewrite: 'Редактирование письма с ИИ'/);
});
test('mail send cards are available in desktop task, general AI, and Mini App chats',()=>{
  const desktop=source('../../client/src/App.tsx');
  const mini=source('../../client/src/MiniApp.tsx');
  const task=source('../src/services/ai-assistant.service.ts');
  assert.match(desktop,/<MailInlineSendCard/);
  assert.match(mini,/<MailInlineSendCard/);
  assert.match(task,/mailSendDraft/);
  assert.match(source('../src/services/ai-chat-tools.service.ts'),/mailSendDraft/);
  assert.match(source('../src/services/ai-mail-tools.service.ts'),/Письмо НЕ отправлено/);
});
