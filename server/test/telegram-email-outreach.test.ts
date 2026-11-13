import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isPrivateTelegramChatId,
  telegramEmailOutreachEligibility
} from '../src/lib/telegram-email-outreach-rules.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Telegram outreach includes no email and unverified or replacement addresses', () => {
  const chat = '123456789';
  assert.deepEqual(telegramEmailOutreachEligibility({
    telegramChatId: chat, email: null, pendingEmail: null, emailVerifiedAt: null
  }, chat), { shouldSend: true, hasEmail: false });
  assert.deepEqual(telegramEmailOutreachEligibility({
    telegramChatId: chat, email: 'old@example.com', pendingEmail: null, emailVerifiedAt: null
  }, chat), { shouldSend: true, hasEmail: true });
  assert.deepEqual(telegramEmailOutreachEligibility({
    telegramChatId: chat, email: 'verified@example.com', pendingEmail: 'new@example.com',
    emailVerifiedAt: new Date()
  }, chat), { shouldSend: true, hasEmail: true });
});

test('Telegram outreach never targets verified, unlinked, changed or group chats', () => {
  const chat = '123456789';
  const valid = {
    telegramChatId: chat, email: 'verified@example.com', pendingEmail: null,
    emailVerifiedAt: new Date()
  };
  assert.deepEqual(telegramEmailOutreachEligibility(valid, chat), {
    shouldSend: false, hasEmail: true
  });
  assert.equal(telegramEmailOutreachEligibility(null, chat).shouldSend, false);
  assert.equal(telegramEmailOutreachEligibility({
    ...valid, emailVerifiedAt: null, telegramChatId: '987654321'
  }, chat).shouldSend, false);
  assert.equal(telegramEmailOutreachEligibility({
    ...valid, emailVerifiedAt: null, telegramChatId: '-100123456789'
  }, '-100123456789').shouldSend, false);
  assert.equal(isPrivateTelegramChatId(chat), true);
  assert.equal(isPrivateTelegramChatId('-100123456789'), false);
  assert.equal(isPrivateTelegramChatId('@publicgroup'), false);
});

test('migration snapshots existing private Telegram recipients only once', () => {
  const schema = read('../prisma/schema.prisma');
  const sql = read('../prisma/migrations/20261114013000_telegram_email_verification_outreach/migration.sql');
  assert.match(schema, /model TelegramEmailVerificationOutreach/);
  assert.match(schema, /userId\s+String\s+@id/);
  assert.match(sql, /INSERT INTO "TelegramEmailVerificationOutreach"/);
  assert.match(sql, /"telegramChatId" ~/);
  assert.match(sql, /"emailVerifiedAt" IS NULL/);
  assert.match(sql, /"pendingEmail"/);
  assert.match(sql, /ON CONFLICT \("userId"\) DO NOTHING/);
  assert.doesNotMatch(sql, /UPDATE "User" SET "emailVerifiedAt"/);
});

test('worker claims in database before sending and never retries ambiguous attempts', () => {
  const worker = read('../src/services/telegram-email-outreach.service.ts');
  const index = read('../src/index.ts');
  assert.match(worker, /where: \{ userId: job\.userId, status: 'PENDING' \}/);
  assert.match(worker, /status: 'CLAIMED'/);
  assert.match(worker, /if \(claim\.count !== 1\) return/);
  assert.ok(worker.indexOf("status: 'CLAIMED'") < worker.indexOf('sendEmailVerificationOutreach('));
  assert.match(worker, /status: 'SENT'/);
  assert.match(worker, /status: 'FAILED'/);
  assert.match(worker, /status: 'SKIPPED'/);
  assert.doesNotMatch(worker, /data: \{ status: 'PENDING' \}/);
  assert.match(index, /dispatchOneTelegramEmailVerificationOutreach/);
  assert.match(index, /setInterval\(runTelegramEmailOutreach, 15_000\)/);
});

test('the recipient gets one Telegram message with steps, code/link options, and Mini App button', () => {
  const sender = read('../src/services/telegram.service.ts');
  const start = sender.indexOf('async sendEmailVerificationOutreach(');
  const end = sender.indexOf('async completeWebLogin(', start);
  assert.ok(start >= 0 && end > start);
  const method = sender.slice(start, end);
  assert.match(method, /'✉️ <b>Планировыч AI: подтвердите почту<\/b>'/);
  assert.match(method, /Настройки/);
  assert.match(method, /Сохранить email и подтвердить/);
  assert.match(method, /шестизначный код/);
  assert.match(method, /ссылке активации/);
  assert.match(method, /inline_keyboard/);
  assert.match(method, /web_app/);
  assert.equal(method.split('return sendMessage(').length - 1, 1);
});
