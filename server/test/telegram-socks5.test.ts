import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import {
  connectTelegramSocks5, parseTelegramSocks5Proxy,
  TelegramSocks5ConnectRejectedError, type TelegramSocks5Stage
} from '../src/lib/telegram-socks5.js';
import {
  telegramUserClientNetworkOptions, TelegramUserProxyConfigurationError,
  classifyTelegramUserNetworkError, type TelegramMtprotoStage
} from '../src/lib/telegram-user-client-network.js';

async function localSocks5(withAuth: boolean, accept = true, rejectCode = 0x02, authStatus = 0x00) {
  const requests: Buffer[] = [];
  const server = net.createServer((socket) => {
    socket.once('data', (greeting) => {
      requests.push(greeting);
      socket.write(Buffer.from([0x05, withAuth ? 0x02 : 0x00]));
      const connectRequest = () => socket.once('data', (request) => {
        requests.push(request);
        socket.write(Buffer.from([0x05, accept ? 0x00 : rejectCode, 0x00, 0x01, 127, 0, 0, 1, 0x1f, 0x90]));
        if (accept) socket.on('data', (data) => socket.write(data));
      });
      if (withAuth) socket.once('data', (credentials) => {
        requests.push(credentials);
        socket.write(Buffer.from([0x01, authStatus]));
        if (authStatus === 0x00) connectRequest();
      });
      else connectRequest();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid test server');
  return {
    port: address.port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

test('SOCKS5 username/password works for MTProto and falls back to bot proxy settings', async () => {
  const proxy = await localSocks5(true);
  const observedStages: TelegramMtprotoStage[] = [];
  const options = telegramUserClientNetworkOptions({
    TELEGRAM_USER_PROXY_URL: ' ',
    TELEGRAM_PROXY_URL: `socks5://127.0.0.1:${proxy.port}`,
    TELEGRAM_PROXY_USERNAME: 'user-name',
    TELEGRAM_PROXY_PASSWORD: 'secret-pass'
  }, stage => observedStages.push(stage));
  assert.ok(options.networkSocket);
  const client = new options.networkSocket!();
  try {
    await client.connect(443, '149.154.167.51');
    assert.deepEqual([...proxy.requests[0]], [5, 1, 2]);
    const auth = proxy.requests[1];
    assert.equal(auth[0], 1);
    assert.equal(auth.subarray(2, 2 + auth[1]).toString(), 'user-name');
    assert.equal(proxy.requests[2].subarray(0, 8).toString('hex'), '05010001959aa733');
    client.write(Buffer.from('MTProto'));
    assert.equal((await client.readExactly(7)).toString(), 'MTProto');
    assert.deepEqual(observedStages, [
      'proxy_tcp_connected', 'proxy_greeting_ok', 'proxy_authenticated',
      'proxy_tunnel_ready', 'mtproto_first_bytes'
    ]);
  } finally {
    await client.close();
    await proxy.close();
  }
});

test('SOCKS5 remote DNS form used for Bot API HTTPS target', async () => {
  const proxy = await localSocks5(false);
  const config = parseTelegramSocks5Proxy(new URL(`socks5://127.0.0.1:${proxy.port}`));
  const socket = await connectTelegramSocks5(config, 'api.telegram.org', 443);
  try {
    assert.deepEqual([...proxy.requests[0]], [5, 1, 0]);
    const request = proxy.requests[1];
    assert.deepEqual([...request.subarray(0, 4)], [5, 1, 0, 3]);
    assert.equal(request.subarray(5, 5 + request[4]).toString(), 'api.telegram.org');
    assert.equal(request.readUInt16BE(request.length - 2), 443);
  } finally {
    socket.destroy();
    await proxy.close();
  }
});

test('SOCKS5 rejection fails closed and never falls back to a direct Telegram connection', async () => {
  const proxy = await localSocks5(false, false);
  const client = new (telegramUserClientNetworkOptions({ TELEGRAM_USER_PROXY_URL: `socks5://127.0.0.1:${proxy.port}` }).networkSocket!)();
  try {
    await assert.rejects(client.connect(443, '149.154.167.51'), /Telegram SOCKS5 connect rejected/);
    assert.equal(classifyTelegramUserNetworkError(new Error('Telegram SOCKS5 connect rejected')), 'proxy_rejected');
    assert.equal(classifyTelegramUserNetworkError(new Error('Telegram SOCKS5 connection timeout')), 'proxy_timeout');
  } finally {
    await client.close();
    await proxy.close();
  }
});

test('SOCKS5 CONNECT rejects expose safe RFC 1928 REP code and stage without secrets', async () => {
  const reasons = [
    [0x01, 'general_socks_server_failure'],
    [0x02, 'connection_not_allowed_by_ruleset'],
    [0x03, 'network_unreachable'],
    [0x04, 'host_unreachable'],
    [0x05, 'connection_refused'],
    [0x06, 'ttl_expired'],
    [0x07, 'command_not_supported'],
    [0x08, 'address_type_not_supported'],
    [0x09, 'unassigned_reply_code']
  ] as const;
  for (const [code, reason] of reasons) {
    const proxy = await localSocks5(true, false, code);
    const stages: TelegramSocks5Stage[] = [];
    try {
      await assert.rejects(
        connectTelegramSocks5(
          { hostname: '127.0.0.1', port: proxy.port, username: 'private_user', password: 'private_password' },
          'api.telegram.org', 443, stage => stages.push(stage)
        ),
        (error: unknown) => {
          assert.ok(error instanceof TelegramSocks5ConnectRejectedError);
          assert.equal(error.stage, 'connect_reply');
          assert.equal(error.replyCode, code);
          assert.equal(error.replyReason, reason);
          assert.match(error.message, new RegExp(`REP=0x${code.toString(16).padStart(2, '0')} reason=${reason}`));
          assert.doesNotMatch(error.message, /private_user|private_password|api\\.telegram\\.org/);
          assert.equal(classifyTelegramUserNetworkError(error), 'proxy_rejected');
          return true;
        }
      );
      assert.deepEqual(stages, [
        'proxy_tcp_connected', 'proxy_greeting_ok', 'proxy_authenticated'
      ]);
    } finally {
      await proxy.close();
    }
  }
});

test('SOCKS5 auth rejection exposes status and stage but not credentials', async () => {
  const proxy = await localSocks5(true, true, 0x02, 0x01);
  try {
    await assert.rejects(
      connectTelegramSocks5({
        hostname: '127.0.0.1', port: proxy.port,
        username: 'private_user', password: 'private_password'
      }, 'api.telegram.org', 443),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /authentication failed: stage=auth_reply status=0x01/);
        assert.doesNotMatch(error.message, /private_user|private_password/);
        return true;
      }
    );
  } finally {
    await proxy.close();
  }
});

test('invalid SOCKS5 credentials, URL and protocols fail before network access', () => {
  assert.throws(() => telegramUserClientNetworkOptions({
    TELEGRAM_PROXY_URL: 'socks5://user:pass@proxy.example:1080'
  }), TelegramUserProxyConfigurationError);
  assert.throws(() => telegramUserClientNetworkOptions({
    TELEGRAM_PROXY_URL: 'socks5://proxy.example:1080',
    TELEGRAM_PROXY_USERNAME: 'username-only'
  }), TelegramUserProxyConfigurationError);
  assert.throws(() => parseTelegramSocks5Proxy(new URL('socks5://proxy.example:1080'), 'u'.repeat(256), 'pass'));
  assert.ok(telegramUserClientNetworkOptions({
    TELEGRAM_USER_PROXY_URL: 'socks5://127.0.0.1:1080',
    TELEGRAM_PROXY_URL: 'http://example.invalid:8080'
  }).networkSocket);
});
