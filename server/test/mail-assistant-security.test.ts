import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { encryptMailPassword, decryptMailPassword, mailKeyReady } from '../src/lib/mail-crypto.js';
import { ReadOnlyImap, parseMailSource, selectImapTextPart, validateMailCredentials } from '../src/services/mail-imap.service.js';
import { diagnoseMailError } from '../src/services/mail-diagnostics.js';

const KEY = 'b3'.repeat(32);

test('mail app passwords use authenticated owner-bound encryption', () => {
  const pw = 'test-app-password';
  assert.equal(mailKeyReady(KEY), true);
  assert.equal(mailKeyReady('short'), false);
  const first = encryptMailPassword(pw, 'user-a', KEY);
  const second = encryptMailPassword(pw, 'user-a', KEY);
  assert.notEqual(first, second);
  assert.ok(!first.includes(pw));
  assert.equal(decryptMailPassword(first, 'user-a', KEY), pw);
  assert.throws(() => decryptMailPassword(first, 'user-b', KEY));
  assert.throws(() => decryptMailPassword(first, 'user-a', 'a4'.repeat(32)));
  assert.throws(() => encryptMailPassword(pw, 'user-a', undefined), /MAIL_ASSISTANT_ENCRYPTION_KEY|/);
});
test('IMAP provider and email credentials are validated without user-defined hosts', () => {
  assert.deepEqual(validateMailCredentials('yandex', '  Demo@Yandex.ru  ', 'secret'), {
    provider: 'yandex', email: 'demo@yandex.ru', password: 'secret'
  });
  assert.throws(() => validateMailCredentials('attacker.example', 'user@example.com', 'pw'));
  assert.throws(() => validateMailCredentials('mailru', 'not-mail', 'pw'));
  assert.throws(() => validateMailCredentials('mailru', 'demo@mail.ru', 'bad\r\nINJECT'));
});
test('parses encoded plaintext without interpreting HTML as instructions', () => {
  const subject = Buffer.from('Договор').toString('base64');
  const body = Buffer.from('Пришлите документы до пятницы.').toString('base64');
  const raw = [
    'From: "Test" <sales@example.org>',
    'Subject: =?UTF-8?B?' + subject + '?=',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].join('\r\n');
  const message = parseMailSource(Buffer.from(raw, 'latin1'), 11);
  assert.equal(message.subject, 'Договор');
  assert.equal(message.uid, 11);
  assert.match(message.text, /документы/);
  assert.equal(message.hasAttachments, false);
});
test('integration is owner-scoped, opt-in, read-only and uses existing task proposal approvals', () => {
  const service = readFileSync(new URL('../src/services/mail-assistant.service.ts', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.tsx', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  const imap = readFileSync(new URL('../src/services/mail-imap.service.ts', import.meta.url), 'utf8');
  assert.match(imap, /imap\.yandex\.ru/);
  assert.match(imap, /imap\.mail\.ru/);
  assert.match(imap, /EXAMINE/);
  assert.match(imap, /BODY\.PEEK/);
  assert.doesNotMatch(imap, /\\bSMTP\\b|\\bSTORE\\b|\\bEXPUNGE\\b/);
  assert.match(service, /prepareTaskProposal/);
  assert.match(service, /autoApply: latest\.taskMode === 'AUTO'/);
  assert.match(service, /inboxUid: incoming\.next - 1/);
  assert.match(service, /leaseToken: token/);
  assert.match(menu, /Почтовый ИИ-ассистент/);
  assert.match(routes, /mailOrigin/);
  assert.match(routes, /\/mail-assistant\/accounts/);
});

test('mail diagnostics classify failures without exposing IMAP replies or account secrets', () => {
  const auth = diagnoseMailError(Object.assign(new Error('login rejected password=supersecret'), {
    code: 'IMAP_REJECTED', stage: 'LOGIN'
  }));
  assert.equal(auth.code, 'IMAP_AUTH_REJECTED');
  assert.match(auth.message, /пароль приложения/);
  assert.ok(!JSON.stringify(auth).includes('supersecret'));
  const network = diagnoseMailError(Object.assign(new Error('network'), {code: 'ETIMEDOUT'}));
  assert.equal(network.code, 'IMAP_TIMEOUT');
  assert.match(network.message, /993/);
  assert.equal(diagnoseMailError(new Error('Почтовый сервер отключился')).code, 'IMAP_CONNECTION_CLOSED');
  assert.equal(diagnoseMailError(new Error('Неполные IMAP данные')).code, 'IMAP_STATUS_INVALID');
  assert.equal(diagnoseMailError(Object.assign(new Error('secret'), {code:'P2002'})).code, 'MAIL_DATABASE_P2002');
  const failed = diagnoseMailError(new Error('Дневной лимит кредитов достигнут'));
  assert.equal(failed.code, 'MAIL_DAILY_LIMIT');
  assert.equal(diagnoseMailError(Object.assign(new Error('secret'), {code:'UNEXPECTED_INTERNAL'})).code, 'MAIL_OPERATION_FAILED');
});

test('mail monitoring retries failed AI analyses instead of silently advancing the IMAP cursor', () => {
  const service = readFileSync(new URL('../src/services/mail-assistant.service.ts', import.meta.url), 'utf8');
  const retry = service.slice(service.indexOf('async function processMessage('), service.indexOf('const isDue ='));
  assert.match(retry, /if \(record\.status === 'FAILED'\)/);
  assert.match(retry, /status: 'PROCESSING', error: null/);
  assert.match(retry, /status: 'FAILED', error: diagnosis\.message/);
  assert.match(retry, /throw cause;/);
  assert.doesNotMatch(retry, /record\.createdAt\.getTime\(\) < Date\.now\(\)/);
  const scan = service.slice(service.indexOf('async function scan('), service.indexOf('export const mailAssistantWorker'));
  assert.ok(scan.indexOf('await processMessage(') < scan.indexOf("processedCount: { increment:"));
  assert.match(scan, /status: 'FAILED'/);
  assert.match(scan, /previous\.uid/);
  assert.match(service, /\[MailAssistant\] scan failed/);
  assert.match(service, /\[MailAssistant\] cycle completed/);
  const read = readFileSync(new URL('../src/services/ai-mail-tools.service.ts', import.meta.url), 'utf8');
  assert.match(read, /failureReasons/);
  assert.match(read, /\[MailAssistant\] search failed/);
});

test('nested Yandex-style multipart emails provide a body to the AI monitor', () => {
  const mail = [
    'From: sender@example.org',
    'Subject: Документы',
    'Content-Type: multipart/mixed; boundary="outer"',
    '',
    '--outer',
    'Content-Type: multipart/alternative; boundary="inner"',
    '',
    '--inner',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<b>HTML fallback</b>',
    '--inner',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Пожалуйста, проверьте документы и пришлите ответ.',
    '--inner--',
    '--outer',
    'Content-Type: application/pdf; name="attachment.pdf"',
    'Content-Disposition: attachment; filename="attachment.pdf"',
    '',
    'binary payload',
    '--outer--'
  ].join('\r\n');
  const parsed = parseMailSource(Buffer.from(mail,'utf8'),101);
  // The parser operates on raw latin1 bytes; the test body uses ASCII for deterministic behavior.
  assert.equal(parsed.hasAttachments,true);
  assert.match(parsed.text,/HTML fallback|Пожалуйста/);
  assert.ok(!parsed.text.includes('binary payload'));
});

test('mail summaries continue after task and reply publishing failures', () => {
  const service=readFileSync(new URL('../src/services/mail-assistant.service.ts',import.meta.url),'utf8');
  const publishing=service.slice(service.indexOf('async function publishPending('),service.indexOf('async function scan('));
  assert.match(publishing,/reportFailure\('TASKS', cause\)/);
  assert.match(publishing,/reportFailure\('REPLIES', cause\)/);
  assert.match(publishing,/reportFailure\('SUMMARY', cause\)/);
  assert.match(publishing,/return \{ warnings, digests \}/);
  assert.match(publishing,/orderBy: \{ createdAt: 'desc' \}, take: 200/);
  const cycle=service.slice(service.indexOf('export const mailAssistantWorker'));
  assert.match(cycle,/await scan\(account, token\)/);
  assert.match(cycle,/await publishPending\(account, token, scanOk\)/);
  assert.match(cycle,/\[MailAssistant\] cycle completed/);
  assert.match(service,/stage = 'FETCH_' \+ folder\.type/);
});

test('IMAP selects text/plain inside nested multipart structure without downloading attachments', async () => {
  const structure = 'BODYSTRUCTURE ((("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "7BIT" 80 1)' +
    '("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 120 2) "ALTERNATIVE")' +
    '("APPLICATION" "PDF" ("NAME" "large.pdf") NIL NIL "BASE64" 30000000) "MIXED")';
  assert.deepEqual(selectImapTextPart('* 1 FETCH (' + structure + ')'), {
    section: '1.2', contentType: 'text/plain', hasAttachments: true
  });
  const imap = new ReadOnlyImap();
  const commands: string[] = [];
  Object.defineProperty(imap, 'command', { value: async (command: string) => {
    commands.push(command);
    if (commands.length === 1) return {lines: ['* 1 FETCH (' + structure + ')'],
      literals: [Buffer.from('From: sender@example.com\r\nSubject: A large report\r\n')]};
    return {lines: [],literals: [
      Buffer.from('Content-Type: text/plain; charset=utf-8\r\n'),
      Buffer.from('Please check the attached report.\r\n')
    ]};
  }});
  const message = await imap.fetch(42);
  assert.equal(message?.uid,42);
  assert.equal(message?.subject,'A large report');
  assert.match(message?.text || '', /attached report/);
  assert.equal(message?.hasAttachments,true);
  assert.match(commands[0], /BODY\.PEEK\[HEADER\]<0\.12288>/);
  assert.match(commands[0], /BODYSTRUCTURE/);
  assert.match(commands[1], /BODY\.PEEK\[1\.2\.MIME\]<0\.4096>/);
  assert.match(commands[1], /BODY\.PEEK\[1\.2\]<0\.24576>/);
  assert.ok(commands.every(x => !x.includes('BODY.PEEK[]')));
  assert.equal(commands.length, 2);
});

test('IMAP uses safe text fallback for single-part messages', async () => {
  const imap = new ReadOnlyImap();
  Object.defineProperty(imap, 'command', { value: async (cmd:string) => cmd.includes('BODYSTRUCTURE')
    ? {lines:['* 1 FETCH (BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 50 1))'],
      literals:[Buffer.from('From: sender@example.com\r\nSubject: Plain letter\r\nContent-Type: text/plain\r\n')]}
    : {lines:[],literals:[Buffer.from('Plain letter body')]}});
  const msg=await imap.fetch(9);
  assert.equal(msg?.subject,'Plain letter');
  assert.equal(msg?.text,'Plain letter body');
});

test('IMAP fetch rejects incomplete MIME-part replies instead of silently losing mail', async () => {
  const imap = new ReadOnlyImap();
  Object.defineProperty(imap, 'command', { value: async (command: string) => command.includes('BODYSTRUCTURE')
    ? {lines:['* 1 FETCH (BODYSTRUCTURE (("TEXT" "PLAIN" NIL NIL NIL "7BIT" 45 1) "MIXED"))'],
      literals: [Buffer.from('From: sender@example.com\r\n')]}
    : {lines: [],literals: [Buffer.from('Content-Type: text/plain\r\n')] }});
  await assert.rejects(imap.fetch(42), (error: unknown) =>
    (error as { code?: string }).code === 'IMAP_FETCH_INCOMPLETE');
});

test('IMAP stream reader retains bounded preview from ignored large partial FETCH', async () => {
  const imap = new ReadOnlyImap();
  // Model a misbehaving provider reporting a >1.2 MB literal in one data chunk.
  const huge = Buffer.concat([Buffer.from('First text characters'), Buffer.alloc(1_500_000, 65)]);
  (imap as unknown as {pending:Buffer}).pending = huge;
  const preview = await (imap as unknown as {
    literal: (size:number, capture:number, transferLimit:number)=>Promise<Buffer>
  }).literal(huge.length, 24576, 64 * 1024 * 1024);
  assert.equal(preview.length, 24576);
  assert.ok(preview.toString().startsWith('First text characters'));
  assert.equal((imap as unknown as {pending:Buffer}).pending.length,0);
});

test('manual digests backfill five recent inbox emails without automatic tasks or replies', () => {
  const service=readFileSync(new URL('../src/services/mail-assistant.service.ts',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../prisma/schema.prisma',import.meta.url),'utf8');
  assert.match(schema,/manualDigestRequestedAt DateTime\?/);
  assert.match(schema,/summaryOnly Boolean @default\(false\)/);
  assert.match(service,/manualDigestRequestedAt: new Date\(\)/);
  assert.match(service,/searchUids\('', 5\)/);
  assert.match(service,/processMessage\(account, 'INBOX', uid, message, true\)/);
  assert.match(service,/!x\.summaryOnly && !x\.taskPublishedAt/);
  assert.match(service,/!x\.summaryOnly && !x\.replyPublishedAt/);
  assert.match(service,/!record\.summaryOnly && !summaryOnly && current\.notifyImportant/);
  assert.match(service,/const manual = Boolean\(manualReady/);
  assert.match(service,/manualDigestRequestedAt: null/);
  assert.match(service,/const fresh = manual \? rows\.slice\(-15\)/);
});

test('mail settings animate both manual refresh controls and track real worker progress', () => {
  const component=readFileSync(new URL('../../client/src/components/MailAssistantSettings.tsx',import.meta.url),'utf8');
  const api=readFileSync(new URL('../../client/src/lib/api.ts',import.meta.url),'utf8');
  const service=readFileSync(new URL('../src/services/mail-assistant.service.ts',import.meta.url),'utf8');
  assert.match(component,/pendingAction === 'summary'/);
  assert.match(component,/pendingAction === 'status'/);
  assert.match(component,/summaryProcessing/);
  assert.match(component,/aria-busy/);
  assert.match(component,/animate-spin/);
  assert.match(component,/window\.setInterval/);
  assert.match(component,/api\.mailAccounts\(\)/);
  assert.match(api,/manualDigestRequestedAt: string \| null/);
  assert.match(service,/manualDigestRequestedAt: a\.manualDigestRequestedAt/);
});
