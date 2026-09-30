import { fetch, ProxyAgent } from 'undici';

type OpenAiFetchInput = Parameters<typeof fetch>[0];
type OpenAiFetchInit = Parameters<typeof fetch>[1];
type FetchLike = (input: OpenAiFetchInput, init?: OpenAiFetchInit) => ReturnType<typeof fetch>;

export type SafeOpenAiError = {
  name?: string;
  message?: string;
  cause?: {
    name?: string;
    message?: string;
    code?: string;
    errno?: string | number;
    syscall?: string;
    address?: string;
    port?: string | number;
  };
};

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENETUNREACH',
  'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'
]);
const RETRY_DELAYS_MS = [500, 1500] as const;

let proxyAgent: ProxyAgent | undefined;
let initialized = false;
let proxyDetails: { enabled: boolean; hostname?: string; port?: string } = { enabled: false };

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
const safeString = (value: unknown) => typeof value === 'string' ? value : undefined;
const safeScalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? value : undefined;

/** Extracts diagnostics only from a strict allow-list so secrets and request payloads cannot leak. */
export function normalizeOpenAiError(error: unknown): SafeOpenAiError {
  const source = asRecord(error);
  const cause = asRecord(source?.cause);
  return {
    name: safeString(source?.name),
    message: safeString(source?.message),
    ...(cause ? { cause: {
      name: safeString(cause.name),
      message: safeString(cause.message),
      code: safeString(cause.code),
      errno: safeScalar(cause.errno),
      syscall: safeString(cause.syscall),
      address: safeString(cause.address),
      port: safeScalar(cause.port)
    } } : {})
  };
}

export function isRetryableOpenAiError(error: unknown): boolean {
  const normalized = normalizeOpenAiError(error);
  return Boolean(normalized.cause?.code && NETWORK_ERROR_CODES.has(normalized.cause.code));
}

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
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password ||
      (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') || parsedUrl.search || parsedUrl.hash) throw new Error('invalid proxy URL');
  } catch {
    throw new Error('OPENAI_PROXY_URL is invalid');
  }
  const username = process.env.OPENAI_PROXY_USERNAME;
  const password = process.env.OPENAI_PROXY_PASSWORD;
  const authenticated = Boolean(username && password);
  const token = authenticated ? `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}` : undefined;
  proxyAgent = new ProxyAgent({ uri: parsedUrl.origin, token });
  proxyDetails = { enabled: true, hostname: parsedUrl.hostname, port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80') };
  console.info('[AI] OpenAI proxy enabled', { ...proxyDetails, authenticated });
  initialized = true;
}

export type OpenAiFetchOptions = { requestId?: string; model?: string };

export function createOpenAiFetch(fetchImpl: FetchLike, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))) {
  return async (input: OpenAiFetchInput, init?: OpenAiFetchInit, options: OpenAiFetchOptions = {}) => {
    initializeProxy();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.info('[AI] OpenAI HTTP attempt', { ...options, attempt, maxAttempts: 3, proxy: proxyDetails });
      try {
        const response = await fetchImpl(input, proxyAgent ? { ...init, dispatcher: proxyAgent } : init);
        console.info('[AI] OpenAI response status', { ...options, attempt, status: response.status });
        const retryableStatus = response.status === 429 || response.status >= 500;
        if (!retryableStatus || attempt === 3) return response;
        // A response body must be released before reusing the connection for the retry.
        await response.body?.cancel();
        console.warn('[AI] Retrying OpenAI HTTP response', { ...options, attempt, status: response.status, delayMs: RETRY_DELAYS_MS[attempt - 1] });
      } catch (error) {
        const normalizedError = normalizeOpenAiError(error);
        const retryable = isRetryableOpenAiError(error);
        console.error('[AI] OpenAI network error', { ...options, attempt, maxAttempts: 3, proxy: proxyDetails, retryable, error: normalizedError });
        if (!retryable || attempt === 3) throw error;
        console.warn('[AI] Retrying OpenAI network error', { ...options, attempt, delayMs: RETRY_DELAYS_MS[attempt - 1] });
      }
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    throw new Error('OpenAI retry loop exhausted');
  };
}

export const openAiFetch = createOpenAiFetch(fetch);
