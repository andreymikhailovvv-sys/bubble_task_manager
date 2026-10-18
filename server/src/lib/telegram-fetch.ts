import tls from 'node:tls';
import { fetch, ProxyAgent, Agent } from 'undici';
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
          callback(error, socket);
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

export function telegramFetch(input: TelegramFetchInput, init?: TelegramFetchInit) {
  initializeProxy();
  return fetch(input, proxyAgent ? { ...init, dispatcher: proxyAgent } : init);
}
