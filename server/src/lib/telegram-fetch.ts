import { fetch, ProxyAgent } from 'undici';

type TelegramFetchInput = Parameters<typeof fetch>[0];
type TelegramFetchInit = Parameters<typeof fetch>[1];

let proxyAgent: ProxyAgent | undefined;
let initialized = false;

function initializeProxy(): void {
  if (initialized) return;

  const proxyUrl = process.env.TELEGRAM_PROXY_URL?.trim();
  if (!proxyUrl) {
    initialized = true;
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(proxyUrl);
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
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
  const token = authenticated
    ? `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
    : undefined;

  proxyAgent = new ProxyAgent({ uri: parsedUrl.origin, token });
  console.info('[Telegram] proxy enabled', {
    host: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
    authenticated
  });
  initialized = true;
}

export function telegramFetch(input: TelegramFetchInput, init?: TelegramFetchInit) {
  initializeProxy();
  return fetch(input, proxyAgent ? { ...init, dispatcher: proxyAgent } : init);
}
