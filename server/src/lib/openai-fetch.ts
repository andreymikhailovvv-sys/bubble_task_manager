import { fetch, ProxyAgent } from 'undici';

type OpenAiFetchInput = Parameters<typeof fetch>[0];
type OpenAiFetchInit = Parameters<typeof fetch>[1];

let proxyAgent: ProxyAgent | undefined;
let initialized = false;

function initializeProxy(): void {
  if (initialized) return;

  const proxyUrl = process.env.OPENAI_PROXY_URL?.trim();
  if (!proxyUrl) {
    console.info('[AI] OpenAI proxy disabled');
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
    throw new Error('OPENAI_PROXY_URL is invalid');
  }

  const username = process.env.OPENAI_PROXY_USERNAME;
  const password = process.env.OPENAI_PROXY_PASSWORD;
  const authenticated = Boolean(username && password);
  const token = authenticated
    ? `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
    : undefined;

  proxyAgent = new ProxyAgent({ uri: parsedUrl.origin, token });
  console.info('[AI] OpenAI proxy enabled', {
    host: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
    authenticated
  });
  initialized = true;
}

export function openAiFetch(input: OpenAiFetchInput, init?: OpenAiFetchInit) {
  initializeProxy();
  return fetch(input, proxyAgent ? { ...init, dispatcher: proxyAgent } : init);
}
