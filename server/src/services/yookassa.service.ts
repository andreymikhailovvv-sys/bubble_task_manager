const YOOKASSA_API_BASE = 'https://api.yookassa.ru/v3';
const REQUEST_TIMEOUT_MS = 12_000;
const GET_STATUS_MAX_ATTEMPTS = 3;
const RECEIPT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type YooKassaPayment = {
  id: string;
  status: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  confirmation?: { confirmation_url?: string };
  metadata?: { purchase_id?: string; credit_pack_key?: string };
  recipient?: { account_id?: string };
};

export class YooKassaError extends Error {
  public readonly httpStatus?: number;
  public readonly providerCode?: string;
  public readonly providerErrorId?: string;
  public readonly providerDescription?: string;
  public readonly providerParameter?: string;
  public readonly failureKind?: string;
  public readonly networkCode?: string;
  public readonly attempts?: number;

  constructor(message: string, diagnostics: {
    httpStatus?: number;
    providerCode?: string;
    providerErrorId?: string;
    providerDescription?: string;
    providerParameter?: string;
    failureKind?: string;
    networkCode?: string;
    attempts?: number;
  } = {}) {
    super(message);
    this.name = 'YooKassaError';
    this.httpStatus = diagnostics.httpStatus;
    this.providerCode = diagnostics.providerCode;
    this.providerErrorId = diagnostics.providerErrorId;
    this.providerDescription = diagnostics.providerDescription;
    this.providerParameter = diagnostics.providerParameter;
    this.failureKind = diagnostics.failureKind;
    this.networkCode = diagnostics.networkCode;
    this.attempts = diagnostics.attempts;
  }
}

const sanitizedProviderString = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return undefined;
  const sanitized = value.trim().slice(0, maxLength);
  return sanitized || undefined;
};

export const normalizeReceiptEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 254 && RECEIPT_EMAIL_PATTERN.test(normalized) ? normalized : null;
};

export const resolveReceiptEmail = (user: { email?: string | null; username?: string | null }, receiptEmail: unknown) =>
  normalizeReceiptEmail(user.email) ?? normalizeReceiptEmail(user.username) ?? normalizeReceiptEmail(receiptEmail);

export const isYooKassaConfigured = () => Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());

const credentials = () => {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) throw new YooKassaError('YooKassa is not configured');
  return { shopId, authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}` };
};

const networkErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const cause = 'cause' in error ? error.cause : undefined;
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined;
  const code = cause.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,50}$/i.test(code) ? code : undefined;
};

async function providerRequest(path: string, init: RequestInit): Promise<YooKassaPayment> {
  const { authorization } = credentials();
  const method = (init.method ?? 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? GET_STATUS_MAX_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let retryable = false;
    let failure: YooKassaError | null = null;
    try {
      // A GET has no JSON payload. Avoid Content-Type on a read-only verification
      // request, since intermediary gateways can reject it unexpectedly.
      const response = await fetch(`${YOOKASSA_API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
        headers: { Authorization: authorization, Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers }
      });
      if (!response.ok) {
        let diagnostics: ConstructorParameters<typeof YooKassaError>[1] = {
          httpStatus: response.status, failureKind: 'upstream_http', attempts: attempt
        };
        try {
          const error = await response.json() as { id?: unknown; code?: unknown; description?: unknown; parameter?: unknown };
          diagnostics = {
            ...diagnostics,
            providerCode: sanitizedProviderString(error.code, 200),
            providerErrorId: sanitizedProviderString(error.id, 200),
            providerDescription: sanitizedProviderString(error.description, 500),
            providerParameter: sanitizedProviderString(error.parameter, 200)
          };
        } catch { /* Provider body is deliberately not retained. */ }
        retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
        failure = new YooKassaError('YooKassa request failed', diagnostics);
      } else {
        try {
          return await response.json() as YooKassaPayment;
        } catch {
          throw new YooKassaError('YooKassa response is invalid', { failureKind: 'invalid_response', attempts: attempt });
        }
      }
    } catch (error) {
      if (error instanceof YooKassaError) {
        failure = error;
      } else {
        const timedOut = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
        failure = new YooKassaError(
          timedOut ? 'YooKassa request timed out' : 'YooKassa network request failed',
          { failureKind: timedOut ? 'timeout' : 'network', networkCode: networkErrorCode(error), attempts: attempt }
        );
        retryable = true;
      }
    } finally {
      clearTimeout(timeout);
    }
    if (!failure) throw new Error('YooKassa request failed without a diagnostic');
    if (!retryable || attempt >= maxAttempts) throw failure;
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  throw new Error('YooKassa provider retry loop ended unexpectedly');
}

export const formatKopecks = (kopecks: number) => `${Math.floor(kopecks / 100)}.${String(kopecks % 100).padStart(2, '0')}`;

export const parseProviderAmountKopecks = (value: string | undefined): number | null => {
  if (!value || !/^\d+\.\d{2}$/.test(value)) return null;
  const [rubles, kopecks] = value.split('.');
  const result = Number(rubles) * 100 + Number(kopecks);
  return Number.isSafeInteger(result) ? result : null;
};

export const yookassaService = {
  createPayment(input: { amountKopecks: number; returnUrl: string; description: string; receiptDescription: string; customerEmail: string; purchaseId: string; creditPackKey: string; idempotenceKey: string }) {
    const amount = { value: formatKopecks(input.amountKopecks), currency: 'RUB' };
    return providerRequest('/payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': input.idempotenceKey },
      body: JSON.stringify({
        amount,
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: input.description,
        metadata: { purchase_id: input.purchaseId, credit_pack_key: input.creditPackKey },
        receipt: {
          customer: { email: input.customerEmail },
          items: [{
            description: input.receiptDescription,
            quantity: '1.000',
            amount,
            vat_code: 1,
            payment_mode: 'full_payment',
            payment_subject: 'service'
          }],
          internet: true
        }
      })
    });
  },
  getPayment(paymentId: string) {
    return providerRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
  }
};
