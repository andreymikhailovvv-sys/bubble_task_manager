import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalizeMailAssistantProjects, canonicalizeTelegramAssistantProjects,
  MAIL_ASSISTANT_MANAGED_PROJECT } from '../src/lib/ai-chat-project-sync.js';
import { emailAddress } from '../src/services/mail-smtp.service.js';
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('mail project creates exactly one authorized conversation per connected mailbox', () => {
  const accounts = [
    { id:'mail-a', provider:'mailru', email:'a@mail.ru' },
    { id:'mail-b', provider:'yandex', email:'b@yandex.ru' }
  ];
  const incoming = [
    { id:'personal',title:'Личный проект',chats: [{id:'quick-ai-requests',messages:[]}] },
    { id:MAIL_ASSISTANT_MANAGED_PROJECT,title:'Придуманный',chats:[
      { id:'mail-ai-assistant:mail-a',title:'Старый',messages:[{id:'keep',role:'assistant',content:'До'}] },
      { id:'mail-ai-assistant:not-owned',title:'Чужой',messages:[{id:'secret',role:'assistant',content:'Чужое письмо'}] }
    ] }
  ];
  const result = canonicalizeMailAssistantProjects(incoming,accounts);
  assert.equal(result.length,2);
  assert.equal(result[1].id, MAIL_ASSISTANT_MANAGED_PROJECT);
  assert.deepEqual(result[1].chats?.map(x=>x.id), ['mail-ai-assistant:mail-a','mail-ai-assistant:mail-b']);
  assert.match(result[1].chats![0].title!, /Письма Mail.ru/);
  assert.match(result[1].chats![1].title!, /Письма Яндекс/);
  assert.equal(result[1].chats![0].messages?.[0].id,'keep');
  assert.deepEqual(canonicalizeMailAssistantProjects(result,[]).map(p=>p.id),['personal']);
});
test('mail canonicalization composes with Telegram without copying foreign chats',()=>{
  const first = canonicalizeTelegramAssistantProjects([], [{id:'tg-a',chatTitle:'Коллеги'}]);
  const second = canonicalizeMailAssistantProjects(first,[{id:'m1',provider:'mailru',email:'own@mail.ru'}]);
  assert.deepEqual(second.map(x=>x.id),['telegram-ai-assistant-project','mail-ai-assistant-project']);
  assert.equal(second[0].chats?.length,1);
  assert.equal(second[1].chats?.length,1);
});
test('mail sender parsing rejects headers and multiple recipients',()=>{
  assert.equal(emailAddress('"Ivan" <ivan@example.com>'),'ivan@example.com');
  for(const sender of ['bad' + String.fromCharCode(13,10) + 'BCC:secret@example.com','foo@example.com,another@example.com','','no-reply<>']) {
    assert.equal(emailAddress(sender),null);
  }
});
test('client and API expose mailbox-owned mail inbox, proposals and reply status',()=>{
  const api=source('../src/routes/api.ts');
  const worker=source('../src/services/mail-assistant.service.ts');
  const inbox=source('../src/services/mail-assistant-inbox.service.ts');
  const web=source('../../client/src/App.tsx');
  const mini=source('../../client/src/MiniApp.tsx');
  const ui=source('../../client/src/components/MailAssistantSettings.tsx');
  assert.ok(api.includes('mail-assistant/inbox'));
  assert.match(api,/mailOrigin/);
  assert.match(api,/canonicalizeMailAssistantProjects/);
  assert.match(worker,/prepareTaskProposal/);
  assert.match(worker,/dailyCreditLimitMilli/);
  assert.match(inbox,/suggestedReplyStatus: 'SENDING'/);
  assert.match(inbox,/suggestedReplyStatus: started \? 'UNKNOWN' : 'FAILED'/);
  assert.match(inbox,/notifyDailyAiCheckup/);
  assert.match(web,/mergeMailAiInbox/);
  assert.match(mini,/mailAiAssistant|mailInbox/);
  for(const section of ['Ответы на письма','Добавление задач','Частота сводок','Общие параметры']) assert.ok(ui.includes(section));
  assert.doesNotMatch(ui,/Дать доступ ассистенту к переписке/);
});
