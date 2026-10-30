import tls from 'node:tls';
import { fetch, ProxyAgent, Agent, FormData } from 'undici';
import { connectTelegramSocks5, parseTelegramSocks5Proxy } from './telegram-socks5.js';

type TelegramFetchInput = Parameters<typeof fetch>[0];
type TelegramFetchInit = Parameters<typeof fetch>[1];

let proxyAgent: ProxyAgent | Agent | undefined;
let initialized = false;

function initializeProxy(): void {
  if (initialized) return;

  const proxyUrl = process.env.TELEGRAM_PROXY_URL?.trim();
  if (!proxyUrl) {
    console.info('[Telegram] proxy disabled');
    initialized = true;
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(proxyUrl);
    if (
      !['http:', 'https:', 'socks5:'].includes(parsedUrl.protocol) ||
      !parsedUrl.hostname ||
      parsedUrl.username ||
      parsedUrl.password ||
      (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new Error('invalid proxy URL');
    }
  } catch {
    throw new Error('TELEGRAM_PROXY_URL is invalid');
  }

  const username = process.env.TELEGRAM_PROXY_USERNAME;
  const password = process.env.TELEGRAM_PROXY_PASSWORD;
  const authenticated = Boolean(username && password);

  if (parsedUrl.protocol === 'socks5:') {
    let config: ReturnType<typeof parseTelegramSocks5Proxy>;
    try {
      config = parseTelegramSocks5Proxy(parsedUrl, username, password);
    } catch {
      throw new Error('TELEGRAM_PROXY_URL SOCKS5 configuration is invalid');
    }
    // The existing undici version has no SOCKS5 dispatcher. Use a TLS-verified
    // per-origin Agent connector rather than silently sending bot tokens in cleartext.
    proxyAgent = new Agent({
      connect(options, callback) {
        if (options.protocol !== 'https:') {
          callback(new Error('Telegram SOCKS5 requires HTTPS target'), null);
          return;
        }
        let finished = false;
        const finish = (error: Error | null, socket: tls.TLSSocket | null) => {
          if (finished) return;
          finished = true;
          if (error) callback(error, null);
          else if (socket) callback(null, socket);
          else callback(new Error('Telegram SOCKS5 TLS connection failed'), null);
        };
        void connectTelegramSocks5(config, options.hostname, Number(options.port || 443))
          .then((tunnel) => {
            const secure = tls.connect({
              socket: tunnel,
              servername: options.servername || options.hostname,
              rejectUnauthorized: true
            });
            const timer = setTimeout(() => secure.destroy(new Error('Telegram SOCKS5 TLS timeout')), 10_000);
            const onError = (error: Error) => {
              clearTimeout(timer);
              secure.destroy();
              finish(error, null);
            };
            secure.once('error', onError);
            secure.once('secureConnect', () => {
              clearTimeout(timer);
              secure.off('error', onError);
              finish(null, secure);
            });
            tunnel.resume();
          })
          .catch((error: unknown) => {
            finish(error instanceof Error ? error : new Error('Telegram SOCKS5 connection failed'), null);
          });
      }
    });
  } else {
    const token = authenticated
      ? `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
      : undefined;
    proxyAgent = new ProxyAgent({ uri: parsedUrl.origin, token });
  }

  console.info('[Telegram] proxy enabled', {
    protocol: parsedUrl.protocol.slice(0, -1),
    host: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : parsedUrl.protocol === 'socks5:' ? '1080' : '80'),
    authenticated
  });
  initialized = true;
}

// Bot API traffic on Timeweb can be routed through a small authenticated
// Render egress without changing any of the existing bot callers. No fallback:
// falling back to a blocked proxy can duplicate side-effecting requests.
const OUTBOUND_RELAY_TIMEOUT_MS = 90_000; // Allow Render free-tier cold starts.
const MAX_RELAY_UPLOAD_BYTES = 8 * 1024 * 1024;

function outboundRelayConfig(): { url: string; secret: string } | null {
  const urlValue = process.env.TELEGRAM_BOT_API_RELAY_URL?.trim();
  const secret = process.env.TELEGRAM_BOT_API_RELAY_SECRET?.trim();
  if (!urlValue && !secret) return null;
  if (!urlValue || !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new Error('Telegram outbound relay configuration is incomplete');
  }
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error('Telegram outbound relay URL is invalid');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.search || url.hash || !url.pathname.endsWith('/api/telegram-bot-api-relay')) {
    throw new Error('Telegram outbound relay requires an HTTPS endpoint');
  }
  return { url: url.href, secret };
}

export async function buildTelegramBotApiRelayEnvelope(input: TelegramFetchInput, init?: TelegramFetchInit) {
  const target = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (target.origin !== 'https://api.telegram.org' || !botToken ||
      target.search || target.hash || target.username || target.password) {
    throw new Error('Telegram outbound relay only supports the configured Bot API');
  }
  const methodPrefix = `/bot${botToken}/`;
  const filePrefix = `/file/bot${botToken}/`;
  if (target.pathname.startsWith(filePrefix) && (!init?.method || init.method === 'GET')) {
    return { kind: 'file' as const, path: target.pathname.slice(filePrefix.length) };
  }
  if (!target.pathname.startsWith(methodPrefix) || init?.method !== 'POST') {
    throw new Error('Unsupported Telegram outbound relay request');
  }
  const method = target.pathname.slice(methodPrefix.length);
  if (!['sendMessage', 'sendPhoto', 'editMessageText',
    'editMessageReplyMarkup', 'answerCallbackQuery', 'getFile'].includes(method)) {
    throw new Error('Unsupported Telegram Bot API method');
  }
  if (typeof init.body === 'string') {
    return { kind: 'api' as const, method, payload: JSON.parse(init.body) as unknown };
  }
  if (init.body instanceof FormData && method === 'sendPhoto') {
    const parts: Array<
      { name: string; value: string } |
      { name: string; base64: string; filename: string; mimeType: string }
    > = [];
    for (const [name, value] of init.body.entries()) {
      if (typeof value === 'string') {
        parts.push({ name, value });
      } else {
        const bytes = Buffer.from(await value.arrayBuffer());
        if (bytes.byteLength > MAX_RELAY_UPLOAD_BYTES) {
          throw new Error('Telegram outbound relay upload too large');
        }
        parts.push({ name, base64: bytes.toString('base64'), filename: value.name, mimeType: value.type });
      }
    }
    return { kind: 'multipart' as const, method: 'sendPhoto' as const, parts };
  }
  throw new Error('Unsupported Telegram outbound relay body');
}

export async function telegramFetch(input: TelegramFetchInput, init?: TelegramFetchInit) {
  const outboundRelay = outboundRelayConfig();
  if (outboundRelay) {
    const envelope = await buildTelegramBotApiRelayEnvelope(input, init);
    return fetch(outboundRelay.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-outbound-relay-secret': outboundRelay.secret
      },
      body: JSON.stringify(envelope),
      // Use undici's normal HTTPS verification and avoid user-supplied proxies.
      signal: init?.signal ?? AbortSignal.timeout(OUTBOUND_RELAY_TIMEOUT_MS),
      redirect: 'error'
    });
  }
  initializeProxy();
  return fetch(input, proxyAgent ? { ...init, dispatcher: proxyAgent } : init);
}
