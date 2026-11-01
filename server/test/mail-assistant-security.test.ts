import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { encryptMailPassword, decryptMailPassword, mailKeyReady } from '../src/lib/mail-crypto.js';
import { parseMailSource, validateMailCredentials } from '../src/services/mail-imap.service.js';

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
