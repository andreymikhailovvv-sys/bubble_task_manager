import test from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'teleproto';
import { parseTelegramSendTargetId, telegramSendTargetFromDialog } from '../src/services/telegram-send-targets.service.js';
import { validateQuickRecipients } from '../src/services/telegram-quick-share.service.js';
import { matchTelegramRecipient } from '../src/services/telegram-inline-send-draft.service.js';

function peer(cls: { prototype: object }, properties: Record<string, unknown>) {
  return Object.assign(Object.create(cls.prototype), properties);
}
const self = '555';

test('send target IDs carry peer type, reject collisions, channels and invented IDs', () => {
  assert.deepEqual(parseTelegramSendTargetId('12345'), { kind: 'user', peerId: '12345' });
  assert.deepEqual(parseTelegramSendTargetId('group:chat:12345'), { kind: 'group', peerId: '12345' });
  assert.deepEqual(parseTelegramSendTargetId('group:supergroup:12345'), { kind: 'supergroup', peerId: '12345' });
  assert.notEqual('group:supergroup:12345', 'group:chat:12345');
  for (const invalid of [
    '-10012345', 'group:channel:12345', 'group:supergroup:-10012345',
    'group:supergroup:0', 'group:chat:000123', 'group:chat:123abc',
    'group:chat:123:456', 'group:channel:broadcast', '@group', 'saved', null
  ]) assert.equal(parseTelegramSendTargetId(invalid), null);
});

test('group and supergroup dialog metadata is eligible, channels and departed groups are excluded', () => {
  const user = { isUser: true, entity: peer(Api.User, { id: 12345n, firstName: 'Иван', bot: false, deleted: false }), name: 'Иван' };
  const basic = { isGroup: true, entity: peer(Api.Chat, { id: 12345n, title: 'Команда ВДНХ' }), name: 'Команда ВДНХ' };
  const supergroup = { isGroup: true, isChannel: true, entity: peer(Api.Channel, {
    id: 12345n, title: 'Организаторы', megagroup: true, broadcast: false, left: false, username: 'vdnhteam'
  }), name: 'Организаторы' };
  assert.deepEqual(telegramSendTargetFromDialog(user, self), { id: '12345', name: 'Иван', username: null, kind: 'user' });
  assert.deepEqual(telegramSendTargetFromDialog(basic, self), { id: 'group:chat:12345', name: 'Команда ВДНХ', username: null, kind: 'group' });
  assert.deepEqual(telegramSendTargetFromDialog(supergroup, self), { id: 'group:supergroup:12345', name: 'Организаторы', username: '@vdnhteam', kind: 'supergroup' });
  assert.equal(telegramSendTargetFromDialog({ ...basic, entity: peer(Api.Chat, { id: 12345n, left: true }) }, self), null);
  assert.equal(telegramSendTargetFromDialog({ ...basic, entity: peer(Api.Chat, { id: 12345n, deactivated: true }) }, self), null);
  assert.equal(telegramSendTargetFromDialog({ ...basic, entity: peer(Api.Chat, { id: 12345n, migratedTo: {} }) }, self), null);
  assert.equal(telegramSendTargetFromDialog({ ...supergroup, entity: peer(Api.Channel, { id: 12345n, title: 'Новости', broadcast: true, megagroup: false }) }, self), null);
  assert.equal(telegramSendTargetFromDialog({ ...supergroup, entity: peer(Api.Channel, { id: 12345n, title: 'Закрытая группа', broadcast: false, megagroup: true, left: true }) }, self), null);
  assert.equal(telegramSendTargetFromDialog({ ...user, entity: peer(Api.User, { id: 12345n, bot: true }) }, self), null);
  assert.equal(telegramSendTargetFromDialog({ ...user, entity: peer(Api.User, { id: 555n }) }, self), null);
});

test('groups share the existing three-recipient limit with users and Saved Messages', () => {
  assert.deepEqual(validateQuickRecipients(['group:chat:100', '123', 'group:supergroup:200']),
    ['group:chat:100', '123', 'group:supergroup:200']);
  assert.deepEqual(validateQuickRecipients(['saved', 'group:chat:100']), ['saved', 'group:chat:100']);
  assert.throws(() => validateQuickRecipients(['group:chat:100', 'group:chat:100']));
  assert.throws(() => validateQuickRecipients(['group:chat:100', 'group:supergroup:200', '123', 'saved']));
  assert.throws(() => validateQuickRecipients(['group:channel:200']));
});

test('AI recipient matching can resolve a unique group by name but cannot guess ambiguous targets', () => {
  const targets = [
    { id: 'group:chat:900', name: 'Команда проекта', username: null, kind: 'group' },
    { id: 'group:supergroup:901', name: 'Команда проекта архив', username: null, kind: 'supergroup' },
    { id: '123', name: 'Иван Иванов', username: '@ivan', kind: 'user' }
  ];
  assert.deepEqual(matchTelegramRecipient('Команда проекта', targets), { match: 'exact', recipient: targets[0] });
  assert.deepEqual(matchTelegramRecipient('Команда', targets), { match: 'ambiguous', recipient: null });
  assert.deepEqual(matchTelegramRecipient('Команда проекта архив', targets), { match: 'exact', recipient: targets[1] });
});

test('old private Telegram history endpoints remain separate from group-only send-target discovery', async () => {
  const { readFileSync } = await import('node:fs');
  const api = readFileSync(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  assert.match(api, /chat\/send-targets', requireAuth, requireTelegramChatOrigin/);
  assert.match(api, /chat\/history', requireAuth, requireTelegramChatOrigin/);
  const reader = readFileSync(new URL('../src/services/telegram-user-client-read.service.ts', import.meta.url), 'utf8');
  assert.match(reader, /const \{ rows \} = await loadPersonalDialogs\(client, owner.accountId\)/);
  const worker = readFileSync(new URL('../src/services/telegram-quick-share.service.ts', import.meta.url), 'utf8');
  assert.match(worker, /telegramSendTargetFromDialog\(row, owner.telegramAccountId\)/);
  assert.match(worker, /claimAudit/);
  assert.match(worker, /sendMessage\(inputEntity/);
});
