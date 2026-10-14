import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import {
  telegramUserClientNetworkOptions,
  TelegramUserProxyConfigurationError,
  classifyTelegramUserNetworkError
} from '../src/lib/telegram-user-client-network.js';

async function localProxy(
  onConnection: (socket: net.Socket) => void
): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer(onConnection);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  return { server, port: address.port };
}

const closeServer = (server: net.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test('HTTP CONNECT tunnels MTProto bytes and existing Telegram Bot proxy credentials', async () => {
  let receivedRequest = '';
  const proxy = await localProxy((socket) => {
    socket.once('data', (request) => {
      receivedRequest = request.toString('utf8');
      socket.write(Buffer.from('HTTP/1.1 200 Connection established\r\n\r\nhello'));
      socket.on('data', (payload) => { socket.write(payload); });
    });
  });
  const options = telegramUserClientNetworkOptions({
    TELEGRAM_PROXY_URL: 'http://127.0.0.1:' + proxy.port,
    TELEGRAM_PROXY_USERNAME: 'telegram-test-user',
    TELEGRAM_PROXY_PASSWORD: 'sample-test-password'
  });
  assert.ok(options.networkSocket);
  const socket = new options.networkSocket!();
  try {
    await socket.connect(443, '149.154.167.51');
    assert.match(receivedRequest, /^CONNECT 149\.154\.167\.51:443 HTTP\/1\.1\r\n/);
    assert.match(receivedRequest, /Proxy-Authorization: Basic /);
    assert.ok(receivedRequest.includes(Buffer.from('telegram-test-user:sample-test-password').toString('base64')));
    assert.equal((await socket.readExactly(5)).toString(), 'hello');
    socket.write(Buffer.from('MTProto'));
    assert.equal((await socket.readExactly(7)).toString(), 'MTProto');
  } finally {
    await socket.close();
    await closeServer(proxy.server);
  }
});

test('CONNECT failure fails closed without passing raw proxy response to caller', async () => {
  const proxy = await localProxy((socket) => {
    socket.once('data', () => { socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\nprivate details'); });
  });
  const options = telegramUserClientNetworkOptions({ TELEGRAM_USER_PROXY_URL: 'http://127.0.0.1:' + proxy.port });
  const socket = new options.networkSocket!();
  try {
    await assert.rejects(socket.connect(443, '149.154.167.51'), /Telegram proxy CONNECT rejected/);
  } finally {
    await socket.close();
    await closeServer(proxy.server);
  }
});

test('invalid proxy URL/credentials are rejected, rather than connecting directly', () => {
  assert.throws(() => telegramUserClientNetworkOptions({
    TELEGRAM_PROXY_URL: 'http://someone:secret@proxy.example:8888'
  }), TelegramUserProxyConfigurationError);
  assert.throws(() => telegramUserClientNetworkOptions({
    TELEGRAM_PROXY_URL: 'ftp://proxy.example:8888'
  }), TelegramUserProxyConfigurationError);
  assert.throws(() => telegramUserClientNetworkOptions({
    TELEGRAM_PROXY_URL: 'http://proxy.example:8888',
    TELEGRAM_PROXY_USERNAME: 'partial'
  }), TelegramUserProxyConfigurationError);
  assert.equal(telegramUserClientNetworkOptions({}).networkSocket, undefined);
});

test('dedicated MTProto proxy settings override the shared Bot API proxy', () => {
  const options = telegramUserClientNetworkOptions({
    TELEGRAM_USER_PROXY_URL: 'http://127.0.0.1:1080',
    TELEGRAM_PROXY_URL: 'http://example.invalid:8080'
  });
  assert.ok(options.networkSocket);
});

test('safe error categories do not reflect arbitrary error text', () => {
  assert.equal(classifyTelegramUserNetworkError(new Error('Telegram proxy CONNECT timeout')), 'proxy_timeout');
  assert.equal(classifyTelegramUserNetworkError(new Error('Telegram proxy CONNECT rejected')), 'proxy_rejected');
  assert.equal(classifyTelegramUserNetworkError(new Error('Connection timed out after 10s')), 'network_timeout');
  assert.equal(classifyTelegramUserNetworkError(new Error('secret=1234567')), 'other');
});
